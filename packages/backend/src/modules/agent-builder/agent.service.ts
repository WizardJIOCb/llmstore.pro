import { db } from '../../config/database.js';
import {
  agents, agentVersions, agentVersionTools, toolDefinitions,
} from '../../db/schema/agents.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import { NotFoundError, AppError } from '../../middleware/error-handler.js';
import { v4 as uuidv4 } from 'uuid';

// --- Types ---

interface CreateAgentInput {
  name: string;
  slug?: string;
  description?: string;
  visibility?: 'public' | 'private' | 'unlisted';
  // Initial version fields
  system_prompt?: string;
  model_id?: string | null;
  runtime_config?: Record<string, unknown>;
  tool_ids?: string[];
}

interface UpdateAgentInput {
  name?: string;
  description?: string;
  visibility?: 'public' | 'private' | 'unlisted';
  status?: 'draft' | 'active' | 'archived';
}

interface CreateVersionInput {
  system_prompt?: string;
  model_id?: string | null;
  runtime_config?: Record<string, unknown>;
  tool_ids?: string[];
  response_mode?: 'text' | 'json_object' | 'json_schema';
}

// --- Helpers ---

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[а-яё]/g, (c) => {
      const map: Record<string, string> = {
        'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh',
        'з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o',
        'п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts',
        'ч':'ch','ш':'sh','щ':'shch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya',
      };
      return map[c] || c;
    })
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 200)
    + '-' + uuidv4().slice(0, 6);
}

// --- Service ---

export async function createAgent(userId: string, input: CreateAgentInput) {
  const slug = input.slug || generateSlug(input.name);

  // Create agent
  const [agent] = await db.insert(agents).values({
    owner_user_id: userId,
    name: input.name,
    slug,
    description: input.description ?? null,
    visibility: input.visibility ?? 'private',
    status: 'active',
  }).returning();

  // Create version 1
  const [version] = await db.insert(agentVersions).values({
    agent_id: agent.id,
    version_number: 1,
    system_prompt: input.system_prompt ?? null,
    model_id: input.model_id ?? null,
    runtime_config: input.runtime_config ?? { max_iterations: 4, temperature: 0.3, max_tokens: 4096 },
    response_mode: 'text',
  }).returning();

  // Link tools
  if (input.tool_ids?.length) {
    await db.insert(agentVersionTools).values(
      input.tool_ids.map((tid, idx) => ({
        agent_version_id: version.id,
        tool_definition_id: tid,
        is_required: false,
        order_index: idx,
      })),
    );
  }

  // Update current_version_id
  await db.update(agents).set({ current_version_id: version.id }).where(eq(agents.id, agent.id));

  return { ...agent, current_version_id: version.id, version };
}

export async function getAgent(agentId: string, userId: string) {
  const [agent] = await db.select().from(agents).where(
    and(eq(agents.id, agentId), eq(agents.owner_user_id, userId)),
  ).limit(1);

  if (!agent) throw new NotFoundError('Агент не найден');

  // Load current version
  let version = null;
  if (agent.current_version_id) {
    [version] = await db.select().from(agentVersions).where(eq(agentVersions.id, agent.current_version_id)).limit(1);
  }

  // Load tools for version
  let tools: Array<typeof toolDefinitions.$inferSelect> = [];
  if (version) {
    const versionTools = await db
      .select({ tool: toolDefinitions })
      .from(agentVersionTools)
      .innerJoin(toolDefinitions, eq(agentVersionTools.tool_definition_id, toolDefinitions.id))
      .where(eq(agentVersionTools.agent_version_id, version.id))
      .orderBy(agentVersionTools.order_index);
    tools = versionTools.map(vt => vt.tool);
  }

  return { ...agent, version, tools };
}

export async function getAgentById(agentId: string) {
  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
  if (!agent) throw new NotFoundError('Агент не найден');

  let version = null;
  if (agent.current_version_id) {
    [version] = await db.select().from(agentVersions).where(eq(agentVersions.id, agent.current_version_id)).limit(1);
  }

  let tools: Array<typeof toolDefinitions.$inferSelect> = [];
  if (version) {
    const versionTools = await db
      .select({ tool: toolDefinitions })
      .from(agentVersionTools)
      .innerJoin(toolDefinitions, eq(agentVersionTools.tool_definition_id, toolDefinitions.id))
      .where(eq(agentVersionTools.agent_version_id, version.id))
      .orderBy(agentVersionTools.order_index);
    tools = versionTools.map(vt => vt.tool);
  }

  return { ...agent, version, tools };
}

