import { Link } from 'react-router-dom';
import { useGalleryPreviews } from '../../hooks/useChats';
import { Spinner } from '../../components/ui/Spinner';
import { Button } from '../../components/ui/Button';

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function formatViews(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(value);
}

export function GalleryPage() {
  const { data, isLoading, error } = useGalleryPreviews(24);

  return (
    <div className="px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Галерея</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Здесь собраны публичные preview из общих чатов: можно посмотреть результат, узнать автора,
            открыть сам чат и вдохновиться свежими генерациями.
          </p>
        </div>

        {isLoading && (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        )}

        {!isLoading && error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
            Не удалось загрузить галерею preview.
          </div>
        )}

        {!isLoading && !error && (data?.length ?? 0) === 0 && (
          <div className="rounded-2xl border bg-muted/20 p-8 text-center text-muted-foreground">
            Пока нет публичных preview для галереи.
          </div>
        )}

        {!isLoading && !error && (data?.length ?? 0) > 0 && (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {data!.map((item) => (
              <article key={item.message_id} className="overflow-hidden rounded-2xl border bg-white shadow-sm">
                <div className="aspect-[16/10] border-b bg-slate-50">
                  {item.preview_type === 'html' && item.preview_url ? (
                    <iframe
                      title={item.preview_title || item.chat_title}
                      src={item.preview_url}
                      className="h-full w-full bg-white"
                      sandbox="allow-scripts"
                    />
                  ) : item.preview_url ? (
                    <a
                      href={item.preview_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-full items-center justify-center p-6 text-sm text-primary underline"
                    >
                      Открыть внешний preview
                    </a>
                  ) : (
                    <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
                      Preview недоступен
                    </div>
                  )}
                </div>

                <div className="space-y-4 p-5">
                  <div className="space-y-2">
                    <p className="line-clamp-2 text-lg font-semibold">{item.chat_title}</p>
                    {item.preview_title && (
                      <p className="line-clamp-2 text-sm text-muted-foreground">{item.preview_title}</p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full border bg-muted/20 px-2.5 py-1">
                      Автор: {item.author_name}
                    </span>
                    <span className="rounded-full border bg-muted/20 px-2.5 py-1">
                      Просмотров: {formatViews(item.view_count)}
                    </span>
                    <span className="rounded-full border bg-muted/20 px-2.5 py-1">
                      {formatDate(item.created_at)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link to={item.chat_url}>
                      <Button size="sm">Перейти в чат</Button>
                    </Link>
                    {item.preview_url && (
                      <a href={item.preview_url} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm">Открыть preview</Button>
                      </a>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
