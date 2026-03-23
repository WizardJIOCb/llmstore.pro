import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../../config/database.js';
import {
  catalogItems, catalogItemMeta, catalogItemTags, catalogItemUseCases,
  tags, useCases, categories, catalogItemCategories,
} from '../../db/schema/catalog.js';
import { aiModels } from '../../db/schema/models.js';
import { savedStackResults } from '../../db/schema/user-data.js';
import { agents, agentVersions } from '../../db/schema/agents.js';
import { NotFoundError } from '../../middleware/error-handler.js';
import { generateSlug } from '@llmstore/shared/utils';
import type {
  StackBuilderInput,
  StackRecommendation,
  SaveStackResultInput,
  ExportStackInput,
  CreateAgentFromStackInput,
  CatalogItemCard,
  TagSlim,
  CategorySlim,
  UseCaseSlim,
  SavedStackResult,
} from '@llmstore/shared';
import {
  scoreAndRank,
  selectWinners,
  generateRationale,
  determineCostBand,
  type EnrichedCatalogItem,
} from './engine.js';
import { toJson, toMarkdown } from './formatters.js';

// ── Helpers for eager-loading relations ───────────────────────────────

async function loadTagsForItems(itemIds: string[]): Promise<Map<string, TagSlim[]>> {
  if (itemIds.length === 0) return new Map();
  const rows = await db
    .select({
      item_id: catalogItemTags.item_id,
      id: tags.id,
      name: tags.name,
      slug: tags.slug,
    })
    .from(catalogItemTags)
    .innerJoin(tags, eq(catalogItemTags.tag_id, tags.id))
    .where(inArray(catalogItemTags.item_id, itemIds));

  const map = new Map<string, TagSlim[]>();
  for (const r of rows) {
    const arr = map.get(r.item_id) ?? [];
    arr.push({ id: r.id, name: r.name, slug: r.slug });
    map.set(r.item_id, arr);
  }
  return map;
}

async function loadCategoriesForItems(itemIds: string[]): Promise<Map<string, CategorySlim[]>> {
  if (itemIds.length === 0) return new Map();
  const rows = await db
    .select({
      item_id: catalogItemCategories.item_id,
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      parent_id: categories.parent_id,
    })
    .from(catalogItemCategories)
    .innerJoin(categories, eq(catalogItemCategories.category_id, categories.id))
    .where(inArray(catalogItemCategories.item_id, itemIds));

  const map = new Map<string, CategorySlim[]>();
  for (const r of rows) {
    const arr = map.get(r.item_id) ?? [];
    arr.push({ id: r.id, name: r.name, slug: r.slug, parent_id: r.parent_id });
    map.set(r.item_id, arr);
  }
  return map;
}

async function loadUseCasesForItems(itemIds: string[]): Promise<Map<string, UseCaseSlim[]>> {
  if (itemIds.length === 0) return new Map();
  const rows = await db
    .select({
      item_id: catalogItemUseCases.item_id,
      id: useCases.id,
      name: useCases.name,
      slug: useCases.slug,
    })
    .from(catalogItemUseCases)
    .innerJoin(useCases, eq(catalogItemUseCases.use_case_id, useCases.id))
    .where(inArray(catalogItemUseCases.item_id, itemIds));

  const map = new Map<string, UseCaseSlim[]>();
  for (const r of rows) {
    const arr = map.get(r.item_id) ?? [];
    arr.push({ id: r.id, name: r.name, slug: r.slug });
    map.set(r.item_id, arr);
  }
  return map;
}

// ── Main service functions ───────────────────────────────────────────

