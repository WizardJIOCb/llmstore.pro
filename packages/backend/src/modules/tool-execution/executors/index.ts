import { logger } from '../../../lib/logger.js';
import { AppError } from '../../../middleware/error-handler.js';
import { executeDtfFeed } from './dtf-feed.executor.js';
import { executeDtfArticleFetch } from './dtf-article.executor.js';
import { executeDtfPopularFeed } from './dtf-popular-feed.executor.js';
import { executeDtfSearch } from './dtf-search.executor.js';
import { executeHttpRequest } from './http-request.executor.js';
import { executeWebSearchCascade } from './web-search-cascade.executor.js';
import { executeJsonTransform } from './json-transform.executor.js';
import { executeLlmOrchestratorWorker } from './llm-orchestrator-worker.executor.js';
import { executeTemplateRenderer } from './template-renderer.executor.js';
import { executeChatFileCreate } from './chat-file-create.executor.js';
import type { ToolExecutionResult } from '../types.js';

type ToolExecutorOutput = {
  payload: Record<string, unknown>;
  usage?: ToolExecutionResult['usage'];
};

type ToolExecutor = (
  input: Record<string, unknown>,
  config?: Record<string, unknown>,
) => Promise<ToolExecutorOutput>;

const executorRegistry = new Map<string, ToolExecutor>();

// Register DTF executors (dispatched by slug)
executorRegistry.set('dtf-latest-feed', async (input) => {
  const result = await executeDtfFeed(input as { limit?: number });
  return { payload: result as unknown as Record<string, unknown> };
});

executorRegistry.set('dtf-article-fetch', async (input) => {
  const result = await executeDtfArticleFetch(input as { url: string });
  return { payload: result as unknown as Record<string, unknown> };
});

executorRegistry.set('dtf-popular-feed', async (input) => {
  const result = await executeDtfPopularFeed(input as { sorting?: string; period?: string; limit?: number });
  return { payload: result as unknown as Record<string, unknown> };
});

executorRegistry.set('dtf-search-articles', async (input) => {
  const result = await executeDtfSearch(input as { query: string; period?: string; limit?: number });
  return { payload: result as unknown as Record<string, unknown> };
});

executorRegistry.set('http-request', async (input, config) => {
  return { payload: await executeHttpRequest(input, config) };
});

executorRegistry.set('web-search-cascade', async (input, config) => {
  return { payload: await executeWebSearchCascade(input, config) };
});

// Calculator executor
executorRegistry.set('calculator', async (input) => {
  const expr = String(input.expression || '');
  // Simple and safe math evaluation — only allow digits, operators, parentheses, dots
  if (!/^[\d\s+\-*/().%]+$/.test(expr)) {
    throw new AppError(400, 'INVALID_EXPRESSION', 'Expression contains invalid characters');
  }
  try {
    // Use Function constructor for basic math (safe since we validated the input)
    const fn = new Function(`"use strict"; return (${expr})`);
    const result = fn();
    return { payload: { result: Number(result) } };
  } catch {
    throw new AppError(400, 'EVAL_ERROR', 'Failed to evaluate expression');
  }
});

executorRegistry.set('json-transform', async (input) => {
  return { payload: await executeJsonTransform(input) };
});

executorRegistry.set('template-renderer', async (input) => {
  return { payload: await executeTemplateRenderer(input) };
});

executorRegistry.set('create-chat-files', async (input, config) => {
  return { payload: await executeChatFileCreate(input, config) };
});

executorRegistry.set('llm-orchestrator-worker', async (input, config) => {
  return executeLlmOrchestratorWorker(input, config);
});

// Mock tool executor
executorRegistry.set('mock-tool', async (input) => {
  return { payload: { result: 'mock data', echo: input } };
});

export async function executeTool(
  slug: string,
  input: Record<string, unknown>,
  config?: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const executor = executorRegistry.get(slug);
  if (!executor) {
    throw new AppError(400, 'UNKNOWN_TOOL', `No executor registered for tool: ${slug}`);
  }

  const startTime = Date.now();
  try {
    logger.debug({ slug, input }, 'Executing tool');
    const result = await executor(input, config);
    const duration_ms = Date.now() - startTime;
    logger.debug({ slug, duration_ms }, 'Tool execution complete');
    return { result: result.payload, duration_ms, usage: result.usage };
  } catch (err) {
    const duration_ms = Date.now() - startTime;
    logger.error({ slug, duration_ms, err }, 'Tool execution failed');
    throw err;
  }
}
