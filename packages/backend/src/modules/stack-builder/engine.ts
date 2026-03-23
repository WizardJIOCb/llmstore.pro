import type {
  StackBuilderInput,
  CatalogItemCard,
  CatalogItemMeta,
  ScoredItem,
  StackRecommendation,
  Confidence,
  CostBand,
  UseCaseSlim,
} from '@llmstore/shared';

// ── Enriched item coming from the service layer ──────────────────────

export interface EnrichedCatalogItem {
  item: CatalogItemCard;
  meta: CatalogItemMeta | null;
  use_cases: UseCaseSlim[];
  model?: {
    context_length: number | null;
    supported_parameters: string[] | null;
    input_modalities: string[] | null;
    pricing_prompt: string | null;
    pricing_completion: string | null;
  };
}

// ── Use-case → use_case slug mapping ─────────────────────────────────

const USE_CASE_SLUG_MAP: Record<string, string[]> = {
  coding_assistant:     ['coding', 'development'],
  customer_support:     ['support', 'chat'],
  content_creation:     ['content', 'summarization'],
  telegram_publishing:  ['telegram-bots', 'content'],
  rag_knowledge_base:   ['rag', 'data-extraction'],
  document_extraction:  ['data-extraction', 'ocr'],
  ocr_speech_pipeline:  ['ocr', 'voice'],
  internal_business:    ['automation', 'analytics'],
  experimentation:      ['coding', 'agentic-workflows'],
  local_private:        ['chat', 'coding'],
  custom:               [],
};

// ── Hard exclusion checks ────────────────────────────────────────────

function isHardExcluded(item: EnrichedCatalogItem, input: StackBuilderInput): boolean {
  const meta = item.meta;
  const model = item.model;

  // User = local only, item = cloud only
  if (input.deployment_preference === 'local' && meta?.deployment_type === 'cloud') {
    return true;
  }

  // User needs structured_outputs, model lacks support
  if (
    input.capabilities_needed.includes('structured_outputs') &&
    model &&
    !model.supported_parameters?.some((p) => p === 'json_mode' || p === 'json_schema' || p === 'response_format')
  ) {
    return true;
  }

  // User needs tool_calling, model lacks tools
  if (
    input.capabilities_needed.includes('tool_calling') &&
    model &&
    !model.supported_parameters?.includes('tools')
  ) {
    return true;
  }

  // User = Russian critical, item = English only
  if (input.language_requirement === 'russian_primary' && meta?.language_support === 'en') {
    return true;
  }

  // User = must_offline, item = cloud + public_api
  if (
    input.privacy_requirement === 'must_offline' &&
    meta?.deployment_type === 'cloud' &&
    meta?.privacy_type === 'public_api'
  ) {
    return true;
  }

  return false;
}

// ── Scoring functions ────────────────────────────────────────────────

function scoreUseCase(item: EnrichedCatalogItem, input: StackBuilderInput): number {
  if (input.use_case === 'custom') return 0;
  const targetSlugs = USE_CASE_SLUG_MAP[input.use_case] ?? [];
  if (targetSlugs.length === 0) return 0;

  const itemSlugs = item.use_cases.map((uc) => uc.slug);
  const exact = targetSlugs.some((s) => itemSlugs.includes(s));
  return exact ? 25 : 0;
}

