import { eq, sql, desc, and, ilike, asc } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { unlink } from 'fs/promises';
import path from 'path';
import { db } from '../../config/database.js';
import { news, newsImages, newsComments, users } from '../../db/schema/index.js';
import { UPLOADS_DIR } from '../../config/upload.js';
import { AppError, NotFoundError } from '../../middleware/error-handler.js';
import type { CreateNewsInput, UpdateNewsInput } from './news.validators.js';

// ─── Slug generation ────────────────────────────────────────

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[а-яё]/g, (c) => {
      const map: Record<string, string> = {
        'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh',
        'з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o',
        'п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts',
        'ч':'ch','ш':'sh','щ':'shch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya',
      };
      return map[c] || c;
    })
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 200)
    + '-' + randomUUID().slice(0, 6);
}

// ─── Helpers ────────────────────────────────────────────────

async function loadImages(newsId: string) {
  const images = await db
    .select()
    .from(newsImages)
    .where(eq(newsImages.news_id, newsId))
    .orderBy(newsImages.sort_order);

  return images.map((img) => ({
    id: img.id,
    filename: img.filename,
    original_name: img.original_name,
    url: `/uploads/news/${img.filename}`,
    sort_order: img.sort_order,
  }));
}

function formatArticle(row: typeof news.$inferSelect, images: Awaited<ReturnType<typeof loadImages>>) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    content: row.content,
    excerpt: row.excerpt,
    status: row.status,
    views_count: row.views_count,
    comments_count: 0,
    author_user_id: row.author_user_id,
    published_at: row.published_at?.toISOString() ?? null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    images,
  };
}

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

async function resolvePublishedNewsIdBySlug(slug: string): Promise<string> {
  const [row] = await db
    .select({ id: news.id })
    .from(news)
    .where(and(eq(news.slug, slug), eq(news.status, 'published')))
    .limit(1);
  if (!row) throw new NotFoundError('Новость не найдена');
  return row.id;
}

// ─── Public ─────────────────────────────────────────────────

export async function listPublished(query: { page: number; per_page: number }) {
  const { page, per_page } = query;
  const offset = (page - 1) * per_page;

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(news)
    .where(eq(news.status, 'published'));

  const total = countResult.count;

  const rows = await db
    .select({
      id: news.id,
      title: news.title,
      slug: news.slug,
      content: news.content,
      excerpt: news.excerpt,
      status: news.status,
      views_count: news.views_count,
      author_user_id: news.author_user_id,
      published_at: news.published_at,
      created_at: news.created_at,
      updated_at: news.updated_at,
      comments_count: sql<number>`(
        select count(*)::int
        from ${newsComments}
        where ${newsComments.news_id} = ${news.id}
      )`,
    })
    .from(news)
    .where(eq(news.status, 'published'))
    .orderBy(desc(news.published_at))
    .limit(per_page)
    .offset(offset);

  const items = await Promise.all(
    rows.map(async (row) => {
      const images = await loadImages(row.id);
      return {
        ...formatArticle(row, images),
        comments_count: row.comments_count,
      };
    }),
  );

  return {
    items,
    meta: {
      total,
      page,
      per_page,
      total_pages: Math.ceil(total / per_page),
    },
  };
}

export async function getBySlug(slug: string) {
  const [row] = await db
    .select({
      id: news.id,
      title: news.title,
      slug: news.slug,
      content: news.content,
      excerpt: news.excerpt,
      status: news.status,
      views_count: news.views_count,
      author_user_id: news.author_user_id,
      published_at: news.published_at,
      created_at: news.created_at,
      updated_at: news.updated_at,
      comments_count: sql<number>`(
        select count(*)::int
        from ${newsComments}
        where ${newsComments.news_id} = ${news.id}
      )`,
    })
    .from(news)
    .where(and(eq(news.slug, slug), eq(news.status, 'published')))
    .limit(1);

  if (!row) throw new NotFoundError('Новость не найдена');

  await db
    .update(news)
    .set({ views_count: sql`${news.views_count} + 1` })
    .where(eq(news.id, row.id));

  const images = await loadImages(row.id);
  return {
    ...formatArticle(row, images),
    views_count: row.views_count + 1,
    comments_count: row.comments_count,
  };
}

