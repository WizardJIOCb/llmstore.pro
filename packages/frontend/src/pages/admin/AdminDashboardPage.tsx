import { AdminLayout } from '../../components/admin/AdminLayout';
import { Spinner } from '../../components/ui/Spinner';
import { useAdminDashboardStats } from '../../hooks/useAdmin';

function formatUsd(value: number, digits = 4) {
  return `$${value.toFixed(digits)}`;
}

function formatInt(value: number) {
  return value.toLocaleString('ru-RU');
}

function formatNumber(value: number, digits = 4) {
  return value.toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function formatOptionalUsd(value: number | null, digits = 4) {
  return value === null ? '—' : formatUsd(value, digits);
}

function formatOptionalNumber(value: number | null, digits = 4) {
  return value === null ? '—' : formatNumber(value, digits);
}

function formatDateTime(value: string | null) {
  if (!value) return '—';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleString('ru-RU');
}

export function AdminDashboardPage() {
  const { data, isLoading } = useAdminDashboardStats();

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      </AdminLayout>
    );
  }

  if (!data) {
    return (
      <AdminLayout>
        <div className="py-16 text-center text-muted-foreground">Статистика недоступна</div>
      </AdminLayout>
    );
  }

  const stats = data;
  const openrouter = stats.openrouter;
  const openrouterBalance = openrouter.credits.remaining_credits ?? openrouter.key?.limit_remaining ?? null;
  const openrouterBalanceHint = openrouter.credits.is_available
    ? 'Остаток по /credits'
    : openrouter.key?.limit_remaining != null
      ? 'Остаток лимита по ключу'
      : 'Нет данных по остатку';

  return (
    <AdminLayout>
      <div className="space-y-6">
        <section className="rounded-lg border">
          <div className="border-b px-4 py-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="font-semibold">OpenRouter</h3>
                <p className="text-sm text-muted-foreground">
                  Последнее обновление: {formatDateTime(openrouter.fetched_at)}
                </p>
              </div>
              <p className={`text-sm font-medium ${openrouter.available ? 'text-emerald-600' : 'text-red-600'}`}>
                {openrouter.available ? 'Подключено' : 'Недоступно'}
              </p>
            </div>
          </div>

          <div className="space-y-4 p-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                label="Баланс OpenRouter"
                value={formatOptionalUsd(openrouterBalance)}
                hint={openrouterBalanceHint}
              />
              <MetricCard
                label="Лимит ключа"
                value={formatOptionalUsd(openrouter.key?.limit ?? null)}
                hint={`Остаток: ${formatOptionalUsd(openrouter.key?.limit_remaining ?? null)}`}
              />
              <MetricCard
                label="Расход за месяц"
                value={formatOptionalUsd(openrouter.credits.total_usage ?? openrouter.key?.usage_monthly ?? null)}
                hint={openrouter.credits.is_available ? 'Источник: /credits' : 'Источник: /key usage_monthly'}
              />
              <MetricCard
                label="Имя ключа"
                value={openrouter.key?.label ?? '—'}
                hint={openrouter.key?.is_management_key ? 'Management key' : 'Обычный API key'}
              />
            </div>

            {openrouter.error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {openrouter.error}
              </div>
            )}

            {!openrouter.error && (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border p-4">
                  <h4 className="font-medium">Профиль ключа</h4>
                  <div className="mt-3 space-y-2 text-sm">
                    <DetailRow label="Label" value={openrouter.key?.label ?? '—'} />
                    <DetailRow label="Free tier" value={openrouter.key?.is_free_tier ? 'Да' : 'Нет'} />
                    <DetailRow label="Management key" value={openrouter.key?.is_management_key ? 'Да' : 'Нет'} />
                    <DetailRow label="Provisioning key" value={openrouter.key?.is_provisioning_key ? 'Да' : 'Нет'} />
                    <DetailRow label="Сброс лимита" value={openrouter.key?.limit_reset ?? '—'} />
                    <DetailRow label="Истекает" value={formatDateTime(openrouter.key?.expires_at ?? null)} />
                  </div>
                </div>

                <div className="rounded-lg border p-4">
                  <h4 className="font-medium">Usage</h4>
                  <div className="mt-3 space-y-2 text-sm">
                    <DetailRow label="Всего" value={formatOptionalUsd(openrouter.key?.usage ?? null)} />
                    <DetailRow label="Сегодня" value={formatOptionalUsd(openrouter.key?.usage_daily ?? null)} />
                    <DetailRow label="Неделя" value={formatOptionalUsd(openrouter.key?.usage_weekly ?? null)} />
                    <DetailRow label="Месяц" value={formatOptionalUsd(openrouter.key?.usage_monthly ?? null)} />
                    <DetailRow label="BYOK месяц" value={formatOptionalUsd(openrouter.key?.byok_usage_monthly ?? null)} />
                    <DetailRow
                      label="BYOK в лимите"
                      value={openrouter.key?.include_byok_in_limit ? 'Да' : 'Нет'}
                    />
                  </div>
                </div>
              </div>
            )}

            {!openrouter.credits.is_available && !openrouter.error && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {openrouter.credits.error ?? 'Эндпоинт credits недоступен для текущего OpenRouter ключа'}
              </div>
            )}

            {openrouter.credits.is_available && (
              <div className="rounded-lg border p-4">
                <h4 className="font-medium">Баланс аккаунта</h4>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <DetailStat label="Всего кредитов" value={formatOptionalNumber(openrouter.credits.total_credits)} />
                  <DetailStat label="Израсходовано" value={formatOptionalNumber(openrouter.credits.total_usage)} />
                  <DetailStat label="Осталось" value={formatOptionalNumber(openrouter.credits.remaining_credits)} />
                </div>
              </div>
            )}
          </div>
        </section>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Пользователи" value={formatInt(stats.totals.users)} hint={`Активных: ${formatInt(stats.totals.active_users)}`} />
          <MetricCard label="Всего чатов" value={formatInt(stats.totals.chats)} hint={`Общение: ${formatInt(stats.totals.chats_general)}, Агент: ${formatInt(stats.totals.chats_agent)}`} />
          <MetricCard label="Токены (все чаты)" value={formatInt(stats.totals.total_tokens)} hint={`Prompt: ${formatInt(stats.totals.prompt_tokens)}, Completion: ${formatInt(stats.totals.completion_tokens)}`} />
          <MetricCard label="Расход чатов" value={formatUsd(stats.totals.chat_cost_usd)} hint={`За всё время: ${formatUsd(stats.totals.chat_cost_usd)}`} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Общий баланс пользователей" value={formatUsd(stats.totals.users_balance_usd)} hint="Сумма всех балансов" />
          <MetricCard label="Запусков агентов" value={formatInt(stats.totals.runs)} hint={`Агентов создано: ${formatInt(stats.totals.agents)}`} />
          <MetricCard label="Сообщений в чатах" value={formatInt(stats.totals.chat_messages)} hint={`В среднем на чат: ${stats.derived.avg_messages_per_chat}`} />
          <MetricCard label="Средний чек чата" value={formatUsd(stats.derived.avg_cost_per_chat_usd)} hint={`Средние токены/сообщение: ${stats.derived.avg_tokens_per_message}`} />
        </div>

        <section className="rounded-lg border">
          <div className="border-b px-4 py-3">
            <h3 className="font-semibold">Топ моделей по расходам</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Модель</th>
                  <th className="px-4 py-2 text-right font-medium">Сообщений</th>
                  <th className="px-4 py-2 text-right font-medium">Токенов</th>
                  <th className="px-4 py-2 text-right font-medium">USD</th>
                </tr>
              </thead>
              <tbody>
                {stats.by_model.slice(0, 10).map((row) => (
                  <tr key={row.model} className="border-b">
                    <td className="px-4 py-2">{row.model}</td>
                    <td className="px-4 py-2 text-right">{formatInt(row.messages)}</td>
                    <td className="px-4 py-2 text-right">{formatInt(row.total_tokens)}</td>
                    <td className="px-4 py-2 text-right">{formatUsd(row.usd_cost)}</td>
                  </tr>
                ))}
                {stats.by_model.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                      Данных пока нет
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border">
          <div className="border-b px-4 py-3">
            <h3 className="font-semibold">Топ чатов по расходам</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Чат</th>
                  <th className="px-4 py-2 text-left font-medium">Режим</th>
                  <th className="px-4 py-2 text-right font-medium">Сообщений</th>
                  <th className="px-4 py-2 text-right font-medium">USD</th>
                </tr>
              </thead>
              <tbody>
                {stats.top_expensive_chats.map((row) => (
                  <tr key={row.id} className="border-b">
                    <td className="px-4 py-2">{row.title}</td>
                    <td className="px-4 py-2">{row.mode === 'general' ? 'Общение' : 'Агент'}</td>
                    <td className="px-4 py-2 text-right">{formatInt(row.message_count)}</td>
                    <td className="px-4 py-2 text-right">{formatUsd(row.usd_cost)}</td>
                  </tr>
                ))}
                {stats.top_expensive_chats.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                      Данных пока нет
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold break-words">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b pb-2 last:border-b-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
