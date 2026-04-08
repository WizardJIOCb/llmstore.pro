import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { db } from '../../config/database.js';
import {
  catalogComments,
  catalogItemBookmarks,
  catalogItemCategories,
  catalogItemMeta,
  catalogItemPollVotes,
  catalogItemReactions,
  catalogItemReports,
  catalogItems,
  catalogItemTags,
  catalogItemUseCases,
  catalogItemViewEvents,
  categories,
  tags,
  useCases,
  users,
} from '../../db/schema/index.js';
import type { CatalogItemCard, CatalogItemFull, CatalogItemMeta, CategorySlim, TagSlim, UseCaseSlim, UserSlim } from '@llmstore/shared';
import { generateSlug } from '@llmstore/shared/utils';
import { AppError, ConflictError, NotFoundError } from '../../middleware/error-handler.js';
import { buildArticlePollView, extractArticlePollConfig } from '../../lib/article-polls.js';
import type { ArticleListQueryInput, ArticlePollVoteInput, ArticleReportInput, UpsertArticleInput } from './articles.validators.js';

const ARTICLE_TYPE = 'article';

type SortMode = ArticleListQueryInput['sort'];

type ViewerContext = {
  userId?: string | null;
  viewerKey?: string | null;
};

const emptyMeta: CatalogItemMeta = {
  pricing_type: null,
  deployment_type: null,
  privacy_type: null,
  language_support: null,
  difficulty: null,
  readiness: null,
  vendor_name: null,
  source_url: null,
  docs_url: null,
  github_url: null,
  website_url: null,
  primary_cta_label: null,
  primary_cta_url: null,
  secondary_cta_label: null,
  secondary_cta_url: null,
  reading_time_minutes: null,
  metadata_json: null,
};

function buildPeriodStartDate(sort: SortMode): string | null {
  const now = new Date();

  if (sort === 'top_day') {
    now.setUTCDate(now.getUTCDate() - 1);
    return now.toISOString().slice(0, 10);
  }

  if (sort === 'top_week') {
    now.setUTCDate(now.getUTCDate() - 7);
    return now.toISOString().slice(0, 10);
  }

  if (sort === 'top_month') {
    now.setUTCDate(now.getUTCDate() - 30);
    return now.toISOString().slice(0, 10);
  }

  return null;
}

function buildPersonalizedBonusExpression(preferences: ViewerPreferenceSignals): SQL<number> {
  const chunks: SQL[] = [];

  if (preferences.tagIds.length > 0) {
    chunks.push(sql`coalesce((
      select least(count(*)::int, 3) * 6
      from ${catalogItemTags}
      where ${catalogItemTags.item_id} = ${catalogItems.id}
      and ${inArray(catalogItemTags.tag_id, preferences.tagIds)}
    ), 0)`);
  }

  if (preferences.categoryIds.length > 0) {
    chunks.push(sql`coalesce((
      select least(count(*)::int, 2) * 5
      from ${catalogItemCategories}
      where ${catalogItemCategories.item_id} = ${catalogItems.id}
      and ${inArray(catalogItemCategories.category_id, preferences.categoryIds)}
    ), 0)`);
  }

  if (preferences.useCaseIds.length > 0) {
    chunks.push(sql`coalesce((
      select least(count(*)::int, 2) * 7
      from ${catalogItemUseCases}
      where ${catalogItemUseCases.item_id} = ${catalogItems.id}
      and ${inArray(catalogItemUseCases.use_case_id, preferences.useCaseIds)}
    ), 0)`);
  }

  if (chunks.length === 0) {
    return sql<number>`0`;
  }

  return sql<number>`(${sql.join(chunks, sql` + `)})::float`;
}

function buildScoreExpression(sort: SortMode, personalizedBonus?: SQL<number>): SQL<number> {
  const periodStart = buildPeriodStartDate(sort);
  const periodStartTimestamp = periodStart ? `${periodStart}T00:00:00.000Z` : null;
  const commentsFilter = periodStart
    ? sql`and ${catalogComments.created_at} >= ${periodStartTimestamp}`
    : sql``;
  const reactionsFilter = periodStart
    ? sql`and ${catalogItemReactions.created_at} >= ${periodStartTimestamp}`
    : sql``;
  const bookmarksFilter = periodStart
    ? sql`and ${catalogItemBookmarks.created_at} >= ${periodStartTimestamp}`
    : sql``;
  const viewsFilter = periodStart
    ? sql`and ${catalogItemViewEvents.viewed_on} >= ${periodStart}`
    : sql``;
  const personalization = personalizedBonus ?? sql<number>`0`;

  return sql<number>`(
    (
      select count(*)::int
      from ${catalogItemReactions}
      where ${catalogItemReactions.item_id} = ${catalogItems.id}
      ${reactionsFilter}
    ) * 8
    +
    (
      select count(*)::int
      from ${catalogComments}
      where ${catalogComments.item_id} = ${catalogItems.id}
      ${commentsFilter}
    ) * 12
    +
    (
      select count(*)::int
      from ${catalogItemBookmarks}
      where ${catalogItemBookmarks.item_id} = ${catalogItems.id}
      ${bookmarksFilter}
    ) * 10
    +
    (
      select count(*)::int
      from ${catalogItemViewEvents}
      where ${catalogItemViewEvents.item_id} = ${catalogItems.id}
      ${viewsFilter}
    ) * 1.5
    +
    case when ${catalogItems.featured} then 40 else 0 end
    +
    (${catalogItems.curated_score} * 0.5)
    +
    ${personalization}
  )::float`;
}

type ViewerPreferenceSignals = {
  tagIds: string[];
  categoryIds: string[];
  useCaseIds: string[];
};

