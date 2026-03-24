import { useState } from 'react';
import { useNewsList } from '../../hooks/useNews';
import { NewsCard } from '../../components/news/NewsCard';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';

const PER_PAGE_OPTIONS = [
  { value: '3', label: '3 на странице' },
  { value: '5', label: '5 на странице' },
  { value: '10', label: '10 на странице' },
];

export function NewsListPage() {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const { data, isLoading } = useNewsList({ page, per_page: perPage });

  const items = data?.data ?? [];
  const meta = data?.meta ?? { total: 0, page: 1, per_page: perPage, total_pages: 1 };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Новости</h1>
        <Select
          options={PER_PAGE_OPTIONS}
          value={String(perPage)}
          onChange={(e) => {
            setPerPage(Number(e.target.value));
            setPage(1);
          }}
          className="w-48"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground text-center py-16">Новостей пока нет</p>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {items.map((article: any) => (
              <NewsCard key={article.id} article={article} />
            ))}
          </div>

          {meta.total_pages > 1 && (
            <div className="flex items-center justify-center gap-4 pt-8">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Назад
              </Button>
              <span className="text-sm text-muted-foreground">
                Страница {page} из {meta.total_pages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(meta.total_pages, p + 1))}
                disabled={page >= meta.total_pages}
              >
                Вперёд
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
