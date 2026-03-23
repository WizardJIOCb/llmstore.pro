import { env } from '../../config/env.js';
import { OpenRouterClient } from './client.js';

export const openRouterClient = new OpenRouterClient(env.OPENROUTER_API_KEY);

export { OpenRouterClient } from './client.js';
export type * from './types.js';