export async function listAgents(userId: string) {
  const result = await db
    .select()
    .from(agents)
    .where(eq(agents.owner_user_id, userId))
    .orderBy(desc(agents.created_at));

  return result;
}

export async function updateAgent(agentId: string, userId: string, input: UpdateAgentInput) {
  const [existing] = await db.select().from(agents).where(
    and(eq(agents.id, agentId), eq(agents.owner_user_id, userId)),
  ).limit(1);

  if (!existing) throw new NotFoundError('Агент не найден');

  const [updated] = await db
    .update(agents)
    .set(input)
    .where(eq(agents.id, agentId))
    .returning();

  return updated;
}

export async function deleteAgent(agentId: string, userId: string) {
  const [existing] = await db.select().from(agents).where(
    and(eq(agents.id, agentId), eq(agents.owner_user_id, userId)),
  ).limit(1);

  if (!existing) throw new NotFoundError('Агент не найден');

  await db.delete(agents).where(eq(agents.id, agentId));
}

export async function createAgentVersion(agentId: string, userId: string, input: CreateVersionInput) {
  // Verify ownership
  const [agent] = await db.select().from(agents).where(
    and(eq(agents.id, agentId), eq(agents.owner_user_id, userId)),
  ).limit(1);

  if (!agent) throw new NotFoundError('Агент не найден');

  // Get latest version number
  const [latest] = await db
    .select({ version_number: agentVersions.version_number })
    .from(agentVersions)
    .where(eq(agentVersions.agent_id, agentId))
    .orderBy(desc(agentVersions.version_number))
    .limit(1);

  const nextVersion = (latest?.version_number ?? 0) + 1;

  const [version] = await db.insert(agentVersions).values({
    agent_id: agentId,
    version_number: nextVersion,
    system_prompt: input.system_prompt ?? null,
    model_id: input.model_id ?? null,
    runtime_config: input.runtime_config ?? { max_iterations: 4, temperature: 0.3, max_tokens: 4096 },
    response_mode: input.response_mode ?? 'text',
  }).returning();

  // Link tools
  if (input.tool_ids?.length) {
    await db.insert(agentVersionTools).values(
      input.tool_ids.map((tid, idx) => ({
        agent_version_id: version.id,
        tool_definition_id: tid,
        is_required: false,
        order_index: idx,
      })),
    );
  }

  // Update current_version_id
  await db.update(agents).set({ current_version_id: version.id }).where(eq(agents.id, agentId));

  return version;
}

// --- Analytics ---

export interface AgentStatsRow {
  agent_id: string;
  total_runs: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_cost: string;
  total_latency_ms: number;
  last_run_at: string | null;
}

export async function getAgentStats(userId: string): Promise<Record<string, AgentStatsRow>> {
  const rows = await db.execute<{
    agent_id: string;
    total_runs: string;
    total_prompt_tokens: string;
    total_completion_tokens: string;
    total_cost: string;
    total_latency_ms: string;
    last_run_at: string | null;
  }>(sql`
    SELECT
      ar.agent_id,
      COUNT(ar.id)                                        AS total_runs,
      COALESCE(SUM(ul.prompt_tokens), 0)                  AS total_prompt_tokens,
      COALESCE(SUM(ul.completion_tokens), 0)               AS total_completion_tokens,
      COALESCE(SUM(ul.estimated_cost::numeric), 0)         AS total_cost,
      COALESCE(SUM(ar.latency_ms), 0)                     AS total_latency_ms,
      MAX(ar.started_at)                                   AS last_run_at
    FROM agent_runs ar
    LEFT JOIN usage_ledger ul ON ul.run_id = ar.id
    WHERE ar.user_id = ${userId}
    GROUP BY ar.agent_id
  `);

  const result: Record<string, AgentStatsRow> = {};
  for (const row of rows) {
    result[row.agent_id] = {
      agent_id: row.agent_id,
      total_runs: Number(row.total_runs),
      total_prompt_tokens: Number(row.total_prompt_tokens),
      total_completion_tokens: Number(row.total_completion_tokens),
      total_cost: String(row.total_cost),
      total_latency_ms: Number(row.total_latency_ms),
      last_run_at: row.last_run_at ? String(row.last_run_at) : null,
    };
  }
  return result;
}

export async function listBuiltinTools() {
  return db
    .select()
    .from(toolDefinitions)
    .where(and(eq(toolDefinitions.is_builtin, true), eq(toolDefinitions.is_active, true)));
}
