import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { Button, Input, Spinner, Textarea } from '../../components/ui';
import { UserLink } from '../../components/users/UserLink';
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

function promptsToText(value: string[]): string {
  return value.join('\n');
}

function textToPrompts(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter((item, index, list) => item.length > 0 && list.indexOf(item) === index)
    .slice(0, 12);
}

export function AdminSettingsPage() {
  const { data: settings, isLoading: settingsLoading } = useAdminSettings();
  const updateSettingsMutation = useUpdateAdminSettings();
  const adjustBalanceMutation = useAdjustUserBalance();

  const [rateInput, setRateInput] = useState('');
  const [topupMessage, setTopupMessage] = useState('');
  const [topupTelegram, setTopupTelegram] = useState('');
  const [topupEmail, setTopupEmail] = useState('');
  const [topupPhone, setTopupPhone] = useState('');
  const [legalBusinessName, setLegalBusinessName] = useState('');
  const [legalBusinessStatus, setLegalBusinessStatus] = useState('');
  const [legalInn, setLegalInn] = useState('');
  const [legalOgrn, setLegalOgrn] = useState('');
  const [legalAddress, setLegalAddress] = useState('');
  const [legalSupportEmail, setLegalSupportEmail] = useState('');
  const [legalSupportPhone, setLegalSupportPhone] = useState('');
  const [legalSupportTelegram, setLegalSupportTelegram] = useState('');
  const [codingPrompts, setCodingPrompts] = useState('');
  const [codingFastPrompts, setCodingFastPrompts] = useState('');
  const [codingHeavyPrompts, setCodingHeavyPrompts] = useState('');
  const [codingAlternativePrompts, setCodingAlternativePrompts] = useState('');
  const [dtfPrompts, setDtfPrompts] = useState('');
  const [settingsSaved, setSettingsSaved] = useState(false);

  const [userSearch, setUserSearch] = useState('');
  const [balanceModal, setBalanceModal] = useState<BalanceTargetUser | null>(null);
  const [balanceAmount, setBalanceAmount] = useState('');
  const [balanceDescription, setBalanceDescription] = useState('');

  useEffect(() => {
    if (!settings) return;
    setRateInput(String(settings.usd_to_rub_rate));
    setTopupMessage(settings.topup_message);
    setTopupTelegram(settings.topup_telegram);
    setTopupEmail(settings.topup_email);
    setTopupPhone(settings.topup_phone);
    setLegalBusinessName(settings.legal_business_name);
    setLegalBusinessStatus(settings.legal_business_status);
    setLegalInn(settings.legal_inn);
    setLegalOgrn(settings.legal_ogrn);
    setLegalAddress(settings.legal_address);
    setLegalSupportEmail(settings.legal_support_email);
    setLegalSupportPhone(settings.legal_support_phone);
    setLegalSupportTelegram(settings.legal_support_telegram);
    setCodingPrompts(promptsToText(settings.starter_prompts_openrouter_coding_agent));
    setCodingFastPrompts(promptsToText(settings.starter_prompts_openrouter_coding_agent_fast));
    setCodingHeavyPrompts(promptsToText(settings.starter_prompts_openrouter_coding_agent_heavy_planning));
    setCodingAlternativePrompts(promptsToText(settings.starter_prompts_openrouter_coding_agent_coding_alternative));
    setDtfPrompts(promptsToText(settings.starter_prompts_dtf_news_agent));
  }, [settings]);

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

  const handleSaveSettings = () => {
    const value = Number(rateInput || 0);
    if (!Number.isFinite(value) || value <= 0) return;

    updateSettingsMutation.mutate(
      {
        usd_to_rub_rate: value,
        topup_message: topupMessage,
        topup_telegram: topupTelegram,
        topup_email: topupEmail,
        topup_phone: topupPhone,
        legal_business_name: legalBusinessName,
        legal_business_status: legalBusinessStatus,
        legal_inn: legalInn,
        legal_ogrn: legalOgrn,
        legal_address: legalAddress,
        legal_support_email: legalSupportEmail,
        legal_support_phone: legalSupportPhone,
        legal_support_telegram: legalSupportTelegram,
        starter_prompts_openrouter_coding_agent: textToPrompts(codingPrompts),
        starter_prompts_openrouter_coding_agent_fast: textToPrompts(codingFastPrompts),
        starter_prompts_openrouter_coding_agent_heavy_planning: textToPrompts(codingHeavyPrompts),
        starter_prompts_openrouter_coding_agent_coding_alternative: textToPrompts(codingAlternativePrompts),
        starter_prompts_dtf_news_agent: textToPrompts(dtfPrompts),
      },
      {
        onSuccess: () => {
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
            <h2 className="text-lg font-semibold">Глобальные настройки</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Здесь можно менять курс доллара и контакты, которые видит пользователь при нехватке баланса.
            </p>
          </div>

          {settingsLoading ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : (
            <div className="space-y-5">
              <div className="max-w-xs">
                <label className="mb-1 block text-sm font-medium">Курс USD к RUB</label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={rateInput}
                  onChange={(e) => setRateInput(e.target.value)}
                  placeholder="81.3"
                />
              </div>

              <div className="grid gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium">Сообщение при нехватке баланса</label>
                  <Input
                    value={topupMessage}
                    onChange={(e) => setTopupMessage(e.target.value)}
                    placeholder="У вас не осталось баланса..."
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium">Telegram</label>
                    <Input
                      value={topupTelegram}
                      onChange={(e) => setTopupTelegram(e.target.value)}
                      placeholder="@WizardJIOCb"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Email</label>
                    <Input
                      value={topupEmail}
                      onChange={(e) => setTopupEmail(e.target.value)}
                      placeholder="rodion89@list.ru"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Телефон</label>
                    <Input
                      value={topupPhone}
                      onChange={(e) => setTopupPhone(e.target.value)}
                      placeholder="89264769929"
                    />
                  </div>
                </div>

                <div className="rounded-xl border bg-muted/20 p-4 space-y-4">
                  <div>
                    <p className="text-sm font-medium">Юридическая информация для публичных страниц и YooKassa</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Эти данные выводятся на страницах оферты, контактов и пополнения. Заполните их реальными реквизитами продавца.
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium">Продавец / ФИО / название</label>
                      <Input
                        value={legalBusinessName}
                        onChange={(e) => setLegalBusinessName(e.target.value)}
                        placeholder="Иван Иванов"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">Статус</label>
                      <Input
                        value={legalBusinessStatus}
                        onChange={(e) => setLegalBusinessStatus(e.target.value)}
                        placeholder="самозанятый / ИП / ООО"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">ИНН</label>
                      <Input
                        value={legalInn}
                        onChange={(e) => setLegalInn(e.target.value)}
                        placeholder="123456789012"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">ОГРН / ОГРНИП</label>
                      <Input
                        value={legalOgrn}
                        onChange={(e) => setLegalOgrn(e.target.value)}
                        placeholder="если есть"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium">Адрес / место ведения деятельности</label>
                    <Textarea
                      value={legalAddress}
                      onChange={(e) => setLegalAddress(e.target.value)}
                      rows={3}
                      placeholder="Город, страна, почтовый адрес или адрес для связи"
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium">Email поддержки</label>
                      <Input
                        value={legalSupportEmail}
                        onChange={(e) => setLegalSupportEmail(e.target.value)}
                        placeholder="support@llmstore.pro"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">Телефон поддержки</label>
                      <Input
                        value={legalSupportPhone}
                        onChange={(e) => setLegalSupportPhone(e.target.value)}
                        placeholder="+7 900 000-00-00"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">Telegram поддержки</label>
                      <Input
                        value={legalSupportTelegram}
                        onChange={(e) => setLegalSupportTelegram(e.target.value)}
                        placeholder="@llmstore"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border bg-muted/20 p-4 space-y-4">
                  <div>
                    <p className="text-sm font-medium">Стартовые промпты встроенных агентов</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Один промпт с новой строки. Эти значения используются в чатах, playground и шаблонах конструктора.
                    </p>
                  </div>

                  <div className="grid gap-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium">OpenRouter Coding Agent</label>
                      <Textarea value={codingPrompts} onChange={(e) => setCodingPrompts(e.target.value)} rows={4} />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">OpenRouter Coding Agent Fast</label>
                      <Textarea value={codingFastPrompts} onChange={(e) => setCodingFastPrompts(e.target.value)} rows={4} />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">OpenRouter Coding Agent Heavy Planning</label>
                      <Textarea value={codingHeavyPrompts} onChange={(e) => setCodingHeavyPrompts(e.target.value)} rows={4} />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">OpenRouter Coding Agent Coding Alternative</label>
                      <Textarea value={codingAlternativePrompts} onChange={(e) => setCodingAlternativePrompts(e.target.value)} rows={4} />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">DTF News Agent</label>
                      <Textarea value={dtfPrompts} onChange={(e) => setDtfPrompts(e.target.value)} rows={4} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button onClick={handleSaveSettings} disabled={updateSettingsMutation.isPending}>
                  {updateSettingsMutation.isPending ? 'Сохраняю...' : 'Сохранить настройки'}
                </Button>
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
                            <div className="text-xs text-muted-foreground"><UserLink username={user.username} name={null} className="hover:text-primary hover:underline" /></div>
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
              <p className="mb-4 text-xs text-muted-foreground"><UserLink username={balanceModal.username} name={null} className="hover:text-primary hover:underline" /></p>
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

