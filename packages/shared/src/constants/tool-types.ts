export const ToolType = {
  HTTP_REQUEST: 'http_request',
  CALCULATOR: 'calculator',
  JSON_TRANSFORM: 'json_transform',
  TEMPLATE_RENDERER: 'template_renderer',
  KNOWLEDGE_LOOKUP: 'knowledge_lookup',
  MOCK_TOOL: 'mock_tool',
  WEBHOOK_CALL: 'webhook_call',
} as const;

export type ToolType = (typeof ToolType)[keyof typeof ToolType];

export const toolTypeValues = Object.values(ToolType) as [ToolType, ...ToolType[]];
