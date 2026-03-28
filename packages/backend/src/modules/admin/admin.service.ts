import { eq, and, desc, asc, ilike, sql, count, inArray, type SQL } from 'drizzle-orm';
import { db } from '../../config/database.js';
import {
  catalogItems, catalogItemMeta,
  catalogItemCategories, catalogItemTags, catalogItemUseCases,
  categories, tags, useCases,
  users, balanceTransactions,
  usageLedger,
  agents, agentRuns,
  toolDefinitions,
  chatConversations, chatConversationMessages,
} from '../../db/schema/index.js';
import { NotFoundError, ConflictError, AppError } from '../../middleware/error-handler.js';
import type { CreateCatalogItemInput, UpdateCatalogItemInput } from '@llmstore/shared/schemas';
import type { UserRole, UserStatus } from '@llmstore/shared';

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

// ─── Tools Management ───────────────────────────────────────────────

export async function listTools() {
  const rows = await db
    .select({
      id: toolDefinitions.id,
      name: toolDefinitions.name,
      slug: toolDefinitions.slug,
      tool_type: toolDefinitions.tool_type,
      description: toolDefinitions.description,
      input_schema: toolDefinitions.input_schema,
      output_schema: toolDefinitions.output_schema,
      config_json: toolDefinitions.config_json,
      is_builtin: toolDefinitions.is_builtin,
      is_active: toolDefinitions.is_active,
      created_at: toolDefinitions.created_at,
      updated_at: toolDefinitions.updated_at,
    })
    .from(toolDefinitions)
    .orderBy(desc(toolDefinitions.created_at));

  return rows.map((r) => ({
    ...r,
    created_at: r.created_at.toISOString(),
    updated_at: r.updated_at.toISOString(),
  }));
}

export async function createTool(input: {
  name: string;
  slug: string;
  tool_type: string;
  description?: string | null;
  input_schema: Record<string, unknown>;
  output_schema?: Record<string, unknown> | null;
  config_json?: Record<string, unknown> | null;
  is_builtin?: boolean;
  is_active?: boolean;
}) {
  const [existing] = await db
    .select({ id: toolDefinitions.id })
    .from(toolDefinitions)
    .where(eq(toolDefinitions.slug, input.slug))
    .limit(1);

  if (existing) throw new ConflictError('Инструмент с таким slug уже существует');

  const [tool] = await db
    .insert(toolDefinitions)
    .values({
      name: input.name,
      slug: input.slug,
      tool_type: input.tool_type as any,
      description: input.description ?? null,
      input_schema: input.input_schema,
      output_schema: input.output_schema ?? null,
      config_json: input.config_json ?? null,
      is_builtin: input.is_builtin ?? false,
      is_active: input.is_active ?? true,
    })
    .returning();

  return {
    ...tool,
    created_at: tool.created_at.toISOString(),
    updated_at: tool.updated_at.toISOString(),
  };
}

export async function updateTool(id: string, input: {
  name?: string;
  slug?: string;
  tool_type?: string;
  description?: string | null;
  input_schema?: Record<string, unknown>;
  output_schema?: Record<string, unknown> | null;
  config_json?: Record<string, unknown> | null;
  is_builtin?: boolean;
  is_active?: boolean;
}) {
  const [existing] = await db
    .select({ id: toolDefinitions.id })
    .from(toolDefinitions)
    .where(eq(toolDefinitions.id, id))
    .limit(1);

  if (!existing) throw new NotFoundError('Инструмент не найден');

  if (input.slug) {
    const [conflict] = await db
      .select({ id: toolDefinitions.id })
      .from(toolDefinitions)
      .where(and(eq(toolDefinitions.slug, input.slug), sql`${toolDefinitions.id} != ${id}`))
      .limit(1);
    if (conflict) throw new ConflictError('Инструмент с таким slug уже существует');
  }

  const [tool] = await db
    .update(toolDefinitions)
    .set(input as any)
    .where(eq(toolDefinitions.id, id))
    .returning();

  return {
    ...tool,
    created_at: tool.created_at.toISOString(),
    updated_at: tool.updated_at.toISOString(),
  };
}

export async function deleteTool(id: string) {
  const [tool] = await db
    .delete(toolDefinitions)
    .where(eq(toolDefinitions.id, id))
    .returning({ id: toolDefinitions.id });

  if (!tool) throw new NotFoundError('Инструмент не найден');
  return { success: true };
}

// ─── User Management ────────────────────────────────────────

interface AdminUsersQuery {
  page?: number;
  per_page?: number;
  search?: string;
  role?: string;
  status?: string;
}

