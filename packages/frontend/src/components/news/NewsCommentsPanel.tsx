import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Textarea';
import { Spinner } from '../ui/Spinner';
import { UserLink } from '../users/UserLink';
import type { PublicComment } from '../../lib/api/comments';
import { cn } from '../../lib/utils';

interface NewsCommentsPanelProps {
  comments: PublicComment[];
  commentsCount: number;
  isLoading: boolean;
  isAuthenticated: boolean;
  isSubmitting: boolean;
  currentUserId?: string | null;
  canDeleteAny?: boolean;
  initialComposerOpen?: boolean;
  onSubmit: (content: string) => Promise<unknown>;
  onDelete?: (commentId: string) => Promise<unknown>;
  onLike?: (commentId: string) => Promise<unknown>;
  onUnlike?: (commentId: string) => Promise<unknown>;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function CommentIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path d="M7 18.5 3.5 20l1-3.4A7.5 7.5 0 1 1 19.5 12 7.5 7.5 0 0 1 7 18.5Z" />
    </svg>
  );
}

function LikeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path d="M12 20s-6.5-4.3-8.5-8A4.8 4.8 0 0 1 12 6.3 4.8 4.8 0 0 1 20.5 12c-2 3.7-8.5 8-8.5 8Z" />
    </svg>
  );
}

export function NewsCommentsPanel({
  comments,
  commentsCount,
  isLoading,
  isAuthenticated,
  isSubmitting,
  currentUserId,
  canDeleteAny = false,
  initialComposerOpen = false,
  onSubmit,
  onDelete,
  onLike,
  onUnlike,
}: NewsCommentsPanelProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(initialComposerOpen);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [likingId, setLikingId] = useState<string | null>(null);

  useEffect(() => {
    if (initialComposerOpen) setComposerOpen(true);
  }, [initialComposerOpen]);

  const topComments = useMemo(() => (
    [...comments]
      .filter((comment) => (comment.likes_count ?? 0) > 0)
      .sort((a, b) => {
        const aLikes = a.likes_count ?? 0;
        const bLikes = b.likes_count ?? 0;
        if (bLikes !== aLikes) return bLikes - aLikes;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      })
      .slice(0, 3)
  ), [comments]);

  const handleSubmit = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setError(null);
    try {
      await onSubmit(trimmed);
      setValue('');
      setComposerOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отправить комментарий');
    }
  };

  const handleInputKeyDown = async (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      await handleSubmit();
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!onDelete) return;
    setError(null);
    setDeletingId(commentId);
    try {
      await onDelete(commentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить комментарий');
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleLike = async (comment: PublicComment) => {
    if (!isAuthenticated || !onLike || !onUnlike) return;
    setLikingId(comment.id);
    setError(null);
    try {
      if (comment.liked_by_me) {
        await onUnlike(comment.id);
      } else {
        await onLike(comment.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось обновить лайк');
    } finally {
      setLikingId(null);
    }
  };

  return (
    <section id="comments" className="mt-16 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_60px_-44px_rgba(15,23,42,0.35)] md:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Обсуждение</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">Комментарии к новости</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {commentsCount > 0
              ? `${commentsCount} комментариев уже в обсуждении.`
              : 'Обсуждение ещё пустое. Можно оставить первый комментарий.'}
          </p>
        </div>
        {isAuthenticated ? (
          <button
            id="comment-form"
            type="button"
            className="inline-flex items-center gap-2 self-start rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-100"
            onClick={() => setComposerOpen((current) => !current)}
          >
            <CommentIcon className="h-4 w-4" />
            {composerOpen ? 'Скрыть форму' : 'Быстрый комментарий'}
          </button>
        ) : (
          <Link
            to="/login"
            className="inline-flex items-center gap-2 self-start rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-100"
          >
            <CommentIcon className="h-4 w-4" />
            Войти и комментировать
          </Link>
        )}
      </div>

      {topComments.length === 3 && (
        <div className="mt-8">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-slate-900">Популярные комментарии</p>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Топ-3 по лайкам</p>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {topComments.map((comment) => (
              <article key={comment.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <UserLink
                    username={comment.user.username}
                    name={comment.user.name}
                    fallback="Пользователь"
                    className="text-sm font-medium text-slate-900 hover:text-primary hover:underline"
                  />
                    <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600">
                      <LikeIcon className="h-3.5 w-3.5" />
                      {comment.likes_count ?? 0}
                    </span>
                </div>
                <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{comment.content}</p>
                <p className="mt-3 text-xs text-slate-400">{formatDate(comment.created_at)}</p>
              </article>
            ))}
          </div>
        </div>
      )}

      {composerOpen && (
        <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-900">
            <CommentIcon className="h-4 w-4" />
            Написать комментарий
          </div>
          <Textarea
            rows={4}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Что думаете об этом обновлении?"
            className="border-slate-200 bg-white"
          />
          <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p className="text-xs text-slate-500">Ctrl + Enter, чтобы отправить быстрее</p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setComposerOpen(false)}>Отмена</Button>
              <Button onClick={handleSubmit} disabled={isSubmitting || value.trim().length === 0}>
                {isSubmitting ? 'Отправка...' : 'Опубликовать'}
              </Button>
            </div>
          </div>
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </div>
      )}

      <div className="mt-8">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-slate-900">Все комментарии</p>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{commentsCount} всего</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : comments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
            Комментариев пока нет.
          </div>
        ) : (
          <div className="space-y-4">
            {comments.map((comment) => (
              <article key={comment.id} className="rounded-2xl border border-slate-200 p-4 md:p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <UserLink
                      username={comment.user.username}
                      name={comment.user.name}
                      fallback="Пользователь"
                      className="text-sm font-medium text-slate-900 hover:text-primary hover:underline"
                    />
                    <p className="mt-1 text-xs text-slate-400">{formatDate(comment.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition',
                        comment.liked_by_me
                          ? 'border-slate-950 bg-slate-950 text-white'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100',
                      )}
                      onClick={() => handleToggleLike(comment)}
                      disabled={!isAuthenticated || likingId === comment.id}
                      title={isAuthenticated ? 'Нравится комментарий' : 'Нужна авторизация'}
                    >
                      <LikeIcon className="h-3.5 w-3.5" />
                      <span>{comment.likes_count ?? 0}</span>
                    </button>
                    {onDelete && (canDeleteAny || currentUserId === comment.user.id) && (
                      <button
                        type="button"
                        className="text-xs text-destructive hover:underline disabled:opacity-60"
                        onClick={() => handleDelete(comment.id)}
                        disabled={deletingId === comment.id}
                      >
                        {deletingId === comment.id ? 'Удаление...' : 'Удалить'}
                      </button>
                    )}
                  </div>
                </div>
                <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-700">{comment.content}</p>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