function scoreCapabilities(item: EnrichedCatalogItem, input: StackBuilderInput): number {
  let score = 0;
  const model = item.model;
  const meta = item.meta;

  for (const cap of input.capabilities_needed) {
    switch (cap) {
      case 'tool_calling':
        if (model?.supported_parameters?.includes('tools')) score += 15;
        else if (item.item.type === 'tool') score += 15;
        break;
      case 'structured_outputs':
        if (model?.supported_parameters?.some((p) => p === 'json_mode' || p === 'json_schema' || p === 'response_format'))
          score += 15;
        break;
      case 'vision':
        if (model?.input_modalities?.includes('image')) score += 15;
        break;
      case 'long_context':
        if (model?.context_length && model.context_length >= 100_000) score += 15;
        break;
      case 'reasoning':
        if (item.item.tags.some((t) => t.slug === 'reasoning')) score += 15;
        break;
      case 'low_latency':
        if (meta?.deployment_type === 'cloud') score += 15;
        break;
      case 'cheap_inference':
        if (meta?.pricing_type === 'free' || meta?.pricing_type === 'open_source') score += 15;
        else if (model?.pricing_prompt && parseFloat(model.pricing_prompt) < 0.001) score += 15;
        break;
      case 'local_support':
        if (meta?.deployment_type === 'local' || meta?.deployment_type === 'self_hosted' || meta?.deployment_type === 'hybrid')
          score += 15;
        break;
    }
  }
  return score;
}

function scoreDeployment(item: EnrichedCatalogItem, input: StackBuilderInput): number {
  const dep = input.deployment_preference;
  const itemDep = item.meta?.deployment_type;
  if (dep === 'not_sure') return 10;
  if (!itemDep) return 5;
  if (dep === itemDep) return 20;
  if (itemDep === 'hybrid') return 15;
  if (dep === 'hybrid') return 10;
  return 0;
}

function scoreLanguage(item: EnrichedCatalogItem, input: StackBuilderInput): number {
  const lang = input.language_requirement;
  const itemLang = item.meta?.language_support;
  if (lang === 'no_preference') return 10;
  if (!itemLang) return 5;
  if (itemLang === 'multilingual') return 20;
  if (lang === 'russian_primary' && itemLang === 'ru') return 20;
  if (lang === 'english_primary' && itemLang === 'en') return 20;
  if (lang === 'multilingual') return 15;
  return 0;
}

function scorePrivacy(item: EnrichedCatalogItem, input: StackBuilderInput): number {
  const req = input.privacy_requirement;
  const itemPriv = item.meta?.privacy_type;
  if (req === 'no_special') return 20;
  if (!itemPriv) return 5;

  if (req === 'prefer_private') {
    if (itemPriv === 'private' || itemPriv === 'zero_retention' || itemPriv === 'offline') return 20;
    return 5;
  }
  if (req === 'must_offline') {
    if (itemPriv === 'offline') return 20;
    if (itemPriv === 'private') return 5;
    return 0;
  }
  if (req === 'zero_retention') {
    if (itemPriv === 'zero_retention' || itemPriv === 'offline') return 20;
    if (itemPriv === 'private') return 10;
    return 0;
  }
  if (req === 'self_hosted') {
    if (item.meta?.deployment_type === 'self_hosted' || item.meta?.deployment_type === 'local') return 20;
    return 5;
  }
  return 10;
}

function scoreHardware(item: EnrichedCatalogItem, input: StackBuilderInput): number {
  const hw = input.hardware_tier;
  if (!hw) return 10;
  const itemDep = item.meta?.deployment_type;

  if (hw === 'cloud_only') {
    return itemDep === 'cloud' ? 15 : 5;
  }
  if (hw === 'cpu_only') {
    if (item.item.type === 'local_build') return 10;
    if (itemDep === 'cloud') return 15;
    return 5;
  }
  // GPU tiers favor local builds and self-hosted
  if (itemDep === 'local' || itemDep === 'self_hosted' || itemDep === 'hybrid') return 15;
  return 10;
}

function scoreCost(item: EnrichedCatalogItem, input: StackBuilderInput): number {
  const budget = input.budget_sensitivity;
  const pricing = item.meta?.pricing_type;
  if (!pricing) return 5;

  if (budget === 'free_only') {
    if (pricing === 'free' || pricing === 'open_source') return 15;
    return 0;
  }
  if (budget === 'low') {
    if (pricing === 'free' || pricing === 'open_source') return 15;
    if (pricing === 'api_based' || pricing === 'freemium') return 8;
    return 0;
  }
  if (budget === 'medium') {
    if (pricing === 'free' || pricing === 'open_source' || pricing === 'api_based' || pricing === 'freemium') return 15;
    return 5;
  }
  if (budget === 'high' || budget === 'enterprise' || budget === 'not_sure') {
    return 15;
  }
  return 10;
}

