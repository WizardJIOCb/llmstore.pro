import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { useAdminNewsList, useDeleteNews } from '../../hooks/useNews';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Spinner } from '../../components/ui/Spinner';

const STATUS_OPTIONS = [
  { value: '', label: 'Все статусы' },
  { value: 'draft', label: 'Черновик' },
  { value: 'published', label: 'Опубликован' },
];

const STATUS_VARIANT: Record<string, 'secondary' | 'success'> = {
  draft: 'secondary',
  published: 'success',
};

const STATUS_LABEL: Record<string, string> = {
  draft: 'Черновик',
  published: 'Опубликован',
};

export function AdminNewsListPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const perPage = 20;

  const { data, isLoading } = useAdminNewsList({ page, per_page: perPage, status: status || undefined, search: search || undefined });
  const deleteMutation = useDeleteNews();

  const items = data?.data ?? [];
  const meta = data?.meta ?? { total: 0, page: 1, per_page: perPage, total_pages: 1 };

  const handleDelete = (id: string, title: string) => {
    if (!confirm(`Удалить новость "${title}"?`)) return;
    deleteMutation.mutate(id);
  };

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Новости</h2>
          <Link to="/admin/news/new">
            <Button>Добавить новость</Button>
          </Link>
        </div>

        <div className="flex gap-3">
          <Input
            placeholder="Поиск по заголовку..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="max-w-xs"
          />
          <Select
            options={STATUS_OPTIONS}
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="w-48"
          />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground text-center py-12">Новостей пока нет</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Заголовок</th>
                    <th className="pb-2 font-medium">Статус</th>
                    <th className="pb-2 font-medium">Дата публикации</th>
                    <th className="pb-2 font-medium">Изменено</th>
                    <th className="pb-2 font-medium text-right">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item: any) => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="py-2 max-w-xs truncate">{item.title}</td>
                      <td className="py-2">
                        <Badge variant={STATUS_VARIANT[item.status] || 'secondary'}>
                          {STATUS_LABEL[item.status] || item.status}
                        </Badge>
                      </td>
                      <td className="py-2 text-muted-foreground">
                        {item.published_at
                          ? new Date(item.published_at).toLocaleDateString('ru-RU')
                          : '—'}
                      </td>
                      <td className="py-2 text-muted-foreground">
                        {new Date(item.updated_at).toLocaleDateString('ru-RU')}
                      </td>
                      <td className="py-2 text-right">
                        <div className="flex justify-end gap-2">
                          <Link to={`/admin/news/${item.id}`}>
                            <Button variant="outline" size="sm">Редактировать</Button>
                          </Link>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDelete(item.id, item.title)}
                            disabled={deleteMutation.isPending}
                          >
                            Удалить
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {meta.total_pages > 1 && (
              <div className="flex items-center justify-center gap-4 pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  Назад
                </Button>
                <span className="text-sm text-muted-foreground">
                  {page} / {meta.total_pages}
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
    </AdminLayout>
  );
}