export async function generateRecommendation(input: StackBuilderInput): Promise<StackRecommendation> {
  // 1. Fetch all published+public catalog items with meta
  const itemsWithMeta = await db
    .select({
      id: catalogItems.id,
      type: catalogItems.type,
      title: catalogItems.title,
      slug: catalogItems.slug,
      short_description: catalogItems.short_description,
      hero_image_url: catalogItems.hero_image_url,
      curated_score: catalogItems.curated_score,
      featured: catalogItems.featured,
      published_at: catalogItems.published_at,
      pricing_type: catalogItemMeta.pricing_type,
      deployment_type: catalogItemMeta.deployment_type,
      privacy_type: catalogItemMeta.privacy_type,
      language_support: catalogItemMeta.language_support,
      difficulty: catalogItemMeta.difficulty,
      readiness: catalogItemMeta.readiness,
      vendor_name: catalogItemMeta.vendor_name,
      source_url: catalogItemMeta.source_url,
      docs_url: catalogItemMeta.docs_url,
      github_url: catalogItemMeta.github_url,
      website_url: catalogItemMeta.website_url,
      metadata_json: catalogItemMeta.metadata_json,
    })
    .from(catalogItems)
    .leftJoin(catalogItemMeta, eq(catalogItems.id, catalogItemMeta.item_id))
    .where(
      and(
        eq(catalogItems.status, 'published'),
        eq(catalogItems.visibility, 'public'),
      ),
    );

  const itemIds = itemsWithMeta.map((r) => r.id);

  // 2. Eager-load relations + model data in parallel
  const [tagsMap, categoriesMap, useCasesMap, modelRows] = await Promise.all([
    loadTagsForItems(itemIds),
    loadCategoriesForItems(itemIds),
    loadUseCasesForItems(itemIds),
    itemIds.length > 0
      ? db
          .select({
            catalog_item_id: aiModels.catalog_item_id,
            context_length: aiModels.context_length,
            supported_parameters: aiModels.supported_parameters,
            input_modalities: aiModels.input_modalities,
            pricing_prompt: aiModels.pricing_prompt,
            pricing_completion: aiModels.pricing_completion,
          })
          .from(aiModels)
          .where(inArray(aiModels.catalog_item_id, itemIds))
      : Promise.resolve([]),
  ]);

  const modelsMap = new Map<string, (typeof modelRows)[0]>();
  for (const m of modelRows) {
    modelsMap.set(m.catalog_item_id, m);
  }

  // 3. Build enriched items
  const enriched: EnrichedCatalogItem[] = itemsWithMeta.map((r) => {
    const itemTags = tagsMap.get(r.id) ?? [];
    const itemCategories = categoriesMap.get(r.id) ?? [];
    const modelData = modelsMap.get(r.id);

    const card: CatalogItemCard = {
      id: r.id,
      type: r.type as CatalogItemCard['type'],
      title: r.title,
      slug: r.slug,
      short_description: r.short_description,
      hero_image_url: r.hero_image_url,
      curated_score: r.curated_score,
      featured: r.featured,
      tags: itemTags,
      categories: itemCategories,
      meta: {
        pricing_type: r.pricing_type as CatalogItemCard['meta']['pricing_type'],
        deployment_type: r.deployment_type as CatalogItemCard['meta']['deployment_type'],
        language_support: r.language_support as CatalogItemCard['meta']['language_support'],
        privacy_type: r.privacy_type as CatalogItemCard['meta']['privacy_type'],
      },
      published_at: r.published_at?.toISOString() ?? null,
    };

    return {
      item: card,
      meta: {
        pricing_type: r.pricing_type as any,
        deployment_type: r.deployment_type as any,
        privacy_type: r.privacy_type as any,
        language_support: r.language_support as any,
        difficulty: r.difficulty as any,
        readiness: r.readiness as any,
        vendor_name: r.vendor_name,
        source_url: r.source_url,
        docs_url: r.docs_url,
        github_url: r.github_url,
        website_url: r.website_url,
        metadata_json: r.metadata_json as Record<string, unknown> | null,
      },
      use_cases: useCasesMap.get(r.id) ?? [],
      model: modelData
        ? {
            context_length: modelData.context_length,
            supported_parameters: modelData.supported_parameters,
            input_modalities: modelData.input_modalities,
            pricing_prompt: modelData.pricing_prompt,
            pricing_completion: modelData.pricing_completion,
          }
        : undefined,
    };
  });

  // 4. Score and rank
  const scored = scoreAndRank(enriched, input);

  // 5. Select winners and generate rationale
  const winners = selectWinners(scored);
  const { rationale, tradeoffs, next_steps } = generateRationale(input, winners, scored);
  const cost_band = determineCostBand(winners);

  return {
    best_overall: winners.best_overall,
    cheapest: winners.cheapest,
    best_privacy: winners.best_privacy,
    best_russian: winners.best_russian,
    best_self_hosted: winners.best_self_hosted,
    all_scored: scored,
    rationale,
    tradeoffs,
    next_steps,
    cost_band,
    generated_at: new Date().toISOString(),
  };
}

