import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Spinner } from '../../components/ui/Spinner';
import { useAdminDebugChat, useAdminDebugChats } from '../../hooks/useAdmin';
import type { AdminDebugChatDetail, AdminDebugChatMessage, AdminDebugRun, AdminDebugRunMessage, AdminDebugToolCall } from '../../lib/api/admin';
import { cn, formatUsd } from '../../lib/utils';

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

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function extractUsageStats(usage: Record<string, unknown> | null) {
  const promptTokens = toNumber(usage?.prompt_tokens);
  const completionTokens = toNumber(usage?.completion_tokens);
  const totalTokens = toNumber(usage?.total_tokens);
  const estimatedCost = typeof usage?.estimated_cost === 'string'
    ? Number(usage.estimated_cost)
    : toNumber(usage?.estimated_cost);

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedCost: estimatedCost != null && Number.isFinite(estimatedCost) ? estimatedCost : null,
    model: typeof usage?.model === 'string' ? usage.model : null,
  };
}

function getRoleLabel(role: string) {
  switch (role) {
    case 'user':
      return 'Пользователь';
    case 'assistant':
      return 'Ассистент';
    case 'system':
      return 'System';
    case 'tool':
      return 'Tool';
    default:
      return role;
  }
}

function getRoleTone(role: string) {
  switch (role) {
    case 'user':
      return 'bg-sky-100 text-sky-700';
    case 'assistant':
      return 'bg-emerald-100 text-emerald-700';
    case 'system':
      return 'bg-amber-100 text-amber-700';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

function getRunStatusTone(status: string) {
  switch (status) {
    case 'completed':
      return 'bg-emerald-100 text-emerald-700';
    case 'failed':
      return 'bg-rose-100 text-rose-700';
    case 'running':
      return 'bg-sky-100 text-sky-700';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

function DebugJsonBlock({ title, value, defaultOpen = false }: { title: string; value: unknown; defaultOpen?: boolean }) {
  return (
    <details className="rounded-lg border" open={defaultOpen}>
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-900">
        {title}
      </summary>
      <div className="border-t bg-slate-950 px-4 py-4">
        <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words text-xs text-slate-100">
          {formatJson(value)}
        </pre>
      </div>
    </details>
  );
}

function RunMessageCard({ item }: { item: AdminDebugRunMessage }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-medium', getRoleTone(item.role))}>
            {getRoleLabel(item.role)}
          </span>
          {item.token_estimate != null ? (
            <span className="text-xs text-slate-500">~{item.token_estimate} tok</span>
          ) : null}
        </div>
        <span className="text-xs text-slate-500">{formatDateTime(item.created_at)}</span>
      </div>
      {item.content_text ? (
        <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-xs text-slate-800">
          {item.content_text}
        </pre>
      ) : null}
      {item.content_json ? <DebugJsonBlock title="content_json" value={item.content_json} /> : null}
    </div>
  );
}

function ToolCallCard({ item }: { item: AdminDebugToolCall }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-950">{item.tool_name}</span>
            <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-medium', getRunStatusTone(item.status))}>
              {item.status}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            call_id: {item.tool_call_id}
            {item.duration_ms != null ? ` • ${item.duration_ms} ms` : ''}
            {item.created_at ? ` • ${formatDateTime(item.created_at)}` : ''}
          </p>
        </div>
      </div>
      {item.error_message ? (
        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {item.error_message}
        </div>
      ) : null}
      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <DebugJsonBlock title="tool_input" value={item.tool_input} defaultOpen />
        <DebugJsonBlock title="tool_output" value={item.tool_output} />
      </div>
    </div>
  );
}

function RunCard({ run }: { run: AdminDebugRun }) {
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-950">Run {run.id}</span>
            <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-medium', getRunStatusTone(run.status))}>
              {run.status}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            {run.mode} • {run.model_external_id || run.model_id || 'model unknown'} • {run.provider_name || 'provider unknown'}
          </p>
          <p className="text-xs text-slate-500">
            started {formatDateTime(run.started_at)}
            {run.completed_at ? ` • completed ${formatDateTime(run.completed_at)}` : ''}
            {run.latency_ms != null ? ` • ${run.latency_ms} ms` : ''}
          </p>
        </div>
        <div className="text-right text-xs text-slate-500">
          {run.trace_id ? <p>trace_id: {run.trace_id}</p> : null}
          {run.external_generation_id ? <p>generation_id: {run.external_generation_id}</p> : null}
          {run.external_response_id ? <p>response_id: {run.external_response_id}</p> : null}
        </div>
      </div>

      {run.input_summary ? (
        <div className="rounded-lg border bg-white px-3 py-2 text-sm text-slate-800">
          <span className="font-medium">Input:</span> {run.input_summary}
        </div>
      ) : null}
      {run.output_summary ? (
        <div className="rounded-lg border bg-white px-3 py-2 text-sm text-slate-800">
          <span className="font-medium">Output:</span> {run.output_summary}
        </div>
      ) : null}
      {run.error_message ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <span className="font-medium">Ошибка:</span> {run.error_message}
        </div>
      ) : null}

      {run.run_messages.length > 0 ? (
        <details className="rounded-lg border bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
            Run messages ({run.run_messages.length})
          </summary>
          <div className="space-y-3 border-t px-4 py-4">
            {run.run_messages.map((item) => (
              <RunMessageCard key={item.id} item={item} />
            ))}
          </div>
        </details>
      ) : null}

      {run.tool_calls.length > 0 ? (
        <details className="rounded-lg border bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
            Tool calls ({run.tool_calls.length})
          </summary>
          <div className="space-y-3 border-t px-4 py-4">
            {run.tool_calls.map((item) => (
              <ToolCallCard key={item.id} item={item} />
            ))}
          </div>
        </details>
      ) : null}

      {run.final_output ? <DebugJsonBlock title="final_output" value={run.final_output} /> : null}
      {run.final_output_json ? <DebugJsonBlock title="final_output_json" value={run.final_output_json} /> : null}
    </div>
  );
}

