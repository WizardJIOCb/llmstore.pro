import { eq, and, desc, asc, ilike, sql, type SQL } from 'drizzle-orm';
import { db } from '../../config/database.js';
import {
  catalogItems, catalogItemMeta,
  catalogItemCategories, catalogItemTags, catalogItemUseCases,
  categories, tags, useCases,
} from '../../db/schema/index.js';
import { NotFoundError, ConflictError } from '../../middleware/error-handler.js';
import type { CreateCatalogItemInput, UpdateCatalogItemInput } from '@llmstore/shared/schemas';

// ─── Admin catalog list (offset pagination) ─────────────────

interface AdminListQuery {
  page?: number;
  per_page?: number;
  type?: string;
  status?: string;
  search?: string;
  sort?: string;
}

export async function listItems(query: AdminListQuery) {
  const page = query.page ?? 1;
  const perPage = query.per_page ?? 20;
  const offset = (page - 1) * perPage;

  const conditions: SQL[] = [];

  if (query.type) {
    conditions.push(eq(catalogItems.type, query.type as any));
  }
  if (query.status) {
    conditions.push(eq(catalogItems.status, query.status as any));
  }
  if (query.search) {
    const term = `%${query.search}%`;
    conditions.push(ilike(catalogItems.title, term));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countResult] = await Promise.all([
    db
      .select({
        id: catalogItems.id,
        type: catalogItems.type,
        title: catalogItems.title,
        slug: catalogItems.slug,
        status: catalogItems.status,
        visibility: catalogItems.visibility,
        featured: catalogItems.featured,
        curated_score: catalogItems.curated_score,
        created_at: catalogItems.created_at,
        updated_at: catalogItems.updated_at,
        published_at: catalogItems.published_at,
      })
      .from(catalogItems)
      .where(where)
      .orderBy(desc(catalogItems.updated_at))
      .limit(perPage)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(catalogItems)
      .where(where),
  ]);

  const total = countResult[0]?.count ?? 0;

  return {
    items: rows.map((r) => ({
      ...r,
      created_at: r.created_at.toISOString(),
      updated_at: r.updated_at.toISOString(),
      published_at: r.published_at?.toISOString() ?? null,
    })),
    meta: {
      total,
      page,
      per_page: perPage,
      total_pages: Math.ceil(total / perPage),
    },
  };
}

// ─── Get single item for admin editing ──────────────────────

export async function getItemById(id: string) {
  const [item] = await db
    .select()
    .from(catalogItems)
    .where(eq(catalogItems.id, id))
    .limit(1);

  if (!item) throw new NotFoundError('Элемент каталога не найден');

  const [meta] = await db
    .select()
    .from(catalogItemMeta)
    .where(eq(catalogItemMeta.item_id, id))
    .limit(1);

  const [catIds, tagIds, ucIds] = await Promise.all([
    db.select({ id: catalogItemCategories.category_id }).from(catalogItemCategories).where(eq(catalogItemCategories.item_id, id)),
    db.select({ id: catalogItemTags.tag_id }).from(catalogItemTags).where(eq(catalogItemTags.item_id, id)),
    db.select({ id: catalogItemUseCases.use_case_id }).from(catalogItemUseCases).where(eq(catalogItemUseCases.item_id, id)),
  ]);

  return {
    ...item,
    created_at: item.created_at.toISOString(),
    updated_at: item.updated_at.toISOString(),
    published_at: item.published_at?.toISOString() ?? null,
    meta: meta ? {
      pricing_type: meta.pricing_type,
      deployment_type: meta.deployment_type,
      privacy_type: meta.privacy_type,
      language_support: meta.language_support,
      difficulty: meta.difficulty,
      readiness: meta.readiness,
      vendor_name: meta.vendor_name,
      source_url: meta.source_url,
      docs_url: meta.docs_url,
      github_url: meta.github_url,
      website_url: meta.website_url,
      metadata_json: meta.metadata_json,
    } : null,
    category_ids: catIds.map((r) => r.id),
    tag_ids: tagIds.map((r) => r.id),
    use_case_ids: ucIds.map((r) => r.id),
  };
}

