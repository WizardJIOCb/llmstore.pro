import { eq, and, or, ilike, desc, asc, lt, gt, sql, inArray, type SQL } from 'drizzle-orm';
import { db } from '../../config/database.js';
import {
  catalogItems, catalogItemMeta,
  catalogItemCategories, catalogItemTags, catalogItemUseCases,
  categories, tags, useCases,
  catalogComments,
} from '../../db/schema/index.js';
import { users } from '../../db/schema/index.js';
import { AppError, NotFoundError } from '../../middleware/error-handler.js';
import type { CatalogItemCard, CatalogItemFull, CatalogItemMeta, TagSlim, CategorySlim, UseCaseSlim, UserSlim } from '@llmstore/shared';
import type { CatalogQueryInput } from '@llmstore/shared/schemas';

// ─── Taxonomy ───────────────────────────────────────────────

export async function listCategories(): Promise<CategorySlim[]> {
  return db.select({
    id: categories.id,
    name: categories.name,
    slug: categories.slug,
    parent_id: categories.parent_id,
  }).from(categories).orderBy(asc(categories.name));
}

export async function listTags(): Promise<TagSlim[]> {
  return db.select({
    id: tags.id,
    name: tags.name,
    slug: tags.slug,
  }).from(tags).orderBy(asc(tags.name));
}

export async function listUseCases(): Promise<UseCaseSlim[]> {
  return db.select({
    id: useCases.id,
    name: useCases.name,
    slug: useCases.slug,
  }).from(useCases).orderBy(asc(useCases.name));
}

// ─── Helpers to eager-load relations ────────────────────────

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

