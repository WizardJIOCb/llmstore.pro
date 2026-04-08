import { useMemo, useState, type KeyboardEvent } from 'react';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Textarea';
import { Spinner } from '../ui/Spinner';
import type { PublicComment } from '../../lib/api/comments';
import { UserLink } from '../users/UserLink';

interface CommentsSectionProps {
  title?: string;
  comments: PublicComment[];
  isLoading: boolean;
  isAuthenticated: boolean;
  isSubmitting: boolean;
  currentUserId?: string | null;
  canDeleteAny?: boolean;
  onSubmit: (content: string, parentId?: string | null) => Promise<unknown>;
  onDelete?: (commentId: string) => Promise<unknown>;
}

interface CommentNodeData extends PublicComment {
  children: CommentNodeData[];
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function pluralizeReplies(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) return `${count} ответ`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} ответа`;
  return `${count} ответов`;
}

function buildCommentTree(comments: PublicComment[]): CommentNodeData[] {
  const sorted = [...comments].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const map = new Map<string, CommentNodeData>();

  for (const comment of sorted) {
    map.set(comment.id, { ...comment, children: [] });
  }

  const roots: CommentNodeData[] = [];
  for (const comment of sorted) {
    const node = map.get(comment.id);
    if (!node) continue;

    if (comment.parent_id) {
      const parent = map.get(comment.parent_id);
      if (parent) {
        parent.children.push(node);
        continue;
      }
    }

    roots.push(node);
  }

  return roots;
}

function CommentComposer({
  isSubmitting,
  onSubmit,
  onCancel,
  submitLabel,
  placeholder,
}: {
  isSubmitting: boolean;
  onSubmit: (content: string) => Promise<unknown>;
  onCancel?: () => void;
  submitLabel: string;
  placeholder: string;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;

    setError(null);
    try {
      await onSubmit(trimmed);
      setValue('');
      onCancel?.();
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

  return (
    <div className="space-y-3">
      <Textarea
        rows={4}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleInputKeyDown}
        placeholder={placeholder}
      />
      <p className="text-xs text-muted-foreground">Ctrl + Enter - отправить</p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => void handleSubmit()} disabled={isSubmitting || value.trim().length === 0}>
          {isSubmitting ? 'Отправка...' : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Отмена
          </Button>
        )}
      </div>
    </div>
  );
}

function CommentNode({
  comment,
  isAuthenticated,
  isSubmitting,
  currentUserId,
  canDeleteAny,
  deletingId,
  onReply,
  onDelete,
  setDeletingId,
}: {
  comment: CommentNodeData;
  isAuthenticated: boolean;
  isSubmitting: boolean;
  currentUserId?: string | null;
  canDeleteAny: boolean;
  deletingId: string | null;
  onReply: (content: string, parentId?: string | null) => Promise<unknown>;
  onDelete?: (commentId: string) => Promise<unknown>;
  setDeletingId: (commentId: string | null) => void;
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const repliesCount = comment.children.length;
  const visibleReplies = expanded ? comment.children : comment.children.slice(0, 3);
  const canDelete = Boolean(onDelete) && (canDeleteAny || currentUserId === comment.user.id);
  const hasHiddenReplies = repliesCount > 3 && !expanded;

  const handleDelete = async () => {
    if (!onDelete) return;
    setActionError(null);
    setDeletingId(comment.id);
    try {
      await onDelete(comment.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не удалось удалить комментарий');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-3">
        <UserLink
          username={comment.user.username}
          name={comment.user.name}
          fallback="Пользователь"
          className="text-sm font-medium text-foreground hover:text-primary hover:underline"
        />
        <div className="flex items-center gap-3">
          <p className="text-xs text-muted-foreground">{formatDate(comment.created_at)}</p>
          {canDelete && (
            <button
              type="button"
              className="text-xs text-destructive hover:underline disabled:opacity-60"
              onClick={() => void handleDelete()}
              disabled={deletingId === comment.id}
            >
              {deletingId === comment.id ? 'Удаление...' : 'Удалить'}
            </button>
          )}
        </div>
      </div>

      <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{comment.content}</p>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        {isAuthenticated && (
          <button
            type="button"
            className="font-medium text-primary hover:underline"
            onClick={() => setReplyOpen((current) => !current)}
          >
            {replyOpen ? 'Скрыть ответ' : 'Ответить'}
          </button>
        )}
        {repliesCount > 0 && (
          <>
            <span className="text-slate-500">{pluralizeReplies(repliesCount)}</span>
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => setExpanded((current) => !current)}
            >
              {expanded ? 'Свернуть' : 'Показать все'}
            </button>
          </>
        )}
      </div>

      {actionError && <p className="mt-3 text-sm text-destructive">{actionError}</p>}

      {replyOpen && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <CommentComposer
            isSubmitting={isSubmitting}
            submitLabel="Ответить"
            placeholder="Напишите ответ..."
            onCancel={() => setReplyOpen(false)}
            onSubmit={(content) => onReply(content, comment.id)}
          />
        </div>
      )}

      {repliesCount > 0 && (
        <div className="mt-4 border-l border-slate-200 pl-4">
          <div className="space-y-3">
            {visibleReplies.map((child) => (
              <CommentNode
                key={child.id}
                comment={child}
                isAuthenticated={isAuthenticated}
                isSubmitting={isSubmitting}
                currentUserId={currentUserId}
                canDeleteAny={canDeleteAny}
                deletingId={deletingId}
                onReply={onReply}
                onDelete={onDelete}
                setDeletingId={setDeletingId}
              />
            ))}
          </div>
          {hasHiddenReplies && (
            <div className="mt-3">
              <button
                type="button"
                className="text-sm font-medium text-primary hover:underline"
                onClick={() => setExpanded(true)}
              >
                Показать все ответы
              </button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export function CommentsSection({
  title = 'Комментарии',
  comments,
  isLoading,
  isAuthenticated,
  isSubmitting,
  currentUserId,
  canDeleteAny = false,
  onSubmit,
  onDelete,
}: CommentsSectionProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const commentTree = useMemo(() => buildCommentTree(comments), [comments]);

  return (
    <section className="mt-12 rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm md:p-6">
      <h2 className="mb-4 text-xl font-semibold text-slate-950">{title}</h2>

      {isAuthenticated ? (
        <div className="mb-6 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
          <CommentComposer
            isSubmitting={isSubmitting}
            submitLabel="Отправить комментарий"
            placeholder="Напишите комментарий..."
            onSubmit={(content) => onSubmit(content, null)}
          />
        </div>
      ) : (
        <p className="mb-6 text-sm text-muted-foreground">Войдите, чтобы оставить комментарий или ответить в обсуждении.</p>
      )}

      {isLoading ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : commentTree.length === 0 ? (
        <p className="text-sm text-muted-foreground">Комментариев пока нет.</p>
      ) : (
        <div className="space-y-4">
          {commentTree.map((comment) => (
            <CommentNode
              key={comment.id}
              comment={comment}
              isAuthenticated={isAuthenticated}
              isSubmitting={isSubmitting}
              currentUserId={currentUserId}
              canDeleteAny={canDeleteAny}
              deletingId={deletingId}
              onReply={onSubmit}
              onDelete={onDelete}
              setDeletingId={setDeletingId}
            />
          ))}
        </div>
      )}
    </section>
  );
}
