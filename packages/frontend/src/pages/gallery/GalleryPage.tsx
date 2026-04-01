import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useGalleryPreviews } from '../../hooks/useChats';
import { Spinner } from '../../components/ui/Spinner';
import { Button } from '../../components/ui/Button';

const GALLERY_IMAGE_PLACEHOLDER = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#e2e8f0" />
        <stop offset="100%" stop-color="#cbd5e1" />
      </linearGradient>
    </defs>
    <rect width="640" height="400" fill="url(#g)" />
    <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
      font-family="Segoe UI, Arial, sans-serif" font-size="28" fill="#334155">
      Preview
    </text>
  </svg>`,
)}`;

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

function sanitizeGalleryPreviewHtml(html: string): string {
  return html
    .replace(/https?:\/\/via\.placeholder\.com\/[^"')\s]+/gi, GALLERY_IMAGE_PLACEHOLDER)
    .replace(/https?:\/\/placehold\.co\/[^"')\s]+/gi, GALLERY_IMAGE_PLACEHOLDER);
}

function buildGallerySrcDoc(html: string): string {
  const safeHtml = sanitizeGalleryPreviewHtml(html);
  const csp = [
    "default-src 'none'",
    "img-src 'self' data: blob: https://llmstore.pro https://www.llmstore.pro",
    "media-src 'self' data: blob: https://llmstore.pro https://www.llmstore.pro",
    "style-src 'self' 'unsafe-inline' https://llmstore.pro https://www.llmstore.pro",
    "font-src 'self' data: https://llmstore.pro https://www.llmstore.pro",
    "script-src 'unsafe-inline'",
    "connect-src 'none'",
    "frame-src 'none'",
    "child-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ');
  const headInjection = [
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
    `<base href="${window.location.origin}/">`,
    '<style>',
    'html,body{overflow:hidden !important;}',
    'body{pointer-events:none !important;}',
    'a,button,input,textarea,select{pointer-events:none !important;}',
    '</style>',
  ].join('');

  if (/<head[^>]*>/i.test(safeHtml)) {
    return safeHtml.replace(/<head([^>]*)>/i, `<head$1>${headInjection}`);
  }

  return `<!DOCTYPE html><html><head>${headInjection}</head><body>${safeHtml}</body></html>`;
}

export function GalleryPage() {
  const { data, isLoading, error } = useGalleryPreviews(24);
  const items = useMemo(
    () =>
      (data ?? []).map((item) => ({
        ...item,
        gallery_srcdoc: item.preview_type === 'html' && item.preview_html
          ? buildGallerySrcDoc(item.preview_html)
          : null,
      })),
    [data],
  );

  return (
    <div className="px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Галерея</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Здесь собраны публичные preview из общих чатов: можно посмотреть результат,
            узнать автора, открыть сам чат и вдохновиться свежими генерациями.
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

        {!isLoading && !error && items.length === 0 && (
          <div className="rounded-2xl border bg-muted/20 p-8 text-center text-muted-foreground">
            Пока нет публичных preview для галереи.
          </div>
        )}

        {!isLoading && !error && items.length > 0 && (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <article key={item.message_id} className="overflow-hidden rounded-2xl border bg-white shadow-sm">
                <div className="aspect-[16/10] border-b bg-slate-50">
                  {item.preview_type === 'html' && item.gallery_srcdoc ? (
                    <iframe
                      title={item.preview_title || item.chat_title}
                      srcDoc={item.gallery_srcdoc}
                      className="h-full w-full bg-white"
                      sandbox="allow-scripts"
                      loading="lazy"
                      referrerPolicy="no-referrer"
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