async function ensureUniqueSlug(slug: string, excludeId?: string) {
  const conditions: SQL[] = [eq(catalogItems.slug, slug)];

  if (excludeId) {
    conditions.push(sql`${catalogItems.id} != ${excludeId}`);
  }

  const [existing] = await db
    .select({ id: catalogItems.id })
    .from(catalogItems)
    .where(and(...conditions))
    .limit(1);

  if (existing) {
    throw new ConflictError('Статья с таким slug уже существует');
  }
}

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
  for (const row of rows) {
    const current = map.get(row.item_id) ?? [];
    current.push({ id: row.id, name: row.name, slug: row.slug });
    map.set(row.item_id, current);
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
  for (const row of rows) {
    const current = map.get(row.item_id) ?? [];
    current.push({ id: row.id, name: row.name, slug: row.slug, parent_id: row.parent_id });
    map.set(row.item_id, current);
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
  for (const row of rows) {
    const current = map.get(row.item_id) ?? [];
    current.push({ id: row.id, name: row.name, slug: row.slug });
    map.set(row.item_id, current);
  }
  return map;
}

async function loadMetaForItems(itemIds: string[]): Promise<Map<string, CatalogItemMeta>> {
  if (itemIds.length === 0) return new Map();

  const rows = await db
    .select()
    .from(catalogItemMeta)
    .where(inArray(catalogItemMeta.item_id, itemIds));

  const map = new Map<string, CatalogItemMeta>();
  for (const row of rows) {
    map.set(row.item_id, {
      pricing_type: row.pricing_type,
      deployment_type: row.deployment_type,
      privacy_type: row.privacy_type,
      language_support: row.language_support,
      difficulty: row.difficulty,
      readiness: row.readiness,
      vendor_name: row.vendor_name,
      source_url: row.source_url,
      docs_url: row.docs_url,
      github_url: row.github_url,
      website_url: row.website_url,
      primary_cta_label: row.primary_cta_label,
      primary_cta_url: row.primary_cta_url,
      secondary_cta_label: row.secondary_cta_label,
      secondary_cta_url: row.secondary_cta_url,
      reading_time_minutes: row.reading_time_minutes,
      metadata_json: row.metadata_json,
    });
  }
  return map;
}

async function loadCommentCountsForItems(itemIds: string[]): Promise<Map<string, number>> {
  if (itemIds.length === 0) return new Map();

  const rows = await db
    .select({
      item_id: catalogComments.item_id,
      count: sql<number>`count(*)::int`,
    })
    .from(catalogComments)
    .where(inArray(catalogComments.item_id, itemIds))
    .groupBy(catalogComments.item_id);

  return new Map(rows.map((row) => [row.item_id, row.count]));
}

async function loadReactionCountsForItems(itemIds: string[]): Promise<Map<string, number>> {
  if (itemIds.length === 0) return new Map();

  const rows = await db
    .select({
      item_id: catalogItemReactions.item_id,
      count: sql<number>`count(*)::int`,
    })
    .from(catalogItemReactions)
    .where(inArray(catalogItemReactions.item_id, itemIds))
    .groupBy(catalogItemReactions.item_id);

  return new Map(rows.map((row) => [row.item_id, row.count]));
}

async function loadBookmarkCountsForItems(itemIds: string[]): Promise<Map<string, number>> {
  if (itemIds.length === 0) return new Map();

  const rows = await db
    .select({
      item_id: catalogItemBookmarks.item_id,
      count: sql<number>`count(*)::int`,
    })
    .from(catalogItemBookmarks)
    .where(inArray(catalogItemBookmarks.item_id, itemIds))
    .groupBy(catalogItemBookmarks.item_id);

  return new Map(rows.map((row) => [row.item_id, row.count]));
}

async function loadLikedMapForItems(itemIds: string[], userId?: string | null): Promise<Map<string, boolean>> {
  if (!userId || itemIds.length === 0) return new Map();

  const rows = await db
    .select({
      item_id: catalogItemReactions.item_id,
    })
    .from(catalogItemReactions)
    .where(and(
      eq(catalogItemReactions.user_id, userId),
      inArray(catalogItemReactions.item_id, itemIds),
    ));

  return new Map(rows.map((row) => [row.item_id, true]));
}

async function loadBookmarkedMapForItems(itemIds: string[], userId?: string | null): Promise<Map<string, boolean>> {
  if (!userId || itemIds.length === 0) return new Map();

  const rows = await db
    .select({
      item_id: catalogItemBookmarks.item_id,
    })
    .from(catalogItemBookmarks)
    .where(and(
      eq(catalogItemBookmarks.user_id, userId),
      inArray(catalogItemBookmarks.item_id, itemIds),
    ));

  return new Map(rows.map((row) => [row.item_id, true]));
}

async function loadOpenReportCountsForItems(itemIds: string[]): Promise<Map<string, number>> {
  if (itemIds.length === 0) return new Map();

  const rows = await db
    .select({
      item_id: catalogItemReports.item_id,
      count: sql<number>`count(*)::int`,
    })
    .from(catalogItemReports)
    .where(and(
      inArray(catalogItemReports.item_id, itemIds),
      eq(catalogItemReports.status, 'open'),
    ))
    .groupBy(catalogItemReports.item_id);

  return new Map(rows.map((row) => [row.item_id, row.count]));
}

async function loadViewCountsSince(itemIds: string[], viewedOnFrom: string): Promise<Map<string, number>> {
  if (itemIds.length === 0) return new Map();

  const rows = await db
    .select({
      item_id: catalogItemViewEvents.item_id,
      count: sql<number>`count(*)::int`,
    })
    .from(catalogItemViewEvents)
    .where(and(
      inArray(catalogItemViewEvents.item_id, itemIds),
      sql`${catalogItemViewEvents.viewed_on} >= ${viewedOnFrom}`,
    ))
    .groupBy(catalogItemViewEvents.item_id);

  return new Map(rows.map((row) => [row.item_id, row.count]));
}

async function loadPollVoteCounts(itemId: string, optionIds: string[]): Promise<Map<string, number>> {
  if (optionIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({
      option_id: catalogItemPollVotes.option_id,
      count: sql<number>`count(*)::int`,
    })
    .from(catalogItemPollVotes)
    .where(and(
      eq(catalogItemPollVotes.item_id, itemId),
      inArray(catalogItemPollVotes.option_id, optionIds),
    ))
    .groupBy(catalogItemPollVotes.option_id);

  return new Map(rows.map((row) => [row.option_id, row.count]));
}

async function loadUserPollVote(itemId: string, userId?: string | null): Promise<string | null> {
  if (!userId) {
    return null;
  }

  const [row] = await db
    .select({
      option_id: catalogItemPollVotes.option_id,
    })
    .from(catalogItemPollVotes)
    .where(and(
      eq(catalogItemPollVotes.item_id, itemId),
      eq(catalogItemPollVotes.user_id, userId),
    ))
    .limit(1);

  return row?.option_id ?? null;
}

async function loadAuthors(userIds: string[]): Promise<Map<string, UserSlim>> {
  if (userIds.length === 0) return new Map();

  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      name: users.name,
      avatar_url: users.avatar_url,
    })
    .from(users)
    .where(inArray(users.id, userIds));

  return new Map(rows.map((row) => [row.id, row]));
}

