import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminItems, useDeleteItem } from '../../hooks/useAdmin';
import { Button, Badge, Spinner } from '../../components/ui';
import { contentTypeLabels, itemStatusLabels } from '../../lib/label-maps';
import { AdminLayout } from '../../components/admin/AdminLayout';

const statusVariants: Record<string, 'success' | 'secondary' | 'warning'> = {
  published: 'success',
  draft: 'secondary',
  archived: 'warning',
};

export function AdminCatalogListPage() {
  const [page, setPage] = useState(1);
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');

  const { data, isLoading } = useAdminItems({
    page,
    per_page: 20,
    type: filterType || undefined,
    status: filterStatus || undefined,
    search: search || undefined,
  });

  const deleteMutation = useDeleteItem();

  const items = data?.data ?? [];
  const meta = data?.meta ?? { total: 0, page: 1, per_page: 20, total_pages: 1 };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Удалить "${title}"?`)) return;
    deleteMutation.mutate(id);
  };

  return (
    <AdminLayout>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Управление статьями</h2>
        <Link to="/admin/items/new">
          <Button>Добавить статью</Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Поиск..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        />
        <select
          value={filterType}
          onChange={(e) => { setFilterType(e.target.value); setPage(1); }}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Все типы</option>
          {Object.entries(contentTypeLabels).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Все статусы</option>
          {Object.entries(itemStatusLabels).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">Элементы не найдены</div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Название</th>
                  <th className="px-4 py-3 text-left font-medium">Тип</th>
                  <th className="px-4 py-3 text-left font-medium">Статус</th>
                  <th className="px-4 py-3 text-left font-medium">Рейтинг</th>
                  <th className="px-4 py-3 text-left font-medium">Обновлён</th>
                  <th className="px-4 py-3 text-right font-medium">Действия</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item: any) => (
                  <tr key={item.id} className="border-b hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link to={`/admin/items/${item.id}`} className="font-medium hover:text-primary">
                        {item.title}
                      </Link>
                      <div className="text-xs text-muted-foreground">{item.slug}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{contentTypeLabels[item.type as keyof typeof contentTypeLabels] ?? item.type}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusVariants[item.status] ?? 'secondary'}>
                        {itemStatusLabels[item.status as keyof typeof itemStatusLabels] ?? item.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">{item.curated_score}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(item.updated_at).toLocaleDateString('ru-RU')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Link to={`/admin/items/${item.id}`}>
                          <Button variant="ghost" size="sm">Редакт.</Button>
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

          {/* Pagination */}
          {meta.total_pages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Всего: {meta.total}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Назад
                </Button>
                <span className="flex items-center px-3 text-sm">
                  {page} / {meta.total_pages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= meta.total_pages}
                  onClick={() => setPage((p) => p + 1)}
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