export async function listUsers(query: AdminUsersQuery) {
  const page = query.page ?? 1;
  const perPage = query.per_page ?? 20;
  const offset = (page - 1) * perPage;

  const conditions: SQL[] = [];

  if (query.search) {
    const term = `%${query.search}%`;
    conditions.push(
      sql`(${ilike(users.email, term)} OR ${ilike(users.name, term)} OR ${ilike(users.username, term)})`,
    );
  }
  if (query.role) {
    conditions.push(eq(users.role, query.role as any));
  }
  if (query.status) {
    conditions.push(eq(users.status, query.status as any));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countResult] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        username: users.username,
        name: users.name,
        avatar_url: users.avatar_url,
        role: users.role,
        status: users.status,
        balance_usd: users.balance_usd,
        created_at: users.created_at,
        updated_at: users.updated_at,
      })
      .from(users)
      .where(where)
      .orderBy(desc(users.created_at))
      .limit(perPage)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(where),
  ]);

  const total = countResult[0]?.count ?? 0;
  const userIds = rows.map((row) => row.id);

  const chatsByUser = new Map<string, number>();
  const agentsByUser = new Map<string, number>();
  const spendByUser = new Map<string, { spent_tokens: number; spent_usd: number }>();

  if (userIds.length > 0) {
    const [chatRows, agentRows, spendRows] = await Promise.all([
      db
        .select({
          user_id: chatConversations.user_id,
          count: sql<number>`count(*)::int`,
        })
        .from(chatConversations)
        .where(inArray(chatConversations.user_id, userIds))
        .groupBy(chatConversations.user_id),
      db
        .select({
          user_id: agents.owner_user_id,
          count: sql<number>`count(*)::int`,
        })
        .from(agents)
        .where(inArray(agents.owner_user_id, userIds))
        .groupBy(agents.owner_user_id),
      db
        .select({
          user_id: agentRuns.user_id,
          spent_tokens: sql<number>`coalesce(sum(coalesce(${usageLedger.total_tokens}, ${usageLedger.prompt_tokens} + ${usageLedger.completion_tokens})), 0)::int`,
          spent_usd: sql<string>`coalesce(sum(${usageLedger.estimated_cost}::numeric), 0)`,
        })
        .from(agentRuns)
        .leftJoin(usageLedger, eq(usageLedger.run_id, agentRuns.id))
        .where(inArray(agentRuns.user_id, userIds))
        .groupBy(agentRuns.user_id),
    ]);

    for (const row of chatRows) {
      chatsByUser.set(row.user_id, row.count ?? 0);
    }
    for (const row of agentRows) {
      agentsByUser.set(row.user_id, row.count ?? 0);
    }
    for (const row of spendRows) {
      spendByUser.set(row.user_id, {
        spent_tokens: row.spent_tokens ?? 0,
        spent_usd: Number(row.spent_usd ?? 0),
      });
    }
  }

  return {
    users: rows.map((r) => ({
      ...r,
      chats_count: chatsByUser.get(r.id) ?? 0,
      agents_count: agentsByUser.get(r.id) ?? 0,
      spent_tokens: spendByUser.get(r.id)?.spent_tokens ?? 0,
      spent_usd: spendByUser.get(r.id)?.spent_usd ?? 0,
      created_at: r.created_at.toISOString(),
      updated_at: r.updated_at.toISOString(),
    })),
    meta: {
      total,
      page,
      per_page: perPage,
      total_pages: Math.ceil(total / perPage),
    },
  };
}

export async function getUserById(id: string) {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      username: users.username,
      name: users.name,
      avatar_url: users.avatar_url,
      role: users.role,
      status: users.status,
      balance_usd: users.balance_usd,
      created_at: users.created_at,
      updated_at: users.updated_at,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!user) throw new NotFoundError('Пользователь не найден');

  const [agentCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agents)
    .where(eq(agents.owner_user_id, id));

  const [runCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agentRuns)
    .where(eq(agentRuns.user_id, id));

  const txs = await db
    .select()
    .from(balanceTransactions)
    .where(eq(balanceTransactions.user_id, id))
    .orderBy(desc(balanceTransactions.created_at))
    .limit(20);

  return {
    ...user,
    created_at: user.created_at.toISOString(),
    updated_at: user.updated_at.toISOString(),
    agents_count: agentCount?.count ?? 0,
    runs_count: runCount?.count ?? 0,
    recent_transactions: txs.map((tx) => ({
      id: tx.id,
      amount: tx.amount,
      balance_after: tx.balance_after,
      type: tx.type,
      description: tx.description,
      created_at: tx.created_at.toISOString(),
    })),
  };
}