// ─── Create catalog item (transactional) ────────────────────

export async function createItem(input: CreateCatalogItemInput, authorUserId: string) {
  // Check slug uniqueness
  const [existing] = await db
    .select({ id: catalogItems.id })
    .from(catalogItems)
    .where(eq(catalogItems.slug, input.slug))
    .limit(1);

  if (existing) {
    throw new ConflictError('Элемент с таким slug уже существует');
  }

  const { meta, category_ids, tag_ids, use_case_ids, ...itemData } = input;

  const now = new Date();
  const publishedAt = itemData.status === 'published' ? now : null;

  const [item] = await db.insert(catalogItems).values({
    ...itemData,
    author_user_id: authorUserId,
    published_at: publishedAt,
  }).returning();

  // Insert meta if provided
  if (meta) {
    await db.insert(catalogItemMeta).values({
      item_id: item.id,
      ...meta,
    });
  }

  // Insert junction records
  if (category_ids?.length) {
    await db.insert(catalogItemCategories).values(
      category_ids.map((cid) => ({ item_id: item.id, category_id: cid })),
    );
  }
  if (tag_ids?.length) {
    await db.insert(catalogItemTags).values(
      tag_ids.map((tid) => ({ item_id: item.id, tag_id: tid })),
    );
  }
  if (use_case_ids?.length) {
    await db.insert(catalogItemUseCases).values(
      use_case_ids.map((uid) => ({ item_id: item.id, use_case_id: uid })),
    );
  }

  return getItemById(item.id);
}

// ─── Update catalog item ────────────────────────────────────

export async function updateItem(id: string, input: UpdateCatalogItemInput) {
  const [existing] = await db
    .select({ id: catalogItems.id, status: catalogItems.status, published_at: catalogItems.published_at })
    .from(catalogItems)
    .where(eq(catalogItems.id, id))
    .limit(1);

  if (!existing) throw new NotFoundError('Элемент каталога не найден');

  // Check slug uniqueness if changing slug
  if (input.slug) {
    const [slugConflict] = await db
      .select({ id: catalogItems.id })
      .from(catalogItems)
      .where(and(eq(catalogItems.slug, input.slug), sql`${catalogItems.id} != ${id}`))
      .limit(1);
    if (slugConflict) {
      throw new ConflictError('Элемент с таким slug уже существует');
    }
  }

  const { meta, category_ids, tag_ids, use_case_ids, ...itemData } = input;

  // Set published_at on first publish
  const updateData: Record<string, unknown> = { ...itemData };
  if (itemData.status === 'published' && !existing.published_at) {
    updateData.published_at = new Date();
  }

  if (Object.keys(updateData).length > 0) {
    await db.update(catalogItems).set(updateData as any).where(eq(catalogItems.id, id));
  }

  // Upsert meta
  if (meta) {
    const [existingMeta] = await db
      .select({ item_id: catalogItemMeta.item_id })
      .from(catalogItemMeta)
      .where(eq(catalogItemMeta.item_id, id))
      .limit(1);

    if (existingMeta) {
      await db.update(catalogItemMeta).set(meta).where(eq(catalogItemMeta.item_id, id));
    } else {
      await db.insert(catalogItemMeta).values({ item_id: id, ...meta });
    }
  }

  // Replace junction records if provided
  if (category_ids !== undefined) {
    await db.delete(catalogItemCategories).where(eq(catalogItemCategories.item_id, id));
    if (category_ids.length) {
      await db.insert(catalogItemCategories).values(
        category_ids.map((cid) => ({ item_id: id, category_id: cid })),
      );
    }
  }
  if (tag_ids !== undefined) {
    await db.delete(catalogItemTags).where(eq(catalogItemTags.item_id, id));
    if (tag_ids.length) {
      await db.insert(catalogItemTags).values(
        tag_ids.map((tid) => ({ item_id: id, tag_id: tid })),
      );
    }
  }
  if (use_case_ids !== undefined) {
    await db.delete(catalogItemUseCases).where(eq(catalogItemUseCases.item_id, id));
    if (use_case_ids.length) {
      await db.insert(catalogItemUseCases).values(
        use_case_ids.map((uid) => ({ item_id: id, use_case_id: uid })),
      );
    }
  }

  return getItemById(id);
}

