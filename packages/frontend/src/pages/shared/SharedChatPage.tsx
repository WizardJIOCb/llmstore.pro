import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChatLiveProgressPanel } from '../../components/agents/ChatLiveProgressPanel';
import { ChatMessage } from '../../components/agents/ChatMessage';
import { ChatThinkingBubble } from '../../components/agents/ChatThinkingBubble';
import { RunMetadata } from '../../components/agents/RunMetadata';
import { Spinner } from '../../components/ui/Spinner';
import { Button } from '../../components/ui/Button';
import { UserLink } from '../../components/users/UserLink';
import { apiClient } from '../../lib/api-client';
import { chatsApi, type ChatAttachment, type ChatGeneratedFile, type ChatPendingRunState, type CodingReport } from '../../lib/api/chats';
import { appendLiveProgressEvent, createLiveProgressEvent } from '../../lib/chat-live-progress';
import { applyLiveBalanceDelta, shouldApplyLiveBalanceEvent } from '../../lib/live-balance';
import { cn } from '../../lib/utils';
import { useAuth } from '../../hooks/useAuth';
import { useProfile } from '../../hooks/useProfile';

interface LegacySharedChat {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  agent_name: string;
}

interface V2SharedChat {
  chat: {
    id: string;
    owner_user_id: string;
    owner_name: string | null;
    owner_username: string | null;
    is_owner: boolean;
    title: string;
    mode: 'general' | 'agent';
    agent_name: string | null;
  };
  pending_run?: ChatPendingRunState | null;
  messages: Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    usage?: Record<string, unknown> | null;
    attachments?: ChatAttachment[];
    generated_files?: ChatGeneratedFile[];
    project_run_count?: number | null;
    latency_ms?: number | null;
    created_at: string;
  }>;
}

interface SharedMessageItem {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  usage?: Record<string, unknown> | null;
  project_run_count?: number | null;
  attachments?: ChatAttachment[];
  generated_files?: ChatGeneratedFile[];
  latency_ms?: number | null;
  created_at?: string;
}

interface SharedPageData {
  chatId?: string;
  ownerUserId?: string;
  ownerName?: string | null;
  ownerUsername?: string | null;
  isOwner?: boolean;
  title: string;
  subtitle: string;
  assistantName?: string | null;
  pendingRun?: V2SharedChat['pending_run'];
  messages: SharedMessageItem[];
}

interface LiveSharedEvent {
  run_id?: string;
  id: string;
  event: string;
  label: string;
  detail?: string;
  status?: string;
  tool_name?: string;
  tool_call_id?: string;
  input?: unknown;
  output?: unknown;
  duration_ms?: number;
  ts?: string;
  error?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  estimated_cost?: string;
  usd_to_rub_rate?: number;
}

function isPendingRunTerminal(pendingRun?: ChatPendingRunState | null): boolean {
  if (!pendingRun) return false;
  if (pendingRun.is_terminal != null) return pendingRun.is_terminal;
  return ['completed', 'failed', 'cancelled'].includes((pendingRun.status ?? '').trim().toLowerCase());
}

function isPendingRunLive(pendingRun?: ChatPendingRunState | null): boolean {
  return Boolean(pendingRun) && !isPendingRunTerminal(pendingRun);
}

function downloadChatBundle(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify({ data: payload }, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function getApiErrorMessage(error: unknown): string | undefined {
  const maybe = error as { response?: { data?: { error?: { message?: string } } } };
  return maybe?.response?.data?.error?.message;
}

function extractFirstJsonObject(value: string): string | null {
  const start = value.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < value.length; index += 1) {
    const char = value[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return value.slice(start, index + 1);
      }
    }
  }

  return null;
}

function extractCodingReportFromContent(content: string): CodingReport | null {
  const openMatch = content.match(/<dev-report>\s*/i);
  if (!openMatch || openMatch.index == null) return null;

  const payload = content.slice(openMatch.index + openMatch[0].length);
  const closeMatch = payload.match(/\s*<\/dev-report>/i);
  const candidate = closeMatch ? payload.slice(0, closeMatch.index) : payload;

  try {
    return JSON.parse(candidate) as CodingReport;
  } catch {
    const rescued = extractFirstJsonObject(candidate);
    if (!rescued) return null;
    try {
      return JSON.parse(rescued) as CodingReport;
    } catch {
      return null;
    }
  }
}

