export const ContentType = {
  TOOL: 'tool',
  MODEL: 'model',
  PROMPT_PACK: 'prompt_pack',
  WORKFLOW_PACK: 'workflow_pack',
  BUSINESS_AGENT: 'business_agent',
  DEVELOPER_ASSET: 'developer_asset',
  LOCAL_BUILD: 'local_build',
  STACK_PRESET: 'stack_preset',
  GUIDE: 'guide',
} as const;

export type ContentType = (typeof ContentType)[keyof typeof ContentType];

export const contentTypeValues = Object.values(ContentType) as [ContentType, ...ContentType[]];