// ─── Delete catalog item ────────────────────────────────────

export async function deleteItem(id: string) {
  const [existing] = await db
    .select({ id: catalogItems.id })
    .from(catalogItems)
    .where(eq(catalogItems.id, id))
    .limit(1);

  if (!existing) throw new NotFoundError('Элемент каталога не найден');

  // Cascading deletes handle junction tables + meta
  await db.delete(catalogItems).where(eq(catalogItems.id, id));

  return { success: true };
}

// ─── Taxonomy CRUD ──────────────────────────────────────────

export async function createCategory(input: { name: string; slug: string; parent_id?: string | null }) {
  const [existing] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, input.slug)).limit(1);
  if (existing) throw new ConflictError('Категория с таким slug уже существует');
  const [cat] = await db.insert(categories).values(input).returning();
  return cat;
}

export async function updateCategory(id: string, input: { name?: string; slug?: string; parent_id?: string | null }) {
  if (input.slug) {
    const [conflict] = await db.select({ id: categories.id }).from(categories).where(and(eq(categories.slug, input.slug), sql`${categories.id} != ${id}`)).limit(1);
    if (conflict) throw new ConflictError('Категория с таким slug уже существует');
  }
  const [cat] = await db.update(categories).set(input).where(eq(categories.id, id)).returning();
  if (!cat) throw new NotFoundError('Категория не найдена');
  return cat;
}

export async function deleteCategory(id: string) {
  const [cat] = await db.delete(categories).where(eq(categories.id, id)).returning();
  if (!cat) throw new NotFoundError('Категория не найдена');
  return { success: true };
}

export async function createTag(input: { name: string; slug: string }) {
  const [existing] = await db.select({ id: tags.id }).from(tags).where(eq(tags.slug, input.slug)).limit(1);
  if (existing) throw new ConflictError('Тег с таким slug уже существует');
  const [tag] = await db.insert(tags).values(input).returning();
  return tag;
}

export async function updateTag(id: string, input: { name?: string; slug?: string }) {
  if (input.slug) {
    const [conflict] = await db.select({ id: tags.id }).from(tags).where(and(eq(tags.slug, input.slug), sql`${tags.id} != ${id}`)).limit(1);
    if (conflict) throw new ConflictError('Тег с таким slug уже существует');
  }
  const [tag] = await db.update(tags).set(input).where(eq(tags.id, id)).returning();
  if (!tag) throw new NotFoundError('Тег не найден');
  return tag;
}

export async function deleteTag(id: string) {
  const [tag] = await db.delete(tags).where(eq(tags.id, id)).returning();
  if (!tag) throw new NotFoundError('Тег не найден');
  return { success: true };
}

export async function createUseCase(input: { name: string; slug: string }) {
  const [existing] = await db.select({ id: useCases.id }).from(useCases).where(eq(useCases.slug, input.slug)).limit(1);
  if (existing) throw new ConflictError('Кейс с таким slug уже существует');
  const [uc] = await db.insert(useCases).values(input).returning();
  return uc;
}

export async function updateUseCase(id: string, input: { name?: string; slug?: string }) {
  if (input.slug) {
    const [conflict] = await db.select({ id: useCases.id }).from(useCases).where(and(eq(useCases.slug, input.slug), sql`${useCases.id} != ${id}`)).limit(1);
    if (conflict) throw new ConflictError('Кейс с таким slug уже существует');
  }
  const [uc] = await db.update(useCases).set(input).where(eq(useCases.id, id)).returning();
  if (!uc) throw new NotFoundError('Кейс не найден');
  return uc;
}

export async function deleteUseCase(id: string) {
  const [uc] = await db.delete(useCases).where(eq(useCases.id, id)).returning();
  if (!uc) throw new NotFoundError('Кейс не найден');
  return { success: true };
}
