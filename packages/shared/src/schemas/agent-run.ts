import { z } from 'zod';
import { agentRunModeValues } from '../constants/index.js';

export const startRunSchema = z.object({
  agent_id: z.string().uuid(),
  agent_version_id: z.string().uuid().optional(),
  mode: z.enum(agentRunModeValues).default('chat'),
  model_id_override: z.string().uuid().optional(),
  input: z.object({
    messages: z
      .array(
        z.object({
          role: z.enum(['user', 'assistant']),
          content: z.string(),
        }),
      )
      .optional(),
    variables: z.record(z.string()).optional(),
    scenario_id: z.string().uuid().optional(),
  }),
  session_key: z.string().optional(),
  stream: z.boolean().default(true),
});

export type StartRunInput = z.infer<typeof startRunSchema>;

export const SSEEventType = {
  STATUS: 'status',
  CONTENT_DELTA: 'content_delta',
  TOOL_CALL_START: 'tool_call_start',
  TOOL_CALL_ARGS: 'tool_call_args',
  TOOL_RESULT: 'tool_result',
  USAGE: 'usage',
  COST: 'cost',
  DONE: 'done',
  ERROR: 'error',
  HEARTBEAT: 'heartbeat',
} as const;

export type SSEEventType = (typeof SSEEventType)[keyof typeof SSEEventType];