export async function listCommentsBySlug(slug: string): Promise<PublicComment[]> {
  const newsId = await resolvePublishedNewsIdBySlug(slug);
  const rows = await db
    .select({
      id: newsComments.id,
      content: newsComments.content,
      created_at: newsComments.created_at,
      updated_at: newsComments.updated_at,
      user_id: users.id,
      name: users.name,
      username: users.username,
      avatar_url: users.avatar_url,
    })
    .from(newsComments)
    .innerJoin(users, eq(users.id, newsComments.user_id))
    .where(eq(newsComments.news_id, newsId))
    .orderBy(asc(newsComments.created_at));

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
  const newsId = await resolvePublishedNewsIdBySlug(slug);
  const [inserted] = await db
    .insert(newsComments)
    .values({
      news_id: newsId,
      user_id: userId,
      content: content.trim(),
    })
    .returning({
      id: newsComments.id,
      content: newsComments.content,
      created_at: newsComments.created_at,
      updated_at: newsComments.updated_at,
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
  const newsId = await resolvePublishedNewsIdBySlug(slug);
  const [comment] = await db
    .select({
      id: newsComments.id,
      user_id: newsComments.user_id,
    })
    .from(newsComments)
    .where(
      and(
        eq(newsComments.id, commentId),
        eq(newsComments.news_id, newsId),
      ),
    )
    .limit(1);

  if (!comment) throw new NotFoundError('Комментарий не найден');

  const canDeleteAny = requesterRole === 'admin' || requesterRole === 'curator';
  if (!canDeleteAny && comment.user_id !== requesterUserId) {
    throw new AppError(403, 'FORBIDDEN', 'Недостаточно прав для удаления комментария');
  }

  await db.delete(newsComments).where(eq(newsComments.id, commentId));
  return { success: true };
}

// ─── Admin ──────────────────────────────────────────────────

export async function listForAdmin(query: { page: number; per_page: number; status?: string; search?: string }) {
  const { page, per_page, status, search } = query;
  const offset = (page - 1) * per_page;

  const conditions = [];
  if (status) conditions.push(eq(news.status, status as 'draft' | 'published'));
  if (search) conditions.push(ilike(news.title, `%${search}%`));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(news)
    .where(where);

  const total = countResult.count;

  const rows = await db
    .select()
    .from(news)
    .where(where)
    .orderBy(desc(news.updated_at))
    .limit(per_page)
    .offset(offset);

  const items = await Promise.all(
    rows.map(async (row) => {
      const images = await loadImages(row.id);
      return formatArticle(row, images);
    }),
  );

  return {
    items,
    meta: {
      total,
      page,
      per_page,
      total_pages: Math.ceil(total / per_page),
    },
  };
}

export async function getById(id: string) {
  const [row] = await db
    .select()
    .from(news)
    .where(eq(news.id, id))
    .limit(1);

  if (!row) throw new NotFoundError('Новость не найдена');

  const images = await loadImages(row.id);
  return formatArticle(row, images);
}

export async function create(input: CreateNewsInput, authorUserId: string) {
  const slug = generateSlug(input.title);
  const isPublished = input.status === 'published';

  const [row] = await db
    .insert(news)
    .values({
      title: input.title,
      slug,
      content: input.content,
      excerpt: input.excerpt ?? null,
      status: input.status ?? 'draft',
      author_user_id: authorUserId,
      published_at: isPublished ? new Date() : null,
    })
    .returning();

  if (input.images?.length) {
    await db.insert(newsImages).values(
      input.images.map((img) => ({
        news_id: row.id,
        filename: img.filename,
        original_name: img.original_name ?? null,
        sort_order: img.sort_order,
      })),
    );
  }

  return getById(row.id);
}

export async function update(id: string, input: UpdateNewsInput) {
  const existing = await getById(id);

  const updateData: Record<string, unknown> = {};
  if (input.title !== undefined) updateData.title = input.title;
  if (input.content !== undefined) updateData.content = input.content;
  if (input.excerpt !== undefined) updateData.excerpt = input.excerpt;
  if (input.status !== undefined) {
    updateData.status = input.status;
    // Set published_at on first publish
    if (input.status === 'published' && !existing.published_at) {
      updateData.published_at = new Date();
    }
  }

  if (Object.keys(updateData).length > 0) {
    await db.update(news).set(updateData).where(eq(news.id, id));
  }

  // Replace images if provided
  if (input.images !== undefined) {
    // Get old images to clean up orphaned files
    const oldImages = await db
      .select({ filename: newsImages.filename })
      .from(newsImages)
      .where(eq(newsImages.news_id, id));

    const newFilenames = new Set(input.images.map((i) => i.filename));
    const toDelete = oldImages.filter((oi) => !newFilenames.has(oi.filename));

    // Replace records
    await db.delete(newsImages).where(eq(newsImages.news_id, id));
    if (input.images.length > 0) {
      await db.insert(newsImages).values(
        input.images.map((img) => ({
          news_id: id,
          filename: img.filename,
          original_name: img.original_name ?? null,
          sort_order: img.sort_order,
        })),
      );
    }

    // Clean up orphaned files
    for (const img of toDelete) {
      unlink(path.join(UPLOADS_DIR, 'news', img.filename)).catch(() => {});
    }
  }

  return getById(id);
}

export async function remove(id: string) {
  // Load images before deleting
  const images = await db
    .select({ filename: newsImages.filename })
    .from(newsImages)
    .where(eq(newsImages.news_id, id));

  const [deleted] = await db.delete(news).where(eq(news.id, id)).returning({ id: news.id });
  if (!deleted) throw new NotFoundError('Новость не найдена');

  // Clean up files
  for (const img of images) {
    unlink(path.join(UPLOADS_DIR, 'news', img.filename)).catch(() => {});
  }

  return { success: true };
}
