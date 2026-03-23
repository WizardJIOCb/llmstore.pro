import {
  stackBuilderInputSchema,
  saveStackResultSchema,
  exportStackSchema,
  createAgentFromStackSchema,
} from '@llmstore/shared/schemas';
import { validate } from '../../middleware/validate.js';

export const validateRecommend = validate(stackBuilderInputSchema, 'body');
export const validateSave = validate(saveStackResultSchema, 'body');
export const validateExport = validate(exportStackSchema, 'body');
export const validateCreateAgent = validate(createAgentFromStackSchema, 'body');
