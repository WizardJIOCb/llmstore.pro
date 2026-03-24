import { useState } from 'react';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { useAdminUsers, useUpdateUserRole, useUpdateUserStatus, useAdjustUserBalance } from '../../hooks/useAdmin';
import { Button, Badge, Spinner } from '../../components/ui';

const roleLabels: Record<string, string> = {
  user: 'Пользователь',
  power_user: 'Power User',
  curator: 'Куратор',
  admin: 'Администратор',
};

const roleVariants: Record<string, 'default' | 'secondary' | 'warning' | 'success' | 'destructive'> = {
  user: 'secondary',
  power_user: 'outline' as any,
  curator: 'warning',
  admin: 'destructive',
};

const statusLabels: Record<string, string> = {
  active: 'Активен',
  suspended: 'Заблокирован',
  deleted: 'Удалён',
};

const statusVariants: Record<string, 'success' | 'warning' | 'destructive' | 'secondary'> = {
  active: 'success',
  suspended: 'warning',
  deleted: 'destructive',
};

export function AdminUsersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Balance modal state
  const [balanceModal, setBalanceModal] = useState<{ userId: string; email: string } | null>(null);
  const [balanceAmount, setBalanceAmount] = useState('');
  const [balanceDescription, setBalanceDescription] = useState('');

  // Role change state
  const [roleModal, setRoleModal] = useState<{ userId: string; email: string; currentRole: string } | null>(null);
  const [newRole, setNewRole] = useState('');

  const { data, isLoading } = useAdminUsers({
    page,
    per_page: 20,
    search: search || undefined,
    role: filterRole || undefined,
    status: filterStatus || undefined,
  });

  const updateRoleMutation = useUpdateUserRole();
  const updateStatusMutation = useUpdateUserStatus();
  const adjustBalanceMutation = useAdjustUserBalance();

  const users = data?.data ?? [];
  const meta = data?.meta ?? { total: 0, page: 1, per_page: 20, total_pages: 1 };

  const handleRoleChange = () => {
    if (!roleModal || !newRole) return;
    updateRoleMutation.mutate(
      { id: roleModal.userId, role: newRole },
      { onSuccess: () => setRoleModal(null) },
    );
  };

  const handleBalanceAdjust = () => {
    if (!balanceModal || !balanceAmount) return;
    adjustBalanceMutation.mutate(
      { id: balanceModal.userId, amount: Number(balanceAmount), description: balanceDescription || 'Корректировка админом' },
      {
        onSuccess: () => {
          setBalanceModal(null);
          setBalanceAmount('');
          setBalanceDescription('');
        },
      },
    );
  };

  const handleToggleStatus = (userId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
    if (!confirm(`${newStatus === 'suspended' ? 'Заблокировать' : 'Разблокировать'} пользователя?`)) return;
    updateStatusMutation.mutate({ id: userId, status: newStatus });
  };

  return (
    <AdminLayout>
      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Поиск по email, имени..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="h-10 w-64 rounded-md border border-input bg-background px-3 text-sm"
        />
        <select
          value={filterRole}
          onChange={(e) => { setFilterRole(e.target.value); setPage(1); }}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Все роли</option>
          {Object.entries(roleLabels).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Все статусы</option>
          {Object.entries(statusLabels).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <span className="ml-auto text-sm text-muted-foreground">
          Всего: {meta.total}
        </span>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : users.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">Пользователи не найдены</div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Email</th>
                  <th className="px-4 py-3 text-left font-medium">Имя</th>
                  <th className="px-4 py-3 text-left font-medium">Роль</th>
                  <th className="px-4 py-3 text-left font-medium">Статус</th>
                  <th className="px-4 py-3 text-right font-medium">Баланс, $</th>
                  <th className="px-4 py-3 text-left font-medium">Регистрация</th>
                  <th className="px-4 py-3 text-right font-medium">Действия</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user: any) => (
                  <tr key={user.id} className="border-b hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="font-medium">{user.email}</div>
                      {user.username && (
                        <div className="text-xs text-muted-foreground">@{user.username}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">{user.name || '-'}</td>
                    <td className="px-4 py-3">
                      <Badge variant={roleVariants[user.role] ?? 'secondary'}>
                        {roleLabels[user.role] ?? user.role}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusVariants[user.status] ?? 'secondary'}>
                        {statusLabels[user.status] ?? user.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      ${Number(user.balance_usd).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(user.created_at).toLocaleDateString('ru-RU')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setRoleModal({ userId: user.id, email: user.email, currentRole: user.role });
                            setNewRole(user.role);
                          }}
                        >
                          Роль
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setBalanceModal({ userId: user.id, email: user.email })}
                        >
                          Баланс
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={user.status === 'active' ? 'text-destructive hover:text-destructive' : 'text-green-600 hover:text-green-600'}
                          onClick={() => handleToggleStatus(user.id, user.status)}
                        >
                          {user.status === 'active' ? 'Блок' : 'Разблок'}
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

      {/* Role change modal */}
      {roleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setRoleModal(null)}>
          <div className="w-full max-w-md rounded-lg bg-background p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold">Изменить роль</h2>
            <p className="mb-4 text-sm text-muted-foreground">{roleModal.email}</p>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="mb-4 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {Object.entries(roleLabels).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setRoleModal(null)}>Отмена</Button>
              <Button size="sm" onClick={handleRoleChange} disabled={updateRoleMutation.isPending}>
                {updateRoleMutation.isPending ? 'Сохранение...' : 'Сохранить'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Balance adjust modal */}
      {balanceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setBalanceModal(null)}>
          <div className="w-full max-w-md rounded-lg bg-background p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold">Корректировка баланса</h2>
            <p className="mb-4 text-sm text-muted-foreground">{balanceModal.email}</p>
            <div className="mb-3">
              <label className="mb-1 block text-sm font-medium">Сумма ($)</label>
              <input
                type="number"
                step="0.01"
                value={balanceAmount}
                onChange={(e) => setBalanceAmount(e.target.value)}
                placeholder="10.00 или -5.00"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
              <p className="mt-1 text-xs text-muted-foreground">Положительное значение - пополнение, отрицательное - списание</p>
            </div>
            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium">Описание</label>
              <input
                type="text"
                value={balanceDescription}
                onChange={(e) => setBalanceDescription(e.target.value)}
                placeholder="Причина корректировки"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setBalanceModal(null)}>Отмена</Button>
              <Button
                size="sm"
                onClick={handleBalanceAdjust}
                disabled={adjustBalanceMutation.isPending || !balanceAmount}
              >
                {adjustBalanceMutation.isPending ? 'Применение...' : 'Применить'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
