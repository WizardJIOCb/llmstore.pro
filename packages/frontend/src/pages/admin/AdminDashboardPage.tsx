import { AdminLayout } from '../../components/admin/AdminLayout';
import { Spinner } from '../../components/ui/Spinner';
import { useAdminDashboardStats } from '../../hooks/useAdmin';

function formatUsd(value: number) {
  return `$${value.toFixed(4)}`;
}

function formatInt(value: number) {
  return value.toLocaleString('ru-RU');
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

  return (
    <AdminLayout>
      <div className="space-y-6">
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
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