function scoreComplexity(item: EnrichedCatalogItem, input: StackBuilderInput): number {
  const skill = input.skill_level;
  const diff = item.meta?.difficulty;
  if (!skill || !diff) return 0;

  if (skill === 'beginner' && diff === 'advanced') return -10;
  if (skill === 'intermediate' && diff === 'advanced') return -5;
  return 0;
}

function computeConfidence(breakdown: Record<string, number>, maxPossible: number): Confidence {
  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const ratio = total / Math.max(maxPossible, 1);
  if (ratio >= 0.6) return 'high';
  if (ratio >= 0.35) return 'medium';
  return 'low';
}

// ── Main scoring entry point ─────────────────────────────────────────

export function scoreAndRank(
  items: EnrichedCatalogItem[],
  input: StackBuilderInput,
): ScoredItem[] {
  const maxCapScore = input.capabilities_needed.length * 15;
  const maxPossible = 100 + 25 + maxCapScore + 20 + 20 + 20 + 15 + 15;

  const scored: ScoredItem[] = [];

  for (const enriched of items) {
    if (isHardExcluded(enriched, input)) continue;

    const breakdown: Record<string, number> = {
      base: enriched.item.curated_score,
      use_case: scoreUseCase(enriched, input),
      capabilities: scoreCapabilities(enriched, input),
      deployment: scoreDeployment(enriched, input),
      language: scoreLanguage(enriched, input),
      privacy: scorePrivacy(enriched, input),
      hardware: scoreHardware(enriched, input),
      cost: scoreCost(enriched, input),
      complexity: scoreComplexity(enriched, input),
    };

    const penalties: string[] = [];
    if (breakdown.complexity < 0) penalties.push('Сложность выше вашего уровня');

    const total = Math.max(0, Object.values(breakdown).reduce((a, b) => a + b, 0));

    scored.push({
      catalog_item: enriched.item,
      score: total,
      compatibility_breakdown: breakdown,
      penalties,
      confidence: computeConfidence(breakdown, maxPossible),
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

// ── Winner selection ─────────────────────────────────────────────────

export interface WinnerSet {
  best_overall: ScoredItem | null;
  cheapest: ScoredItem | null;
  best_privacy: ScoredItem | null;
  best_russian: ScoredItem | null;
  best_self_hosted: ScoredItem | null;
}

export function selectWinners(scored: ScoredItem[]): WinnerSet {
  const best_overall = scored[0] ?? null;

  const threshold = best_overall ? best_overall.score * 0.5 : 0;
  const viable = scored.filter((s) => s.score >= threshold);

  const cheapest = findBestWith(viable, (s) => {
    const pricing = s.catalog_item.meta?.pricing_type;
    return pricing === 'free' || pricing === 'open_source';
  }) ?? findBestWith(viable, (s) => {
    const pricing = s.catalog_item.meta?.pricing_type;
    return pricing === 'freemium' || pricing === 'api_based';
  });

  const best_privacy = findBestWith(scored, (s) => {
    const privacy = s.catalog_item.meta?.privacy_type;
    return privacy === 'offline' || privacy === 'private' || privacy === 'zero_retention';
  });

  const best_russian = findBestWith(scored, (s) => {
    const lang = s.catalog_item.meta?.language_support;
    return lang === 'ru' || lang === 'multilingual';
  });

  const best_self_hosted = findBestWith(scored, (s) => {
    const dep = s.catalog_item.meta?.deployment_type;
    return dep === 'local' || dep === 'self_hosted';
  });

  return { best_overall, cheapest, best_privacy, best_russian, best_self_hosted };
}

function findBestWith(scored: ScoredItem[], pred: (s: ScoredItem) => boolean): ScoredItem | null {
  return scored.find(pred) ?? null;
}

// ── Rationale generation (template-based) ────────────────────────────

const USE_CASE_LABELS: Record<string, string> = {
  coding_assistant: 'помощник разработчика',
  customer_support: 'поддержка клиентов',
  content_creation: 'создание контента',
  telegram_publishing: 'публикация в Telegram',
  rag_knowledge_base: 'RAG / база знаний',
  document_extraction: 'извлечение из документов',
  ocr_speech_pipeline: 'OCR / речевой пайплайн',
  internal_business: 'внутренний бизнес-ассистент',
  experimentation: 'эксперименты / прототипирование',
  local_private: 'локальный приватный ассистент',
  custom: 'произвольная задача',
};

export function generateRationale(
  input: StackBuilderInput,
  winners: WinnerSet,
  allScored: ScoredItem[],
): { rationale: string[]; tradeoffs: string[]; next_steps: string[] } {
  const rationale: string[] = [];
  const tradeoffs: string[] = [];
  const next_steps: string[] = [];

  const ucLabel = USE_CASE_LABELS[input.use_case] ?? input.use_case;

  if (winners.best_overall) {
    rationale.push(
      `Для задачи "${ucLabel}" лучший выбор — ${winners.best_overall.catalog_item.title} (оценка совместимости: ${winners.best_overall.score}).`,
    );
    if (winners.best_overall.confidence === 'high') {
      rationale.push('Этот вариант имеет высокую совместимость с вашими требованиями.');
    } else if (winners.best_overall.confidence === 'medium') {
      rationale.push('Совместимость средняя — рекомендуем проверить детали требований.');
    }
  }

  if (allScored.length === 0) {
    rationale.push('К сожалению, не удалось найти подходящих элементов по вашим критериям. Попробуйте смягчить требования.');
  }

  // Tradeoffs
  if (winners.cheapest && winners.best_overall && winners.cheapest.catalog_item.id !== winners.best_overall.catalog_item.id) {
    tradeoffs.push(
      `Если бюджет ограничен, рассмотрите ${winners.cheapest.catalog_item.title} (${winners.cheapest.catalog_item.meta?.pricing_type ?? 'н/д'}).`,
    );
  }
  if (winners.best_privacy && winners.best_overall && winners.best_privacy.catalog_item.id !== winners.best_overall.catalog_item.id) {
    tradeoffs.push(
      `Для максимальной приватности — ${winners.best_privacy.catalog_item.title} (${winners.best_privacy.catalog_item.meta?.privacy_type ?? 'н/д'}).`,
    );
  }
  if (winners.best_russian && winners.best_overall && winners.best_russian.catalog_item.id !== winners.best_overall.catalog_item.id) {
    tradeoffs.push(
      `Лучший вариант для русского языка — ${winners.best_russian.catalog_item.title}.`,
    );
  }
  if (winners.best_self_hosted && winners.best_overall && winners.best_self_hosted.catalog_item.id !== winners.best_overall.catalog_item.id) {
    tradeoffs.push(
      `Для self-hosted развёртывания — ${winners.best_self_hosted.catalog_item.title}.`,
    );
  }

  // Next steps
  next_steps.push('Сохраните результат, чтобы вернуться к нему позже.');
  if (winners.best_overall) {
    next_steps.push('Создайте агента на основе этой рекомендации.');
  }
  next_steps.push('Экспортируйте результат в Markdown или JSON для отчёта.');

  return { rationale, tradeoffs, next_steps };
}

// ── Cost band estimation ─────────────────────────────────────────────

export function determineCostBand(winners: WinnerSet): CostBand {
  const item = winners.best_overall;
  if (!item) return 'free';

  const pricing = item.catalog_item.meta?.pricing_type;
  if (pricing === 'free' || pricing === 'open_source') return 'free';
  if (pricing === 'freemium') return 'low';
  if (pricing === 'api_based') return 'medium';
  if (pricing === 'paid') return 'high';
  if (pricing === 'enterprise') return 'enterprise';
  return 'medium';
}
