import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { useAdminAgents } from '../../hooks/useAdmin';
import { Button, Badge, Spinner } from '../../components/ui';

const agentStatusLabels: Record<string, string> = {
  draft: 'Черновик',
  active: 'Активен',
  archived: 'Архив',
};

const agentStatusVariants: Record<string, 'secondary' | 'success' | 'warning'> = {
  draft: 'secondary',
  active: 'success',
  archived: 'warning',
};

const visibilityLabels: Record<string, string> = {
  public: 'Публичный',
  private: 'Приватный',
  unlisted: 'По ссылке',
};

export function AdminAgentsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const { data, isLoading } = useAdminAgents({
    page,
    per_page: 20,
    search: search || undefined,
    status: filterStatus || undefined,
  });

  const agents = data?.data ?? [];
  const meta = data?.meta ?? { total: 0, page: 1, per_page: 20, total_pages: 1 };

  return (
    <AdminLayout>
      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Поиск по имени агента..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="h-10 w-64 rounded-md border border-input bg-background px-3 text-sm"
        />
        <select
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Все статусы</option>
          {Object.entries(agentStatusLabels).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <span className="ml-auto text-sm text-muted-foreground">
          Всего: {meta.total}
        </span>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : agents.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">Агенты не найдены</div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Название</th>
                  <th className="px-4 py-3 text-left font-medium">Владелец</th>
                  <th className="px-4 py-3 text-left font-medium">Статус</th>
                  <th className="px-4 py-3 text-left font-medium">Видимость</th>
                  <th className="px-4 py-3 text-left font-medium">Обновлён</th>
                  <th className="px-4 py-3 text-right font-medium">Действия</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent: any) => (
                  <tr key={agent.id} className="border-b hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="font-medium">{agent.name}</div>
                      {agent.slug && (
                        <div className="text-xs text-muted-foreground">{agent.slug}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm">{agent.owner_email}</div>
                      {agent.owner_name && (
                        <div className="text-xs text-muted-foreground">{agent.owner_name}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={agentStatusVariants[agent.status] ?? 'secondary'}>
                        {agentStatusLabels[agent.status] ?? agent.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {visibilityLabels[agent.visibility] ?? agent.visibility}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(agent.updated_at).toLocaleDateString('ru-RU')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link to={`/builder/agent/${agent.id}`}>
                        <Button variant="ghost" size="sm">Открыть</Button>
                      </Link>
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
                Страница {page} из {meta.total_pages}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Назад
                </Button>
                <Button variant="outline" size="sm" disabled={page >= meta.total_pages} onClick={() => setPage((p) => p + 1)}>
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
