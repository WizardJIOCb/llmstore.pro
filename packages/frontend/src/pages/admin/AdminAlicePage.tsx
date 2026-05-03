import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Spinner } from '../../components/ui/Spinner';
import { useAdminAliceLogs } from '../../hooks/useAdmin';
import { cn } from '../../lib/utils';

const STATUS_OPTIONS = [
  { value: 'all', label: 'Все статусы' },
  { value: 'success', label: 'Успешные' },
  { value: 'ping_pong', label: 'Ping/Pong' },
  { value: 'error', label: 'С ошибкой' },
] as const;

type AliceLogStatus = 'success' | 'error';
type AliceLogDisplayStatus = AliceLogStatus | 'ping_pong';

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
    second: '2-digit',
  });
}

function formatJson(value: unknown) {
  if (value == null) return 'null';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function isPingPongLog(item: {
  status: AliceLogStatus;
  response_status_code: number;
  command: string | null;
  original_utterance: string | null;
  response_text: string | null;
}) {
  const command = (item.command || item.original_utterance || '').trim().toLowerCase();
  const response = (item.response_text || '').trim().toLowerCase();
  return item.status === 'success' && item.response_status_code === 200 && command === 'ping' && response === 'pong';
}

function getDisplayStatus(item: Parameters<typeof isPingPongLog>[0]): AliceLogDisplayStatus {
  return isPingPongLog(item) ? 'ping_pong' : item.status;
}

function statusTone(status: AliceLogDisplayStatus) {
  if (status === 'ping_pong') return 'bg-sky-100 text-sky-700';
  return status === 'success'
    ? 'bg-emerald-100 text-emerald-700'
    : 'bg-rose-100 text-rose-700';
}

function statusLabel(status: AliceLogDisplayStatus) {
  if (status === 'ping_pong') return 'Ping/Pong';
  return status === 'success' ? 'Успешно' : 'Ошибка';
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-background px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-sm text-foreground">{value || '—'}</div>
    </div>
  );
}

export function AdminAlicePage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]['value']>('all');
  const [page, setPage] = useState(1);

  const query = useMemo(() => ({
    page,
    per_page: 20,
    search: search.trim() || undefined,
    status,
  }), [page, search, status]);

  const { data, isLoading, isFetching } = useAdminAliceLogs(query);

  const items = data?.data ?? [];
  const meta = data?.meta;
  const totalPages = meta?.total_pages ?? 1;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid gap-3 md:grid-cols-[minmax(280px,360px)_180px]">
            <Input
              value={search}
              onChange={(event) => {
                setPage(1);
                setSearch(event.target.value);
              }}
              placeholder="Поиск по фразе, skill user id, email, session id..."
            />
            <select
              value={status}
              onChange={(event) => {
                setPage(1);
                setStatus(event.target.value as typeof status);
              }}
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
            Всего: {isFetching && !isLoading ? 'обновляем…' : meta?.total ?? 0}
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
              По текущим фильтрам логов Алисы не найдено.
            </CardContent>
          </Card>
        ) : null}

        <div className="space-y-4">
          {items.map((item) => {
            const displayStatus = getDisplayStatus(item);

            return (
            <Card key={item.id}>
              <CardContent className="space-y-4 pt-6">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-medium', statusTone(displayStatus))}>
                        {statusLabel(displayStatus)}
                      </span>
                      <span className="text-xs text-slate-500">
                        HTTP {item.response_status_code}
                      </span>
                      <span className="text-xs text-slate-500">
                        {formatDateTime(item.created_at)}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <p className="text-sm font-medium text-slate-950">
                        {item.command || item.original_utterance || '(пустой запуск)'}
                      </p>
                      <p className="text-sm text-slate-600">
                        Ответ: {item.response_text || item.error_message || '—'}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                      <span>skill user: {item.yandex_skill_user_id || '—'}</span>
                      <span>session: {item.session_id || '—'}</span>
                      <span>message: {item.message_id ?? '—'}</span>
                      <span>duration: {item.duration_ms != null ? `${item.duration_ms} ms` : '—'}</span>
                    </div>
                  </div>

                  <div className="shrink-0 text-right text-xs text-slate-500">
                    {item.user ? (
                      <div className="space-y-1">
                        <div>{item.user.name || item.user.username || item.user.email || item.user.id}</div>
                        <div>{item.user.email || item.user.id}</div>
                      </div>
                    ) : (
                      <div>Пользователь не связан</div>
                    )}
                    {item.chat ? (
                      <div className="mt-2">
                        <Link to={`/chats?admin_chat_id=${item.chat.id}`} className="text-primary hover:underline">
                          Открыть чат
                        </Link>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
                  <DetailRow label="Application ID" value={item.yandex_application_id} />
                  <DetailRow label="Request type" value={item.request_type} />
                  <DetailRow label="IP" value={item.ip_address} />
                  <DetailRow label="Размер ответа" value={item.response_size_bytes != null ? `${item.response_size_bytes} B` : '—'} />
                  <DetailRow label="Новый пользователь" value={item.is_new_user == null ? '—' : item.is_new_user ? 'Да' : 'Нет'} />
                  <DetailRow label="Стартовый бонус" value={item.bonus_granted == null ? '—' : item.bonus_granted ? 'Да' : 'Нет'} />
                  <DetailRow label="Request ID" value={item.request_id} />
                  <DetailRow label="User-Agent" value={item.user_agent} />
                </div>

                {item.error_message ? (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    <span className="font-medium">{item.error_code || 'Ошибка'}:</span> {item.error_message}
                  </div>
                ) : null}

                <details className="rounded-lg border">
                  <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-900">
                    Полные данные запроса и ответа
                  </summary>
                  <div className="grid gap-4 border-t p-4 xl:grid-cols-2">
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-slate-900">request_json</div>
                      <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950 p-4 text-xs text-slate-100">
                        {formatJson(item.request_json)}
                      </pre>
                    </div>
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-slate-900">response_json</div>
                      <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950 p-4 text-xs text-slate-100">
                        {formatJson(item.response_json)}
                      </pre>
                    </div>
                  </div>
                </details>
              </CardContent>
            </Card>
            );
          })}
        </div>

        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            Страница {meta?.page ?? 1} из {totalPages}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
              Назад
            </Button>
            <Button type="button" variant="outline" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>
              Дальше
            </Button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
