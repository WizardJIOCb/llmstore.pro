import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, MoreHorizontal } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { useAdminUsers, useUpdateUserRole, useUpdateUserStatus, useAdjustUserBalance, useResetUserPassword, useImpersonateUser } from '../../hooks/useAdmin';
import { Button, Badge, Spinner } from '../../components/ui';
import { UserLink } from '../../components/users/UserLink';
import type { AdminUserListItem } from '../../lib/api/admin';
import { formatUsd } from '../../lib/utils';
import { useAuth } from '../../hooks/useAuth';

type SortField = 'spent_usd' | 'spent_tokens' | 'agents_count' | 'chats_count' | 'balance_usd' | 'last_activity_at' | 'last_login_at' | 'created_at' | 'role';
type SortOrder = 'asc' | 'desc';
type PerPageOption = 5 | 10 | 20;
type PaginationItem = number | 'start-ellipsis' | 'end-ellipsis';

const ALICE_ROLE_FILTER_VALUE = '__alice';
const ALICE_SYNTHETIC_EMAIL_DOMAIN = '@alice.llmstore.local';
const perPageOptions: PerPageOption[] = [5, 10, 20];

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

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-';

  return new Date(value).toLocaleString('ru-RU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isAliceUser(user: Pick<AdminUserListItem, 'email'>): boolean {
  return user.email.toLowerCase().endsWith(ALICE_SYNTHETIC_EMAIL_DOMAIN);
}

function buildPaginationItems(currentPage: number, totalPages: number): PaginationItem[] {
  const safeTotalPages = Math.max(1, totalPages);
  const safeCurrentPage = Math.min(Math.max(1, currentPage), safeTotalPages);

  if (safeTotalPages <= 7) {
    return Array.from({ length: safeTotalPages }, (_, index) => index + 1);
  }

  const pageSet = new Set<number>([1, safeTotalPages, safeCurrentPage, safeCurrentPage - 1, safeCurrentPage + 1]);

  if (safeCurrentPage <= 4) {
    [2, 3, 4, 5].forEach((pageNumber) => pageSet.add(pageNumber));
  }

  if (safeCurrentPage >= safeTotalPages - 3) {
    [safeTotalPages - 4, safeTotalPages - 3, safeTotalPages - 2, safeTotalPages - 1].forEach((pageNumber) =>
      pageSet.add(pageNumber),
    );
  }

  const pages = Array.from(pageSet)
    .filter((pageNumber) => pageNumber >= 1 && pageNumber <= safeTotalPages)
    .sort((a, b) => a - b);

  return pages.reduce<PaginationItem[]>((items, pageNumber, index) => {
    const previousPage = pages[index - 1];
    if (previousPage && pageNumber - previousPage > 1) {
      items.push(index === 1 ? 'start-ellipsis' : 'end-ellipsis');
    }
    items.push(pageNumber);
    return items;
  }, []);
}

