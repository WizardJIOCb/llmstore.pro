import { db } from '../../config/database.js';
import { agents, agentVersions, agentVersionTools, toolDefinitions } from '../../db/schema/agents.js';
import { agentRuns, agentRunMessages, agentRunToolCalls } from '../../db/schema/runtime.js';
import { usageLedger } from '../../db/schema/analytics.js';
import { eq, desc, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { openRouterClient } from '../openrouter/index.js';
import { executeTool } from '../tool-execution/index.js';
import { NotFoundError, AppError } from '../../middleware/error-handler.js';
import { logger } from '../../lib/logger.js';
import type { ChatMessage, ToolDefinitionParam } from '../openrouter/types.js';

const DEFAULT_MODEL = 'google/gemini-2.0-flash-001';
const DEFAULT_MAX_ITERATIONS = 4;

// --- Types ---

interface StartRunInput {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  variables?: Record<string, string>;
}

interface RunResult {
  run_id: string;
  status: string;
  output: string;
  tool_traces: ToolTrace[];
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number; estimated_cost: string | null } | null;
  latency_ms: number;
}

interface ToolTrace {
  tool_call_id: string;
  tool_name: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  status: string;
  duration_ms: number | null;
  error?: string;
}

// --- Core Runtime ---

export async function startRun(agentId: string, userId: string, input: StartRunInput): Promise<RunResult> {
  const startTime = Date.now();

  // 1. Load agent + version + tools
  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
  if (!agent) throw new NotFoundError('Агент не найден');

  if (!agent.current_version_id) {
    throw new AppError(400, 'NO_VERSION', 'У агента нет активной версии');
  }

  const [version] = await db.select().from(agentVersions).where(eq(agentVersions.id, agent.current_version_id)).limit(1);
  if (!version) throw new NotFoundError('Версия агента не найдена');

  const versionToolRows = await db
    .select({ tool: toolDefinitions })
    .from(agentVersionTools)
    .innerJoin(toolDefinitions, eq(agentVersionTools.tool_definition_id, toolDefinitions.id))
    .where(eq(agentVersionTools.agent_version_id, version.id))
    .orderBy(agentVersionTools.order_index);
  const tools = versionToolRows.map(r => r.tool);

  // 2. Resolve model
  const modelId = DEFAULT_MODEL; // MVP: always use default model

  // 3. Parse runtime config
  const runtimeConfig = (version.runtime_config || {}) as {
    max_iterations?: number;
    temperature?: number;
    max_tokens?: number;
  };
  const maxIterations = runtimeConfig.max_iterations ?? DEFAULT_MAX_ITERATIONS;

  // 4. Create run record
  const traceId = uuidv4();
  const [run] = await db.insert(agentRuns).values({
    agent_id: agentId,
    agent_version_id: version.id,
    user_id: userId,
    status: 'preparing',
    mode: 'chat',
    provider_name: 'openrouter',
    trace_id: traceId,
    input_summary: input.messages[input.messages.length - 1]?.content?.slice(0, 200) ?? '',
  }).returning();

  // 5. Build messages
  const messages: ChatMessage[] = [];
  if (version.system_prompt) {
    messages.push({ role: 'system', content: version.system_prompt });
  }
  for (const msg of input.messages) {
    messages.push({ role: msg.role, content: msg.content });
  }

  // 6. Build tools array
  const toolParams: ToolDefinitionParam[] = tools.map(t => ({
    type: 'function' as const,
    function: {
      name: t.slug,
      description: t.description || t.name,
      parameters: t.input_schema,
    },
  }));

  // 7. Update run to running
  await db.update(agentRuns).set({ status: 'running' }).where(eq(agentRuns.id, run.id));

  const toolTraces: ToolTrace[] = [];
  let totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  let finalOutput = '';
  let runStatus: 'completed' | 'failed' = 'completed';
  let errorMessage: string | undefined;

  try {
    // 8. Main loop
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      logger.debug({ runId: run.id, iteration, messageCount: messages.length }, 'Runtime loop iteration');

      const response = await openRouterClient.chatCompletion({
        model: modelId,
        messages,
        tools: toolParams.length > 0 ? toolParams : undefined,
        temperature: runtimeConfig.temperature ?? 0.3,
        max_tokens: runtimeConfig.max_tokens ?? 4096,
      });

      // Accumulate usage
      if (response.usage) {
        totalUsage.prompt_tokens += response.usage.prompt_tokens;
        totalUsage.completion_tokens += response.usage.completion_tokens;
        totalUsage.total_tokens += response.usage.total_tokens;
      }

      const choice = response.choices[0];
      if (!choice) {
        throw new AppError(502, 'EMPTY_RESPONSE', 'LLM returned no choices');
      }

      const assistantMessage = choice.message;

      // If tool_calls present — execute tools and continue
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        // Add assistant message with tool calls
        messages.push(assistantMessage);

        await db.update(agentRuns).set({ status: 'tool_executing' }).where(eq(agentRuns.id, run.id));

        for (const toolCall of assistantMessage.tool_calls) {
          const toolSlug = toolCall.function.name;
          let toolInput: Record<string, unknown>;
          try {
            toolInput = JSON.parse(toolCall.function.arguments);
          } catch {
            toolInput = {};
          }

          // Find tool definition
          const toolDef = tools.find(t => t.slug === toolSlug);

          // Create tool call record
          const [tcRecord] = await db.insert(agentRunToolCalls).values({
            run_id: run.id,
            tool_definition_id: toolDef?.id ?? null,
            tool_call_id: toolCall.id,
            tool_name: toolSlug,
            tool_input: toolInput,
            status: 'running',
          }).returning();

          let trace: ToolTrace;
          try {
            const execResult = await executeTool(toolSlug, toolInput, toolDef?.config_json ?? undefined);

            // Update tool call record
            await db.update(agentRunToolCalls).set({
              tool_output: execResult.result,
              status: 'success',
              duration_ms: execResult.duration_ms,
            }).where(eq(agentRunToolCalls.id, tcRecord.id));

            // Add tool result message
            messages.push({
              role: 'tool',
              content: JSON.stringify(execResult.result),
              tool_call_id: toolCall.id,
            });

            trace = {
              tool_call_id: toolCall.id,
              tool_name: toolSlug,
              input: toolInput,
              output: execResult.result,
              status: 'success',
              duration_ms: execResult.duration_ms,
            };
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : 'Unknown error';

            await db.update(agentRunToolCalls).set({
              status: 'error',
              error_message: errMsg,
              duration_ms: 0,
            }).where(eq(agentRunToolCalls.id, tcRecord.id));

            // Still add tool result so the LLM knows about the error
            messages.push({
              role: 'tool',
              content: JSON.stringify({ error: errMsg }),
              tool_call_id: toolCall.id,
            });

            trace = {
              tool_call_id: toolCall.id,
              tool_name: toolSlug,
              input: toolInput,
              output: null,
              status: 'error',
              duration_ms: 0,
              error: errMsg,
            };
          }

          toolTraces.push(trace);
        }

        await db.update(agentRuns).set({ status: 'continuing' }).where(eq(agentRuns.id, run.id));
        continue; // Next iteration — LLM processes tool results
      }

      // No tool calls — final answer
      finalOutput = assistantMessage.content || '';
      break;
    }
  } catch (err) {
    runStatus = 'failed';
    errorMessage = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ runId: run.id, err }, 'Runtime execution failed');
  }

  const latencyMs = Date.now() - startTime;

  // 9. Persist messages
  const allMessages = messages.map(m => ({
    run_id: run.id,
    role: m.role,
    content_text: typeof m.content === 'string' ? m.content : (m.content ? JSON.stringify(m.content) : null),
  }));
  if (allMessages.length > 0) {
    await db.insert(agentRunMessages).values(allMessages);
  }

  // 10. Persist usage
  if (totalUsage.total_tokens > 0) {
    await db.insert(usageLedger).values({
      run_id: run.id,
      provider: 'openrouter',
      model_external_id: modelId,
      provider_name: 'openrouter',
      prompt_tokens: totalUsage.prompt_tokens,
      completion_tokens: totalUsage.completion_tokens,
      total_tokens: totalUsage.total_tokens,
      raw_usage_json: totalUsage as unknown as Record<string, unknown>,
    });
  }

  // 11. Update run with final state
  await db.update(agentRuns).set({
    status: runStatus,
    completed_at: new Date(),
    latency_ms: latencyMs,
    final_output: finalOutput || null,
    output_summary: finalOutput?.slice(0, 200) || null,
    error_message: errorMessage ?? null,
  }).where(eq(agentRuns.id, run.id));

  return {
    run_id: run.id,
    status: runStatus,
    output: finalOutput,
    tool_traces: toolTraces,
    usage: totalUsage.total_tokens > 0 ? { ...totalUsage, estimated_cost: null } : null,
    latency_ms: latencyMs,
  };
}

