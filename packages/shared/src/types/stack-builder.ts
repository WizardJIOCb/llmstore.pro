import type { CatalogItemCard } from './catalog.js';
import type { CostBand, Confidence } from '../constants/stack-wizard.js';
import type { StackBuilderInput } from '../schemas/stack-builder.js';

export interface ScoredItem {
  catalog_item: CatalogItemCard;
  score: number;
  compatibility_breakdown: Record<string, number>;
  penalties: string[];
  confidence: Confidence;
}

export interface StackRecommendation {
  best_overall: ScoredItem | null;
  cheapest: ScoredItem | null;
  best_privacy: ScoredItem | null;
  best_russian: ScoredItem | null;
  best_self_hosted: ScoredItem | null;
  all_scored: ScoredItem[];
  rationale: string[];
  tradeoffs: string[];
  next_steps: string[];
  cost_band: CostBand;
  generated_at: string;
}

export interface SavedStackResult {
  id: string;
  user_id: string;
  name: string | null;
  builder_answers: StackBuilderInput;
  recommended_result: StackRecommendation;
  created_at: string;
}