async function loadViewerPreferenceSignals(userId?: string | null): Promise<ViewerPreferenceSignals> {
  if (!userId) {
    return {
      tagIds: [],
      categoryIds: [],
      useCaseIds: [],
    };
  }

  const [likedRows, bookmarkedRows, authoredRows] = await Promise.all([
    db
      .select({ item_id: catalogItemReactions.item_id })
      .from(catalogItemReactions)
      .where(eq(catalogItemReactions.user_id, userId))
      .orderBy(desc(catalogItemReactions.created_at))
      .limit(24),
    db
      .select({ item_id: catalogItemBookmarks.item_id })
      .from(catalogItemBookmarks)
      .where(eq(catalogItemBookmarks.user_id, userId))
      .orderBy(desc(catalogItemBookmarks.created_at))
      .limit(24),
    db
      .select({ item_id: catalogItems.id })
      .from(catalogItems)
      .where(and(
        eq(catalogItems.type, ARTICLE_TYPE),
        eq(catalogItems.author_user_id, userId),
      ))
      .orderBy(desc(catalogItems.updated_at))
      .limit(12),
  ]);

  const itemIds = Array.from(new Set([
    ...likedRows.map((row) => row.item_id),
    ...bookmarkedRows.map((row) => row.item_id),
    ...authoredRows.map((row) => row.item_id),
  ])).slice(0, 36);

  if (itemIds.length === 0) {
    return {
      tagIds: [],
      categoryIds: [],
      useCaseIds: [],
    };
  }

  const [tagRows, categoryRows, useCaseRows] = await Promise.all([
    db
      .select({ id: catalogItemTags.tag_id })
      .from(catalogItemTags)
      .where(inArray(catalogItemTags.item_id, itemIds)),
    db
      .select({ id: catalogItemCategories.category_id })
      .from(catalogItemCategories)
      .where(inArray(catalogItemCategories.item_id, itemIds)),
    db
      .select({ id: catalogItemUseCases.use_case_id })
      .from(catalogItemUseCases)
      .where(inArray(catalogItemUseCases.item_id, itemIds)),
  ]);

  return {
    tagIds: Array.from(new Set(tagRows.map((row) => row.id))).slice(0, 24),
    categoryIds: Array.from(new Set(categoryRows.map((row) => row.id))).slice(0, 16),
    useCaseIds: Array.from(new Set(useCaseRows.map((row) => row.id))).slice(0, 16),
  };
}

function toPublicCard(
  row: {
    id: string;
    type: typeof ARTICLE_TYPE;
    title: string;
    slug: string;
    short_description: string | null;
    hero_image_url: string | null;
    curated_score: number;
    featured: boolean;
    views_count: number;
    published_at: Date | null;
    ranking_score: number;
  },
  args: {
    tagsMap: Map<string, TagSlim[]>;
    categoriesMap: Map<string, CategorySlim[]>;
    metaMap: Map<string, CatalogItemMeta>;
    commentsMap: Map<string, number>;
    likesMap: Map<string, number>;
    bookmarksMap: Map<string, number>;
    likedMap: Map<string, boolean>;
    bookmarkedMap: Map<string, boolean>;
  },
): CatalogItemCard {
  const meta = args.metaMap.get(row.id) ?? emptyMeta;

  return {
    id: row.id,
    type: row.type,
    title: row.title,
    slug: row.slug,
    short_description: row.short_description,
    hero_image_url: row.hero_image_url,
    curated_score: row.curated_score,
    featured: row.featured,
    views_count: row.views_count,
    comments_count: args.commentsMap.get(row.id) ?? 0,
    likes_count: args.likesMap.get(row.id) ?? 0,
    bookmarks_count: args.bookmarksMap.get(row.id) ?? 0,
    liked_by_me: args.likedMap.get(row.id) ?? false,
    bookmarked_by_me: args.bookmarkedMap.get(row.id) ?? false,
    ranking_score: Number(row.ranking_score ?? 0),
    tags: args.tagsMap.get(row.id) ?? [],
    categories: args.categoriesMap.get(row.id) ?? [],
    meta: {
      pricing_type: meta.pricing_type,
      deployment_type: meta.deployment_type,
      language_support: meta.language_support,
      privacy_type: meta.privacy_type,
    },
    published_at: row.published_at?.toISOString() ?? null,
  };
}