function MessageCard({ message }: { message: AdminDebugChatMessage }) {
  const usage = extractUsageStats(message.usage_json);
  const hasPreview = Boolean((message.usage_json?.coding_report as Record<string, unknown> | undefined)?.preview);

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-medium', getRoleTone(message.role))}>
                {getRoleLabel(message.role)}
              </span>
              {message.run_id ? (
                <span className="text-xs text-slate-500">run_id: {message.run_id}</span>
              ) : null}
              {hasPreview ? (
                <span className="inline-flex rounded-full bg-violet-100 px-2.5 py-1 text-xs font-medium text-violet-700">
                  preview
                </span>
              ) : null}
            </div>
            <p className="text-xs text-slate-500">
              {formatDateTime(message.created_at)}
              {message.latency_ms != null ? ` • ${message.latency_ms} ms` : ''}
            </p>
          </div>
          <div className="text-right text-xs text-slate-500">
            {usage.model ? <p>{usage.model}</p> : null}
            {usage.totalTokens != null ? <p>{usage.totalTokens.toLocaleString('ru-RU')} токенов</p> : null}
            {usage.estimatedCost != null ? (
              <p>{formatUsd(usage.estimatedCost, { minimumFractionDigits: 4, maximumFractionDigits: 6 })}</p>
            ) : null}
            {(message.preview_view_count > 0 || message.project_run_count > 0) ? (
              <p>preview: {message.preview_view_count} • runs: {message.project_run_count}</p>
            ) : null}
          </div>
        </div>

        <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
          {message.content_text}
        </pre>

        {message.usage_json ? <DebugJsonBlock title="usage_json" value={message.usage_json} /> : null}
        {message.run ? <RunCard run={message.run} /> : null}
      </CardContent>
    </Card>
  );
}

