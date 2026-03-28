import { Link, useParams } from 'react-router-dom';
import { useNewsArticle } from '../../hooks/useNews';
import { useCreateNewsComment, useDeleteNewsComment, useNewsComments } from '../../hooks/useComments';
import { useAuth } from '../../hooks/useAuth';
import { ImageGallery } from '../../components/news/ImageGallery';
import { CommentsSection } from '../../components/comments/CommentsSection';
import { Spinner } from '../../components/ui/Spinner';

export function NewsDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user, isAuthenticated, isAdmin } = useAuth();
  const { data: article, isLoading, error } = useNewsArticle(slug || '');
  const { data: comments = [], isLoading: commentsLoading } = useNewsComments(slug || '');
  const createComment = useCreateNewsComment(slug || '');
  const deleteComment = useDeleteNewsComment(slug || '');

  if (isLoading) {
    return (
      <div className="container mx-auto flex max-w-3xl justify-center px-4 py-16">
        <Spinner />
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="mb-4 text-destructive">Новость не найдена</p>
        <Link to="/news" className="text-primary hover:underline">
          Вернуться к списку
        </Link>
      </div>
    );
  }

  const displayDate = article.published_at
    ? new Date(article.published_at).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    : null;

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <Link to="/news" className="mb-4 inline-block text-sm text-muted-foreground hover:text-foreground">
        &larr; Все новости
      </Link>

      <article className="space-y-6">
        <header>
          <h1 className="mb-2 text-3xl font-bold">{article.title}</h1>
          {displayDate && (
            <p className="text-sm text-muted-foreground">{displayDate}</p>
          )}
        </header>

        {article.images.length > 0 && (
          <div className="overflow-hidden rounded-lg">
            <img
              src={article.images[0].url}
              alt={article.title}
              className="max-h-[500px] w-full object-cover"
            />
          </div>
        )}

        <div className="prose prose-neutral max-w-none">
          {article.content.split('\n').map((paragraph, i) => (
            paragraph.trim() ? <p key={i}>{paragraph}</p> : <br key={i} />
          ))}
        </div>

        {article.images.length > 1 && (
          <div className="pt-4">
            <h3 className="mb-3 text-lg font-semibold">Галерея</h3>
            <ImageGallery images={article.images} />
          </div>
        )}
      </article>

      <CommentsSection
        comments={comments}
        isLoading={commentsLoading}
        isAuthenticated={isAuthenticated}
        isSubmitting={createComment.isPending}
        currentUserId={user?.id}
        canDeleteAny={isAdmin}
        onSubmit={(content) => createComment.mutateAsync(content)}
        onDelete={(commentId) => deleteComment.mutateAsync(commentId)}
      />
    </div>
  );
}