export async function updateUserRole(id: string, role: UserRole) {
  const [user] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!user) throw new NotFoundError('Пользователь не найден');

  await db.update(users).set({ role }).where(eq(users.id, id));

  return { id, previous_role: user.role, new_role: role };
}

export async function updateUserStatus(id: string, status: UserStatus) {
  const [user] = await db
    .select({ id: users.id, status: users.status })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!user) throw new NotFoundError('Пользователь не найден');

  await db.update(users).set({ status }).where(eq(users.id, id));

  return { id, previous_status: user.status, new_status: status };
}

// ─── All Agents (admin view) ────────────────────────────────

interface AdminAgentsQuery {
  page?: number;
  per_page?: number;
  search?: string;
  status?: string;
  owner_id?: string;
}

export async function listAllAgents(query: AdminAgentsQuery) {
  const page = query.page ?? 1;
  const perPage = query.per_page ?? 20;
  const offset = (page - 1) * perPage;

  const conditions: SQL[] = [];

  if (query.search) {
    const term = `%${query.search}%`;
    conditions.push(ilike(agents.name, term));
  }
  if (query.status) {
    conditions.push(eq(agents.status, query.status as any));
  }
  if (query.owner_id) {
    conditions.push(eq(agents.owner_user_id, query.owner_id));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countResult] = await Promise.all([
    db
      .select({
        id: agents.id,
        name: agents.name,
        slug: agents.slug,
        description: agents.description,
        visibility: agents.visibility,
        status: agents.status,
        created_at: agents.created_at,
        updated_at: agents.updated_at,
        owner_id: agents.owner_user_id,
        owner_email: users.email,
        owner_name: users.name,
      })
      .from(agents)
      .leftJoin(users, eq(agents.owner_user_id, users.id))
      .where(where)
      .orderBy(desc(agents.updated_at))
      .limit(perPage)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(agents)
      .where(where),
  ]);

  const total = countResult[0]?.count ?? 0;

  const agentIds = rows.map((r) => r.id);
  const usageByAgent = new Map<string, { total_tokens: number; total_cost_usd: number }>();

  if (agentIds.length > 0) {
    const usageRows = await db
      .select({
        agent_id: agentRuns.agent_id,
        total_tokens: sql<number>`coalesce(sum(coalesce(${usageLedger.total_tokens}, ${usageLedger.prompt_tokens} + ${usageLedger.completion_tokens})), 0)::int`,
        total_cost_usd: sql<string>`coalesce(sum(${usageLedger.estimated_cost}::numeric), 0)`,
      })
      .from(agentRuns)
      .leftJoin(usageLedger, eq(usageLedger.run_id, agentRuns.id))
      .where(inArray(agentRuns.agent_id, agentIds))
      .groupBy(agentRuns.agent_id);

    for (const row of usageRows) {
      usageByAgent.set(row.agent_id, {
        total_tokens: row.total_tokens ?? 0,
        total_cost_usd: Number(row.total_cost_usd ?? 0),
      });
    }
  }

  return {
    agents: rows.map((r) => {
      const usage = usageByAgent.get(r.id);
      return {
        ...r,
        total_tokens: usage?.total_tokens ?? 0,
        total_cost_usd: usage?.total_cost_usd ?? 0,
        created_at: r.created_at.toISOString(),
        updated_at: r.updated_at.toISOString(),
      };
    }),
    meta: {
      total,
      page,
      per_page: perPage,
      total_pages: Math.ceil(total / perPage),
    },
  };
}

// ─── User Balance Management ────────────────────────────────

export async function adjustUserBalance(
  adminUserId: string,
  input: { user_id: string; amount: number; description: string },
) {
  const [user] = await db
    .select({ id: users.id, balance_usd: users.balance_usd })
    .from(users)
    .where(eq(users.id, input.user_id))
    .limit(1);

  if (!user) throw new NotFoundError('Пользователь не найден');

  const currentBalance = Number(user.balance_usd);
  const newBalance = currentBalance + input.amount;

  if (newBalance < 0) {
    throw new AppError(400, 'INSUFFICIENT_BALANCE', 'Недостаточно средств на балансе');
  }

  await db
    .update(users)
    .set({ balance_usd: String(newBalance.toFixed(4)) })
    .where(eq(users.id, input.user_id));

  const [tx] = await db
    .insert(balanceTransactions)
    .values({
      user_id: input.user_id,
      amount: String(input.amount),
      balance_after: String(newBalance.toFixed(4)),
      type: input.amount >= 0 ? 'admin_credit' : 'admin_debit',
      description: input.description,
      performed_by: adminUserId,
    })
    .returning();

  return {
    balance_usd: newBalance.toFixed(4),
    transaction: {
      id: tx.id,
      amount: tx.amount,
      balance_after: tx.balance_after,
      type: tx.type,
      description: tx.description,
      created_at: tx.created_at.toISOString(),
    },
  };
}