function ConversationPanel({ detail }: { detail: AdminDebugChatDetail }) {
  const navigate = useNavigate();
  const { conversation, messages } = detail;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-semibold text-slate-950">{conversation.title}</h2>
                <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                  {conversation.mode}
                </span>
                <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                  {conversation.access}
                </span>
              </div>
              <div className="space-y-1 text-sm text-slate-600">
                <p>ID: {conversation.id}</p>
                <p>Owner: {conversation.owner.name || conversation.owner.username || conversation.owner.email}</p>
                <p>Agent: {conversation.agent?.name || '—'}</p>
                <p>Model: {conversation.model_external_id || '—'}</p>
                {conversation.share_token ? <p>Share token: {conversation.share_token}</p> : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => navigate(`/chats?admin_chat_id=${conversation.id}`)}>
                Открыть чат
              </Button>
              {conversation.share_token ? (
                <Link
                  to={`/shared/chats/${conversation.share_token}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  Shared
                </Link>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border bg-white px-4 py-3">
              <p className="text-xs text-slate-500">Сообщений</p>
              <p className="mt-1 text-sm font-medium text-slate-950">{conversation.message_count}</p>
            </div>
            <div className="rounded-lg border bg-white px-4 py-3">
              <p className="text-xs text-slate-500">Пользователь</p>
              <p className="mt-1 text-sm font-medium text-slate-950">{conversation.user_message_count}</p>
            </div>
            <div className="rounded-lg border bg-white px-4 py-3">
              <p className="text-xs text-slate-500">Ассистент</p>
              <p className="mt-1 text-sm font-medium text-slate-950">{conversation.assistant_message_count}</p>
            </div>
            <div className="rounded-lg border bg-white px-4 py-3">
              <p className="text-xs text-slate-500">Просмотры</p>
              <p className="mt-1 text-sm font-medium text-slate-950">
                {conversation.total_view_count} / {conversation.unique_view_count} уник.
              </p>
            </div>
          </div>

          {conversation.system_prompt ? <DebugJsonBlock title="system_prompt" value={conversation.system_prompt} /> : null}
          {conversation.settings_json ? <DebugJsonBlock title="settings_json" value={conversation.settings_json} /> : null}
        </CardContent>
      </Card>

      <div className="space-y-4">
        {messages.map((message) => (
          <MessageCard key={message.id} message={message} />
        ))}
      </div>
    </div>
  );
}

export function AdminDebugPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [input, setInput] = useState(searchParams.get('q') ?? '');
  const queryText = (searchParams.get('q') ?? '').trim();
  const selectedChatId = searchParams.get('chat') ?? '';

  useEffect(() => {
    setInput(searchParams.get('q') ?? '');
  }, [searchParams]);

  const searchQuery = useMemo(() => ({
    query: queryText,
    limit: 20,
  }), [queryText]);

  const searchEnabled = queryText.length > 0;
  const { data: matches = [], isLoading: isSearchLoading, isFetching: isSearchFetching } = useAdminDebugChats(searchQuery, searchEnabled);
  const { data: detail, isLoading: isDetailLoading } = useAdminDebugChat(selectedChatId, Boolean(selectedChatId));

  useEffect(() => {
    if (!queryText || selectedChatId || matches.length !== 1) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('q', queryText);
      next.set('chat', matches[0].id);
      return next;
    }, { replace: true });
  }, [matches, queryText, selectedChatId, setSearchParams]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const nextQuery = input.trim();
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (nextQuery) {
        next.set('q', nextQuery);
      } else {
        next.delete('q');
      }
      next.delete('chat');
      return next;
    });
  };

  const handleSelectChat = (chatId: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (queryText) next.set('q', queryText);
      next.set('chat', chatId);
      return next;
    });
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <Card>
          <CardContent className="pt-6">
            <form className="flex flex-col gap-3 lg:flex-row" onSubmit={handleSubmit}>
              <Input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Вставь ссылку на чат, UUID, share token или название чата"
              />
              <Button type="submit">Найти</Button>
            </form>
            <p className="mt-3 text-sm text-slate-500">
              Поддерживаются ссылки вида <span className="font-mono">/chats?chat=...</span>, <span className="font-mono">/shared/chats/...</span>, UUID чата и обычный поиск по названию.
            </p>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-4">
            <Card>
              <CardContent className="pt-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-slate-950">Совпадения</h2>
                  <span className="text-sm text-slate-500">
                    {isSearchFetching && !isSearchLoading ? 'обновляем…' : matches.length}
                  </span>
                </div>

                {!searchEnabled ? (
                  <p className="text-sm text-slate-500">Введи ссылку, UUID или название чата.</p>
                ) : null}

                {isSearchLoading ? (
                  <div className="flex justify-center py-8">
                    <Spinner size="lg" />
                  </div>
                ) : null}

                {searchEnabled && !isSearchLoading && matches.length === 0 ? (
                  <p className="text-sm text-slate-500">Ничего не найдено.</p>
                ) : null}

                <div className="space-y-3">
                  {matches.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectChat(item.id)}
                      className={cn(
                        'w-full rounded-xl border px-4 py-3 text-left transition-colors',
                        selectedChatId === item.id
                          ? 'border-slate-950 bg-slate-950 text-white'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
                      )}
                    >
                      <div className="space-y-1">
                        <p className="text-sm font-semibold">{item.title}</p>
                        <p className={cn('text-xs', selectedChatId === item.id ? 'text-slate-300' : 'text-slate-500')}>
                          {item.owner.name || item.owner.username || item.owner.email}
                        </p>
                        <p className={cn('text-xs', selectedChatId === item.id ? 'text-slate-300' : 'text-slate-500')}>
                          {item.mode} • {item.message_count} msg • {item.run_count} runs
                        </p>
                        <p className={cn('text-xs', selectedChatId === item.id ? 'text-slate-300' : 'text-slate-500')}>
                          {formatDateTime(item.last_message_at)}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div>
            {selectedChatId && isDetailLoading ? (
              <div className="flex justify-center py-16">
                <Spinner size="lg" />
              </div>
            ) : null}

            {!selectedChatId ? (
              <Card>
                <CardContent className="pt-6 text-sm text-slate-500">
                  Выбери чат слева, и здесь появится полная отладка сообщений, run-ов, tool call-ов, usage, preview и raw JSON.
                </CardContent>
              </Card>
            ) : null}

            {detail ? <ConversationPanel detail={detail} /> : null}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
