const CHAR_PER_TOKEN_MIXED = 3.5;

export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / CHAR_PER_TOKEN_MIXED);
}

export function calculateCost(
  promptTokens: number,
  completionTokens: number,
  pricingPrompt: number,
  pricingCompletion: number,
  cachedTokens?: number,
): { totalCost: number; cacheDiscount: number } {
  const promptCost = promptTokens * pricingPrompt;
  const completionCost = completionTokens * pricingCompletion;
  const cacheDiscount = cachedTokens ? cachedTokens * pricingPrompt * 0.5 : 0;
  const totalCost = promptCost + completionCost - cacheDiscount;
  return { totalCost: Math.max(0, totalCost), cacheDiscount };
}
