import { useState, type KeyboardEvent } from 'react';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Textarea';
import { Spinner } from '../ui/Spinner';
import type { PublicComment } from '../../lib/api/comments';

interface CommentsSectionProps {
  title?: string;
  comments: PublicComment[];
  isLoading: boolean;
  isAuthenticated: boolean;
  isSubmitting: boolean;
  currentUserId?: string | null;
  canDeleteAny?: boolean;
  onSubmit: (content: string) => Promise<unknown>;
  onDelete?: (commentId: string) => Promise<unknown>;
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

function displayUserName(comment: PublicComment) {
  return comment.user.name || comment.user.username || 'Пользователь';
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
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleSubmit = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setError(null);
    try {
      await onSubmit(trimmed);
      setValue('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отправить комментарий');
    }
  };

  const handleInputKeyDown = async (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
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

  return (
    <section className="mt-12 rounded-lg border p-4 md:p-6">
      <h2 className="mb-4 text-xl font-semibold">{title}</h2>

      {isAuthenticated ? (
        <div className="mb-6 space-y-3">
          <Textarea
            rows={4}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Напишите комментарий..."
          />
          <p className="text-xs text-muted-foreground">Ctrl + Enter - отправить</p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={handleSubmit} disabled={isSubmitting || value.trim().length === 0}>
            {isSubmitting ? 'Отправка...' : 'Отправить комментарий'}
          </Button>
        </div>
      ) : (
        <p className="mb-6 text-sm text-muted-foreground">Войдите, чтобы оставить комментарий.</p>
      )}

      {isLoading ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">Комментариев пока нет.</p>
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => (
            <article key={comment.id} className="rounded-md border p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm font-medium">{displayUserName(comment)}</p>
                <div className="flex items-center gap-3">
                  <p className="text-xs text-muted-foreground">{formatDate(comment.created_at)}</p>
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
              <p className="whitespace-pre-wrap text-sm">{comment.content}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