function buildViewerKey({ userId, viewerKey }: ViewerContext): string | null {
  if (userId) return `user:${userId}`;
  if (!viewerKey) return null;
  return viewerKey.slice(0, 512);
}

async function resolvePublishedArticleId(slug: string): Promise<string> {
  const [row] = await db
    .select({ id: catalogItems.id })
    .from(catalogItems)
    .where(and(
      eq(catalogItems.type, ARTICLE_TYPE),
      eq(catalogItems.slug, slug),
      eq(catalogItems.status, 'published'),
      eq(catalogItems.visibility, 'public'),
    ))
    .limit(1);

  if (!row) {
    throw new NotFoundError('Статья не найдена');
  }

  return row.id;
}

function normalizeArticlePayload(input: UpsertArticleInput) {
  return {
    title: input.title.trim(),
    slug: generateSlug(input.slug.trim()),
    short_description: input.short_description.trim(),
    full_description: input.full_description,
    hero_image_url: input.hero_image_url ?? null,
    seo_title: input.seo_title ?? null,
    seo_description: input.seo_description ?? null,
    status: input.status,
    meta: input.meta ? {
      primary_cta_label: input.meta.primary_cta_label ?? null,
      primary_cta_url: input.meta.primary_cta_url ?? null,
      secondary_cta_label: input.meta.secondary_cta_label ?? null,
      secondary_cta_url: input.meta.secondary_cta_url ?? null,
      reading_time_minutes: input.meta.reading_time_minutes ?? null,
      metadata_json: input.meta.metadata_json ?? null,
    } : null,
  };
}

export async function listArticles(query: ArticleListQueryInput, viewerUserId?: string | null) {
  const page = query.page;
  const perPage = query.per_page;
  const offset = (page - 1) * perPage;
  const viewerPreferences = query.recommended ? await loadViewerPreferenceSignals(viewerUserId) : { tagIds: [], categoryIds: [], useCaseIds: [] };
  const scoreExpression = buildScoreExpression(query.sort, buildPersonalizedBonusExpression(viewerPreferences));
  const conditions: SQL[] = [
    eq(catalogItems.type, ARTICLE_TYPE),
    eq(catalogItems.status, 'published'),
    eq(catalogItems.visibility, 'public'),
  ];

  if (query.featured) {
    conditions.push(eq(catalogItems.featured, true));
  }

  if (query.search) {
    const term = `%${query.search}%`;
    conditions.push(sql`(${catalogItems.title} ilike ${term} or ${catalogItems.short_description} ilike ${term})`);
  }

  const where = and(...conditions);

  const [countRows, rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(catalogItems)
      .where(where),
    db
      .select({
        id: catalogItems.id,
        type: catalogItems.type,
        title: catalogItems.title,
        slug: catalogItems.slug,
        short_description: catalogItems.short_description,
        hero_image_url: catalogItems.hero_image_url,
        curated_score: catalogItems.curated_score,
        featured: catalogItems.featured,
        views_count: catalogItems.views_count,
        published_at: catalogItems.published_at,
        ranking_score: scoreExpression,
      })
      .from(catalogItems)
      .where(where)
      .orderBy(
        query.sort === 'newest' ? desc(catalogItems.published_at) : desc(scoreExpression),
        desc(catalogItems.featured),
        desc(catalogItems.published_at),
        asc(catalogItems.id),
      )
      .limit(perPage)
      .offset(offset),
  ]);

  const itemIds = rows.map((row) => row.id);
  const [tagsMap, categoriesMap, metaMap, commentsMap, likesMap, bookmarksMap, likedMap, bookmarkedMap] = await Promise.all([
    loadTagsForItems(itemIds),
    loadCategoriesForItems(itemIds),
    loadMetaForItems(itemIds),
    loadCommentCountsForItems(itemIds),
    loadReactionCountsForItems(itemIds),
    loadBookmarkCountsForItems(itemIds),
    loadLikedMapForItems(itemIds, viewerUserId),
    loadBookmarkedMapForItems(itemIds, viewerUserId),
  ]);

  return {
    items: rows.map((row) => toPublicCard(row as any, {
      tagsMap,
      categoriesMap,
      metaMap,
      commentsMap,
      likesMap,
      bookmarksMap,
      likedMap,
      bookmarkedMap,
    })),
    meta: {
      total: countRows[0]?.count ?? 0,
      page,
      per_page: perPage,
      total_pages: Math.max(1, Math.ceil((countRows[0]?.count ?? 0) / perPage)),
    },
  };
}