export async function saveResult(
  userId: string,
  body: SaveStackResultInput,
): Promise<{ id: string }> {
  const [row] = await db
    .insert(savedStackResults)
    .values({
      user_id: userId,
      name: body.name ?? null,
      builder_answers: body.builder_answers as Record<string, unknown>,
      recommended_result: body.recommended_result,
    })
    .returning({ id: savedStackResults.id });

  return { id: row.id };
}

export async function listSavedResults(userId: string): Promise<SavedStackResult[]> {
  const rows = await db
    .select()
    .from(savedStackResults)
    .where(eq(savedStackResults.user_id, userId))
    .orderBy(savedStackResults.created_at);

  return rows.map((r) => ({
    id: r.id,
    user_id: r.user_id,
    name: r.name,
    builder_answers: r.builder_answers as unknown as SavedStackResult['builder_answers'],
    recommended_result: r.recommended_result as unknown as SavedStackResult['recommended_result'],
    created_at: r.created_at?.toISOString() ?? new Date().toISOString(),
  }));
}

export async function getSavedResult(userId: string, id: string): Promise<SavedStackResult> {
  const [row] = await db
    .select()
    .from(savedStackResults)
    .where(and(eq(savedStackResults.id, id), eq(savedStackResults.user_id, userId)));

  if (!row) throw new NotFoundError('Сохранённый результат не найден');

  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    builder_answers: row.builder_answers as unknown as SavedStackResult['builder_answers'],
    recommended_result: row.recommended_result as unknown as SavedStackResult['recommended_result'],
    created_at: row.created_at?.toISOString() ?? new Date().toISOString(),
  };
}

export async function exportResult(
  body: ExportStackInput,
  userId?: string,
): Promise<{ format: 'json' | 'markdown'; data: object | string }> {
  let result: StackRecommendation;

  if (body.saved_result_id && userId) {
    const saved = await getSavedResult(userId, body.saved_result_id);
    result = saved.recommended_result;
  } else if (body.result) {
    result = body.result as unknown as StackRecommendation;
  } else {
    throw new NotFoundError('Нет данных для экспорта');
  }

  if (body.format === 'markdown') {
    return { format: 'markdown', data: toMarkdown(result) };
  }
  return { format: 'json', data: toJson(result) };
}

export async function createAgentFromStack(
  userId: string,
  body: CreateAgentFromStackInput,
): Promise<{ agent_id: string; redirect_url: string }> {
  let result: StackRecommendation;

  if (body.saved_result_id) {
    const saved = await getSavedResult(userId, body.saved_result_id);
    result = saved.recommended_result;
  } else if (body.result) {
    result = body.result as unknown as StackRecommendation;
  } else {
    throw new NotFoundError('Нет данных для создания агента');
  }

  const bestItem = result.best_overall?.catalog_item;
  const agentName = body.name ?? (bestItem ? `Агент: ${bestItem.title}` : 'Новый агент');
  const slug = generateSlug(agentName) + '-' + Date.now().toString(36);

  // Find model_id if best item is a model
  let modelId: string | null = null;
  if (bestItem?.type === 'model') {
    const [modelRow] = await db
      .select({ id: aiModels.id })
      .from(aiModels)
      .where(eq(aiModels.catalog_item_id, bestItem.id))
      .limit(1);
    if (modelRow) modelId = modelRow.id;
  }

  // Create agent
  const [agent] = await db
    .insert(agents)
    .values({
      owner_user_id: userId,
      source_catalog_item_id: bestItem?.id ?? null,
      name: agentName,
      slug,
      description: bestItem?.short_description ?? null,
      visibility: 'private',
      status: 'draft',
    })
    .returning({ id: agents.id });

  // Create initial version
  await db.insert(agentVersions).values({
    agent_id: agent.id,
    version_number: 1,
    model_id: modelId,
    runtime_config: {
      temperature: 0.7,
      max_tokens: 2048,
      top_p: 1,
      stream: true,
      max_iterations: 6,
      timeout_ms: 60000,
    },
  });

  return {
    agent_id: agent.id,
    redirect_url: `/builder/agent/${agent.id}`,
  };
}