export function AdminUsersPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user: authUser, fetchMe } = useAuth();
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState<PerPageOption>(10);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [openActionMenuUserId, setOpenActionMenuUserId] = useState<string | null>(null);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);

  // Balance modal state
  const [balanceModal, setBalanceModal] = useState<{ userId: string; email: string; balanceUsd: string } | null>(null);
  const [balanceAmount, setBalanceAmount] = useState('');
  const [balanceDescription, setBalanceDescription] = useState('');
  const [passwordModal, setPasswordModal] = useState<{ userId: string; email: string; username: string | null } | null>(null);
  const [newPassword, setNewPassword] = useState('');

  // Role change state
  const [roleModal, setRoleModal] = useState<{ userId: string; email: string; currentRole: string } | null>(null);
  const [newRole, setNewRole] = useState('');

  const { data, isLoading } = useAdminUsers({
    page,
    per_page: perPage,
    search: search || undefined,
    role: filterRole && filterRole !== ALICE_ROLE_FILTER_VALUE ? filterRole : undefined,
    status: filterStatus || undefined,
    source: filterRole === ALICE_ROLE_FILTER_VALUE ? 'alice' : 'regular',
    sort_by: sortBy,
    sort_order: sortOrder,
  });

  const updateRoleMutation = useUpdateUserRole();
  const updateStatusMutation = useUpdateUserStatus();
  const adjustBalanceMutation = useAdjustUserBalance();
  const resetPasswordMutation = useResetUserPassword();
  const impersonateMutation = useImpersonateUser();

  useEffect(() => {
    if (!openActionMenuUserId) return undefined;

    const handlePointerDown = (event: MouseEvent) => {
      if (!actionMenuRef.current?.contains(event.target as Node)) {
        setOpenActionMenuUserId(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenActionMenuUserId(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openActionMenuUserId]);

  const users = data?.data ?? [];
  const meta = data?.meta ?? { total: 0, page: 1, per_page: perPage, total_pages: 1 };
  const totalPages = Math.max(1, meta.total_pages);
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pageStart = meta.total === 0 ? 0 : (currentPage - 1) * perPage + 1;
  const pageEnd = Math.min(currentPage * perPage, meta.total);
  const paginationItems = buildPaginationItems(currentPage, totalPages);

  const handleSort = (field: SortField) => {
    setPage(1);
    if (sortBy === field) {
      setSortOrder((current) => (current === 'desc' ? 'asc' : 'desc'));
      return;
    }
    setSortBy(field);
    setSortOrder(field === 'role' ? 'asc' : 'desc');
  };

  const renderSortableHeader = (
    label: string,
    field: SortField,
    align: 'left' | 'right' = 'left',
  ) => {
    const isActive = sortBy === field;
    const icon = !isActive
      ? null
      : sortOrder === 'desc'
        ? <ArrowDown className="h-3.5 w-3.5" />
        : <ArrowUp className="h-3.5 w-3.5" />;

    return (
      <button
        type="button"
        className={`inline-flex items-center gap-1.5 transition-colors hover:text-foreground ${align === 'right' ? 'ml-auto' : ''}`}
        onClick={() => handleSort(field)}
      >
        <span>{label}</span>
        <span className={isActive ? 'text-foreground' : 'text-muted-foreground/50'}>
          {icon ?? <ArrowDown className="h-3.5 w-3.5 opacity-40" />}
        </span>
      </button>
    );
  };

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

  const handleResetPassword = () => {
    if (!passwordModal || newPassword.length < 8) return;
    resetPasswordMutation.mutate(
      { id: passwordModal.userId, password: newPassword },
      {
        onSuccess: () => {
          setPasswordModal(null);
          setNewPassword('');
        },
      },
    );
  };

  const handleImpersonate = async (userId: string) => {
    if (!confirm('Войти за этого пользователя и перейти в его чаты?')) return;

    try {
      await impersonateMutation.mutateAsync(userId);
      queryClient.clear();
      await fetchMe();
      navigate('/chats');
    } finally {
      setOpenActionMenuUserId(null);
    }
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
          <option value={ALICE_ROLE_FILTER_VALUE}>Alice user</option>
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
                  <th className="px-4 py-3 text-right font-medium">{renderSortableHeader('Чаты', 'chats_count', 'right')}</th>
                  <th className="px-4 py-3 text-right font-medium">{renderSortableHeader('Агенты', 'agents_count', 'right')}</th>
                  <th className="px-4 py-3 text-right font-medium">{renderSortableHeader('Потрачено, токены', 'spent_tokens', 'right')}</th>
                  <th className="px-4 py-3 text-right font-medium">{renderSortableHeader('Потрачено, $', 'spent_usd', 'right')}</th>
                  <th className="px-4 py-3 text-left font-medium">{renderSortableHeader('Роль', 'role')}</th>
                  <th className="px-4 py-3 text-left font-medium">Статус</th>
                  <th className="px-4 py-3 text-right font-medium">{renderSortableHeader('Баланс, $', 'balance_usd', 'right')}</th>
                  <th className="px-4 py-3 text-left font-medium">{renderSortableHeader('Последняя активность', 'last_activity_at')}</th>
                  <th className="px-4 py-3 text-left font-medium">{renderSortableHeader('Последний вход', 'last_login_at')}</th>
                  <th className="px-4 py-3 text-left font-medium">{renderSortableHeader('Регистрация', 'created_at')}</th>
                  <th className="px-4 py-3 text-right font-medium">Действия</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user: AdminUserListItem) => (
                  <tr key={user.id} className="border-b hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="font-medium">{user.email}</div>
                      {user.username && (
                        <div className="text-xs text-muted-foreground"><UserLink username={user.username} name={null} className="hover:text-primary hover:underline" /></div>
                      )}
                    </td>
                    <td className="px-4 py-3">{user.name || '-'}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      {Number(user.chats_count ?? 0).toLocaleString('ru-RU')}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {Number(user.agents_count ?? 0).toLocaleString('ru-RU')}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {Number(user.spent_tokens ?? 0).toLocaleString('ru-RU')}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {formatUsd(user.spent_usd ?? 0, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={roleVariants[user.role] ?? 'secondary'}>
                        {roleLabels[user.role] ?? user.role}
                      </Badge>
                      {isAliceUser(user) && (
                        <Badge variant="outline" className="ml-2">
                          Alice
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusVariants[user.status] ?? 'secondary'}>
                        {statusLabels[user.status] ?? user.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {formatUsd(user.balance_usd)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {formatDateTime(user.last_activity_at)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {formatDateTime(user.last_login_at)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {formatDateTime(user.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div
                        ref={openActionMenuUserId === user.id ? actionMenuRef : null}
                        className="relative flex justify-end"
                      >
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          aria-label={`Действия для ${user.email}`}
                          aria-haspopup="menu"
                          aria-expanded={openActionMenuUserId === user.id}
                          onClick={() => setOpenActionMenuUserId((current) => (current === user.id ? null : user.id))}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>

                        {openActionMenuUserId === user.id && (
                          <div className="absolute right-0 top-full z-20 mt-2 min-w-[190px] rounded-lg border bg-background p-1 shadow-lg">
                            {authUser?.role === 'admin' && authUser.id !== user.id && user.status === 'active' && (
                              <button
                                type="button"
                                className="w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                                onClick={() => {
                                  void handleImpersonate(user.id);
                                }}
                              >
                                Авторизоваться
                              </button>
                            )}
                            <button
                              type="button"
                              className="w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                              onClick={() => {
                                setOpenActionMenuUserId(null);
                                setRoleModal({ userId: user.id, email: user.email, currentRole: user.role });
                                setNewRole(user.role);
                              }}
                            >
                              Роль
                            </button>
                            <button
                              type="button"
                              className="w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                              onClick={() => {
                                setOpenActionMenuUserId(null);
                                setBalanceModal({ userId: user.id, email: user.email, balanceUsd: String(user.balance_usd) });
                              }}
                            >
                              Баланс
                            </button>
                            <button
                              type="button"
                              className="w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                              onClick={() => {
                                setOpenActionMenuUserId(null);
                                setPasswordModal({ userId: user.id, email: user.email, username: user.username ?? null });
                                setNewPassword('');
                              }}
                            >
                              Пароль
                            </button>
                            <button
                              type="button"
                              className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${
                                user.status === 'active' ? 'text-destructive' : 'text-green-600'
                              }`}
                              onClick={() => {
                                setOpenActionMenuUserId(null);
                                handleToggleStatus(user.id, user.status);
                              }}
                            >
                              {user.status === 'active' ? 'Блок' : 'Разблок'}
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="mt-4 rounded-lg border bg-muted/20 p-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:gap-4">
                <label className="flex items-center gap-2">
                  <span>Записей на странице</span>
                  <select
                    value={perPage}
                    onChange={(event) => {
                      setPerPage(Number(event.target.value) as PerPageOption);
                      setPage(1);
                    }}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                  >
                    {perPageOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <span>
                  Показано {pageStart}-{pageEnd} из {meta.total}
                </span>
              </div>

              <nav className="flex flex-wrap items-center gap-2" aria-label="Пагинация пользователей">
                <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage(1)}>
                  Первая
                </Button>
                <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Назад
                </Button>
                <div className="flex flex-wrap items-center gap-1">
                  {paginationItems.map((item) =>
                    typeof item === 'number' ? (
                      <Button
                        key={item}
                        variant={item === currentPage ? 'primary' : 'outline'}
                        size="sm"
                        className="min-w-9 px-3"
                        aria-current={item === currentPage ? 'page' : undefined}
                        onClick={() => setPage(item)}
                      >
                        {item}
                      </Button>
                    ) : (
                      <span key={item} className="px-1.5 text-sm text-muted-foreground">
                        ...
                      </span>
                    ),
                  )}
                </div>
                <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                  Вперёд
                </Button>
                <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setPage(totalPages)}>
                  Последняя
                </Button>
              </nav>
            </div>
          </div>
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

      {passwordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setPasswordModal(null)}>
          <div className="w-full max-w-md rounded-lg bg-background p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold">Сменить пароль</h2>
            <p className="mb-1 text-sm text-muted-foreground">{passwordModal.email}</p>
            <p className="mb-4 text-xs text-muted-foreground">
              {passwordModal.username
                ? `Вход будет работать по email или логину @${passwordModal.username}`
                : 'Вход будет работать по email и новому паролю'}
            </p>
            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium">Новый пароль</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Минимум 8 символов"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
            {resetPasswordMutation.error && (
              <p className="mb-4 text-sm text-destructive">
                {(resetPasswordMutation.error as any)?.response?.data?.error?.message || 'Не удалось обновить пароль'}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setPasswordModal(null)}>Отмена</Button>
              <Button
                size="sm"
                onClick={handleResetPassword}
                disabled={resetPasswordMutation.isPending || newPassword.length < 8}
              >
                {resetPasswordMutation.isPending ? 'Сохранение...' : 'Сменить пароль'}
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
            <p className="text-sm text-muted-foreground">{balanceModal.email}</p>
            <p className="mb-4 text-sm text-muted-foreground">
              Текущий баланс: <span className="font-mono text-foreground">{formatUsd(balanceModal.balanceUsd)}</span>
            </p>
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