export async function getArticleBySlug(slug: string, viewer: ViewerContext): Promise<CatalogItemFull> {
  const [row] = await db
    .select({
      id: catalogItems.id,
      type: catalogItems.type,
      title: catalogItems.title,
      slug: catalogItems.slug,
      short_description: catalogItems.short_description,
      full_description: catalogItems.full_description,
      hero_image_url: catalogItems.hero_image_url,
      curated_score: catalogItems.curated_score,
      featured: catalogItems.featured,
      views_count: catalogItems.views_count,
      status: catalogItems.status,
      visibility: catalogItems.visibility,
      seo_title: catalogItems.seo_title,
      seo_description: catalogItems.seo_description,
      author_user_id: catalogItems.author_user_id,
      published_at: catalogItems.published_at,
    })
    .from(catalogItems)
    .where(and(
      eq(catalogItems.type, ARTICLE_TYPE),
      eq(catalogItems.slug, slug),
      eq(catalogItems.status, 'published'),
      eq(catalogItems.visibility, 'public'),
    ))
    .limit(1);

  if (!row) {
    throw new NotFoundError('Статья не найдена');
  }

  const normalizedViewerKey = buildViewerKey(viewer);
  const viewedOn = new Date().toISOString().slice(0, 10);
  let viewsCount = row.views_count;

  if (normalizedViewerKey) {
    const inserted = await db
      .insert(catalogItemViewEvents)
      .values({
        item_id: row.id,
        user_id: viewer.userId ?? null,
        viewer_key: normalizedViewerKey,
        viewed_on: viewedOn,
      })
      .onConflictDoNothing()
      .returning({ id: catalogItemViewEvents.id });

    if (inserted.length > 0) {
      await db
        .update(catalogItems)
        .set({ views_count: sql`${catalogItems.views_count} + 1` })
        .where(eq(catalogItems.id, row.id));
      viewsCount += 1;
    }
  }

  const [tagsMap, categoriesMap, useCasesMap, metaMap, commentsMap, likesMap, bookmarksMap, likedMap, bookmarkedMap] = await Promise.all([
    loadTagsForItems([row.id]),
    loadCategoriesForItems([row.id]),
    loadUseCasesForItems([row.id]),
    loadMetaForItems([row.id]),
    loadCommentCountsForItems([row.id]),
    loadReactionCountsForItems([row.id]),
    loadBookmarkCountsForItems([row.id]),
    loadLikedMapForItems([row.id], viewer.userId),
    loadBookmarkedMapForItems([row.id], viewer.userId),
  ]);

  const authorsMap = await loadAuthors(row.author_user_id ? [row.author_user_id] : []);
  const author = row.author_user_id ? (authorsMap.get(row.author_user_id) ?? null) : null;

  const relatedScoreExpression = buildScoreExpression('top_all');
  const relatedRows = await db
    .select({
      id: catalogItems.id,
      type: catalogItems.type,
      title: catalogItems.title,
      slug: catalogItems.slug,
      short_description: catalogItems.short_description,
      hero_image_url: catalogItems.hero_image_url,
      curated_score: catalogItems.curated_score,
      featured: catalogItems.featured,
      views_count: catalogItems.views_count,
      published_at: catalogItems.published_at,
      ranking_score: relatedScoreExpression,
    })
    .from(catalogItems)
    .where(and(
      eq(catalogItems.type, ARTICLE_TYPE),
      eq(catalogItems.status, 'published'),
      eq(catalogItems.visibility, 'public'),
      sql`${catalogItems.id} != ${row.id}`,
    ))
    .orderBy(desc(catalogItems.featured), desc(relatedScoreExpression), desc(catalogItems.published_at))
    .limit(4);

  const relatedIds = relatedRows.map((item) => item.id);
  const [relatedTagsMap, relatedCategoriesMap, relatedMetaMap, relatedCommentsMap, relatedLikesMap, relatedBookmarksMap, relatedLikedMap, relatedBookmarkedMap] = await Promise.all([
    loadTagsForItems(relatedIds),
    loadCategoriesForItems(relatedIds),
    loadMetaForItems(relatedIds),
    loadCommentCountsForItems(relatedIds),
    loadReactionCountsForItems(relatedIds),
    loadBookmarkCountsForItems(relatedIds),
    loadLikedMapForItems(relatedIds, viewer.userId),
    loadBookmarkedMapForItems(relatedIds, viewer.userId),
  ]);

  const fullMeta = metaMap.get(row.id) ?? emptyMeta;
  const pollConfig = extractArticlePollConfig(fullMeta.metadata_json);
  const [pollCountsByOptionId, votedPollOptionId] = pollConfig
    ? await Promise.all([
      loadPollVoteCounts(row.id, pollConfig.options.map((option) => option.id)),
      loadUserPollVote(row.id, viewer.userId),
    ])
    : [new Map<string, number>(), null];
  const likesCount = likesMap.get(row.id) ?? 0;
  const bookmarksCount = bookmarksMap.get(row.id) ?? 0;
  const commentsCount = commentsMap.get(row.id) ?? 0;
  const rankingScore = likesCount * 8 + commentsCount * 12 + bookmarksCount * 10 + viewsCount * 1.5 + (row.featured ? 40 : 0) + (row.curated_score * 0.5);
  const metaFull: CatalogItemMeta = {
    ...fullMeta,
    metadata_json: pollConfig
      ? {
        ...(fullMeta.metadata_json ?? {}),
        poll: buildArticlePollView(pollConfig, pollCountsByOptionId, votedPollOptionId),
      }
      : fullMeta.metadata_json,
  };

  return {
    id: row.id,
    type: row.type,
    title: row.title,
    slug: row.slug,
    short_description: row.short_description,
    full_description: row.full_description,
    hero_image_url: row.hero_image_url,
    curated_score: row.curated_score,
    featured: row.featured,
    views_count: viewsCount,
    comments_count: commentsCount,
    likes_count: likesCount,
    bookmarks_count: bookmarksCount,
    liked_by_me: likedMap.get(row.id) ?? false,
    bookmarked_by_me: bookmarkedMap.get(row.id) ?? false,
    ranking_score: rankingScore,
    status: row.status,
    visibility: row.visibility,
    seo_title: row.seo_title,
    seo_description: row.seo_description,
    tags: tagsMap.get(row.id) ?? [],
    categories: categoriesMap.get(row.id) ?? [],
    meta: {
      pricing_type: fullMeta.pricing_type,
      deployment_type: fullMeta.deployment_type,
      language_support: fullMeta.language_support,
      privacy_type: fullMeta.privacy_type,
    },
    published_at: row.published_at?.toISOString() ?? null,
    author,
    meta_full: metaFull,
    use_cases: useCasesMap.get(row.id) ?? [],
    related_items: relatedRows.map((item) => toPublicCard(item as any, {
      tagsMap: relatedTagsMap,
      categoriesMap: relatedCategoriesMap,
      metaMap: relatedMetaMap,
      commentsMap: relatedCommentsMap,
      likesMap: relatedLikesMap,
      bookmarksMap: relatedBookmarksMap,
      likedMap: relatedLikedMap,
      bookmarkedMap: relatedBookmarkedMap,
    })),
  };
}

