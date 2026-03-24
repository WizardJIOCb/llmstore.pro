import { useParams, Link } from 'react-router-dom';
import { useNewsArticle } from '../../hooks/useNews';
import { ImageGallery } from '../../components/news/ImageGallery';
import { Spinner } from '../../components/ui/Spinner';

export function NewsDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: article, isLoading, error } = useNewsArticle(slug || '');

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-16 flex justify-center">
        <Spinner />
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-destructive mb-4">Новость не найдена</p>
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
      <Link to="/news" className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-block">
        &larr; Все новости
      </Link>

      <article className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold mb-2">{article.title}</h1>
          {displayDate && (
            <p className="text-sm text-muted-foreground">{displayDate}</p>
          )}
        </header>

        {/* Main image */}
        {article.images.length > 0 && (
          <div className="rounded-lg overflow-hidden">
            <img
              src={article.images[0].url}
              alt={article.title}
              className="w-full max-h-[500px] object-cover"
            />
          </div>
        )}

        <div className="prose prose-neutral max-w-none">
          {article.content.split('\n').map((paragraph, i) => (
            paragraph.trim() ? <p key={i}>{paragraph}</p> : <br key={i} />
          ))}
        </div>

        {/* Gallery (all images) */}
        {article.images.length > 1 && (
          <div className="pt-4">
            <h3 className="text-lg font-semibold mb-3">Галерея</h3>
            <ImageGallery images={article.images} />
          </div>
        )}
      </article>
    </div>
  );
}