function extractCodingReport(value?: Record<string, unknown> | null, content?: string): CodingReport | null {
  if (value && value.coding_report && typeof value.coding_report === 'object') {
    return value.coding_report as CodingReport;
  }
  if (typeof content === 'string' && content.includes('<dev-report>')) {
    return extractCodingReportFromContent(content);
  }
  return null;
}

function extractAttachments(value?: Record<string, unknown> | null): ChatAttachment[] {
  if (!value || !Array.isArray((value as { attachments?: unknown[] }).attachments)) return [];
  return ((value as { attachments: unknown[] }).attachments ?? [])
    .filter((item) => item && typeof item === 'object')
    .map((item) => item as ChatAttachment);
}

function extractGeneratedFiles(value?: Record<string, unknown> | null): ChatGeneratedFile[] {
  const direct = value && Array.isArray((value as { generated_files?: unknown[] }).generated_files)
    ? (value as { generated_files: unknown[] }).generated_files
    : null;
  const artifactFiles = value
    && value.artifacts
    && typeof value.artifacts === 'object'
    && !Array.isArray(value.artifacts)
    && Array.isArray((value.artifacts as { files?: unknown[] }).files)
    ? (value.artifacts as { files: unknown[] }).files
    : null;

  return (direct ?? artifactFiles ?? [])
    .filter((item) => item && typeof item === 'object')
    .map((item) => item as ChatGeneratedFile);
}

function extractUsage(value: Record<string, unknown> | null | undefined) {
  if (!value) return null;
  const prompt_tokens = typeof value.prompt_tokens === 'number' ? value.prompt_tokens : null;
  const completion_tokens = typeof value.completion_tokens === 'number' ? value.completion_tokens : null;
  const total_tokens = typeof value.total_tokens === 'number' ? value.total_tokens : null;
  if (prompt_tokens == null || completion_tokens == null || total_tokens == null) return null;

  return {
    prompt_tokens,
    completion_tokens,
    total_tokens,
    estimated_cost: typeof value.estimated_cost === 'string' ? value.estimated_cost : undefined,
    charged_cost: typeof value.charged_cost === 'string' ? value.charged_cost : undefined,
    model: typeof value.model === 'string' ? value.model : undefined,
    usd_to_rub_rate: typeof value.usd_to_rub_rate === 'number' ? value.usd_to_rub_rate : undefined,
  };
}

function extractToolTraces(value: Record<string, unknown> | null | undefined) {
  if (!value || !Array.isArray((value as { tool_traces?: unknown[] }).tool_traces)) return [];
  return ((value as { tool_traces: unknown[] }).tool_traces ?? [])
    .filter((item) => item && typeof item === 'object')
    .map((item) => item as {
      tool_call_id: string;
      tool_name: string;
      input: Record<string, unknown>;
      output: Record<string, unknown> | null;
      status: string;
      duration_ms: number | null;
      error?: string;
    });
}

function getUsageModel(value: Record<string, unknown> | null | undefined): string | null {
  return typeof value?.model === 'string' && value.model.trim()
    ? value.model.trim()
    : null;
}

function shouldRefetchSharedChat(sharedData?: SharedPageData) {
  if (!sharedData || sharedData.messages.length === 0) return false;

  const lastMessage = sharedData.messages[sharedData.messages.length - 1];
  if (!lastMessage || lastMessage.role !== 'user' || !lastMessage.created_at) return false;

  const ageMs = Date.now() - Date.parse(lastMessage.created_at);
  if (Number.isNaN(ageMs)) return false;

  return ageMs <= 10 * 60_000;
}

const LIVE_PARTIAL_RESULT_NOTICE = '\u042d\u0442\u043e \u043f\u0440\u043e\u043c\u0435\u0436\u0443\u0442\u043e\u0447\u043d\u044b\u0439 \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442. \u041f\u043e\u043a\u0430 pending_run \u0430\u043a\u0442\u0438\u0432\u0435\u043d, \u0447\u0430\u0442 \u0435\u0449\u0451 \u043d\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043d.';
const LIVE_AUTO_SCROLL_THRESHOLD_PX = 50;

function getWindowDistanceFromBottom(): number {
  const doc = document.documentElement;
  const body = document.body;
  const scrollHeight = Math.max(doc.scrollHeight, body?.scrollHeight ?? 0);
  const scrollTop = window.scrollY || doc.scrollTop || body?.scrollTop || 0;
  return Math.max(0, scrollHeight - window.innerHeight - scrollTop);
}