export async function likeArticle(slug: string, userId: string) {
  const itemId = await resolvePublishedArticleId(slug);

  await db
    .insert(catalogItemReactions)
    .values({
      item_id: itemId,
      user_id: userId,
    })
    .onConflictDoNothing();

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(catalogItemReactions)
    .where(eq(catalogItemReactions.item_id, itemId));

  return {
    likes_count: countRow?.count ?? 0,
    liked_by_me: true,
  };
}

export async function unlikeArticle(slug: string, userId: string) {
  const itemId = await resolvePublishedArticleId(slug);

  await db
    .delete(catalogItemReactions)
    .where(and(
      eq(catalogItemReactions.item_id, itemId),
      eq(catalogItemReactions.user_id, userId),
    ));

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(catalogItemReactions)
    .where(eq(catalogItemReactions.item_id, itemId));

  return {
    likes_count: countRow?.count ?? 0,
    liked_by_me: false,
  };
}

export async function bookmarkArticle(slug: string, userId: string) {
  const itemId = await resolvePublishedArticleId(slug);

  await db
    .insert(catalogItemBookmarks)
    .values({
      item_id: itemId,
      user_id: userId,
    })
    .onConflictDoNothing();

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(catalogItemBookmarks)
    .where(eq(catalogItemBookmarks.item_id, itemId));

  return {
    bookmarks_count: countRow?.count ?? 0,
    bookmarked_by_me: true,
  };
}

export async function unbookmarkArticle(slug: string, userId: string) {
  const itemId = await resolvePublishedArticleId(slug);

  await db
    .delete(catalogItemBookmarks)
    .where(and(
      eq(catalogItemBookmarks.item_id, itemId),
      eq(catalogItemBookmarks.user_id, userId),
    ));

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(catalogItemBookmarks)
    .where(eq(catalogItemBookmarks.item_id, itemId));

  return {
    bookmarks_count: countRow?.count ?? 0,
    bookmarked_by_me: false,
  };
}

export async function voteArticlePoll(slug: string, userId: string, input: ArticlePollVoteInput) {
  const itemId = await resolvePublishedArticleId(slug);
  const metaMap = await loadMetaForItems([itemId]);
  const meta = metaMap.get(itemId) ?? emptyMeta;
  const pollConfig = extractArticlePollConfig(meta.metadata_json);

  if (!pollConfig) {
    throw new AppError(404, 'NOT_FOUND', 'Голосование для этой статьи не найдено');
  }

  const normalizedOptionId = input.option_id.trim();
  const hasOption = pollConfig.options.some((option) => option.id === normalizedOptionId);

  if (!hasOption) {
    throw new AppError(400, 'BAD_REQUEST', 'Выбран неверный вариант ответа');
  }

  await db
    .insert(catalogItemPollVotes)
    .values({
      item_id: itemId,
      option_id: normalizedOptionId,
      user_id: userId,
    })
    .onConflictDoUpdate({
      target: [catalogItemPollVotes.item_id, catalogItemPollVotes.user_id],
      set: {
        option_id: normalizedOptionId,
        updated_at: new Date(),
      },
    });

  return {
    submitted: true,
  };
}

export async function reportArticle(slug: string, userId: string, input: ArticleReportInput) {
  const itemId = await resolvePublishedArticleId(slug);

  await db
    .insert(catalogItemReports)
    .values({
      item_id: itemId,
      user_id: userId,
      reason: input.reason,
      details: input.details?.trim() || null,
      status: 'open',
    })
    .onConflictDoUpdate({
      target: [catalogItemReports.item_id, catalogItemReports.user_id],
      set: {
        reason: input.reason,
        details: input.details?.trim() || null,
        status: 'open',
        updated_at: new Date(),
      },
    });

  return {
    submitted: true,
  };
}

export async function listMyArticles(userId: string) {
  const rows = await db
    .select({
      id: catalogItems.id,
      type: catalogItems.type,
      title: catalogItems.title,
      slug: catalogItems.slug,
      short_description: catalogItems.short_description,
      hero_image_url: catalogItems.hero_image_url,
      curated_score: catalogItems.curated_score,
      featured: catalogItems.featured,
      views_count: catalogItems.views_count,
      published_at: catalogItems.published_at,
      status: catalogItems.status,
      visibility: catalogItems.visibility,
      updated_at: catalogItems.updated_at,
    })
    .from(catalogItems)
    .where(and(
      eq(catalogItems.type, ARTICLE_TYPE),
      eq(catalogItems.author_user_id, userId),
    ))
    .orderBy(desc(catalogItems.updated_at));

  const itemIds = rows.map((row) => row.id);
  const [tagsMap, categoriesMap, metaMap, commentsMap, likesMap, bookmarksMap, likedMap, bookmarkedMap] = await Promise.all([
    loadTagsForItems(itemIds),
    loadCategoriesForItems(itemIds),
    loadMetaForItems(itemIds),
    loadCommentCountsForItems(itemIds),
    loadReactionCountsForItems(itemIds),
    loadBookmarkCountsForItems(itemIds),
    loadLikedMapForItems(itemIds, userId),
    loadBookmarkedMapForItems(itemIds, userId),
  ]);

  return rows.map((row) => ({
    ...toPublicCard({
      ...row,
      ranking_score: 0,
    } as any, {
      tagsMap,
      categoriesMap,
      metaMap,
      commentsMap,
      likesMap,
      bookmarksMap,
      likedMap,
      bookmarkedMap,
    }),
    status: row.status,
    visibility: row.visibility,
    updated_at: row.updated_at.toISOString(),
  }));
}

