import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { Button, Input, Spinner } from '../../components/ui';
import { adminApi } from '../../lib/api/admin';
import { useAdminSettings, useAdjustUserBalance, useUpdateAdminSettings } from '../../hooks/useAdmin';

interface BalanceTargetUser {
  id: string;
  email: string;
  username: string | null;
  name: string | null;
  balance_usd: string;
}

function formatBalanceUsd(value: string | number): string {
  return `$${Number(value ?? 0).toFixed(2)}`;
}

export function AdminSettingsPage() {
  const { data: settings, isLoading: settingsLoading } = useAdminSettings();
  const updateSettingsMutation = useUpdateAdminSettings();
  const adjustBalanceMutation = useAdjustUserBalance();

  const [rateInput, setRateInput] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [balanceModal, setBalanceModal] = useState<BalanceTargetUser | null>(null);
  const [balanceAmount, setBalanceAmount] = useState('');
  const [balanceDescription, setBalanceDescription] = useState('');
  const [settingsSaved, setSettingsSaved] = useState(false);

  const searchTerm = userSearch.trim();
  const usersQuery = useQuery({
    queryKey: ['admin', 'settings', 'user-search', searchTerm],
    queryFn: () => adminApi.listUsers({ page: 1, per_page: 10, search: searchTerm }),
    enabled: searchTerm.length >= 2,
  });

  const foundUsers = useMemo(
    () => (usersQuery.data?.data ?? []) as BalanceTargetUser[],
    [usersQuery.data],
  );

  const currentRate = settings?.usd_to_rub_rate ?? null;

  const handleSaveRate = () => {
    const value = Number(rateInput || currentRate || 0);
    if (!Number.isFinite(value) || value <= 0) return;

    updateSettingsMutation.mutate(
      { usd_to_rub_rate: value },
      {
        onSuccess: (next) => {
          setRateInput(String(next.usd_to_rub_rate));
          setSettingsSaved(true);
          window.setTimeout(() => setSettingsSaved(false), 2000);
        },
      },
    );
  };

  const handleOpenBalanceModal = (user: BalanceTargetUser) => {
    setBalanceModal(user);
    setBalanceAmount('');
    setBalanceDescription('');
  };

  const handleAdjustBalance = () => {
    if (!balanceModal || !balanceAmount) return;
    adjustBalanceMutation.mutate(
      {
        id: balanceModal.id,
        amount: Number(balanceAmount),
        description: balanceDescription || 'Корректировка администратором из настроек',
      },
      {
        onSuccess: () => {
          setBalanceModal(null);
          setBalanceAmount('');
          setBalanceDescription('');
          usersQuery.refetch();
        },
      },
    );
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <section className="rounded-xl border bg-background p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Курс USD к RUB</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Это значение используется для отображения рублей в профиле, чатах и статистике.
            </p>
          </div>

          {settingsLoading ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="w-full max-w-xs">
                <label className="mb-1 block text-sm font-medium">1 USD = сколько RUB</label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={rateInput || (currentRate != null ? String(currentRate) : '')}
                  onChange={(e) => setRateInput(e.target.value)}
                  placeholder="90"
                />
              </div>
              <div className="flex items-center gap-3">
                <Button onClick={handleSaveRate} disabled={updateSettingsMutation.isPending}>
                  {updateSettingsMutation.isPending ? 'Сохраняю...' : 'Сохранить курс'}
                </Button>
                {currentRate != null && (
                  <span className="text-sm text-muted-foreground">
                    Текущий курс: <span className="font-medium text-foreground">{currentRate}</span>
                  </span>
                )}
                {settingsSaved && <span className="text-sm text-green-600">Сохранено</span>}
              </div>
            </div>
          )}
        </section>

        <section className="rounded-xl border bg-background p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Баланс пользователя</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Найдите пользователя по email или логину и пополните либо спишите сумму в долларах.
            </p>
          </div>

          <div className="max-w-xl">
            <label className="mb-1 block text-sm font-medium">Email или логин</label>
            <Input
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="user@example.com или username"
            />
          </div>

          <div className="mt-4">
            {searchTerm.length < 2 ? (
              <p className="text-sm text-muted-foreground">
                Введите минимум 2 символа, чтобы найти пользователя.
              </p>
            ) : usersQuery.isLoading ? (
              <div className="flex justify-center py-6">
                <Spinner />
              </div>
            ) : foundUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground">Пользователи не найдены.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/40">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Пользователь</th>
                      <th className="px-4 py-3 text-left font-medium">Имя</th>
                      <th className="px-4 py-3 text-right font-medium">Баланс</th>
                      <th className="px-4 py-3 text-right font-medium">Действие</th>
                    </tr>
                  </thead>
                  <tbody>
                    {foundUsers.map((user) => (
                      <tr key={user.id} className="border-b last:border-0">
                        <td className="px-4 py-3">
                          <div className="font-medium">{user.email}</div>
                          {user.username ? (
                            <div className="text-xs text-muted-foreground">@{user.username}</div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">{user.name || '-'}</td>
                        <td className="px-4 py-3 text-right font-mono">
                          {formatBalanceUsd(user.balance_usd)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button variant="outline" size="sm" onClick={() => handleOpenBalanceModal(user)}>
                            Изменить баланс
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>

      {balanceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setBalanceModal(null)}>
          <div className="w-full max-w-md rounded-lg bg-background p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-2 text-lg font-semibold">Корректировка баланса</h2>
            <p className="text-sm text-muted-foreground">{balanceModal.email}</p>
            {balanceModal.username ? (
              <p className="mb-4 text-xs text-muted-foreground">@{balanceModal.username}</p>
            ) : (
              <div className="mb-4" />
            )}

            <div className="mb-3">
              <label className="mb-1 block text-sm font-medium">Сумма ($)</label>
              <Input
                type="number"
                step="0.01"
                value={balanceAmount}
                onChange={(e) => setBalanceAmount(e.target.value)}
                placeholder="10.00 или -5.00"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Положительное значение пополняет баланс, отрицательное списывает.
              </p>
            </div>

            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium">Описание</label>
              <Input
                value={balanceDescription}
                onChange={(e) => setBalanceDescription(e.target.value)}
                placeholder="Причина изменения баланса"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setBalanceModal(null)}>
                Отмена
              </Button>
              <Button size="sm" onClick={handleAdjustBalance} disabled={adjustBalanceMutation.isPending || !balanceAmount}>
                {adjustBalanceMutation.isPending ? 'Применяю...' : 'Применить'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
