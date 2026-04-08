import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Input, Select, Spinner } from '../../components/ui';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { useAdminItems, useDeleteItem } from '../../hooks/useAdmin';
import { itemStatusLabels } from '../../lib/label-maps';

const statusVariants: Record<string, 'success' | 'secondary' | 'warning'> = {
  published: 'success',
  draft: 'secondary',
  archived: 'warning',
};

function toOptions(map: Record<string, string>) {
  return Object.entries(map).map(([value, label]) => ({ value, label }));
}

export function AdminArticlesListPage() {
  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');

  const { data, isLoading } = useAdminItems({
    page,
    per_page: 20,
    type: 'article',
    status: filterStatus || undefined,
    search: search || undefined,
  });

  const deleteMutation = useDeleteItem();
  const items = data?.data ?? [];
  const meta = data?.meta ?? { total: 0, page: 1, per_page: 20, total_pages: 1 };

  const handleDelete = (id: string, title: string) => {
    if (!window.confirm(`Удалить статью "${title}"?`)) return;
    deleteMutation.mutate(id);
  };

  return (
    <AdminLayout>
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">Статьи</h2>
          <p className="mt-1 text-sm text-slate-500">
            Управление пользовательскими и редакторскими статьями в новом формате.
          </p>
        </div>
        <Link to="/admin/articles/new">
          <Button>Добавить статью</Button>
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Поиск по заголовку"
          className="max-w-xs"
        />
        <Select
          value={filterStatus}
          onChange={(event) => {
            setFilterStatus(event.target.value);
            setPage(1);
          }}
          options={toOptions(itemStatusLabels)}
          placeholder="Все статусы"
          className="w-52"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center text-slate-500">
          Статей пока нет
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/80">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Статья</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Статус</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Фичеринг</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Обновлено</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-600">Действия</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item: any) => (
                  <tr key={item.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/60">
                    <td className="px-4 py-4">
                      <Link to={`/admin/articles/${item.id}`} className="font-medium text-slate-950 hover:text-primary">
                        {item.title}
                      </Link>
                      <div className="mt-1 text-xs text-slate-500">
                        /articles/{item.slug}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <Badge variant={statusVariants[item.status] ?? 'secondary'}>
                        {itemStatusLabels[item.status as keyof typeof itemStatusLabels] ?? item.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {item.featured ? 'Да' : 'Нет'}
                      <span className="ml-2 text-xs text-slate-400">Score: {item.curated_score}</span>
                    </td>
                    <td className="px-4 py-4 text-xs text-slate-500">
                      {new Date(item.updated_at).toLocaleDateString('ru-RU')}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        <Link to={`/admin/articles/${item.id}`}>
                          <Button variant="ghost" size="sm">Редактировать</Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(item.id, item.title)}
                          className="text-destructive hover:text-destructive"
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
            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm text-slate-500">Всего: {meta.total}</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => current - 1)}
                >
                  Назад
                </Button>
                <span className="px-3 text-sm text-slate-500">
                  {page} / {meta.total_pages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= meta.total_pages}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Вперёд
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </AdminLayout>
  );
}
