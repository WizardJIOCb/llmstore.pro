import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Spinner } from '../../components/ui/Spinner';
import { useAdminRuntimes, useStartAdminRuntime, useStopAdminRuntime } from '../../hooks/useAdmin';
import { cn, formatUsd } from '../../lib/utils';

const STATUS_OPTIONS = [
  { value: 'all', label: 'Все статусы' },
  { value: 'running', label: 'Running' },
  { value: 'deploying', label: 'Deploying' },
  { value: 'stopped', label: 'Stopped' },
  { value: 'failed', label: 'Failed' },
] as const;

function formatDateTime(value: string | null) {
  if (!value) return '—';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatInt(value: number) {
  return value.toLocaleString('ru-RU');
}

function getStatusTone(status: string) {
  switch (status) {
    case 'running':
      return 'bg-emerald-100 text-emerald-700';
    case 'deploying':
      return 'bg-amber-100 text-amber-700';
    case 'failed':
      return 'bg-rose-100 text-rose-700';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case 'running':
      return 'Running';
    case 'deploying':
      return 'Deploying';
    case 'failed':
      return 'Failed';
    case 'stopped':
      return 'Stopped';
    default:
      return status;
  }
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

export function AdminRuntimesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]['value']>('all');
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  const query = useMemo(() => ({
    search: search.trim() || undefined,
    status,
  }), [search, status]);

  const { data, isLoading, isFetching } = useAdminRuntimes(query);
  const startRuntimeMutation = useStartAdminRuntime();
  const stopRuntimeMutation = useStopAdminRuntime();

  const items = data?.data ?? [];
  const total = data?.meta.total ?? 0;

  const handleOpenChat = (conversationId: string) => {
    navigate(`/chats?admin_chat_id=${conversationId}`);
  };

  const handleStart = async (runtimeId: string) => {
    setPendingActionId(runtimeId);
    try {
      await startRuntimeMutation.mutateAsync(runtimeId);
    } finally {
      setPendingActionId(null);
    }
  };

  const handleStop = async (runtimeId: string) => {
    setPendingActionId(runtimeId);
    try {
      await stopRuntimeMutation.mutateAsync(runtimeId);
    } finally {
      setPendingActionId(null);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid gap-3 md:grid-cols-[minmax(280px,320px)_180px]">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск по runtime, чату, email, агенту..."
            />
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as typeof status)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="text-sm text-muted-foreground">
            Всего: {isFetching && !isLoading ? 'обновляем…' : total}
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : null}

        {!isLoading && items.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              По текущим фильтрам ничего не найдено.
            </CardContent>
          </Card>
        ) : null}

        <div className="space-y-4">
          {items.map((item) => {
            const ownerLabel = item.owner_name || item.owner_username || item.owner_email;
            const isBusy = pendingActionId === item.id;

            return (
              <Card key={item.id}>
                <CardContent className="space-y-4 pt-6">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2">
                          <span className={cn('inline-block h-2.5 w-2.5 rounded-full', item.status === 'running' ? 'bg-emerald-400' : item.status === 'failed' ? 'bg-rose-400' : item.status === 'deploying' ? 'bg-amber-400' : 'bg-slate-300')} />
                          <h3 className="text-xl font-semibold text-foreground">{item.title}</h3>
                        </div>
                        <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-medium', getStatusTone(item.status))}>
                          {getStatusLabel(item.status)}
                        </span>
                      </div>

                      <div className="space-y-1.5 text-sm text-muted-foreground">
                        <p>Owner: {ownerLabel}</p>
                        <p>Runtime: {item.runtime}, entrypoint: {item.entrypoint ?? '—'}</p>
                        <p>Chat: {item.chat_title}</p>
                        <p>Linked agent: {item.linked_agent_name ?? '—'}</p>
                        <p>Model: {item.runtime_model_external_id ?? '-'}</p>
                        <p className="break-all">Webhook URL: {item.webhook_url}</p>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button type="button" variant="outline" onClick={() => handleOpenChat(item.conversation_id)}>
                        Открыть чат
                      </Button>
                      {item.status === 'running' || item.status === 'deploying' ? (
                        <Button type="button" variant="outline" disabled={isBusy} onClick={() => void handleStop(item.id)}>
                          {isBusy ? 'Останавливаю…' : 'Остановить'}
                        </Button>
                      ) : (
                        <Button type="button" variant="outline" disabled={isBusy} onClick={() => void handleStart(item.id)}>
                          {isBusy ? 'Запускаю…' : 'Запустить'}
                        </Button>
                      )}
                    </div>
                  </div>

                  {item.last_error ? (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      {item.last_error}
                    </div>
                  ) : null}

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <MetricCell label="Запросов" value={formatInt(item.run_stats.total_runs)} />
                    <MetricCell label="Токенов" value={formatInt(item.run_stats.total_tokens)} />
                    <MetricCell label="Стоимость" value={formatUsd(item.run_stats.total_cost_usd, { minimumFractionDigits: 4, maximumFractionDigits: 4 })} />
                    <MetricCell label="В рублях" value={`${item.run_stats.total_cost_rub.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`} />
                    <MetricCell label="Успешно" value={formatInt(item.run_stats.completed_runs)} />
                    <MetricCell label="Ошибок" value={formatInt(item.run_stats.failed_runs)} />
                    <MetricCell label="Обновлён" value={formatDateTime(item.updated_at)} />
                    <MetricCell label="Последний запуск" value={formatDateTime(item.run_stats.last_run_at)} />
                  </div>

                  <details className="rounded-lg border">
                    <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                      Логи runtime
                    </summary>
                    <div className="border-t px-4 py-4">
                      <div className="grid gap-3 lg:grid-cols-2">
                        <div className="rounded-lg border bg-slate-950 p-3">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">stdout</p>
                          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs text-slate-100">
                            {item.live_stdout || 'Нет stdout-логов'}
                          </pre>
                        </div>
                        <div className="rounded-lg border bg-slate-950 p-3">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">stderr</p>
                          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs text-slate-100">
                            {item.live_stderr || 'Нет stderr-логов'}
                          </pre>
                        </div>
                      </div>
                    </div>
                  </details>

                  <details className="rounded-lg border">
                    <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                      Последние запросы
                    </summary>
                    <div className="border-t px-4 py-4">
                      {item.recent_runs.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Запусков пока нет.</p>
                      ) : (
                        <div className="space-y-3">
                          {item.recent_runs.map((run) => (
                            <div key={run.id} className="rounded-lg border bg-muted/20 p-4">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-medium text-foreground">{formatDateTime(run.started_at)}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {run.status} · {run.latency_ms != null ? `${run.latency_ms} ms` : 'без latency'} · {formatInt(run.total_tokens)} токенов
                                  </p>
                                </div>
                                <p className="text-sm font-medium text-foreground">
                                  {formatUsd(run.estimated_cost_usd, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                                </p>
                              </div>
                              {run.input_summary ? (
                                <p className="mt-3 text-sm text-foreground">
                                  <span className="font-medium">Input:</span> {run.input_summary}
                                </p>
                              ) : null}
                              {run.output_summary ? (
                                <p className="mt-2 text-sm text-foreground">
                                  <span className="font-medium">Output:</span> {run.output_summary}
                                </p>
                              ) : null}
                              {run.error_message ? (
                                <p className="mt-2 text-sm text-rose-700">
                                  <span className="font-medium">Ошибка:</span> {run.error_message}
                                </p>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </details>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </AdminLayout>
  );
}
