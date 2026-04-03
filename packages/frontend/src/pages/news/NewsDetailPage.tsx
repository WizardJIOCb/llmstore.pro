import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useNewsArticle } from '../../hooks/useNews';
import {
  useCreateNewsComment,
  useDeleteNewsComment,
  useLikeNewsComment,
  useNewsComments,
  useUnlikeNewsComment,
} from '../../hooks/useComments';
import { useAuth } from '../../hooks/useAuth';
import { ImageGallery } from '../../components/news/ImageGallery';
import { NewsLightbox } from '../../components/news/NewsLightbox';
import { NewsCommentsPanel } from '../../components/news/NewsCommentsPanel';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';

function formatDisplayDate(value: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function scrollToElement(id: string) {
  requestAnimationFrame(() => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
}

export function NewsDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const { user, isAuthenticated, isAdmin } = useAuth();
  const { data: article, isLoading, error } = useNewsArticle(slug || '');
  const { data: comments = [], isLoading: commentsLoading } = useNewsComments(slug || '');
  const createComment = useCreateNewsComment(slug || '');
  const deleteComment = useDeleteNewsComment(slug || '');
  const likeComment = useLikeNewsComment(slug || '');
  const unlikeComment = useUnlikeNewsComment(slug || '');
  const [isLeadImageOpen, setIsLeadImageOpen] = useState(false);

  useEffect(() => {
    if (!article || !location.hash) return;
    if (location.hash === '#comments') scrollToElement('comments');
    if (location.hash === '#comment-form') scrollToElement('comment-form');
  }, [article, location.hash]);

  if (isLoading) {
    return (
      <div className="container mx-auto flex max-w-5xl justify-center px-4 py-20">
        <Spinner />
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-20 text-center">
        <p className="mb-4 text-destructive">Новость не найдена</p>
        <Link to="/news" className="text-primary hover:underline">
          Вернуться к списку
        </Link>
      </div>
    );
  }

  const displayDate = formatDisplayDate(article.published_at);
  const leadImage = article.images[0] ?? null;
  const initialComposerOpen = location.hash === '#comment-form';

  return (
    <div className="bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_25%,#f8fafc_100%)]">
      <div className="container mx-auto max-w-6xl px-4 py-10 md:py-14">
        <div className="mb-6">
          <Link to="/news" className="inline-flex items-center gap-2 text-sm text-slate-500 transition hover:text-slate-900">
            ← Все новости
          </Link>
        </div>

        <article className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.35)] md:p-10">
          <div>
            <p className="text-sm uppercase tracking-[0.22em] text-slate-400">Пульс продукта</p>
            <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-950 md:text-3xl">
              {article.title}
            </h1>
            {article.excerpt && (
              <p className="mt-5 max-w-4xl text-lg leading-8 text-slate-600">{article.excerpt}</p>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              {displayDate && (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
                  {displayDate}
                </span>
              )}
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-100"
                onClick={() => scrollToElement('comments')}
              >
                {article.comments_count} комментариев
              </button>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
                {article.views_count ?? 0} просмотров
              </span>
            </div>
          </div>

          {leadImage && (
            <button
              type="button"
              className="group mt-8 block w-full overflow-hidden rounded-[28px] border border-slate-200 bg-slate-50 text-left"
              onClick={() => setIsLeadImageOpen(true)}
            >
              <img
                src={leadImage.url}
                alt={article.title}
                className="h-auto w-full object-contain transition duration-300 group-hover:scale-[1.01]"
              />
              <div className="flex items-center justify-between gap-4 border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <span className="truncate">Нажмите, чтобы открыть изображение полностью</span>
                <span className="shrink-0 text-xs uppercase tracking-[0.18em] text-slate-400">Full size</span>
              </div>
            </button>
          )}

          <div className="mt-10 min-w-0">
            <div className="prose prose-neutral max-w-none text-[16px] leading-8">
              {article.content.split('\n').map((paragraph, index) => (
                paragraph.trim() ? <p key={index}>{paragraph}</p> : <br key={index} />
              ))}
            </div>

            {article.images.length > 1 && (
              <div className="mt-10">
                <h3 className="mb-4 text-lg font-semibold text-slate-950">Дополнительные изображения</h3>
                <ImageGallery images={article.images.slice(1)} />
              </div>
            )}

            <NewsCommentsPanel
              comments={comments}
              commentsCount={article.comments_count}
              isLoading={commentsLoading}
              isAuthenticated={isAuthenticated}
              isSubmitting={createComment.isPending}
              currentUserId={user?.id}
              canDeleteAny={isAdmin}
              initialComposerOpen={initialComposerOpen}
              onSubmit={(content) => createComment.mutateAsync(content)}
              onDelete={(commentId) => deleteComment.mutateAsync(commentId)}
              onLike={(commentId) => likeComment.mutateAsync(commentId)}
              onUnlike={(commentId) => unlikeComment.mutateAsync(commentId)}
            />
          </div>
        </article>
      </div>

      {leadImage && isLeadImageOpen && (
        <NewsLightbox
          images={[leadImage]}
          index={0}
          onClose={() => setIsLeadImageOpen(false)}
        />
      )}
    </div>
  );
}
