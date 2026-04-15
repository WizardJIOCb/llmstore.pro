import argon2 from 'argon2';
import { eq, and, or, desc, asc, ilike, sql, count, inArray, type SQL } from 'drizzle-orm';
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
  agentRunMessages, agentRunToolCalls, aiModels,
  aliceWebhookLogs, aliceSkillLinks,
} from '../../db/schema/index.js';
import { NotFoundError, ConflictError, AppError } from '../../middleware/error-handler.js';
import type { CreateCatalogItemInput, UpdateCatalogItemInput } from '@llmstore/shared/schemas';
import type { UserRole, UserStatus } from '@llmstore/shared';
import {
  getAdminSettings as getGlobalAdminSettings,
  setUsdToRubRate,
  updateTopUpSettings,
  updateLegalSettings,
  updateStarterPromptSettings,
  updateSignupBonusSettings,
  updateOpenRouterRequestsSettings,
} from '../../lib/app-settings.js';
import { openRouterClient } from '../openrouter/index.js';
import { logger } from '../../lib/logger.js';
import {
  listProjectDeploymentsForAdmin,
  startProjectDeploymentAsAdmin,
  stopProjectDeploymentAsAdmin,
  type AdminProjectDeploymentRecord,
} from '../agent-runtime/project-deployments.service.js';

// ─── Admin catalog list (offset pagination) ─────────────────

interface AdminListQuery {
  page?: number;
  per_page?: number;
  type?: string;
  status?: string;
  search?: string;
  sort?: string;
}

export async function getAdminSettings() {
  return getGlobalAdminSettings();
}

export async function updateAdminSettings(
  input: {
    usd_to_rub_rate: number;
    topup_message: string;
    topup_telegram: string;
    topup_email: string;
    topup_phone: string;
    legal_business_name: string;
    legal_business_status: string;
    legal_inn: string;
    legal_ogrn: string;
    legal_address: string;
    legal_support_email: string;
    legal_support_phone: string;
    legal_support_telegram: string;
    starter_prompts_openrouter_coding_agent: string[];
    starter_prompts_openrouter_coding_agent_fast: string[];
    starter_prompts_openrouter_coding_agent_heavy_planning: string[];
    starter_prompts_openrouter_coding_agent_coding_alternative: string[];
    starter_prompts_dtf_news_agent: string[];
    signup_bonus_requires_email_verification: boolean;
    signup_bonus_amount_usd: number;
    openrouter_requests_enabled: boolean;
    openrouter_disabled_message: string;
  },
  adminUserId: string,
) {
  const [usdToRubRate, topUp, legal, starterPrompts, signupBonus, openRouterRequests] = await Promise.all([
    setUsdToRubRate(input.usd_to_rub_rate, adminUserId),
    updateTopUpSettings(input, adminUserId),
    updateLegalSettings(input, adminUserId),
    updateStarterPromptSettings({
      openrouter_coding_agent: input.starter_prompts_openrouter_coding_agent,
      openrouter_coding_agent_fast: input.starter_prompts_openrouter_coding_agent_fast,
      openrouter_coding_agent_heavy_planning: input.starter_prompts_openrouter_coding_agent_heavy_planning,
      openrouter_coding_agent_coding_alternative: input.starter_prompts_openrouter_coding_agent_coding_alternative,
      dtf_news_agent: input.starter_prompts_dtf_news_agent,
    }, adminUserId),
    updateSignupBonusSettings({
      signup_bonus_requires_email_verification: input.signup_bonus_requires_email_verification,
      signup_bonus_amount_usd: input.signup_bonus_amount_usd,
    }, adminUserId),
    updateOpenRouterRequestsSettings({
      openrouter_requests_enabled: input.openrouter_requests_enabled,
      openrouter_disabled_message: input.openrouter_disabled_message,
    }, adminUserId),
  ]);

  return {
    usd_to_rub_rate: usdToRubRate,
    topup_message: topUp.message,
    topup_telegram: topUp.telegram,
    topup_email: topUp.email,
    topup_phone: topUp.phone,
    legal_business_name: legal.business_name,
    legal_business_status: legal.business_status,
    legal_inn: legal.inn,
    legal_ogrn: legal.ogrn,
    legal_address: legal.address,
    legal_support_email: legal.support_email,
    legal_support_phone: legal.support_phone,
    legal_support_telegram: legal.support_telegram,
    starter_prompts_openrouter_coding_agent: starterPrompts.openrouter_coding_agent,
    starter_prompts_openrouter_coding_agent_fast: starterPrompts.openrouter_coding_agent_fast,
    starter_prompts_openrouter_coding_agent_heavy_planning: starterPrompts.openrouter_coding_agent_heavy_planning,
    starter_prompts_openrouter_coding_agent_coding_alternative: starterPrompts.openrouter_coding_agent_coding_alternative,
    starter_prompts_dtf_news_agent: starterPrompts.dtf_news_agent,
    signup_bonus_requires_email_verification: signupBonus.requires_email_verification,
    signup_bonus_amount_usd: signupBonus.amount_usd,
    openrouter_requests_enabled: openRouterRequests.enabled,
    openrouter_disabled_message: openRouterRequests.message,
  };
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
      primary_cta_label: meta.primary_cta_label,
      primary_cta_url: meta.primary_cta_url,
      secondary_cta_label: meta.secondary_cta_label,
      secondary_cta_url: meta.secondary_cta_url,
      reading_time_minutes: meta.reading_time_minutes,
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
  sort_by?: 'spent_usd' | 'spent_tokens' | 'agents_count' | 'chats_count' | 'balance_usd' | 'last_activity_at' | 'last_login_at' | 'created_at' | 'role';
  sort_order?: 'asc' | 'desc';
}