export async function listMyBookmarkedArticles(userId: string) {
  const rows = await db
    .select({
      id: catalogItems.id,
      type: catalogItems.type,
      title: catalogItems.title,
      slug: catalogItems.slug,
      short_description: catalogItems.short_description,
      hero_image_url: catalogItems.hero_image_url,
      curated_score: catalogItems.curated_score,
      featured: catalogItems.featured,
      views_count: catalogItems.views_count,
      published_at: catalogItems.published_at,
      bookmarked_at: catalogItemBookmarks.created_at,
    })
    .from(catalogItemBookmarks)
    .innerJoin(catalogItems, eq(catalogItemBookmarks.item_id, catalogItems.id))
    .where(and(
      eq(catalogItemBookmarks.user_id, userId),
      eq(catalogItems.type, ARTICLE_TYPE),
      eq(catalogItems.status, 'published'),
      eq(catalogItems.visibility, 'public'),
    ))
    .orderBy(desc(catalogItemBookmarks.created_at))
    .limit(12);

  const itemIds = rows.map((row) => row.id);
  const [tagsMap, categoriesMap, metaMap, commentsMap, likesMap, bookmarksMap, likedMap, bookmarkedMap] = await Promise.all([
    loadTagsForItems(itemIds),
    loadCategoriesForItems(itemIds),
    loadMetaForItems(itemIds),
    loadCommentCountsForItems(itemIds),
    loadReactionCountsForItems(itemIds),
    loadBookmarkCountsForItems(itemIds),
    loadLikedMapForItems(itemIds, userId),
    loadBookmarkedMapForItems(itemIds, userId),
  ]);

  return rows.map((row) => ({
    ...toPublicCard({
      ...row,
      ranking_score: 0,
    } as any, {
      tagsMap,
      categoriesMap,
      metaMap,
      commentsMap,
      likesMap,
      bookmarksMap,
      likedMap,
      bookmarkedMap,
    }),
    bookmarked_at: row.bookmarked_at.toISOString(),
  }));
}

export async function getMyArticleAnalytics(userId: string) {
  const rows = await db
    .select({
      id: catalogItems.id,
      title: catalogItems.title,
      slug: catalogItems.slug,
      status: catalogItems.status,
      published_at: catalogItems.published_at,
      updated_at: catalogItems.updated_at,
      views_count: catalogItems.views_count,
      featured: catalogItems.featured,
      curated_score: catalogItems.curated_score,
    })
    .from(catalogItems)
    .where(and(
      eq(catalogItems.type, ARTICLE_TYPE),
      eq(catalogItems.author_user_id, userId),
    ))
    .orderBy(desc(catalogItems.updated_at));

  const itemIds = rows.map((row) => row.id);
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
  const viewedOnFrom = sevenDaysAgo.toISOString().slice(0, 10);

  const [commentsMap, likesMap, bookmarksMap, reportsMap, viewsLast7Map] = await Promise.all([
    loadCommentCountsForItems(itemIds),
    loadReactionCountsForItems(itemIds),
    loadBookmarkCountsForItems(itemIds),
    loadOpenReportCountsForItems(itemIds),
    loadViewCountsSince(itemIds, viewedOnFrom),
  ]);

  const items = rows.map((row) => {
    const likes = likesMap.get(row.id) ?? 0;
    const comments = commentsMap.get(row.id) ?? 0;
    const bookmarks = bookmarksMap.get(row.id) ?? 0;
    const openReports = reportsMap.get(row.id) ?? 0;
    const viewsLast7Days = viewsLast7Map.get(row.id) ?? 0;
    const rankingScore = likes * 8 + comments * 12 + bookmarks * 10 + row.views_count * 1.5 + (row.featured ? 40 : 0) + (row.curated_score * 0.5);

    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      status: row.status,
      published_at: row.published_at?.toISOString() ?? null,
      updated_at: row.updated_at.toISOString(),
      views_count: row.views_count,
      views_last_7_days: viewsLast7Days,
      likes_count: likes,
      comments_count: comments,
      bookmarks_count: bookmarks,
      open_reports_count: openReports,
      ranking_score: rankingScore,
    };
  });

  return {
    totals: {
      articles: rows.length,
      published: rows.filter((row) => row.status === 'published').length,
      drafts: rows.filter((row) => row.status === 'draft').length,
      views: items.reduce((sum, item) => sum + item.views_count, 0),
      views_last_7_days: items.reduce((sum, item) => sum + item.views_last_7_days, 0),
      likes: items.reduce((sum, item) => sum + item.likes_count, 0),
      comments: items.reduce((sum, item) => sum + item.comments_count, 0),
      bookmarks: items.reduce((sum, item) => sum + item.bookmarks_count, 0),
      open_reports: items.reduce((sum, item) => sum + item.open_reports_count, 0),
    },
    items,
  };
}