export function SharedChatPage() {
  const navigate = useNavigate();
  const { token } = useParams<{ token: string }>();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const { data: profile } = useProfile(isAuthenticated);
  const [isExporting, setIsExporting] = useState(false);
  const [ownerLinkCopied, setOwnerLinkCopied] = useState(false);
  const [streamEvents, setStreamEvents] = useState<LiveSharedEvent[]>([]);
  const [streamConnected, setStreamConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const liveBalanceSeenCostsRef = useRef<Record<string, number>>({});
  const streamRunKeyRef = useRef<string | null>(null);
  const pendingProgressAnchorRef = useRef<HTMLDivElement | null>(null);
  const messagesEndAnchorRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const previousDisplayedEventsCountRef = useRef(0);
  const liveAutoScrollPinnedRef = useRef(true);

  const updateSharedPreviewMutation = useMutation({
    mutationFn: ({ messageId, ...payload }: { messageId: string; title?: string | null; html: string }) =>
      chatsApi.updateSharedPreview(token!, messageId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shared-chat-any', token] });
    },
  });

  const sendFixMessageMutation = useMutation({
    mutationFn: ({ chatId, content }: { chatId: string; content: string }) =>
      chatsApi.sendMessage(chatId, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shared-chat-any', token] });
      queryClient.invalidateQueries({ queryKey: ['chats'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['shared-chat-any', token],
    queryFn: async () => {
      if (!token) throw new Error('Token required');

      try {
        const v2 = await apiClient.get<{ data: V2SharedChat }>(`/shared/chats/${token}`);
        return {
          chatId: v2.data.data.chat.id,
          ownerUserId: v2.data.data.chat.owner_user_id,
          ownerName: v2.data.data.chat.owner_name,
          ownerUsername: v2.data.data.chat.owner_username,
          isOwner: v2.data.data.chat.is_owner,
          title: v2.data.data.chat.title,
          assistantName: v2.data.data.chat.agent_name,
          subtitle: v2.data.data.chat.is_owner
            ? 'Общий чат. Управление preview и deployment доступно владельцу.'
            : 'Общий чат только для чтения. Управление preview, deployment и секретами доступно только владельцу.',
          pendingRun: v2.data.data.pending_run ?? null,
          messages: v2.data.data.messages.map((message): SharedMessageItem => ({
            id: message.id,
            role: message.role,
            content: message.content,
            usage: message.usage ?? null,
            project_run_count: message.project_run_count ?? 0,
            attachments: message.attachments ?? extractAttachments(message.usage ?? null),
            generated_files: message.generated_files ?? extractGeneratedFiles(message.usage ?? null),
            latency_ms: message.latency_ms ?? null,
            created_at: message.created_at,
          })),
        } satisfies SharedPageData;
      } catch (requestError) {
        const maybe = requestError as { response?: { status?: number } };
        if (maybe?.response?.status !== 404) {
          throw requestError;
        }
        const legacy = await apiClient.get<{ data: LegacySharedChat }>(`/shared/chat/${token}`);
        return {
          title: legacy.data.data.agent_name,
          assistantName: legacy.data.data.agent_name,
          subtitle: 'Общий чат только для чтения.',
          pendingRun: null,
          messages: legacy.data.data.messages.map((message): SharedMessageItem => ({
            role: message.role,
            content: message.content,
          })),
        } satisfies SharedPageData;
      }
    },
    enabled: !!token,
    placeholderData: keepPreviousData,
    refetchInterval: (query) => {
      const sharedData = query.state.data as SharedPageData | undefined;
      if (sendFixMessageMutation.isPending) return 4_000;
      return sharedData && (shouldRefetchSharedChat(sharedData) || isPendingRunLive(sharedData.pendingRun)) ? 4_000 : false;
    },
  });

  const isPendingSharedReply = useMemo(
    () => Boolean(data && (shouldRefetchSharedChat(data) || isPendingRunLive(data.pendingRun))),
    [data],
  );

  useEffect(() => {
    if (!token || !isPendingSharedReply) {
      setStreamConnected(false);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }

    const nextRunKey = `${token}:${data?.pendingRun?.run_id ?? 'pending'}`;
    const shouldResetEvents = streamRunKeyRef.current !== nextRunKey;
    streamRunKeyRef.current = nextRunKey;

    const source = new EventSource(`/api/shared/chats/${token}/events`);
    eventSourceRef.current = source;
    if (shouldResetEvents) {
      setStreamEvents([]);
    }
    setStreamConnected(false);

    const pushEvent = (eventName: string, payload: {
      run_id?: string;
      label?: string;
      detail?: string;
      status?: string;
      tool_name?: string;
      tool_call_id?: string;
      input?: unknown;
      output?: unknown;
      duration_ms?: number;
      ts?: string;
      error?: string;
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
      estimated_cost?: string;
      usd_to_rub_rate?: number;
    }) => {
      if (eventName === 'connected') {
        setStreamConnected(true);
        return;
      }

      setStreamEvents((prev) => appendLiveProgressEvent(
        prev,
        createLiveProgressEvent(eventName, payload, prev.length),
      ));
    };

    const bind = (eventName: string) => {
      source.addEventListener(eventName, (raw) => {
        const message = raw as MessageEvent<string>;
        try {
          const payload = JSON.parse(message.data) as {
            run_id?: string;
            label?: string;
            detail?: string;
            status?: string;
            tool_name?: string;
            tool_call_id?: string;
            input?: unknown;
            output?: unknown;
            duration_ms?: number;
            ts?: string;
            error?: string;
            prompt_tokens?: number;
            completion_tokens?: number;
            total_tokens?: number;
            estimated_cost?: string;
            usd_to_rub_rate?: number;
          };
          pushEvent(eventName, payload);
          if (shouldApplyLiveBalanceEvent(eventName)) {
            applyLiveBalanceDelta(queryClient, liveBalanceSeenCostsRef, payload);
          }
          if (
            eventName === 'chat.message.completed'
            || eventName === 'chat.run.completed'
            || eventName === 'chat.run.failed'
            || eventName === 'chat.run.skipped'
          ) {
            void queryClient.invalidateQueries({ queryKey: ['shared-chat-any', token] });
            void queryClient.invalidateQueries({ queryKey: ['chats'] });
            void queryClient.invalidateQueries({ queryKey: ['profile'] });
          }
        } catch {
          pushEvent(eventName, { label: eventName });
          if (
            eventName === 'chat.message.completed'
            || eventName === 'chat.run.completed'
            || eventName === 'chat.run.failed'
            || eventName === 'chat.run.skipped'
          ) {
            void queryClient.invalidateQueries({ queryKey: ['shared-chat-any', token] });
            void queryClient.invalidateQueries({ queryKey: ['chats'] });
            void queryClient.invalidateQueries({ queryKey: ['profile'] });
          }
        }
      });
    };

    [
      'connected',
      'chat.message.accepted',
      'chat.message.completed',
      'chat.run.started',
      'chat.run.status',
      'chat.run.tool.started',
      'chat.run.tool.finished',
      'chat.run.completed',
      'chat.run.failed',
      'chat.run.skipped',
    ].forEach(bind);

    source.onerror = () => {
      setStreamConnected(false);
      source.close();
      if (eventSourceRef.current === source) {
        eventSourceRef.current = null;
      }
    };

    return () => {
      source.close();
      if (eventSourceRef.current === source) {
        eventSourceRef.current = null;
      }
    };
  }, [data?.pendingRun?.run_id, isPendingSharedReply, queryClient, token]);

  const exportChat = async () => {
    if (!token) return;
    setIsExporting(true);
    try {
      const bundle = await chatsApi.exportSharedBundle(token);
      downloadChatBundle(bundle.filename, bundle.payload);
    } catch (err) {
      window.alert(getApiErrorMessage(err) ?? 'Не удалось экспортировать чат');
    } finally {
      setIsExporting(false);
    }
  };

  const openOriginalChat = () => {
    if (!data?.chatId) return;
    navigate(`/chats?chat=${data.chatId}`);
  };

  const copyOriginalChatLink = async () => {
    if (!data?.chatId) return;
    await navigator.clipboard.writeText(`${window.location.origin}/chats?chat=${data.chatId}`);
    setOwnerLinkCopied(true);
    window.setTimeout(() => setOwnerLinkCopied(false), 2000);
  };

  const syncProjectRunCount = (messageId: string, projectRunCount: number | null) => {
    if (!token || typeof projectRunCount !== 'number') return;

    queryClient.setQueryData<SharedPageData | undefined>(['shared-chat-any', token], (current) => {
      if (!current) return current;
      return {
        ...current,
        messages: current.messages.map((message) => (
          message.id === messageId
            ? { ...message, project_run_count: projectRunCount }
            : message
        )),
      };
    });
  };

  const messages = data?.messages ?? [];
  const lastAssistantMessageId = useMemo(() => {
    const assistantMessages = messages.filter((message) => message.role === 'assistant');
    return assistantMessages[assistantMessages.length - 1]?.id;
  }, [messages]);
  const canManageSharedChat = Boolean(profile) && Boolean(data?.chatId) && data?.isOwner === true;
  const userMessageAuthorLabel = data?.isOwner && profile?.username?.trim()
    ? (
      <UserLink
        username={profile.username.trim()}
        name={profile.name?.trim() || null}
        className="hover:text-primary hover:underline"
      />
    )
    : (data?.isOwner
      ? (profile?.name?.trim() || 'Вы')
      : (data?.ownerUsername?.trim()
        ? (
          <UserLink
            username={data.ownerUsername.trim()}
            name={data.ownerName?.trim() || null}
            className="hover:text-primary hover:underline"
          />
        )
        : (data?.ownerName?.trim() || 'Пользователь')));
  const getAssistantAuthorLabel = (message: SharedMessageItem) => {
    const usageModel = getUsageModel(message.usage);
    if (usageModel) return usageModel;
    if (data?.assistantName?.trim()) return data.assistantName.trim();
    return 'AI';
  };
  const lastMessage = messages[messages.length - 1];
  const restoredPendingEvents = (data?.pendingRun?.events ?? []).map((event, index) => (
    createLiveProgressEvent(event.event, {
      run_id: event.run_id,
      label: event.label,
      detail: event.detail,
      status: event.status,
      tool_name: event.tool_name ?? undefined,
      tool_call_id: event.tool_call_id,
      input: event.input,
      output: event.output,
        duration_ms: typeof event.duration_ms === 'number' ? event.duration_ms : undefined,
      ts: event.ts,
      error: event.error ?? undefined,
    }, index)
  ));
  const latestEvent = streamEvents[streamEvents.length - 1]
    ?? restoredPendingEvents[restoredPendingEvents.length - 1]
    ?? (data?.pendingRun
      ? createLiveProgressEvent('pending.snapshot', {
        label: data.pendingRun.label,
        detail: data.pendingRun.detail,
        status: data.pendingRun.status,
        tool_name: data.pendingRun.tool_name ?? undefined,
        ts: data.pendingRun.started_at,
        error: data.pendingRun.error ?? undefined,
      }, 0)
      : undefined);
  const pendingLabel = latestEvent?.event === 'chat.run.failed'
    ? 'Ответ не получен'
    : latestEvent?.event === 'chat.message.completed'
      ? 'Ответ почти готов'
      : latestEvent?.event === 'chat.run.tool.started'
        ? 'Инструменты работают'
        : data?.pendingRun?.label || 'Агент работает';
  const pendingDetail = latestEvent?.error
    || latestEvent?.detail
    || latestEvent?.label
    || data?.pendingRun?.detail
    || 'Собираю ответ, выполняю инструменты и автоматически обновлю страницу, когда сообщение появится.';
  const displayedStreamEvents = streamEvents.length > 0
    ? streamEvents
    : restoredPendingEvents.length > 0
      ? restoredPendingEvents
    : (data?.pendingRun
      ? [{
        ...createLiveProgressEvent('pending.snapshot', {
          label: data.pendingRun.label,
          detail: data.pendingRun.detail,
          status: data.pendingRun.status,
          tool_name: data.pendingRun.tool_name ?? undefined,
          ts: data.pendingRun.started_at,
          error: data.pendingRun.error ?? undefined,
        }, 0),
        id: `pending-${data.pendingRun.run_id}`,
      } satisfies LiveSharedEvent]
      : []);
  const terminalNotice = data?.pendingRun && isPendingRunTerminal(data.pendingRun) && data.pendingRun.result_status && data.pendingRun.result_status !== 'success'
    ? {
      tone: data.pendingRun.result_status === 'failed_no_result' ? 'destructive' : 'warning',
      label: data.pendingRun.label,
      detail: data.pendingRun.detail,
    }
    : null;
  const pendingAssistantSignature = useMemo(() => {
    const assistantMessages = messages.filter((message) => message.role === 'assistant');
    const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];
    if (!lastAssistantMessage) return 'none';

    const toolTraceCount = Array.isArray((lastAssistantMessage.usage as { tool_traces?: unknown[] } | null)?.tool_traces)
      ? (((lastAssistantMessage.usage as { tool_traces?: unknown[] } | null)?.tool_traces?.length) ?? 0)
      : 0;

    return [
      lastAssistantMessage.id ?? 'assistant',
      lastAssistantMessage.content.length,
      toolTraceCount,
      lastAssistantMessage.created_at ?? 'no-ts',
    ].join(':');
  }, [messages]);
  const pendingUserMessageIndex = useMemo(() => {
    if (!isPendingSharedReply) return -1;

    let lastUserIndex = -1;
    messages.forEach((message, index) => {
      if (message.role === 'user') {
        lastUserIndex = index;
      }
    });

    return lastUserIndex;
  }, [messages, isPendingSharedReply]);
  const pendingAssistantMessageIndex = useMemo(() => {
    if (!isPendingSharedReply || !lastAssistantMessageId) return -1;

    return messages.findIndex((message) => (
      message.role === 'assistant' && message.id === lastAssistantMessageId
    ));
  }, [messages, isPendingSharedReply, lastAssistantMessageId]);

  useEffect(() => {
    const syncPinnedState = () => {
      liveAutoScrollPinnedRef.current = getWindowDistanceFromBottom() <= LIVE_AUTO_SCROLL_THRESHOLD_PX;
    };

    syncPinnedState();
    window.addEventListener('scroll', syncPinnedState, { passive: true });
    window.addEventListener('resize', syncPinnedState);

    return () => {
      window.removeEventListener('scroll', syncPinnedState);
      window.removeEventListener('resize', syncPinnedState);
    };
  }, [token]);

  useEffect(() => {
    const nextCount = displayedStreamEvents.length;
    const previousCount = previousDisplayedEventsCountRef.current;
    const hasNewProgressEvent = nextCount > previousCount;
    previousDisplayedEventsCountRef.current = nextCount;

    if (!isPendingSharedReply) return;
    if (!hasNewProgressEvent && pendingAssistantSignature === 'none') return;
    if (!liveAutoScrollPinnedRef.current) return;

    const primaryAnchor = messagesEndAnchorRef.current ?? pendingProgressAnchorRef.current;
    if (!primaryAnchor) return;

    const scrollToLatest = () => {
      if (!liveAutoScrollPinnedRef.current) return;
      primaryAnchor.scrollIntoView({ behavior: 'smooth', block: 'end' });
    };

    const rafId = requestAnimationFrame(scrollToLatest);
    const timeoutId = window.setTimeout(scrollToLatest, 100);
    const timeoutId2 = window.setTimeout(scrollToLatest, 240);

    return () => {
      cancelAnimationFrame(rafId);
      window.clearTimeout(timeoutId);
      window.clearTimeout(timeoutId2);
    };
  }, [displayedStreamEvents.length, isPendingSharedReply, pendingAssistantSignature]);

  useEffect(() => {
    if (!isPendingSharedReply) return;

    const container = messagesContainerRef.current;
    if (!container) return;

    let frameId: number | null = null;
    let timeoutId: number | null = null;

    const scrollToBottom = () => {
      if (!liveAutoScrollPinnedRef.current) return;
      const targetTop = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
      );
      window.scrollTo({ top: targetTop, behavior: 'smooth' });
    };

    const scheduleScroll = () => {
      if (!liveAutoScrollPinnedRef.current) return;
      if (frameId != null) cancelAnimationFrame(frameId);
      if (timeoutId != null) window.clearTimeout(timeoutId);

      frameId = requestAnimationFrame(scrollToBottom);
      timeoutId = window.setTimeout(scrollToBottom, 120);
    };

    const resizeObserver = new ResizeObserver(() => {
      scheduleScroll();
    });
    resizeObserver.observe(container);

    const mutationObserver = new MutationObserver(() => {
      scheduleScroll();
    });
    mutationObserver.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    scheduleScroll();

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      if (frameId != null) cancelAnimationFrame(frameId);
      if (timeoutId != null) window.clearTimeout(timeoutId);
    };
  }, [isPendingSharedReply, pendingAssistantSignature, displayedStreamEvents.length]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground">Чат не найден или ссылка недействительна.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{data.title}</h1>
          <p className="text-xs text-muted-foreground">{data.subtitle}</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportChat} disabled={isExporting}>
          {isExporting ? 'Экспорт...' : 'Экспортировать чат'}
        </Button>
      </div>

      {canManageSharedChat && data.chatId ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={openOriginalChat}>
            Открыть в чатах
          </Button>
          <Button variant="outline" size="sm" onClick={() => void copyOriginalChatLink()}>
            {ownerLinkCopied ? 'Ссылка скопирована' : 'Скопировать ссылку на чат'}
          </Button>
        </div>
      ) : null}

      {terminalNotice && (
        <div
          className={cn(
            'mb-4 rounded-xl border px-4 py-3 text-sm',
            terminalNotice.tone === 'destructive'
              ? 'border-destructive/20 bg-destructive/10 text-destructive'
              : 'border-amber-200 bg-amber-50 text-amber-900',
          )}
        >
          <p className="font-medium">{terminalNotice.label}</p>
          <p className="mt-1 text-xs opacity-80">{terminalNotice.detail}</p>
        </div>
      )}

      {false && isPendingSharedReply && lastMessage?.role === 'user' && (
        <div className="mb-6 space-y-3">
          <ChatThinkingBubble
            label={pendingLabel}
            detail={pendingDetail}
            startedAt={data?.pendingRun?.started_at ?? lastMessage.created_at ?? null}
          />
          {displayedStreamEvents.length > 0 && (
            <div className="rounded-xl border border-sky-200 bg-sky-50/80 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-sky-950">Живой процесс выполнения</p>
                  <p className="text-xs text-sky-900/70">
                    {streamConnected ? 'Live progress подключен' : 'Жду переподключение к live progress'}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                {displayedStreamEvents.map((event) => (
                  <div key={event.id} className="rounded-lg border border-sky-200/80 bg-white/80 px-3 py-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm text-slate-900">{event.label}</p>
                        {event.detail && (
                          <p className="mt-1 text-xs leading-5 text-slate-600">
                            {event.detail}
                          </p>
                        )}
                        {(event.tool_name || event.status || event.error) && (
                          <p className="mt-1 text-xs text-slate-500">
                            {[event.tool_name, event.status, event.error].filter(Boolean).join(' • ')}
                          </p>
                        )}
                      </div>
                      {event.ts && (
                        <span className="shrink-0 text-[11px] text-slate-400">
                          {new Intl.DateTimeFormat('ru-RU', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          }).format(new Date(event.ts))}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div ref={messagesContainerRef} className="space-y-4">
        {data.messages.map((msg, index) => (
          <div key={msg.id ?? index} className="space-y-3">
          <ChatMessage
            role={msg.role}
            content={msg.content}
            createdAt={msg.created_at}
            authorLabel={msg.role === 'user' ? userMessageAuthorLabel : getAssistantAuthorLabel(msg)}
            attachments={msg.attachments ?? extractAttachments(msg.usage)}
            generatedFiles={msg.role === 'assistant' ? (msg.generated_files ?? extractGeneratedFiles(msg.usage)) : undefined}
            toolTraces={msg.role === 'assistant' ? extractToolTraces(msg.usage) : undefined}
            codingReport={msg.role === 'assistant' ? extractCodingReport(msg.usage, msg.content) : undefined}
            projectRunCount={msg.project_run_count}
            previewPageUrl={msg.role === 'assistant' && token && msg.id ? `/api/shared/chats/${token}/messages/${msg.id}/preview` : undefined}
            canEditPreview={canManageSharedChat && msg.role === 'assistant' && Boolean(msg.id)}
            onSavePreview={canManageSharedChat && msg.role === 'assistant' && msg.id
              ? async (payload) => {
                try {
                  await updateSharedPreviewMutation.mutateAsync({
                    messageId: msg.id!,
                    ...payload,
                  });
                } catch (saveError) {
                  throw new Error(getApiErrorMessage(saveError) ?? 'Не удалось сохранить preview');
                }
              }
              : undefined}
            canRunProject={Boolean(profile) && Boolean(data.chatId) && msg.role === 'assistant' && Boolean(msg.id)}
            onRunProject={profile && data.chatId && msg.role === 'assistant' && msg.id
              ? async () => {
                const result = await chatsApi.runProject(data.chatId!, msg.id!);
                syncProjectRunCount(msg.id!, result.project_run_count);
                return result;
              }
              : undefined}
            canManageDeployment={canManageSharedChat && msg.role === 'assistant' && Boolean(msg.id)}
            onLoadProjectDeployment={canManageSharedChat && data.chatId && msg.role === 'assistant' && msg.id
              ? async () => chatsApi.getProjectDeployment(data.chatId!, msg.id!)
              : undefined}
            onUpsertProjectDeployment={canManageSharedChat && data.chatId && msg.role === 'assistant' && msg.id
              ? async (payload) => chatsApi.upsertProjectDeployment(data.chatId!, msg.id!, payload)
              : undefined}
            onControlProjectDeployment={canManageSharedChat && data.chatId && msg.role === 'assistant' && msg.id
              ? async (payload) => chatsApi.controlProjectDeployment(data.chatId!, msg.id!, payload)
              : undefined}
            onStartProjectDeployment={canManageSharedChat && data.chatId && msg.role === 'assistant' && msg.id
              ? async () => chatsApi.startProjectDeployment(data.chatId!, msg.id!)
              : undefined}
            onReinstallProjectDeploymentWebhook={canManageSharedChat && data.chatId && msg.role === 'assistant' && msg.id
              ? async () => chatsApi.reinstallProjectDeploymentWebhook(data.chatId!, msg.id!)
              : undefined}
            onStopProjectDeployment={canManageSharedChat && data.chatId && msg.role === 'assistant' && msg.id
              ? async () => chatsApi.stopProjectDeployment(data.chatId!, msg.id!)
              : undefined}
            onFixProjectError={canManageSharedChat && data.chatId && msg.role === 'assistant'
              ? async (prompt) => {
                try {
                  await sendFixMessageMutation.mutateAsync({
                    chatId: data.chatId!,
                    content: prompt,
                  });
                } catch (fixError) {
                  throw new Error(getApiErrorMessage(fixError) ?? 'Не удалось отправить запрос на исправление');
                }
              }
              : undefined}
            canDeleteMessage={canManageSharedChat && Boolean(msg.id)}
            onDeleteMessage={canManageSharedChat && data.chatId && msg.id
              ? async () => {
                try {
                  await chatsApi.deleteMessage(data.chatId!, msg.id!);
                  queryClient.invalidateQueries({ queryKey: ['shared-chat-any', token] });
                } catch (deleteError) {
                  throw new Error(getApiErrorMessage(deleteError) ?? 'Не удалось удалить сообщение');
                }
              }
              : undefined}
          />
          {msg.role === 'assistant' && (
            <div className="mt-1 ml-1">
              <RunMetadata
                usage={extractUsage(msg.usage)}
                latencyMs={msg.latency_ms ?? undefined}
                agentName={data?.assistantName ?? undefined}
              />
            </div>
          )}
          {isPendingSharedReply && msg.role === 'assistant' && msg.id && msg.id === lastAssistantMessageId && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-medium">{'\u041f\u0440\u043e\u043c\u0435\u0436\u0443\u0442\u043e\u0447\u043d\u044b\u0439 \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442'}</p>
              <p className="mt-1 text-xs opacity-80">{LIVE_PARTIAL_RESULT_NOTICE}</p>
            </div>
          )}
          {false && isPendingSharedReply && index === pendingAssistantMessageIndex && (
            <div ref={pendingProgressAnchorRef} className="space-y-3">
              <ChatThinkingBubble
                label={pendingLabel}
                detail={pendingDetail}
                startedAt={data?.pendingRun?.started_at ?? lastMessage?.created_at ?? null}
              />
              <ChatLiveProgressPanel
                events={displayedStreamEvents}
                connected={streamConnected}
                connectedLabel="SSE подключен"
                disconnectedLabel="Ожидаю переподключение к SSE"
              />
            </div>
          )}
          {false && isPendingSharedReply && index === pendingUserMessageIndex && pendingAssistantMessageIndex === -1 && (
            <div ref={pendingProgressAnchorRef} className="space-y-3">
              <ChatThinkingBubble
                label={pendingLabel}
                detail={pendingDetail}
                startedAt={data?.pendingRun?.started_at ?? lastMessage?.created_at ?? null}
              />
              <ChatLiveProgressPanel
                events={displayedStreamEvents}
                connected={streamConnected}
                connectedLabel="SSE подключен"
                disconnectedLabel="Ожидаю переподключение к SSE"
              />
            </div>
          )}
                    </div>
        ))}
        {isPendingSharedReply && (
          <div ref={pendingProgressAnchorRef} className="space-y-3">
            <ChatLiveProgressPanel
              events={displayedStreamEvents}
              connected={streamConnected}
              connectedLabel="SSE подключен"
              disconnectedLabel="Ожидаю переподключение к SSE"
            />
            <ChatThinkingBubble
              label={pendingLabel}
              detail={pendingDetail}
              startedAt={data.pendingRun?.started_at ?? lastMessage?.created_at ?? null}
            />
          </div>
        )}
        <div ref={messagesEndAnchorRef} aria-hidden="true" />
      </div>

      {data.messages.length === 0 && (
        <p className="py-8 text-center text-muted-foreground">Чат пуст.</p>
      )}
    </div>
  );
}