export async function listUsers(query: AdminUsersQuery) {
  const page = query.page ?? 1;
  const perPage = query.per_page ?? 20;
  const offset = (page - 1) * perPage;
  const sortBy = query.sort_by ?? 'created_at';
  const sortOrder = query.sort_order === 'asc' ? 'asc' : 'desc';

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
  const chatCounts = db
    .select({
      user_id: chatConversations.user_id,
      chats_count: sql<number>`count(*)::int`.as('chats_count'),
    })
    .from(chatConversations)
    .groupBy(chatConversations.user_id)
    .as('chat_counts');

  const agentCounts = db
    .select({
      user_id: agents.owner_user_id,
      agents_count: sql<number>`count(*)::int`.as('agents_count'),
    })
    .from(agents)
    .groupBy(agents.owner_user_id)
    .as('agent_counts');

  const spendByUser = db
    .select({
      user_id: agentRuns.user_id,
      spent_tokens: sql<number>`coalesce(sum(coalesce(${usageLedger.total_tokens}, ${usageLedger.prompt_tokens} + ${usageLedger.completion_tokens})), 0)::int`.as('spent_tokens'),
      spent_usd: sql<string>`coalesce(sum(${usageLedger.estimated_cost}::numeric), 0)`.as('spent_usd'),
    })
    .from(agentRuns)
    .leftJoin(usageLedger, eq(usageLedger.run_id, agentRuns.id))
    .groupBy(agentRuns.user_id)
    .as('spend_by_user');

  const chatsCountOrderExpr = sql<number>`coalesce(${chatCounts.chats_count}, 0)`;
  const agentsCountOrderExpr = sql<number>`coalesce(${agentCounts.agents_count}, 0)`;
  const spentTokensOrderExpr = sql<number>`coalesce(${spendByUser.spent_tokens}, 0)`;
  const spentUsdOrderExpr = sql<number>`coalesce(${spendByUser.spent_usd}, 0::numeric)`;
  const roleOrderExpr = sql<number>`
    case
      when ${users.role} = 'admin' then 0
      when ${users.role} = 'curator' then 1
      when ${users.role} = 'power_user' then 2
      else 3
    end
  `;

  const primaryOrderExpr = (() => {
    switch (sortBy) {
      case 'spent_usd':
        return spentUsdOrderExpr;
      case 'spent_tokens':
        return spentTokensOrderExpr;
      case 'agents_count':
        return agentsCountOrderExpr;
      case 'chats_count':
        return chatsCountOrderExpr;
      case 'balance_usd':
        return users.balance_usd;
      case 'role':
        return roleOrderExpr;
      case 'last_activity_at':
        return users.last_activity_at;
      case 'last_login_at':
        return users.last_login_at;
      case 'created_at':
      default:
        return users.created_at;
    }
  })();

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
        last_activity_at: users.last_activity_at,
        last_login_at: users.last_login_at,
        updated_at: users.updated_at,
        chats_count: sql<number>`coalesce(${chatCounts.chats_count}, 0)::int`,
        agents_count: sql<number>`coalesce(${agentCounts.agents_count}, 0)::int`,
        spent_tokens: sql<number>`coalesce(${spendByUser.spent_tokens}, 0)::int`,
        spent_usd: sql<string>`coalesce(${spendByUser.spent_usd}, 0)`,
      })
      .from(users)
      .leftJoin(chatCounts, eq(chatCounts.user_id, users.id))
      .leftJoin(agentCounts, eq(agentCounts.user_id, users.id))
      .leftJoin(spendByUser, eq(spendByUser.user_id, users.id))
      .where(where)
      .orderBy(
        sortOrder === 'asc' ? asc(primaryOrderExpr) : desc(primaryOrderExpr),
        desc(users.created_at),
        desc(users.id),
      )
      .limit(perPage)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(where),
  ]);

  const total = countResult[0]?.count ?? 0;

  return {
    users: rows.map((r) => ({
      ...r,
      balance_usd: Number(r.balance_usd ?? 0),
      chats_count: r.chats_count ?? 0,
      agents_count: r.agents_count ?? 0,
      spent_tokens: r.spent_tokens ?? 0,
      spent_usd: Number(r.spent_usd ?? 0),
      created_at: r.created_at.toISOString(),
      last_activity_at: r.last_activity_at?.toISOString() ?? null,
      last_login_at: r.last_login_at?.toISOString() ?? null,
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
      last_activity_at: users.last_activity_at,
      last_login_at: users.last_login_at,
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
    last_activity_at: user.last_activity_at?.toISOString() ?? null,
    last_login_at: user.last_login_at?.toISOString() ?? null,
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

export async function impersonateUser(adminUserId: string, targetUserId: string) {
  if (adminUserId === targetUserId) {
    throw new AppError(400, 'BAD_REQUEST', 'Нельзя авторизоваться под самим собой');
  }

  const [targetUser] = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      status: users.status,
    })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);

  if (!targetUser) {
    throw new NotFoundError('Пользователь не найден');
  }

  if (targetUser.status !== 'active') {
    throw new AppError(400, 'BAD_REQUEST', 'Нельзя авторизоваться под неактивным пользователем');
  }

  logger.info({
    adminUserId,
    targetUserId: targetUser.id,
    targetUserEmail: targetUser.email,
    targetUserRole: targetUser.role,
  }, 'Admin impersonated user');

  return {
    id: targetUser.id,
    role: targetUser.role,
    status: targetUser.status,
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

interface AdminRuntimesQuery {
  search?: string;
  status?: string;
}

interface AdminDebugChatsQuery {
  query?: string;
  limit?: number;
}

interface AdminAliceLogsQuery {
  page?: number;
  per_page?: number;
  search?: string;
  status?: 'all' | 'success' | 'error';
}

interface AdminDebugChatLocator {
  raw: string;
  conversationId: string | null;
  shareToken: string | null;
  searchText: string | null;
}

export async function resetUserPassword(adminUserId: string, id: string, password: string) {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      username: users.username,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!user) throw new NotFoundError('Пользователь не найден');

  const password_hash = await argon2.hash(password);

  await db.update(users).set({ password_hash }).where(eq(users.id, id));

  logger.info({
    adminUserId,
    targetUserId: user.id,
    targetUserEmail: user.email,
  }, 'Admin reset user password');

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    password_updated: true,
  };
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

interface AdminDashboardChartsQuery {
  date_from?: string;
  date_to?: string;
}

interface AdminDashboardChartsDailyDbRow extends Record<string, unknown> {
  day: string | Date;
  registrations: string | number;
  cumulative_users: string | number;
  active_users: string | number;
  dau: string | number;
  wau: string | number;
  mau: string | number;
  payers_count: string | number;
  chats_created: string | number;
  chat_messages: string | number;
  assistant_messages: string | number;
  user_messages: string | number;
  agent_runs: string | number;
  successful_runs: string | number;
  prompt_tokens: string | number;
  completion_tokens: string | number;
  total_tokens: string | number;
  usage_cost_usd: string | number;
  topups_usd: string | number;
  paid_topups_usd: string | number;
  bonus_credits_usd: string | number;
  balance_spend_usd: string | number;
  manual_debits_usd: string | number;
}

interface AdminDashboardChartsModelDbRow extends Record<string, unknown> {
  model: string;
  model_rank: string | number;
  total_usage_cost_usd: string | number;
  total_tokens: string | number;
  day: string | Date;
  usage_cost_usd: string | number;
  total_tokens_day: string | number;
}

function parseUtcDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addUtcDays(value: Date, days: number): Date {
  const next = new Date(value.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatUtcDateOnly(value: string | Date): string {
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    return new Date(value).toISOString().slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}

function toSafeNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMetric(value: number, digits = 6): number {
  return Number(value.toFixed(digits));
}

function normalizeAdminDebugLocator(value?: string | null): AdminDebugChatLocator {
  const raw = value?.trim() ?? '';
  if (!raw) {
    return {
      raw: '',
      conversationId: null,
      shareToken: null,
      searchText: null,
    };
  }

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const directUuid = uuidPattern.test(raw) ? raw : null;

  let conversationId: string | null = directUuid;
  let shareToken: string | null = null;

  try {
    const parsedUrl = new URL(raw);
    const chatParam = parsedUrl.searchParams.get('chat') || parsedUrl.searchParams.get('admin_chat_id');
    if (chatParam && uuidPattern.test(chatParam)) {
      conversationId = chatParam;
    }

    const pathMatch = parsedUrl.pathname.match(/^\/(?:shared\/)?chats?\/([^/?#]+)/i);
    if (pathMatch?.[1]) {
      shareToken = pathMatch[1];
    }
  } catch {
    const chatQueryMatch = raw.match(/[?&](?:chat|admin_chat_id)=([0-9a-f-]{36})/i);
    if (chatQueryMatch?.[1] && uuidPattern.test(chatQueryMatch[1])) {
      conversationId = chatQueryMatch[1];
    }

    const pathMatch = raw.match(/\/(?:shared\/)?chats?\/([^/?#]+)/i);
    if (pathMatch?.[1]) {
      shareToken = pathMatch[1];
    }
  }

  if (!shareToken && !conversationId && /^[A-Za-z0-9_-]{8,128}$/.test(raw)) {
    shareToken = raw;
  }

  return {
    raw,
    conversationId,
    shareToken,
    searchText: raw,
  };
}

function normalizeDashboardChartsRange(query: AdminDashboardChartsQuery) {
  const today = startOfUtcDay(new Date());
  const endDate = query.date_to ? parseUtcDateOnly(query.date_to) : today;
  const startDate = query.date_from ? parseUtcDateOnly(query.date_from) : addUtcDays(endDate, -29);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new AppError(400, 'BAD_REQUEST', 'Некорректный диапазон дат');
  }

  if (startDate.getTime() > endDate.getTime()) {
    throw new AppError(400, 'BAD_REQUEST', 'Дата начала не может быть позже даты окончания');
  }

  const diffDays = Math.floor((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  if (diffDays > 366) {
    throw new AppError(400, 'BAD_REQUEST', 'Максимальный диапазон графиков - 366 дней');
  }

  return {
    startDate,
    endDate,
    startDateIso: formatUtcDateOnly(startDate),
    endDateIso: formatUtcDateOnly(endDate),
    days: diffDays,
  };
}

export async function getDashboardCharts(query: AdminDashboardChartsQuery) {
  const range = normalizeDashboardChartsRange(query);

  const dailyRows = await db.execute<AdminDashboardChartsDailyDbRow>(sql`
    WITH params AS (
      SELECT
        ${range.startDateIso}::date AS start_day,
        ${range.endDateIso}::date AS end_day,
        (${range.startDateIso}::date - interval '29 day')::date AS activity_start_day
    ),
    series AS (
      SELECT gs::date AS day
      FROM params, generate_series(params.start_day, params.end_day, interval '1 day') AS gs
    ),
    usage_events AS (
      SELECT
        timezone('UTC', ccm.created_at)::date AS day,
        cc.user_id,
        COALESCE(ccm.usage_json->>'model', ul.model_external_id, cc.model_external_id, 'unknown') AS model,
        COALESCE(NULLIF(ccm.usage_json->>'prompt_tokens', '')::numeric, ul.prompt_tokens, 0) AS prompt_tokens,
        COALESCE(NULLIF(ccm.usage_json->>'completion_tokens', '')::numeric, ul.completion_tokens, 0) AS completion_tokens,
        COALESCE(
          NULLIF(ccm.usage_json->>'total_tokens', '')::numeric,
          COALESCE(ul.total_tokens, ul.prompt_tokens + ul.completion_tokens, 0),
          0
        ) AS total_tokens,
        COALESCE(NULLIF(ccm.usage_json->>'estimated_cost', '')::numeric, ul.estimated_cost, 0) AS usage_cost_usd
      FROM chat_conversation_messages ccm
      INNER JOIN chat_conversations cc ON cc.id = ccm.conversation_id
      LEFT JOIN usage_ledger ul ON ul.run_id = ccm.run_id
      INNER JOIN params ON true
      WHERE ccm.role = 'assistant'
        AND (ccm.usage_json IS NOT NULL OR ccm.run_id IS NOT NULL)
        AND timezone('UTC', ccm.created_at)::date BETWEEN params.start_day AND params.end_day

      UNION ALL

      SELECT
        timezone('UTC', ul.created_at)::date AS day,
        ar.user_id,
        COALESCE(ul.model_external_id, 'unknown') AS model,
        COALESCE(ul.prompt_tokens, 0)::numeric AS prompt_tokens,
        COALESCE(ul.completion_tokens, 0)::numeric AS completion_tokens,
        COALESCE(ul.total_tokens, ul.prompt_tokens + ul.completion_tokens, 0)::numeric AS total_tokens,
        COALESCE(ul.estimated_cost, 0)::numeric AS usage_cost_usd
      FROM usage_ledger ul
      INNER JOIN agent_runs ar ON ar.id = ul.run_id
      INNER JOIN params ON true
      WHERE timezone('UTC', ul.created_at)::date BETWEEN params.start_day AND params.end_day
        AND NOT EXISTS (
          SELECT 1
          FROM chat_conversation_messages ccm
          WHERE ccm.run_id = ar.id
        )
    ),
    daily_usage AS (
      SELECT
        ue.day,
        COALESCE(SUM(ue.prompt_tokens), 0) AS prompt_tokens,
        COALESCE(SUM(ue.completion_tokens), 0) AS completion_tokens,
        COALESCE(SUM(ue.total_tokens), 0) AS total_tokens,
        COALESCE(SUM(ue.usage_cost_usd), 0) AS usage_cost_usd
      FROM usage_events ue
      GROUP BY ue.day
    ),
    tx_daily AS (
      SELECT
        timezone('UTC', bt.created_at)::date AS day,
        COALESCE(SUM(CASE WHEN bt.amount::numeric > 0 THEN bt.amount::numeric ELSE 0 END), 0) AS topups_usd,
        COALESCE(SUM(CASE WHEN bt.type = 'topup' AND bt.amount::numeric > 0 THEN bt.amount::numeric ELSE 0 END), 0) AS paid_topups_usd,
        COALESCE(SUM(CASE WHEN bt.amount::numeric > 0 AND bt.type <> 'topup' THEN bt.amount::numeric ELSE 0 END), 0) AS bonus_credits_usd,
        COALESCE(SUM(CASE WHEN bt.type IN ('chat_usage', 'agent_run_usage') AND bt.amount::numeric < 0 THEN ABS(bt.amount::numeric) ELSE 0 END), 0) AS balance_spend_usd,
        COALESCE(SUM(CASE WHEN bt.amount::numeric < 0 AND bt.type NOT IN ('chat_usage', 'agent_run_usage') THEN ABS(bt.amount::numeric) ELSE 0 END), 0) AS manual_debits_usd,
        COUNT(DISTINCT CASE WHEN bt.amount::numeric > 0 THEN bt.user_id END)::int AS payers_count
      FROM balance_transactions bt
      INNER JOIN params ON true
      WHERE timezone('UTC', bt.created_at)::date BETWEEN params.start_day AND params.end_day
      GROUP BY timezone('UTC', bt.created_at)::date
    ),
    registrations AS (
      SELECT
        timezone('UTC', u.created_at)::date AS day,
        COUNT(*)::int AS registrations
      FROM users u
      INNER JOIN params ON true
      WHERE timezone('UTC', u.created_at)::date BETWEEN params.start_day AND params.end_day
      GROUP BY timezone('UTC', u.created_at)::date
    ),
    base_users AS (
      SELECT COUNT(*)::int AS total_users_before_range
      FROM users u
      INNER JOIN params ON true
      WHERE timezone('UTC', u.created_at)::date < params.start_day
    ),
    chat_daily AS (
      SELECT
        timezone('UTC', cc.created_at)::date AS day,
        COUNT(*)::int AS chats_created
      FROM chat_conversations cc
      INNER JOIN params ON true
      WHERE timezone('UTC', cc.created_at)::date BETWEEN params.start_day AND params.end_day
      GROUP BY timezone('UTC', cc.created_at)::date
    ),
    message_daily AS (
      SELECT
        timezone('UTC', ccm.created_at)::date AS day,
        COUNT(*)::int AS chat_messages,
        COUNT(*) FILTER (WHERE ccm.role = 'assistant')::int AS assistant_messages,
        COUNT(*) FILTER (WHERE ccm.role = 'user')::int AS user_messages
      FROM chat_conversation_messages ccm
      INNER JOIN params ON true
      WHERE timezone('UTC', ccm.created_at)::date BETWEEN params.start_day AND params.end_day
      GROUP BY timezone('UTC', ccm.created_at)::date
    ),
    runs_daily AS (
      SELECT
        timezone('UTC', ar.started_at)::date AS day,
        COUNT(*)::int AS agent_runs,
        COUNT(*) FILTER (WHERE ar.status = 'completed')::int AS successful_runs
      FROM agent_runs ar
      INNER JOIN params ON true
      WHERE timezone('UTC', ar.started_at)::date BETWEEN params.start_day AND params.end_day
      GROUP BY timezone('UTC', ar.started_at)::date
    ),
    activity_events AS (
      SELECT uda.day, uda.user_id
      FROM user_daily_activity uda
      INNER JOIN params ON true
      WHERE uda.day BETWEEN params.activity_start_day AND params.end_day

      UNION

      SELECT DISTINCT timezone('UTC', cc.created_at)::date AS day, cc.user_id
      FROM chat_conversations cc
      INNER JOIN params ON true
      WHERE timezone('UTC', cc.created_at)::date BETWEEN params.activity_start_day AND params.end_day

      UNION

      SELECT DISTINCT timezone('UTC', ccm.created_at)::date AS day, cc.user_id
      FROM chat_conversation_messages ccm
      INNER JOIN chat_conversations cc ON cc.id = ccm.conversation_id
      INNER JOIN params ON true
      WHERE timezone('UTC', ccm.created_at)::date BETWEEN params.activity_start_day AND params.end_day

      UNION

      SELECT DISTINCT timezone('UTC', ar.started_at)::date AS day, ar.user_id
      FROM agent_runs ar
      INNER JOIN params ON true
      WHERE timezone('UTC', ar.started_at)::date BETWEEN params.activity_start_day AND params.end_day

      UNION

      SELECT DISTINCT timezone('UTC', bt.created_at)::date AS day, bt.user_id
      FROM balance_transactions bt
      INNER JOIN params ON true
      WHERE timezone('UTC', bt.created_at)::date BETWEEN params.activity_start_day AND params.end_day
    ),
    daily_activity AS (
      SELECT ae.day, COUNT(DISTINCT ae.user_id)::int AS active_users
      FROM activity_events ae
      GROUP BY ae.day
    )
    SELECT
      s.day,
      COALESCE(r.registrations, 0)::int AS registrations,
      (
        COALESCE((SELECT total_users_before_range FROM base_users), 0)
        + SUM(COALESCE(r.registrations, 0)) OVER (ORDER BY s.day ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
      )::int AS cumulative_users,
      COALESCE(da.active_users, 0)::int AS active_users,
      COALESCE(da.active_users, 0)::int AS dau,
      COALESCE((
        SELECT COUNT(DISTINCT ae.user_id)::int
        FROM activity_events ae
        WHERE ae.day BETWEEN (s.day - interval '6 day')::date AND s.day
      ), 0)::int AS wau,
      COALESCE((
        SELECT COUNT(DISTINCT ae.user_id)::int
        FROM activity_events ae
        WHERE ae.day BETWEEN (s.day - interval '29 day')::date AND s.day
      ), 0)::int AS mau,
      COALESCE(tx.payers_count, 0)::int AS payers_count,
      COALESCE(cd.chats_created, 0)::int AS chats_created,
      COALESCE(md.chat_messages, 0)::int AS chat_messages,
      COALESCE(md.assistant_messages, 0)::int AS assistant_messages,
      COALESCE(md.user_messages, 0)::int AS user_messages,
      COALESCE(rd.agent_runs, 0)::int AS agent_runs,
      COALESCE(rd.successful_runs, 0)::int AS successful_runs,
      COALESCE(du.prompt_tokens, 0) AS prompt_tokens,
      COALESCE(du.completion_tokens, 0) AS completion_tokens,
      COALESCE(du.total_tokens, 0) AS total_tokens,
      COALESCE(du.usage_cost_usd, 0) AS usage_cost_usd,
      COALESCE(tx.topups_usd, 0) AS topups_usd,
      COALESCE(tx.paid_topups_usd, 0) AS paid_topups_usd,
      COALESCE(tx.bonus_credits_usd, 0) AS bonus_credits_usd,
      COALESCE(tx.balance_spend_usd, 0) AS balance_spend_usd,
      COALESCE(tx.manual_debits_usd, 0) AS manual_debits_usd
    FROM series s
    LEFT JOIN registrations r ON r.day = s.day
    LEFT JOIN chat_daily cd ON cd.day = s.day
    LEFT JOIN message_daily md ON md.day = s.day
    LEFT JOIN runs_daily rd ON rd.day = s.day
    LEFT JOIN daily_usage du ON du.day = s.day
    LEFT JOIN tx_daily tx ON tx.day = s.day
    LEFT JOIN daily_activity da ON da.day = s.day
    ORDER BY s.day
  `);

  const modelRows = await db.execute<AdminDashboardChartsModelDbRow>(sql`
    WITH params AS (
      SELECT
        ${range.startDateIso}::date AS start_day,
        ${range.endDateIso}::date AS end_day
    ),
    series AS (
      SELECT gs::date AS day
      FROM params, generate_series(params.start_day, params.end_day, interval '1 day') AS gs
    ),
    usage_events AS (
      SELECT
        timezone('UTC', ccm.created_at)::date AS day,
        COALESCE(ccm.usage_json->>'model', ul.model_external_id, cc.model_external_id, 'unknown') AS model,
        COALESCE(
          NULLIF(ccm.usage_json->>'total_tokens', '')::numeric,
          COALESCE(ul.total_tokens, ul.prompt_tokens + ul.completion_tokens, 0),
          0
        ) AS total_tokens,
        COALESCE(NULLIF(ccm.usage_json->>'estimated_cost', '')::numeric, ul.estimated_cost, 0) AS usage_cost_usd
      FROM chat_conversation_messages ccm
      INNER JOIN chat_conversations cc ON cc.id = ccm.conversation_id
      LEFT JOIN usage_ledger ul ON ul.run_id = ccm.run_id
      INNER JOIN params ON true
      WHERE ccm.role = 'assistant'
        AND (ccm.usage_json IS NOT NULL OR ccm.run_id IS NOT NULL)
        AND timezone('UTC', ccm.created_at)::date BETWEEN params.start_day AND params.end_day

      UNION ALL

      SELECT
        timezone('UTC', ul.created_at)::date AS day,
        COALESCE(ul.model_external_id, 'unknown') AS model,
        COALESCE(ul.total_tokens, ul.prompt_tokens + ul.completion_tokens, 0)::numeric AS total_tokens,
        COALESCE(ul.estimated_cost, 0)::numeric AS usage_cost_usd
      FROM usage_ledger ul
      INNER JOIN agent_runs ar ON ar.id = ul.run_id
      INNER JOIN params ON true
      WHERE timezone('UTC', ul.created_at)::date BETWEEN params.start_day AND params.end_day
        AND NOT EXISTS (
          SELECT 1
          FROM chat_conversation_messages ccm
          WHERE ccm.run_id = ar.id
        )
    ),
    model_totals AS (
      SELECT
        ue.model,
        COALESCE(SUM(ue.usage_cost_usd), 0) AS total_usage_cost_usd,
        COALESCE(SUM(ue.total_tokens), 0) AS total_tokens
      FROM usage_events ue
      GROUP BY ue.model
    ),
    top_models AS (
      SELECT
        mt.model,
        mt.total_usage_cost_usd,
        mt.total_tokens,
        ROW_NUMBER() OVER (
          ORDER BY mt.total_usage_cost_usd DESC, mt.total_tokens DESC, mt.model ASC
        )::int AS model_rank
      FROM model_totals mt
      WHERE mt.total_usage_cost_usd > 0 OR mt.total_tokens > 0
      ORDER BY mt.total_usage_cost_usd DESC, mt.total_tokens DESC, mt.model ASC
      LIMIT 8
    )
    SELECT
      tm.model,
      tm.model_rank,
      tm.total_usage_cost_usd,
      tm.total_tokens,
      s.day,
      COALESCE(SUM(ue.usage_cost_usd), 0) AS usage_cost_usd,
      COALESCE(SUM(ue.total_tokens), 0) AS total_tokens_day
    FROM top_models tm
    CROSS JOIN series s
    LEFT JOIN usage_events ue ON ue.model = tm.model AND ue.day = s.day
    GROUP BY tm.model, tm.model_rank, tm.total_usage_cost_usd, tm.total_tokens, s.day
    ORDER BY tm.model_rank ASC, s.day ASC
  `);

  const daily = dailyRows.map((row) => {
    const registrations = toSafeNumber(row.registrations);
    const cumulativeUsers = toSafeNumber(row.cumulative_users);
    const activeUsers = toSafeNumber(row.active_users);
    const dau = toSafeNumber(row.dau);
    const wau = toSafeNumber(row.wau);
    const mau = toSafeNumber(row.mau);
    const payersCount = toSafeNumber(row.payers_count);
    const chatsCreated = toSafeNumber(row.chats_created);
    const chatMessages = toSafeNumber(row.chat_messages);
    const assistantMessages = toSafeNumber(row.assistant_messages);
    const userMessages = toSafeNumber(row.user_messages);
    const agentRuns = toSafeNumber(row.agent_runs);
    const successfulRuns = toSafeNumber(row.successful_runs);
    const promptTokens = toSafeNumber(row.prompt_tokens);
    const completionTokens = toSafeNumber(row.completion_tokens);
    const totalTokens = toSafeNumber(row.total_tokens);
    const usageCostUsd = toSafeNumber(row.usage_cost_usd);
    const topupsUsd = toSafeNumber(row.topups_usd);
    const paidTopupsUsd = toSafeNumber(row.paid_topups_usd);
    const bonusCreditsUsd = toSafeNumber(row.bonus_credits_usd);
    const balanceSpendUsd = toSafeNumber(row.balance_spend_usd);
    const manualDebitsUsd = toSafeNumber(row.manual_debits_usd);
    const marginUsd = roundMetric(balanceSpendUsd - usageCostUsd, 6);
    const cashflowUsd = roundMetric(topupsUsd - balanceSpendUsd, 6);
    const roiPercent = usageCostUsd > 0
      ? roundMetric((balanceSpendUsd / usageCostUsd) * 100, 2)
      : null;
    const arpuUsd = activeUsers > 0
      ? roundMetric(balanceSpendUsd / activeUsers, 6)
      : 0;
    const arppuUsd = payersCount > 0
      ? roundMetric(topupsUsd / payersCount, 6)
      : 0;
    const payerSharePercent = activeUsers > 0
      ? roundMetric((payersCount / activeUsers) * 100, 2)
      : 0;
    const successRatePercent = agentRuns > 0
      ? roundMetric((successfulRuns / agentRuns) * 100, 2)
      : null;

    return {
      date: formatUtcDateOnly(row.day),
      registrations,
      cumulative_users: cumulativeUsers,
      active_users: activeUsers,
      dau,
      wau,
      mau,
      payers_count: payersCount,
      chats_created: chatsCreated,
      chat_messages: chatMessages,
      assistant_messages: assistantMessages,
      user_messages: userMessages,
      agent_runs: agentRuns,
      successful_runs: successfulRuns,
      success_rate_percent: successRatePercent,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      usage_cost_usd: roundMetric(usageCostUsd, 6),
      topups_usd: roundMetric(topupsUsd, 6),
      paid_topups_usd: roundMetric(paidTopupsUsd, 6),
      bonus_credits_usd: roundMetric(bonusCreditsUsd, 6),
      balance_spend_usd: roundMetric(balanceSpendUsd, 6),
      manual_debits_usd: roundMetric(manualDebitsUsd, 6),
      margin_usd: marginUsd,
      cashflow_usd: cashflowUsd,
      roi_percent: roiPercent,
      arpu_usd: arpuUsd,
      arppu_usd: arppuUsd,
      payer_share_percent: payerSharePercent,
    };
  });

  const modelSeriesMap = new Map<string, {
    model: string;
    rank: number;
    total_usage_cost_usd: number;
    total_tokens: number;
    daily: Array<{ date: string; usage_cost_usd: number; total_tokens: number }>;
  }>();

  for (const row of modelRows) {
    const key = row.model;
    const existing = modelSeriesMap.get(key) ?? {
      model: row.model,
      rank: toSafeNumber(row.model_rank),
      total_usage_cost_usd: roundMetric(toSafeNumber(row.total_usage_cost_usd), 6),
      total_tokens: toSafeNumber(row.total_tokens),
      daily: [],
    };

    existing.daily.push({
      date: formatUtcDateOnly(row.day),
      usage_cost_usd: roundMetric(toSafeNumber(row.usage_cost_usd), 6),
      total_tokens: toSafeNumber(row.total_tokens_day),
    });

    modelSeriesMap.set(key, existing);
  }

  const totals = daily.reduce((acc, point) => {
    acc.registrations += point.registrations;
    acc.topups_usd += point.topups_usd;
    acc.paid_topups_usd += point.paid_topups_usd;
    acc.bonus_credits_usd += point.bonus_credits_usd;
    acc.balance_spend_usd += point.balance_spend_usd;
    acc.manual_debits_usd += point.manual_debits_usd;
    acc.usage_cost_usd += point.usage_cost_usd;
    acc.margin_usd += point.margin_usd;
    acc.cashflow_usd += point.cashflow_usd;
    acc.total_tokens += point.total_tokens;
    acc.prompt_tokens += point.prompt_tokens;
    acc.completion_tokens += point.completion_tokens;
    acc.chats_created += point.chats_created;
    acc.chat_messages += point.chat_messages;
    acc.assistant_messages += point.assistant_messages;
    acc.user_messages += point.user_messages;
    acc.agent_runs += point.agent_runs;
    acc.successful_runs += point.successful_runs;
    acc.payers_count += point.payers_count;
    acc.avg_dau += point.dau;
    acc.avg_wau += point.wau;
    acc.avg_mau += point.mau;
    acc.peak_dau = Math.max(acc.peak_dau, point.dau);
    acc.peak_wau = Math.max(acc.peak_wau, point.wau);
    acc.peak_mau = Math.max(acc.peak_mau, point.mau);
    return acc;
  }, {
    registrations: 0,
    topups_usd: 0,
    paid_topups_usd: 0,
    bonus_credits_usd: 0,
    balance_spend_usd: 0,
    manual_debits_usd: 0,
    usage_cost_usd: 0,
    margin_usd: 0,
    cashflow_usd: 0,
    total_tokens: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    chats_created: 0,
    chat_messages: 0,
    assistant_messages: 0,
    user_messages: 0,
    agent_runs: 0,
    successful_runs: 0,
    payers_count: 0,
    avg_dau: 0,
    avg_wau: 0,
    avg_mau: 0,
    peak_dau: 0,
    peak_wau: 0,
    peak_mau: 0,
  });

  const pointsCount = daily.length || 1;
  const totalUsersEnd = daily.length > 0 ? daily[daily.length - 1].cumulative_users : 0;

  return {
    range: {
      date_from: range.startDateIso,
      date_to: range.endDateIso,
      days: range.days,
    },
    totals: {
      registrations: totals.registrations,
      total_users_end: totalUsersEnd,
      total_tokens: totals.total_tokens,
      prompt_tokens: totals.prompt_tokens,
      completion_tokens: totals.completion_tokens,
      topups_usd: roundMetric(totals.topups_usd, 6),
      paid_topups_usd: roundMetric(totals.paid_topups_usd, 6),
      bonus_credits_usd: roundMetric(totals.bonus_credits_usd, 6),
      balance_spend_usd: roundMetric(totals.balance_spend_usd, 6),
      manual_debits_usd: roundMetric(totals.manual_debits_usd, 6),
      usage_cost_usd: roundMetric(totals.usage_cost_usd, 6),
      margin_usd: roundMetric(totals.margin_usd, 6),
      cashflow_usd: roundMetric(totals.cashflow_usd, 6),
      roi_percent: totals.usage_cost_usd > 0
        ? roundMetric((totals.balance_spend_usd / totals.usage_cost_usd) * 100, 2)
        : null,
      chats_created: totals.chats_created,
      chat_messages: totals.chat_messages,
      assistant_messages: totals.assistant_messages,
      user_messages: totals.user_messages,
      agent_runs: totals.agent_runs,
      successful_runs: totals.successful_runs,
      success_rate_percent: totals.agent_runs > 0
        ? roundMetric((totals.successful_runs / totals.agent_runs) * 100, 2)
        : null,
      payers_count: totals.payers_count,
      avg_dau: roundMetric(totals.avg_dau / pointsCount, 2),
      avg_wau: roundMetric(totals.avg_wau / pointsCount, 2),
      avg_mau: roundMetric(totals.avg_mau / pointsCount, 2),
      peak_dau: totals.peak_dau,
      peak_wau: totals.peak_wau,
      peak_mau: totals.peak_mau,
      arpu_usd: totalUsersEnd > 0
        ? roundMetric(totals.balance_spend_usd / totalUsersEnd, 6)
        : 0,
      range_days_with_activity: daily.filter((point) => point.dau > 0).length,
      active_days_share_percent: roundMetric((daily.filter((point) => point.dau > 0).length / pointsCount) * 100, 2),
    },
    daily,
    model_series: Array.from(modelSeriesMap.values()).sort((a, b) => a.rank - b.rank),
  };
}

function resolveOpenRouterErrorMessage(error: unknown): string {
  if (error instanceof AppError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Не удалось получить данные OpenRouter';
}

async function getOpenRouterDashboardStatus() {
  const fetchedAt = new Date().toISOString();

  try {
    const [keyResponse, creditsResponse] = await Promise.all([
      openRouterClient.getCurrentKey(),
      openRouterClient.getCreditsIfAvailable(),
    ]);

    const key = keyResponse.data;
    const credits = creditsResponse?.data ?? null;

    return {
      fetched_at: fetchedAt,
      available: true,
      error: null,
      key: {
        label: key.label,
        limit: key.limit,
        limit_remaining: key.limit_remaining,
        limit_reset: key.limit_reset,
        usage: key.usage,
        usage_daily: key.usage_daily,
        usage_weekly: key.usage_weekly,
        usage_monthly: key.usage_monthly,
        byok_usage: key.byok_usage,
        byok_usage_daily: key.byok_usage_daily,
        byok_usage_weekly: key.byok_usage_weekly,
        byok_usage_monthly: key.byok_usage_monthly,
        include_byok_in_limit: key.include_byok_in_limit,
        is_free_tier: key.is_free_tier,
        is_management_key: key.is_management_key ?? false,
        is_provisioning_key: key.is_provisioning_key ?? false,
        expires_at: key.expires_at ?? null,
      },
      credits: {
        is_available: Boolean(credits),
        error: credits ? null : 'Эндпоинт credits недоступен для текущего OpenRouter ключа',
        total_credits: credits ? Number(credits.total_credits ?? 0) : null,
        total_usage: credits ? Number(credits.total_usage ?? 0) : null,
        remaining_credits: credits
          ? Number((Number(credits.total_credits ?? 0) - Number(credits.total_usage ?? 0)).toFixed(4))
          : null,
      },
    };
  } catch (error) {
    const message = resolveOpenRouterErrorMessage(error);
    logger.warn({ err: error }, 'OpenRouter dashboard status unavailable');

    return {
      fetched_at: fetchedAt,
      available: false,
      error: message,
      key: null,
      credits: {
        is_available: false,
        error: message,
        total_credits: null,
        total_usage: null,
        remaining_credits: null,
      },
    };
  }
}

export async function listRuntimes(query: AdminRuntimesQuery): Promise<{ items: AdminProjectDeploymentRecord[]; total: number }> {
  return listProjectDeploymentsForAdmin(query);
}

export async function startRuntime(id: string): Promise<AdminProjectDeploymentRecord> {
  return startProjectDeploymentAsAdmin(id);
}

export async function stopRuntime(id: string): Promise<AdminProjectDeploymentRecord> {
  return stopProjectDeploymentAsAdmin(id);
}

export async function listAliceLogs(query: AdminAliceLogsQuery) {
  const page = query.page ?? 1;
  const perPage = query.per_page ?? 20;
  const offset = (page - 1) * perPage;

  const conditions: SQL[] = [];

  if (query.status && query.status !== 'all') {
    conditions.push(eq(aliceWebhookLogs.status, query.status));
  }

  if (query.search?.trim()) {
    const term = `%${query.search.trim()}%`;
    conditions.push(
      or(
        ilike(aliceWebhookLogs.command, term),
        ilike(aliceWebhookLogs.original_utterance, term),
        ilike(aliceWebhookLogs.response_text, term),
        ilike(aliceWebhookLogs.yandex_skill_user_id, term),
        ilike(aliceWebhookLogs.session_id, term),
        ilike(users.email, term),
        ilike(users.name, term),
        ilike(users.username, term),
      )!,
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countResult] = await Promise.all([
    db
      .select({
        id: aliceWebhookLogs.id,
        status: aliceWebhookLogs.status,
        response_status_code: aliceWebhookLogs.response_status_code,
        yandex_skill_user_id: aliceWebhookLogs.yandex_skill_user_id,
        yandex_application_id: aliceWebhookLogs.yandex_application_id,
        session_id: aliceWebhookLogs.session_id,
        request_id: aliceWebhookLogs.request_id,
        message_id: aliceWebhookLogs.message_id,
        request_type: aliceWebhookLogs.request_type,
        command: aliceWebhookLogs.command,
        original_utterance: aliceWebhookLogs.original_utterance,
        response_text: aliceWebhookLogs.response_text,
        error_code: aliceWebhookLogs.error_code,
        error_message: aliceWebhookLogs.error_message,
        is_new_user: aliceWebhookLogs.is_new_user,
        bonus_granted: aliceWebhookLogs.bonus_granted,
        ip_address: aliceWebhookLogs.ip_address,
        user_agent: aliceWebhookLogs.user_agent,
        duration_ms: aliceWebhookLogs.duration_ms,
        response_size_bytes: aliceWebhookLogs.response_size_bytes,
        request_json: aliceWebhookLogs.request_json,
        response_json: aliceWebhookLogs.response_json,
        created_at: aliceWebhookLogs.created_at,
        user_id: users.id,
        user_email: users.email,
        user_name: users.name,
        user_username: users.username,
        chat_id: chatConversations.id,
        chat_title: chatConversations.title,
        linked_skill_user_id: aliceSkillLinks.yandex_skill_user_id,
      })
      .from(aliceWebhookLogs)
      .leftJoin(users, eq(aliceWebhookLogs.user_id, users.id))
      .leftJoin(chatConversations, eq(aliceWebhookLogs.chat_id, chatConversations.id))
      .leftJoin(
        aliceSkillLinks,
        and(
          eq(aliceSkillLinks.user_id, aliceWebhookLogs.user_id),
          eq(aliceSkillLinks.yandex_skill_user_id, aliceWebhookLogs.yandex_skill_user_id),
        ),
      )
      .where(where)
      .orderBy(desc(aliceWebhookLogs.created_at))
      .limit(perPage)
      .offset(offset),
    db
      .select({ count: count() })
      .from(aliceWebhookLogs)
      .leftJoin(users, eq(aliceWebhookLogs.user_id, users.id))
      .where(where),
  ]);

  const total = countResult[0]?.count ?? 0;

  return {
    items: rows.map((row) => ({
      id: row.id,
      status: row.status,
      response_status_code: row.response_status_code,
      yandex_skill_user_id: row.yandex_skill_user_id,
      yandex_application_id: row.yandex_application_id,
      session_id: row.session_id,
      request_id: row.request_id,
      message_id: row.message_id,
      request_type: row.request_type,
      command: row.command,
      original_utterance: row.original_utterance,
      response_text: row.response_text,
      error_code: row.error_code,
      error_message: row.error_message,
      is_new_user: row.is_new_user,
      bonus_granted: row.bonus_granted,
      ip_address: row.ip_address,
      user_agent: row.user_agent,
      duration_ms: row.duration_ms,
      response_size_bytes: row.response_size_bytes,
      request_json: row.request_json,
      response_json: row.response_json,
      created_at: row.created_at.toISOString(),
      user: row.user_id ? {
        id: row.user_id,
        email: row.user_email,
        name: row.user_name,
        username: row.user_username,
      } : null,
      chat: row.chat_id ? {
        id: row.chat_id,
        title: row.chat_title,
      } : null,
      alice_link: row.linked_skill_user_id ? {
        skill_user_id: row.linked_skill_user_id,
      } : null,
    })),
    meta: {
      total,
      page,
      per_page: perPage,
      total_pages: Math.max(1, Math.ceil(total / perPage)),
    },
  };
}

export async function searchDebugChats(query: AdminDebugChatsQuery) {
  const locator = normalizeAdminDebugLocator(query.query);
  const limit = Math.min(Math.max(query.limit ?? 12, 1), 50);
  const conditions: SQL[] = [];

  if (locator.conversationId) {
    conditions.push(eq(chatConversations.id, locator.conversationId));
  }

  if (locator.shareToken) {
    conditions.push(eq(chatConversations.share_token, locator.shareToken));
  }

  if (locator.searchText) {
    const term = `%${locator.searchText}%`;
    conditions.push(or(
      ilike(chatConversations.title, term),
      ilike(users.email, term),
      ilike(sql`coalesce(${users.username}, '')`, term),
      ilike(sql`coalesce(${users.name}, '')`, term),
      ilike(sql`coalesce(${agents.name}, '')`, term),
    )!);
  }

  const where = conditions.length > 0 ? or(...conditions) : undefined;

  const rows = await db
    .select({
      id: chatConversations.id,
      title: chatConversations.title,
      mode: chatConversations.mode,
      access: chatConversations.access,
      share_token: chatConversations.share_token,
      model_external_id: chatConversations.model_external_id,
      created_at: chatConversations.created_at,
      updated_at: chatConversations.updated_at,
      last_message_at: chatConversations.last_message_at,
      total_view_count: chatConversations.total_view_count,
      unique_view_count: chatConversations.unique_view_count,
      owner_id: users.id,
      owner_name: users.name,
      owner_username: users.username,
      owner_email: users.email,
      agent_id: agents.id,
      agent_name: agents.name,
      message_count: sql<number>`(
        select count(*)::int
        from ${chatConversationMessages}
        where ${chatConversationMessages.conversation_id} = ${chatConversations.id}
      )`,
      assistant_message_count: sql<number>`(
        select count(*)::int
        from ${chatConversationMessages}
        where ${chatConversationMessages.conversation_id} = ${chatConversations.id}
          and ${chatConversationMessages.role} = 'assistant'
      )`,
      run_count: sql<number>`(
        select count(*)::int
        from ${agentRuns}
        where ${agentRuns.id} in (
          select ${chatConversationMessages.run_id}
          from ${chatConversationMessages}
          where ${chatConversationMessages.conversation_id} = ${chatConversations.id}
            and ${chatConversationMessages.run_id} is not null
        )
      )`,
    })
    .from(chatConversations)
    .innerJoin(users, eq(chatConversations.user_id, users.id))
    .leftJoin(agents, eq(chatConversations.agent_id, agents.id))
    .where(where)
    .orderBy(desc(chatConversations.updated_at))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    mode: row.mode,
    access: row.access,
    share_token: row.share_token,
    model_external_id: row.model_external_id,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    last_message_at: row.last_message_at.toISOString(),
    total_view_count: row.total_view_count,
    unique_view_count: row.unique_view_count,
    owner: {
      id: row.owner_id,
      name: row.owner_name,
      username: row.owner_username,
      email: row.owner_email,
    },
    agent: row.agent_id ? { id: row.agent_id, name: row.agent_name } : null,
    message_count: toSafeNumber(row.message_count),
    assistant_message_count: toSafeNumber(row.assistant_message_count),
    run_count: toSafeNumber(row.run_count),
  }));
}

export async function getDebugChatById(conversationId: string) {
  const [conversation] = await db
    .select({
      id: chatConversations.id,
      title: chatConversations.title,
      mode: chatConversations.mode,
      access: chatConversations.access,
      share_token: chatConversations.share_token,
      model_external_id: chatConversations.model_external_id,
      system_prompt: chatConversations.system_prompt,
      settings_json: chatConversations.settings_json,
      total_view_count: chatConversations.total_view_count,
      unique_view_count: chatConversations.unique_view_count,
      created_at: chatConversations.created_at,
      updated_at: chatConversations.updated_at,
      last_message_at: chatConversations.last_message_at,
      owner_id: users.id,
      owner_name: users.name,
      owner_username: users.username,
      owner_email: users.email,
      agent_id: agents.id,
      agent_name: agents.name,
      agent_slug: agents.slug,
      message_count: sql<number>`(
        select count(*)::int
        from ${chatConversationMessages}
        where ${chatConversationMessages.conversation_id} = ${chatConversations.id}
      )`,
      user_message_count: sql<number>`(
        select count(*)::int
        from ${chatConversationMessages}
        where ${chatConversationMessages.conversation_id} = ${chatConversations.id}
          and ${chatConversationMessages.role} = 'user'
      )`,
      assistant_message_count: sql<number>`(
        select count(*)::int
        from ${chatConversationMessages}
        where ${chatConversationMessages.conversation_id} = ${chatConversations.id}
          and ${chatConversationMessages.role} = 'assistant'
      )`,
    })
    .from(chatConversations)
    .innerJoin(users, eq(chatConversations.user_id, users.id))
    .leftJoin(agents, eq(chatConversations.agent_id, agents.id))
    .where(eq(chatConversations.id, conversationId))
    .limit(1);

  if (!conversation) {
    throw new NotFoundError('Чат не найден');
  }

  const messages = await db
    .select({
      id: chatConversationMessages.id,
      role: chatConversationMessages.role,
      content_text: chatConversationMessages.content_text,
      run_id: chatConversationMessages.run_id,
      usage_json: chatConversationMessages.usage_json,
      preview_view_count: chatConversationMessages.preview_view_count,
      project_run_count: chatConversationMessages.project_run_count,
      latency_ms: chatConversationMessages.latency_ms,
      created_at: chatConversationMessages.created_at,
    })
    .from(chatConversationMessages)
    .where(eq(chatConversationMessages.conversation_id, conversationId))
    .orderBy(asc(chatConversationMessages.created_at));

  const runIds = [...new Set(messages.map((message) => message.run_id).filter((value): value is string => Boolean(value)))];

  const [runs, runMessages, toolCalls] = await Promise.all([
    runIds.length > 0
      ? db
        .select({
          id: agentRuns.id,
          status: agentRuns.status,
          mode: agentRuns.mode,
          model_id: agentRuns.model_id,
          model_external_id: aiModels.external_model_id,
          provider_name: agentRuns.provider_name,
          external_generation_id: agentRuns.external_generation_id,
          external_response_id: agentRuns.external_response_id,
          session_key: agentRuns.session_key,
          trace_id: agentRuns.trace_id,
          started_at: agentRuns.started_at,
          completed_at: agentRuns.completed_at,
          latency_ms: agentRuns.latency_ms,
          error_message: agentRuns.error_message,
          input_summary: agentRuns.input_summary,
          output_summary: agentRuns.output_summary,
          final_output: agentRuns.final_output,
          final_output_json: agentRuns.final_output_json,
        })
        .from(agentRuns)
        .leftJoin(aiModels, eq(agentRuns.model_id, aiModels.id))
        .where(inArray(agentRuns.id, runIds))
        .orderBy(asc(agentRuns.started_at))
      : Promise.resolve([]),
    runIds.length > 0
      ? db
        .select({
          id: agentRunMessages.id,
          run_id: agentRunMessages.run_id,
          role: agentRunMessages.role,
          content_text: agentRunMessages.content_text,
          content_json: agentRunMessages.content_json,
          token_estimate: agentRunMessages.token_estimate,
          created_at: agentRunMessages.created_at,
        })
        .from(agentRunMessages)
        .where(inArray(agentRunMessages.run_id, runIds))
        .orderBy(asc(agentRunMessages.created_at))
      : Promise.resolve([]),
    runIds.length > 0
      ? db
        .select({
          id: agentRunToolCalls.id,
          run_id: agentRunToolCalls.run_id,
          tool_definition_id: agentRunToolCalls.tool_definition_id,
          tool_call_id: agentRunToolCalls.tool_call_id,
          tool_name: agentRunToolCalls.tool_name,
          tool_input: agentRunToolCalls.tool_input,
          tool_output: agentRunToolCalls.tool_output,
          status: agentRunToolCalls.status,
          duration_ms: agentRunToolCalls.duration_ms,
          error_message: agentRunToolCalls.error_message,
          created_at: agentRunToolCalls.created_at,
        })
        .from(agentRunToolCalls)
        .where(inArray(agentRunToolCalls.run_id, runIds))
        .orderBy(asc(agentRunToolCalls.created_at))
      : Promise.resolve([]),
  ]);

  const runMessagesByRunId = new Map<string, typeof runMessages>();
  for (const message of runMessages) {
    const bucket = runMessagesByRunId.get(message.run_id) ?? [];
    bucket.push(message);
    runMessagesByRunId.set(message.run_id, bucket);
  }

  const toolCallsByRunId = new Map<string, typeof toolCalls>();
  for (const toolCall of toolCalls) {
    const bucket = toolCallsByRunId.get(toolCall.run_id) ?? [];
    bucket.push(toolCall);
    toolCallsByRunId.set(toolCall.run_id, bucket);
  }

  const runsById = new Map(runs.map((run) => [run.id, {
    id: run.id,
    status: run.status,
    mode: run.mode,
    model_id: run.model_id,
    model_external_id: run.model_external_id,
    provider_name: run.provider_name,
    external_generation_id: run.external_generation_id,
    external_response_id: run.external_response_id,
    session_key: run.session_key,
    trace_id: run.trace_id,
    started_at: run.started_at.toISOString(),
    completed_at: run.completed_at?.toISOString() ?? null,
    latency_ms: run.latency_ms,
    error_message: run.error_message,
    input_summary: run.input_summary,
    output_summary: run.output_summary,
    final_output: run.final_output,
    final_output_json: run.final_output_json,
    run_messages: (runMessagesByRunId.get(run.id) ?? []).map((message) => ({
      id: message.id,
      role: message.role,
      content_text: message.content_text,
      content_json: message.content_json,
      token_estimate: message.token_estimate,
      created_at: message.created_at.toISOString(),
    })),
    tool_calls: (toolCallsByRunId.get(run.id) ?? []).map((toolCall) => ({
      id: toolCall.id,
      tool_definition_id: toolCall.tool_definition_id,
      tool_call_id: toolCall.tool_call_id,
      tool_name: toolCall.tool_name,
      tool_input: toolCall.tool_input,
      tool_output: toolCall.tool_output,
      status: toolCall.status,
      duration_ms: toolCall.duration_ms,
      error_message: toolCall.error_message,
      created_at: toolCall.created_at.toISOString(),
    })),
  }]));

  return {
    conversation: {
      id: conversation.id,
      title: conversation.title,
      mode: conversation.mode,
      access: conversation.access,
      share_token: conversation.share_token,
      model_external_id: conversation.model_external_id,
      system_prompt: conversation.system_prompt,
      settings_json: conversation.settings_json,
      total_view_count: conversation.total_view_count,
      unique_view_count: conversation.unique_view_count,
      created_at: conversation.created_at.toISOString(),
      updated_at: conversation.updated_at.toISOString(),
      last_message_at: conversation.last_message_at.toISOString(),
      owner: {
        id: conversation.owner_id,
        name: conversation.owner_name,
        username: conversation.owner_username,
        email: conversation.owner_email,
      },
      agent: conversation.agent_id ? {
        id: conversation.agent_id,
        name: conversation.agent_name,
        slug: conversation.agent_slug,
      } : null,
      message_count: toSafeNumber(conversation.message_count),
      user_message_count: toSafeNumber(conversation.user_message_count),
      assistant_message_count: toSafeNumber(conversation.assistant_message_count),
    },
    messages: messages.map((message) => ({
      id: message.id,
      role: message.role,
      content_text: message.content_text,
      run_id: message.run_id,
      usage_json: message.usage_json,
      preview_view_count: message.preview_view_count,
      project_run_count: message.project_run_count,
      latency_ms: message.latency_ms,
      created_at: message.created_at.toISOString(),
      run: message.run_id ? (runsById.get(message.run_id) ?? null) : null,
    })),
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
    openrouter,
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
    getOpenRouterDashboardStatus(),
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
    openrouter,
  };
}
