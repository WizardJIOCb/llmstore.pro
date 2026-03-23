import { logger } from '../../../lib/logger.js';
import { AppError } from '../../../middleware/error-handler.js';
import { executeDtfFeed } from './dtf-feed.executor.js';
import { executeDtfArticleFetch } from './dtf-article.executor.js';
import { executeDtfPopularFeed } from './dtf-popular-feed.executor.js';
import type { ToolExecutionResult } from '../types.js';

type ToolExecutor = (input: Record<string, unknown>) => Promise<Record<string, unknown>>;

const executorRegistry = new Map<string, ToolExecutor>();

// Register DTF executors (dispatched by slug)
executorRegistry.set('dtf-latest-feed', async (input) => {
  const result = await executeDtfFeed(input as { limit?: number });
  return result as unknown as Record<string, unknown>;
});

executorRegistry.set('dtf-article-fetch', async (input) => {
  const result = await executeDtfArticleFetch(input as { url: string });
  return result as unknown as Record<string, unknown>;
});

executorRegistry.set('dtf-popular-feed', async (input) => {
  const result = await executeDtfPopularFeed(input as { sorting?: string; period?: string; limit?: number });
  return result as unknown as Record<string, unknown>;
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
    return { result: Number(result) };
  } catch {
    throw new AppError(400, 'EVAL_ERROR', 'Failed to evaluate expression');
  }
});

// Mock tool executor
executorRegistry.set('mock-tool', async (input) => {
  return { result: 'mock data', echo: input };
});

export async function executeTool(
  slug: string,
  input: Record<string, unknown>,
  _config?: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const executor = executorRegistry.get(slug);
  if (!executor) {
    throw new AppError(400, 'UNKNOWN_TOOL', `No executor registered for tool: ${slug}`);
  }

  const startTime = Date.now();
  try {
    logger.debug({ slug, input }, 'Executing tool');
    const result = await executor(input);
    const duration_ms = Date.now() - startTime;
    logger.debug({ slug, duration_ms }, 'Tool execution complete');
    return { result, duration_ms };
  } catch (err) {
    const duration_ms = Date.now() - startTime;
    logger.error({ slug, duration_ms, err }, 'Tool execution failed');
    throw err;
  }
}