export async function getDashboardStats() {
  const now = new Date();
  const days30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    usersCountRes,
    usersActiveRes,
    usersBalanceRes,
    agentsCountRes,
    runsCountRes,
    chatsCountRes,
    chatsGeneralCountRes,
    chatsAgentCountRes,
    chatMessagesCountRes,
    usageRows,
    topExpensiveChats,
  ] = await Promise.all([
    db.select({ count: count() }).from(users),
    db.select({ count: count() }).from(users).where(eq(users.status, 'active')),
    db.select({ total: sql<string>`coalesce(sum(${users.balance_usd}), 0)` }).from(users),
    db.select({ count: count() }).from(agents),
    db.select({ count: count() }).from(agentRuns),
    db.select({ count: count() }).from(chatConversations),
    db.select({ count: count() }).from(chatConversations).where(eq(chatConversations.mode, 'general')),
    db.select({ count: count() }).from(chatConversations).where(eq(chatConversations.mode, 'agent')),
    db.select({ count: count() }).from(chatConversationMessages),
    db
      .select({
        model: sql<string>`coalesce(${chatConversationMessages.usage_json}->>'model', ${chatConversations.model_external_id}, 'unknown')`,
        prompt_tokens: sql<number>`coalesce(sum(
          coalesce(
            nullif(${chatConversationMessages.usage_json}->>'prompt_tokens', '')::numeric,
            (
              select ul.prompt_tokens
              from usage_ledger ul
              where ul.run_id = ${chatConversationMessages.run_id}
              limit 1
            ),
            0
          )
        ), 0)::int`,
        completion_tokens: sql<number>`coalesce(sum(
          coalesce(
            nullif(${chatConversationMessages.usage_json}->>'completion_tokens', '')::numeric,
            (
              select ul.completion_tokens
              from usage_ledger ul
              where ul.run_id = ${chatConversationMessages.run_id}
              limit 1
            ),
            0
          )
        ), 0)::int`,
        total_tokens: sql<number>`coalesce(sum(
          coalesce(
            nullif(${chatConversationMessages.usage_json}->>'total_tokens', '')::numeric,
            (
              select coalesce(ul.total_tokens, ul.prompt_tokens + ul.completion_tokens, 0)
              from usage_ledger ul
              where ul.run_id = ${chatConversationMessages.run_id}
              limit 1
            ),
            0
          )
        ), 0)::int`,
        usd_cost: sql<string>`coalesce(sum(
          coalesce(
            nullif(${chatConversationMessages.usage_json}->>'estimated_cost', '')::numeric,
            (
              select ul.estimated_cost
              from usage_ledger ul
              where ul.run_id = ${chatConversationMessages.run_id}
              limit 1
            ),
            0
          )
        ), 0)`,
        messages: sql<number>`count(*)::int`,
      })
      .from(chatConversationMessages)
      .innerJoin(chatConversations, eq(chatConversationMessages.conversation_id, chatConversations.id))
      .where(sql`${chatConversationMessages.usage_json} is not null OR ${chatConversationMessages.run_id} is not null`)
      .groupBy(sql`coalesce(${chatConversationMessages.usage_json}->>'model', ${chatConversations.model_external_id}, 'unknown')`)
      .orderBy(sql`coalesce(sum(
        coalesce(
          nullif(${chatConversationMessages.usage_json}->>'estimated_cost', '')::numeric,
          (
            select ul.estimated_cost
            from usage_ledger ul
            where ul.run_id = ${chatConversationMessages.run_id}
            limit 1
          ),
          0
        )
      ), 0) desc`),
    db
      .select({
        id: chatConversations.id,
        title: chatConversations.title,
        mode: chatConversations.mode,
        message_count: sql<number>`count(${chatConversationMessages.id})::int`,
        usd_cost: sql<string>`coalesce(sum(
          coalesce(
            nullif(${chatConversationMessages.usage_json}->>'estimated_cost', '')::numeric,
            (
              select ul.estimated_cost
              from usage_ledger ul
              where ul.run_id = ${chatConversationMessages.run_id}
              limit 1
            ),
            0
          )
        ), 0)`,
      })
      .from(chatConversations)
      .leftJoin(chatConversationMessages, eq(chatConversationMessages.conversation_id, chatConversations.id))
      .groupBy(chatConversations.id, chatConversations.title, chatConversations.mode)
      .orderBy(sql`coalesce(sum(
        coalesce(
          nullif(${chatConversationMessages.usage_json}->>'estimated_cost', '')::numeric,
          (
            select ul.estimated_cost
            from usage_ledger ul
            where ul.run_id = ${chatConversationMessages.run_id}
            limit 1
          ),
          0
        )
      ), 0) desc`)
      .limit(5),
  ]);

  const usage30Rows = await db
    .select({
      total_tokens: sql<number>`coalesce(sum(
        coalesce(
          nullif(${chatConversationMessages.usage_json}->>'total_tokens', '')::numeric,
          (
            select coalesce(ul.total_tokens, ul.prompt_tokens + ul.completion_tokens, 0)
            from usage_ledger ul
            where ul.run_id = ${chatConversationMessages.run_id}
            limit 1
          ),
          0
        )
      ), 0)::int`,
      usd_cost: sql<string>`coalesce(sum(
        coalesce(
          nullif(${chatConversationMessages.usage_json}->>'estimated_cost', '')::numeric,
          (
            select ul.estimated_cost
            from usage_ledger ul
            where ul.run_id = ${chatConversationMessages.run_id}
            limit 1
          ),
          0
        )
      ), 0)`,
    })
    .from(chatConversationMessages)
    .where(
      and(
        sql`${chatConversationMessages.usage_json} is not null OR ${chatConversationMessages.run_id} is not null`,
        sql`${chatConversationMessages.created_at} >= ${days30.toISOString()}`,
      ),
    );

  const totalUsdCost = usageRows.reduce((sum, row) => sum + Number(row.usd_cost ?? 0), 0);
  const totalPromptTokens = usageRows.reduce((sum, row) => sum + (row.prompt_tokens ?? 0), 0);
  const totalCompletionTokens = usageRows.reduce((sum, row) => sum + (row.completion_tokens ?? 0), 0);
  const totalTokens = usageRows.reduce((sum, row) => sum + (row.total_tokens ?? 0), 0);

  const avgMessagesPerChat = (chatsCountRes[0]?.count ?? 0) > 0
    ? (chatMessagesCountRes[0]?.count ?? 0) / (chatsCountRes[0]?.count ?? 1)
    : 0;

  return {
    totals: {
      users: usersCountRes[0]?.count ?? 0,
      active_users: usersActiveRes[0]?.count ?? 0,
      users_balance_usd: Number(usersBalanceRes[0]?.total ?? 0),
      agents: agentsCountRes[0]?.count ?? 0,
      runs: runsCountRes[0]?.count ?? 0,
      chats: chatsCountRes[0]?.count ?? 0,
      chats_general: chatsGeneralCountRes[0]?.count ?? 0,
      chats_agent: chatsAgentCountRes[0]?.count ?? 0,
      chat_messages: chatMessagesCountRes[0]?.count ?? 0,
      prompt_tokens: totalPromptTokens,
      completion_tokens: totalCompletionTokens,
      total_tokens: totalTokens,
      chat_cost_usd: totalUsdCost,
    },
    last_30_days: {
      total_tokens: usage30Rows[0]?.total_tokens ?? 0,
      chat_cost_usd: Number(usage30Rows[0]?.usd_cost ?? 0),
    },
    derived: {
      avg_messages_per_chat: Number(avgMessagesPerChat.toFixed(2)),
      avg_cost_per_chat_usd: (chatsCountRes[0]?.count ?? 0) > 0
        ? Number((totalUsdCost / (chatsCountRes[0]?.count ?? 1)).toFixed(6))
        : 0,
      avg_tokens_per_message: (chatMessagesCountRes[0]?.count ?? 0) > 0
        ? Number((totalTokens / (chatMessagesCountRes[0]?.count ?? 1)).toFixed(2))
        : 0,
    },
    by_model: usageRows.map((row) => ({
      model: row.model,
      prompt_tokens: row.prompt_tokens ?? 0,
      completion_tokens: row.completion_tokens ?? 0,
      total_tokens: row.total_tokens ?? 0,
      usd_cost: Number(row.usd_cost ?? 0),
      messages: row.messages ?? 0,
    })),
    top_expensive_chats: topExpensiveChats.map((row) => ({
      id: row.id,
      title: row.title,
      mode: row.mode,
      message_count: row.message_count ?? 0,
      usd_cost: Number(row.usd_cost ?? 0),
    })),
  };
}
