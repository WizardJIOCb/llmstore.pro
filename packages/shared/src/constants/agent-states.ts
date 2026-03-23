export const AgentRunStatus = {
  PENDING: 'pending',
  PREPARING: 'preparing',
  RUNNING: 'running',
  WAITING_FOR_TOOL: 'waiting_for_tool',
  TOOL_EXECUTING: 'tool_executing',
  CONTINUING: 'continuing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

export type AgentRunStatus = (typeof AgentRunStatus)[keyof typeof AgentRunStatus];

export const agentRunStatusValues = Object.values(AgentRunStatus) as [AgentRunStatus, ...AgentRunStatus[]];

export const AgentRunMode = {
  CHAT: 'chat',
  SCENARIO: 'scenario',
  COMPARISON: 'comparison',
  PREFLIGHT: 'preflight',
} as const;

export type AgentRunMode = (typeof AgentRunMode)[keyof typeof AgentRunMode];

export const agentRunModeValues = Object.values(AgentRunMode) as [AgentRunMode, ...AgentRunMode[]];

export const AgentStatus = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  ARCHIVED: 'archived',
} as const;

export type AgentStatus = (typeof AgentStatus)[keyof typeof AgentStatus];

export const agentStatusValues = Object.values(AgentStatus) as [AgentStatus, ...AgentStatus[]];

export const ResponseMode = {
  TEXT: 'text',
  JSON_OBJECT: 'json_object',
  JSON_SCHEMA: 'json_schema',
} as const;

export type ResponseMode = (typeof ResponseMode)[keyof typeof ResponseMode];

export const responseModeValues = Object.values(ResponseMode) as [ResponseMode, ...ResponseMode[]];

export const ToolCallStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  SUCCESS: 'success',
  ERROR: 'error',
  TIMEOUT: 'timeout',
} as const;

export type ToolCallStatus = (typeof ToolCallStatus)[keyof typeof ToolCallStatus];

export const toolCallStatusValues = Object.values(ToolCallStatus) as [ToolCallStatus, ...ToolCallStatus[]];

export const AssetType = {
  SYSTEM_PROMPT: 'system_prompt',
  JSON_SCHEMA: 'json_schema',
  OUTPUT_SCHEMA: 'output_schema',
  EVAL_DATASET: 'eval_dataset',
  TOOL_DEFINITION: 'tool_definition',
  RAG_PRESET: 'rag_preset',
  GUARDRAIL_RULES: 'guardrail_rules',
  CONNECTOR_TEMPLATE: 'connector_template',
  STARTER_TEMPLATE: 'starter_template',
} as const;

export type AssetType = (typeof AssetType)[keyof typeof AssetType];

export const assetTypeValues = Object.values(AssetType) as [AssetType, ...AssetType[]];

export const AssetFormat = {
  JSON: 'json',
  YAML: 'yaml',
  MARKDOWN: 'markdown',
  TEXT: 'text',
  CSV: 'csv',
  JSONL: 'jsonl',
} as const;

export type AssetFormat = (typeof AssetFormat)[keyof typeof AssetFormat];

export const assetFormatValues = Object.values(AssetFormat) as [AssetFormat, ...AssetFormat[]];

export const RuntimeType = {
  OLLAMA: 'ollama',
  LM_STUDIO: 'lm_studio',
  LLAMA_CPP: 'llama_cpp',
  OPEN_WEBUI: 'open_webui',
  VLLM: 'vllm',
  OTHER: 'other',
} as const;

export type RuntimeType = (typeof RuntimeType)[keyof typeof RuntimeType];

export const runtimeTypeValues = Object.values(RuntimeType) as [RuntimeType, ...RuntimeType[]];

export const BudgetTier = {
  FREE: 'free',
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  ENTERPRISE: 'enterprise',
} as const;

export type BudgetTier = (typeof BudgetTier)[keyof typeof BudgetTier];

export const budgetTierValues = Object.values(BudgetTier) as [BudgetTier, ...BudgetTier[]];

export const ComplexityLevel = {
  SIMPLE: 'simple',
  MODERATE: 'moderate',
  COMPLEX: 'complex',
  EXPERT: 'expert',
} as const;

export type ComplexityLevel = (typeof ComplexityLevel)[keyof typeof ComplexityLevel];

export const complexityLevelValues = Object.values(ComplexityLevel) as [ComplexityLevel, ...ComplexityLevel[]];
