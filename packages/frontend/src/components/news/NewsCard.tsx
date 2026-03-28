import { Link } from 'react-router-dom';
import type { NewsArticle } from '../../lib/api/news';

interface NewsCardProps {
  article: NewsArticle;
}

export function NewsCard({ article }: NewsCardProps) {
  const thumbnail = article.images[0]?.url;
  const displayDate = article.published_at
    ? new Date(article.published_at).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  const excerpt =
    article.excerpt || (article.content.length > 160 ? article.content.slice(0, 160) + '...' : article.content);

  return (
    <Link
      to={`/news/${article.slug}`}
      className="block rounded-lg border overflow-hidden hover:shadow-md transition-shadow group"
    >
      {thumbnail ? (
        <div className="aspect-video overflow-hidden">
          <img
            src={thumbnail}
            alt={article.title}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        </div>
      ) : (
        <div className="aspect-video bg-muted flex items-center justify-center">
          <span className="text-muted-foreground text-sm">Нет изображения</span>
        </div>
      )}
      <div className="p-4">
        <h3 className="font-semibold text-lg mb-1 line-clamp-2">{article.title}</h3>
        <p className="text-sm text-muted-foreground mb-2 line-clamp-3">{excerpt}</p>
        {displayDate && (
          <p className="text-xs text-muted-foreground">{displayDate}</p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          {article.comments_count ?? 0} комментариев • {article.views_count ?? 0} просмотров
        </p>
      </div>
    </Link>
  );
}