export async function getMyArticleById(id: string, userId: string) {
  const [row] = await db
    .select({
      id: catalogItems.id,
      title: catalogItems.title,
      slug: catalogItems.slug,
      short_description: catalogItems.short_description,
      full_description: catalogItems.full_description,
      status: catalogItems.status,
      visibility: catalogItems.visibility,
      hero_image_url: catalogItems.hero_image_url,
      seo_title: catalogItems.seo_title,
      seo_description: catalogItems.seo_description,
    })
    .from(catalogItems)
    .where(and(
      eq(catalogItems.id, id),
      eq(catalogItems.type, ARTICLE_TYPE),
      eq(catalogItems.author_user_id, userId),
    ))
    .limit(1);

  if (!row) {
    throw new NotFoundError('Статья не найдена');
  }

  const [meta] = await db
    .select()
    .from(catalogItemMeta)
    .where(eq(catalogItemMeta.item_id, id))
    .limit(1);

  const [categoryRows, tagRows, useCaseRows] = await Promise.all([
    db.select({ id: catalogItemCategories.category_id }).from(catalogItemCategories).where(eq(catalogItemCategories.item_id, id)),
    db.select({ id: catalogItemTags.tag_id }).from(catalogItemTags).where(eq(catalogItemTags.item_id, id)),
    db.select({ id: catalogItemUseCases.use_case_id }).from(catalogItemUseCases).where(eq(catalogItemUseCases.item_id, id)),
  ]);

  return {
    ...row,
    meta: meta ? {
      primary_cta_label: meta.primary_cta_label,
      primary_cta_url: meta.primary_cta_url,
      secondary_cta_label: meta.secondary_cta_label,
      secondary_cta_url: meta.secondary_cta_url,
      reading_time_minutes: meta.reading_time_minutes,
      metadata_json: meta.metadata_json,
    } : null,
    category_ids: categoryRows.map((item) => item.id),
    tag_ids: tagRows.map((item) => item.id),
    use_case_ids: useCaseRows.map((item) => item.id),
  };
}

async function replaceRelations(id: string, input: Pick<UpsertArticleInput, 'category_ids' | 'tag_ids' | 'use_case_ids'>) {
  await db.delete(catalogItemCategories).where(eq(catalogItemCategories.item_id, id));
  await db.delete(catalogItemTags).where(eq(catalogItemTags.item_id, id));
  await db.delete(catalogItemUseCases).where(eq(catalogItemUseCases.item_id, id));

  if (input.category_ids?.length) {
    await db.insert(catalogItemCategories).values(
      input.category_ids.map((categoryId) => ({ item_id: id, category_id: categoryId })),
    );
  }

  if (input.tag_ids?.length) {
    await db.insert(catalogItemTags).values(
      input.tag_ids.map((tagId) => ({ item_id: id, tag_id: tagId })),
    );
  }

  if (input.use_case_ids?.length) {
    await db.insert(catalogItemUseCases).values(
      input.use_case_ids.map((useCaseId) => ({ item_id: id, use_case_id: useCaseId })),
    );
  }
}

export async function createArticle(input: UpsertArticleInput, userId: string) {
  const payload = normalizeArticlePayload(input);
  await ensureUniqueSlug(payload.slug);

  const [inserted] = await db
    .insert(catalogItems)
    .values({
      type: ARTICLE_TYPE,
      title: payload.title,
      slug: payload.slug,
      short_description: payload.short_description,
      full_description: payload.full_description,
      status: payload.status,
      visibility: 'public',
      hero_image_url: payload.hero_image_url,
      author_user_id: userId,
      seo_title: payload.seo_title,
      seo_description: payload.seo_description,
      published_at: payload.status === 'published' ? new Date() : null,
    })
    .returning({ id: catalogItems.id });

  if (payload.meta) {
    await db.insert(catalogItemMeta).values({
      item_id: inserted.id,
      ...payload.meta,
    });
  }

  await replaceRelations(inserted.id, input);

  return getMyArticleById(inserted.id, userId);
}

export async function updateMyArticle(id: string, input: UpsertArticleInput, userId: string) {
  const [existing] = await db
    .select({
      id: catalogItems.id,
      author_user_id: catalogItems.author_user_id,
      published_at: catalogItems.published_at,
    })
    .from(catalogItems)
    .where(and(
      eq(catalogItems.id, id),
      eq(catalogItems.type, ARTICLE_TYPE),
    ))
    .limit(1);

  if (!existing) {
    throw new NotFoundError('Статья не найдена');
  }

  if (existing.author_user_id !== userId) {
    throw new AppError(403, 'FORBIDDEN', 'Недостаточно прав для редактирования этой статьи');
  }

  const payload = normalizeArticlePayload(input);
  await ensureUniqueSlug(payload.slug, id);

  await db
    .update(catalogItems)
    .set({
      title: payload.title,
      slug: payload.slug,
      short_description: payload.short_description,
      full_description: payload.full_description,
      status: payload.status,
      hero_image_url: payload.hero_image_url,
      seo_title: payload.seo_title,
      seo_description: payload.seo_description,
      published_at: payload.status === 'published'
        ? (existing.published_at ?? new Date())
        : null,
    })
    .where(eq(catalogItems.id, id));

  if (payload.meta) {
    const [existingMeta] = await db
      .select({ item_id: catalogItemMeta.item_id })
      .from(catalogItemMeta)
      .where(eq(catalogItemMeta.item_id, id))
      .limit(1);

    if (existingMeta) {
      await db
        .update(catalogItemMeta)
        .set(payload.meta)
        .where(eq(catalogItemMeta.item_id, id));
    } else {
      await db.insert(catalogItemMeta).values({
        item_id: id,
        ...payload.meta,
      });
    }
  } else {
    await db.delete(catalogItemMeta).where(eq(catalogItemMeta.item_id, id));
  }

  await replaceRelations(id, input);

  return getMyArticleById(id, userId);
}