// --- Query ---

export async function getRun(runId: string, userId: string) {
  const [run] = await db.select().from(agentRuns).where(
    and(eq(agentRuns.id, runId), eq(agentRuns.user_id, userId)),
  ).limit(1);

  if (!run) throw new NotFoundError('Запуск не найден');

  const messages = await db.select().from(agentRunMessages).where(eq(agentRunMessages.run_id, runId)).orderBy(agentRunMessages.created_at);
  const toolCalls = await db.select().from(agentRunToolCalls).where(eq(agentRunToolCalls.run_id, runId)).orderBy(agentRunToolCalls.created_at);

  return { ...run, messages, tool_calls: toolCalls };
}

export async function listRuns(userId: string, agentId?: string) {
  let query = db
    .select({
      id: agentRuns.id,
      agent_id: agentRuns.agent_id,
      status: agentRuns.status,
      mode: agentRuns.mode,
      input_summary: agentRuns.input_summary,
      output_summary: agentRuns.output_summary,
      latency_ms: agentRuns.latency_ms,
      started_at: agentRuns.started_at,
      completed_at: agentRuns.completed_at,
      error_message: agentRuns.error_message,
    })
    .from(agentRuns)
    .where(
      agentId
        ? and(eq(agentRuns.user_id, userId), eq(agentRuns.agent_id, agentId))
        : eq(agentRuns.user_id, userId),
    )
    .orderBy(desc(agentRuns.started_at))
    .limit(100);

  return query;
}
