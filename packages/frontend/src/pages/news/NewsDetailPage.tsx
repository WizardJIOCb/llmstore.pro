import { useCallback, useEffect, useRef, useState } from 'react';
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
import { RichNewsContent } from '../../components/news/RichNewsContent';
import { Spinner } from '../../components/ui/Spinner';
import { UserLink } from '../../components/users/UserLink';
import { formatNewsDateParts } from '../../lib/newsDates';
import { getNewsProductBadge, getNewsTryLinks } from '../../lib/newsProduct';

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
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const leadImageFrameRef = useRef<HTMLDivElement | null>(null);
  const leadImageRef = useRef<HTMLImageElement | null>(null);
  const [leadImageShouldFill, setLeadImageShouldFill] = useState(false);
  const leadImage = article?.images[0] ?? null;

  const updateLeadImageLayout = useCallback(() => {
    const frame = leadImageFrameRef.current;
    const image = leadImageRef.current;
    if (!frame || !image || image.naturalWidth <= 0) return;

    const availableWidth = frame.clientWidth;
    setLeadImageShouldFill(image.naturalWidth >= availableWidth - 8);
  }, []);

  useEffect(() => {
    if (!article || !location.hash) return;
    if (location.hash === '#comments') scrollToElement('comments');
    if (location.hash === '#comment-form') scrollToElement('comment-form');
  }, [article, location.hash]);

  useEffect(() => {
    if (!leadImage) return;

    const handleResize = () => updateLeadImageLayout();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [leadImage, updateLeadImageLayout]);

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

  const displayDate = formatNewsDateParts(article.published_at);
  const initialComposerOpen = location.hash === '#comment-form';
  const resolvedCommentsCount = commentsLoading ? article.comments_count : comments.length;
  const productBadge = getNewsProductBadge(article);
  const tryLinks = getNewsTryLinks(article);

  return (
    <div className="bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_25%,#f8fafc_100%)]">
      <div className="container mx-auto max-w-6xl px-4 py-10 md:py-14">

        <article className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.35)] md:p-10">
          <div className="relative">
            <Link to="/news" className="absolute right-0 top-0 inline-flex items-center gap-2 text-sm text-slate-500 transition hover:text-slate-900">
              {'\u2190 \u0412\u0441\u0435 \u043d\u043e\u0432\u043e\u0441\u0442\u0438'}
            </Link>
            <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${productBadge.className}`}>
              {productBadge.label}
            </span>
            <h1 className="mt-4 pr-40 text-2xl font-bold tracking-tight text-slate-950 md:pr-56 md:text-3xl">
              {article.title}
            </h1>
            {article.excerpt && (
              <p className="mt-5 max-w-4xl text-lg leading-8 text-slate-600">{article.excerpt}</p>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              {displayDate && (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
                  {displayDate.date}, {displayDate.time}
                </span>
              )}
              <span className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
                Автор:{' '}
                <UserLink
                  username={article.author?.username}
                  name={article.author?.name}
                  fallback="Команда LLMStore"
                  className="font-medium text-slate-900 hover:text-primary"
                />
              </span>
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-100"
                onClick={() => scrollToElement('comments')}
              >
                {resolvedCommentsCount} комментариев
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
              onClick={() => setLightboxIndex(0)}
            >
              <div ref={leadImageFrameRef} className="flex justify-center px-4 py-4 md:px-6 md:py-6">
                <img
                  ref={leadImageRef}
                  src={leadImage.url}
                  alt={article.title}
                  className={leadImageShouldFill
                    ? 'h-auto w-full max-w-full object-contain transition duration-300 group-hover:scale-[1.01]'
                    : 'mx-auto h-auto w-auto max-w-full object-contain transition duration-300 group-hover:scale-[1.01]'}
                  onLoad={updateLeadImageLayout}
                />
              </div>
              <div className="flex items-center justify-between gap-4 border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <span className="truncate">Нажмите, чтобы открыть изображение полностью</span>
                <span className="shrink-0 text-xs uppercase tracking-[0.18em] text-slate-400">Full size</span>
              </div>
            </button>
          )}

          <div className="mt-10 min-w-0">
            <RichNewsContent content={article.content} />

            <section className="mt-10 rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,#f8fafc,#ffffff_46%,#eefcf5)] p-6">
              <p className="text-sm uppercase tracking-[0.22em] text-slate-500">Где попробовать</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-950">Связанные продуктовые маршруты</h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
                Если обновление хочется проверить руками, начните с ближайшего раздела продукта. Ссылки подобраны по теме новости.
              </p>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                {tryLinks.map((link) => (
                  <Link
                    key={link.href}
                    to={link.href}
                    className="block rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    <span className="text-sm font-semibold text-primary">{link.label}</span>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{link.description}</p>
                  </Link>
                ))}
              </div>
            </section>

            {article.images.length > 1 && (
              <div className="mt-10">
                <h3 className="mb-4 text-lg font-semibold text-slate-950">Дополнительные изображения</h3>
                <ImageGallery
                  images={article.images.slice(1)}
                  onImageClick={(index) => setLightboxIndex(index + 1)}
                />
              </div>
            )}

            <NewsCommentsPanel
              comments={comments}
              commentsCount={resolvedCommentsCount}
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

      {article.images.length > 0 && lightboxIndex !== null && (
        <NewsLightbox
          images={article.images}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onSelect={setLightboxIndex}
          onPrev={() => setLightboxIndex((current) => (
            current !== null && current > 0 ? current - 1 : article.images.length - 1
          ))}
          onNext={() => setLightboxIndex((current) => (
            current !== null && current < article.images.length - 1 ? current + 1 : 0
          ))}
        />
      )}
    </div>
  );
}