async function loadMetaForItems(itemIds: string[]): Promise<Map<string, CatalogItemMeta>> {
  if (itemIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(catalogItemMeta)
    .where(inArray(catalogItemMeta.item_id, itemIds));

  const map = new Map<string, CatalogItemMeta>();
  for (const r of rows) {
    map.set(r.item_id, {
      pricing_type: r.pricing_type,
      deployment_type: r.deployment_type,
      privacy_type: r.privacy_type,
      language_support: r.language_support,
      difficulty: r.difficulty,
      readiness: r.readiness,
      vendor_name: r.vendor_name,
      source_url: r.source_url,
      docs_url: r.docs_url,
      github_url: r.github_url,
      website_url: r.website_url,
      metadata_json: r.metadata_json,
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

  const map = new Map<string, number>();
  for (const r of rows) {
    map.set(r.item_id, r.count);
  }
  return map;
}

const emptyMeta: CatalogItemMeta = {
  pricing_type: null, deployment_type: null, privacy_type: null,
  language_support: null, difficulty: null, readiness: null,
  vendor_name: null, source_url: null, docs_url: null,
  github_url: null, website_url: null, metadata_json: null,
};

export interface PublicComment {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
  user: {
    id: string;
    name: string | null;
    username: string | null;
    avatar_url: string | null;
  };
}

// ─── list() — public catalog with dynamic filtering ─────────

export async function list(query: CatalogQueryInput): Promise<{ items: CatalogItemCard[]; nextCursor: string | null }> {
  const conditions: SQL[] = [
    eq(catalogItems.status, 'published'),
    eq(catalogItems.visibility, 'public'),
  ];

  // Type filter
  if (query.type) {
    conditions.push(eq(catalogItems.type, query.type));
  }

  // Featured filter
  if (query.featured) {
    conditions.push(eq(catalogItems.featured, true));
  }

  // Text search
  if (query.search) {
    const term = `%${query.search}%`;
    conditions.push(
      or(
        ilike(catalogItems.title, term),
        ilike(catalogItems.short_description, term),
      )!,
    );
  }

  // Category filter (via junction subquery)
  if (query.category) {
    const catSub = db
      .select({ item_id: catalogItemCategories.item_id })
      .from(catalogItemCategories)
      .innerJoin(categories, eq(catalogItemCategories.category_id, categories.id))
      .where(eq(categories.slug, query.category));
    conditions.push(inArray(catalogItems.id, catSub));
  }

  // Tags filter (comma-separated slugs — item must match ANY)
  if (query.tags) {
    const tagSlugs = query.tags.split(',').map((s) => s.trim()).filter(Boolean);
    if (tagSlugs.length > 0) {
      const tagSub = db
        .select({ item_id: catalogItemTags.item_id })
        .from(catalogItemTags)
        .innerJoin(tags, eq(catalogItemTags.tag_id, tags.id))
        .where(inArray(tags.slug, tagSlugs));
      conditions.push(inArray(catalogItems.id, tagSub));
    }
  }

  // Use-case filter
  if (query.use_case) {
    const ucSub = db
      .select({ item_id: catalogItemUseCases.item_id })
      .from(catalogItemUseCases)
      .innerJoin(useCases, eq(catalogItemUseCases.use_case_id, useCases.id))
      .where(eq(useCases.slug, query.use_case));
    conditions.push(inArray(catalogItems.id, ucSub));
  }

  // Meta-field filters (pricing, deployment, privacy, language, difficulty)
  const metaFilters: SQL[] = [];
  if (query.pricing) metaFilters.push(eq(catalogItemMeta.pricing_type, query.pricing));
  if (query.deployment) metaFilters.push(eq(catalogItemMeta.deployment_type, query.deployment));
  if (query.privacy) metaFilters.push(eq(catalogItemMeta.privacy_type, query.privacy));
  if (query.language) metaFilters.push(eq(catalogItemMeta.language_support, query.language));
  if (query.difficulty) metaFilters.push(eq(catalogItemMeta.difficulty, query.difficulty));

  const hasMetaFilter = metaFilters.length > 0;

  if (hasMetaFilter) {
    const metaSub = db
      .select({ item_id: catalogItemMeta.item_id })
      .from(catalogItemMeta)
      .where(and(...metaFilters));
    conditions.push(inArray(catalogItems.id, metaSub));
  }

  // Sorting
  let orderCol: SQL;
  let orderDir: 'asc' | 'desc';
  switch (query.sort) {
    case 'newest':
      orderCol = sql`${catalogItems.published_at}`;
      orderDir = 'desc';
      break;
    case 'alphabetical':
      orderCol = sql`${catalogItems.title}`;
      orderDir = 'asc';
      break;
    case 'curated':
    default:
      orderCol = sql`${catalogItems.curated_score}`;
      orderDir = 'desc';
      break;
  }

  // Cursor pagination: fetch cursor row's sort value, then add keyset condition
  if (query.cursor) {
    const [cursorRow] = await db
      .select({
        curated_score: catalogItems.curated_score,
        published_at: catalogItems.published_at,
        title: catalogItems.title,
        id: catalogItems.id,
      })
      .from(catalogItems)
      .where(eq(catalogItems.id, query.cursor))
      .limit(1);

    if (cursorRow) {
      switch (query.sort) {
        case 'newest':
          if (cursorRow.published_at) {
            conditions.push(
              or(
                lt(catalogItems.published_at, cursorRow.published_at),
                and(
                  eq(catalogItems.published_at, cursorRow.published_at),
                  gt(catalogItems.id, cursorRow.id),
                ),
              )!,
            );
          }
          break;
        case 'alphabetical':
          conditions.push(
            or(
              gt(catalogItems.title, cursorRow.title),
              and(
                eq(catalogItems.title, cursorRow.title),
                gt(catalogItems.id, cursorRow.id),
              ),
            )!,
          );
          break;
        case 'curated':
        default:
          conditions.push(
            or(
              lt(catalogItems.curated_score, cursorRow.curated_score),
              and(
                eq(catalogItems.curated_score, cursorRow.curated_score),
                gt(catalogItems.id, cursorRow.id),
              ),
            )!,
          );
          break;
      }
    }
  }

  // Execute: fetch limit+1 to check if there's a next page
  const fetchLimit = query.limit + 1;

  const orderExpr = orderDir === 'desc'
    ? desc(orderCol)
    : asc(orderCol);

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
    })
    .from(catalogItems)
    .where(and(...conditions))
    .orderBy(orderExpr, asc(catalogItems.id))
    .limit(fetchLimit);

  const hasMore = rows.length > query.limit;
  const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
  const nextCursor = hasMore ? pageRows[pageRows.length - 1].id : null;

  const itemIds = pageRows.map((r) => r.id);

  // Eager-load tags, categories, meta
  const [tagsMap, catsMap, metaMap, commentsMap] = await Promise.all([
    loadTagsForItems(itemIds),
    loadCategoriesForItems(itemIds),
    loadMetaForItems(itemIds),
    loadCommentCountsForItems(itemIds),
  ]);

  const items: CatalogItemCard[] = pageRows.map((r) => {
    const meta = metaMap.get(r.id) ?? emptyMeta;
    return {
      id: r.id,
      type: r.type,
      title: r.title,
      slug: r.slug,
      short_description: r.short_description,
      hero_image_url: r.hero_image_url,
      curated_score: r.curated_score,
      featured: r.featured,
      views_count: r.views_count,
      comments_count: commentsMap.get(r.id) ?? 0,
      tags: tagsMap.get(r.id) ?? [],
      categories: catsMap.get(r.id) ?? [],
      meta: {
        pricing_type: meta.pricing_type,
        deployment_type: meta.deployment_type,
        language_support: meta.language_support,
        privacy_type: meta.privacy_type,
      },
      published_at: r.published_at?.toISOString() ?? null,
    };
  });

  return { items, nextCursor };
}

// ─── getByTypeAndSlug() — full detail ───────────────────────

export async function getByTypeAndSlug(type: string, slug: string): Promise<CatalogItemFull> {
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
    .where(
      and(
        eq(catalogItems.type, type as any),
        eq(catalogItems.slug, slug),
        eq(catalogItems.status, 'published'),
        eq(catalogItems.visibility, 'public'),
      ),
    )
    .limit(1);

  if (!row) {
    throw new NotFoundError('Элемент каталога не найден');
  }

  await db
    .update(catalogItems)
    .set({ views_count: sql`${catalogItems.views_count} + 1` })
    .where(eq(catalogItems.id, row.id));

  // Load related data in parallel
  const [tagsMap, catsMap, useCasesMap, metaMap, commentsMap] = await Promise.all([
    loadTagsForItems([row.id]),
    loadCategoriesForItems([row.id]),
    loadUseCasesForItems([row.id]),
    loadMetaForItems([row.id]),
    loadCommentCountsForItems([row.id]),
  ]);

  // Load author
  let author: UserSlim | null = null;
  if (row.author_user_id) {
    const [authorRow] = await db
      .select({
        id: users.id,
        username: users.username,
        name: users.name,
        avatar_url: users.avatar_url,
      })
      .from(users)
      .where(eq(users.id, row.author_user_id))
      .limit(1);
    author = authorRow ?? null;
  }

  // Related items: same type, published, public, different id, limit 4
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
    })
    .from(catalogItems)
    .where(
      and(
        eq(catalogItems.type, row.type),
        eq(catalogItems.status, 'published'),
        eq(catalogItems.visibility, 'public'),
        sql`${catalogItems.id} != ${row.id}`,
      ),
    )
    .orderBy(desc(catalogItems.curated_score))
    .limit(4);

  const relatedIds = relatedRows.map((r) => r.id);
  const [relTagsMap, relCatsMap, relMetaMap, relCommentsMap] = await Promise.all([
    loadTagsForItems(relatedIds),
    loadCategoriesForItems(relatedIds),
    loadMetaForItems(relatedIds),
    loadCommentCountsForItems(relatedIds),
  ]);

  const relatedItems: CatalogItemCard[] = relatedRows.map((r) => {
    const meta = relMetaMap.get(r.id) ?? emptyMeta;
    return {
      id: r.id,
      type: r.type,
      title: r.title,
      slug: r.slug,
      short_description: r.short_description,
      hero_image_url: r.hero_image_url,
      curated_score: r.curated_score,
      featured: r.featured,
      views_count: r.views_count,
      comments_count: relCommentsMap.get(r.id) ?? 0,
      tags: relTagsMap.get(r.id) ?? [],
      categories: relCatsMap.get(r.id) ?? [],
      meta: {
        pricing_type: meta.pricing_type,
        deployment_type: meta.deployment_type,
        language_support: meta.language_support,
        privacy_type: meta.privacy_type,
      },
      published_at: r.published_at?.toISOString() ?? null,
    };
  });

  const fullMeta = metaMap.get(row.id) ?? emptyMeta;

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
    views_count: row.views_count + 1,
    comments_count: commentsMap.get(row.id) ?? 0,
    status: row.status,
    visibility: row.visibility,
    seo_title: row.seo_title,
    seo_description: row.seo_description,
    tags: tagsMap.get(row.id) ?? [],
    categories: catsMap.get(row.id) ?? [],
    meta: {
      pricing_type: fullMeta.pricing_type,
      deployment_type: fullMeta.deployment_type,
      language_support: fullMeta.language_support,
      privacy_type: fullMeta.privacy_type,
    },
    published_at: row.published_at?.toISOString() ?? null,
    author,
    meta_full: fullMeta,
    use_cases: useCasesMap.get(row.id) ?? [],
    related_items: relatedItems,
  };
}

export async function getBySlug(slug: string): Promise<CatalogItemFull> {
  const [row] = await db
    .select({
      type: catalogItems.type,
    })
    .from(catalogItems)
    .where(
      and(
        eq(catalogItems.slug, slug),
        eq(catalogItems.status, 'published'),
        eq(catalogItems.visibility, 'public'),
      ),
    )
    .limit(1);

  if (!row) {
    throw new NotFoundError('Элемент каталога не найден');
  }

  return getByTypeAndSlug(row.type, slug);
}

async function resolvePublishedItemIdBySlug(slug: string): Promise<string> {
  const [row] = await db
    .select({ id: catalogItems.id })
    .from(catalogItems)
    .where(
      and(
        eq(catalogItems.slug, slug),
        eq(catalogItems.status, 'published'),
        eq(catalogItems.visibility, 'public'),
      ),
    )
    .limit(1);

  if (!row) throw new NotFoundError('Элемент каталога не найден');
  return row.id;
}

export async function listCommentsBySlug(slug: string): Promise<PublicComment[]> {
  const itemId = await resolvePublishedItemIdBySlug(slug);
  const rows = await db
    .select({
      id: catalogComments.id,
      content: catalogComments.content,
      created_at: catalogComments.created_at,
      updated_at: catalogComments.updated_at,
      user_id: users.id,
      name: users.name,
      username: users.username,
      avatar_url: users.avatar_url,
    })
    .from(catalogComments)
    .innerJoin(users, eq(users.id, catalogComments.user_id))
    .where(eq(catalogComments.item_id, itemId))
    .orderBy(asc(catalogComments.created_at));

  return rows.map((row) => ({
    id: row.id,
    content: row.content,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    user: {
      id: row.user_id,
      name: row.name,
      username: row.username,
      avatar_url: row.avatar_url,
    },
  }));
}

export async function createCommentBySlug(slug: string, userId: string, content: string): Promise<PublicComment> {
  const itemId = await resolvePublishedItemIdBySlug(slug);
  const [inserted] = await db
    .insert(catalogComments)
    .values({
      item_id: itemId,
      user_id: userId,
      content: content.trim(),
    })
    .returning({
      id: catalogComments.id,
      content: catalogComments.content,
      created_at: catalogComments.created_at,
      updated_at: catalogComments.updated_at,
    });

  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      avatar_url: users.avatar_url,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return {
    id: inserted.id,
    content: inserted.content,
    created_at: inserted.created_at.toISOString(),
    updated_at: inserted.updated_at.toISOString(),
    user: {
      id: user?.id ?? userId,
      name: user?.name ?? null,
      username: user?.username ?? null,
      avatar_url: user?.avatar_url ?? null,
    },
  };
}

export async function deleteCommentBySlug(
  slug: string,
  commentId: string,
  requesterUserId: string,
  requesterRole?: string,
) {
  const itemId = await resolvePublishedItemIdBySlug(slug);
  const [comment] = await db
    .select({
      id: catalogComments.id,
      user_id: catalogComments.user_id,
    })
    .from(catalogComments)
    .where(
      and(
        eq(catalogComments.id, commentId),
        eq(catalogComments.item_id, itemId),
      ),
    )
    .limit(1);

  if (!comment) throw new NotFoundError('Комментарий не найден');

  const canDeleteAny = requesterRole === 'admin' || requesterRole === 'curator';
  if (!canDeleteAny && comment.user_id !== requesterUserId) {
    throw new AppError(403, 'FORBIDDEN', 'Недостаточно прав для удаления комментария');
  }

  await db.delete(catalogComments).where(eq(catalogComments.id, commentId));
  return { success: true };
}
