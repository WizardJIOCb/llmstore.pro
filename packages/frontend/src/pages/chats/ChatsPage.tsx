import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { ChatInput } from '../../components/agents/ChatInput';
import { ChatMessage } from '../../components/agents/ChatMessage';
import { ChatThinkingBubble } from '../../components/agents/ChatThinkingBubble';
import { RunMetadata } from '../../components/agents/RunMetadata';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Spinner } from '../../components/ui/Spinner';
import {
  useChat,
  useChatAgents,
  useChatStats,
  useChatsList,
  useCreateChat,
  useDeleteChat,
  useDeleteChatMessage,
  useTruncateChatFromMessage,
  useSendChatMessage,
  useUpdateChatMessagePreview,
  useUploadChatFiles,
  useShareChatById,
  useUpdateChat,
  useImportChatBundle,
} from '../../hooks/useChats';
import { useBuiltinTools } from '../../hooks/useAgents';
import { useAppSettings } from '../../hooks/useAppSettings';
import { useProfile } from '../../hooks/useProfile';
import { chatsApi } from '../../lib/api/chats';
import { UserLink } from '../../components/users/UserLink';
import type {
  ChatAccess,
  ChatAgentOption,
  ChatAttachment,
  ChatDetails,
  ChatListItem,
  ChatMessage as ChatMessageType,
  ChatMode,
  CodingReport,
  ToolTrace,
} from '../../lib/api/chats';
import { cn, formatRub, formatUsd } from '../../lib/utils';
import { TopUpHelp } from '../../components/billing/TopUpHelp';

interface GeneralModelOption {
  value: string;
  label: string;
  description: string;
  pricing_input_usd_per_million: number;
  pricing_output_usd_per_million: number;
}

type PropertiesModeView = 'general' | 'coding' | 'other';

const GENERAL_MODELS: GeneralModelOption[] = [
  {
    value: 'openai/gpt-4o-mini',
    label: 'GPT-4o Mini',
    description: 'Лучший бюджетный дефолт для повседневного общения, быстрых ответов и недорогих диалогов.',
    pricing_input_usd_per_million: 0.15,
    pricing_output_usd_per_million: 0.60,
  },
  {
    value: 'google/gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    description: 'Быстрый reasoning-вариант с большим контекстом, когда нужен баланс цены и “умности”.',
    pricing_input_usd_per_million: 0.30,
    pricing_output_usd_per_million: 2.50,
  },
  {
    value: 'openai/gpt-5.4-mini',
    label: 'GPT-5.4 Mini',
    description: 'Сильный modern-balanced вариант для чатов, где хочется лучшее качество без premium-цены.',
    pricing_input_usd_per_million: 0.75,
    pricing_output_usd_per_million: 4.50,
  },
  {
    value: 'anthropic/claude-haiku-4.5',
    label: 'Claude Haiku 4.5',
    description: 'Очень приятная быстрая модель для живого стиля ответа, summaries и частых коротких запросов.',
    pricing_input_usd_per_million: 1.00,
    pricing_output_usd_per_million: 5.00,
  },
  {
    value: 'google/gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    description: 'Сильный вариант для длинного контекста, сложного reasoning и вдумчивых ответов.',
    pricing_input_usd_per_million: 1.25,
    pricing_output_usd_per_million: 10.00,
  },
  {
    value: 'openai/gpt-4o',
    label: 'GPT-4o',
    description: 'Стабильный premium-класс для качественного мультимодального общения и общего использования.',
    pricing_input_usd_per_million: 2.50,
    pricing_output_usd_per_million: 10.00,
  },
  {
    value: 'openai/gpt-5.4',
    label: 'GPT-5.4',
    description: 'Флагманский general-purpose вариант, когда нужен максимально сильный обычный чат.',
    pricing_input_usd_per_million: 2.50,
    pricing_output_usd_per_million: 15.00,
  },
  {
    value: 'anthropic/claude-sonnet-4.6',
    label: 'Claude Sonnet 4.6',
    description: 'Очень сильный quality-first вариант для содержательных ответов, письма и сложных обсуждений.',
    pricing_input_usd_per_million: 3.00,
    pricing_output_usd_per_million: 15.00,
  },
];

const CHAT_ACCESS_OPTIONS = [
  { value: 'public', label: 'Общий' },
  { value: 'private', label: 'Приватный' },
  { value: 'restricted', label: 'Ограниченный' },
];

function formatDate(iso: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatInt(value: number): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value);
}

function formatMoney(value: number, currency: 'USD' | 'RUB'): string {
  return currency === 'USD'
    ? formatUsd(value, { minimumFractionDigits: 4, maximumFractionDigits: 4 })
    : formatRub(value, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

function formatUsdCompact(value: number): string {
  if (value >= 1) {
    return `$${value.toFixed(value % 1 === 0 ? 0 : 2)}`;
  }

  if (value >= 0.1) {
    return `$${value.toFixed(2)}`;
  }

  return `$${value.toFixed(3)}`;
}

function formatAgentPricing(agent: ChatAgentOption): string | null {
  if (
    typeof agent.pricing_input_usd_per_million !== 'number'
    || typeof agent.pricing_output_usd_per_million !== 'number'
  ) {
    return null;
  }

  return `${formatUsdCompact(agent.pricing_input_usd_per_million)} in / ${formatUsdCompact(agent.pricing_output_usd_per_million)} out за 1M`;
}

function getChatListMeta(chat: ChatListItem): string {
  if (chat.mode === 'agent') {
    const parts = ['Агент'];
    if (chat.agent_name?.trim()) parts.push(chat.agent_name.trim());
    if (chat.effective_model_label?.trim()) parts.push(chat.effective_model_label.trim());
    return parts.join(' • ');
  }

  if (chat.effective_model_label?.trim()) {
    return `Общение • ${chat.effective_model_label.trim()}`;
  }

  return 'Общение';
}

function formatGeneralModelPricing(model: GeneralModelOption): string {
  return `${formatUsdCompact(model.pricing_input_usd_per_million)} in / ${formatUsdCompact(model.pricing_output_usd_per_million)} out за 1M`;
}

function buildAgentMetaLabel(agent: ChatAgentOption): string {
  return agent.model_external_id?.trim() || '';
}

function formatDuration(ms: number): string {
  if (ms <= 0) return '0 c';
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds} c`;
  return `${minutes} мин ${seconds} c`;
}

function extractUsage(value: Record<string, unknown> | null) {
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
    model: typeof value.model === 'string' ? value.model : undefined,
    usd_to_rub_rate: typeof value.usd_to_rub_rate === 'number' ? value.usd_to_rub_rate : undefined,
  };
}

function extractAttachments(value: Record<string, unknown> | null) {
  if (!value || !Array.isArray((value as { attachments?: unknown[] }).attachments)) return [];
  return ((value as { attachments: unknown[] }).attachments ?? [])
    .filter((item) => item && typeof item === 'object')
    .map((item) => item as {
      filename: string;
      original_name: string;
      mime_type: string;
      size: number;
      kind: 'image' | 'text' | 'file';
      url: string;
      text_preview?: string;
    });
}

function extractToolTraces(value: Record<string, unknown> | null): ToolTrace[] {
  if (!value || !Array.isArray((value as { tool_traces?: unknown[] }).tool_traces)) return [];
  return ((value as { tool_traces: unknown[] }).tool_traces ?? [])
    .filter((item) => item && typeof item === 'object')
    .map((item) => item as ToolTrace);
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

function extractCodingReport(value: Record<string, unknown> | null, content?: string): CodingReport | null {
  if (value && value.coding_report && typeof value.coding_report === 'object') {
    return value.coding_report as CodingReport;
  }
  if (typeof content === 'string' && content.includes('<dev-report>')) {
    return extractCodingReportFromContent(content);
  }
  return null;
}

function formatChatPreview(preview: string | null): string | null {
  if (!preview) return preview;
  const cleaned = preview.replace(/<dev-report>\s*[\s\S]*?(?:\s*<\/dev-report>|$)/gi, '').trim();
  if (cleaned) return cleaned;
  const summaryMatch = preview.match(/"summary"\s*:\s*"([^"]+)/);
  return summaryMatch?.[1] ?? preview;
}

type MenuItem = { kind: 'chat'; id: string } | null;

interface LiveChatEvent {
  id: string;
  event: string;
  label: string;
  status?: string;
  tool_name?: string;
  ts?: string;
  error?: string;
}

declare global {
  interface Window {
    llmstoreDebugShowThinking?: (
      input?: string | { text?: string; label?: string; detail?: string },
    ) => boolean;
    llmstoreDebugClearThinking?: () => void;
  }
}

function getApiErrorCode(err: unknown): string | undefined {
  const maybe = err as { response?: { data?: { error?: { code?: string } } } };
  return maybe?.response?.data?.error?.code;
}

function getApiErrorMessage(err: unknown): string | undefined {
  const maybe = err as { response?: { data?: { error?: { message?: string } } } };
  return maybe?.response?.data?.error?.message;
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

function getApiErrorStatus(err: unknown): number | undefined {
  const maybe = err as { response?: { status?: number } };
  return maybe?.response?.status;
}

function getUsageModel(value: Record<string, unknown> | null): string | null {
  return typeof value?.model === 'string' && value.model.trim()
    ? value.model.trim()
    : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function inferOptimisticAttachmentKind(file: File): ChatAttachment['kind'] {
  if (file.type.startsWith('image/')) {
    return 'image';
  }

  if (
    file.type.startsWith('text/')
    || /\.(txt|log|md|csv|json|xml|html?|css|scss|sass|less|jsx?|tsx?|mjs|cjs|py|java|kt|go|rs|php|rb|sh|bash|zsh|sql|ya?ml|toml|ini|conf|env|gitignore|svg)$/i.test(file.name)
  ) {
    return 'text';
  }

  return 'file';
}

export function ChatsPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: chats, isLoading: chatsLoading } = useChatsList();
  const { data: agents, isLoading: agentsLoading } = useChatAgents();
  const { data: availableTools } = useBuiltinTools();
  const { data: appSettings } = useAppSettings();
  const { data: profile } = useProfile();
  const createChatMutation = useCreateChat();
  const updateChatMutation = useUpdateChat();
  const deleteChatMutation = useDeleteChat();
  const deleteChatMessageMutation = useDeleteChatMessage();
  const truncateChatFromMessageMutation = useTruncateChatFromMessage();
  const shareChatMutation = useShareChatById();
  const sendMessageMutation = useSendChatMessage();
  const updatePreviewMutation = useUpdateChatMessagePreview();
  const uploadFilesMutation = useUploadChatFiles();
  const importChatBundleMutation = useImportChatBundle();

  const [search, setSearch] = useState('');
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<MenuItem>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localNoticeTone, setLocalNoticeTone] = useState<'error' | 'warning'>('error');
  const [shareToastVisible, setShareToastVisible] = useState(false);
  const [isPropertiesOpen, setIsPropertiesOpen] = useState(false);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia('(min-width: 768px)').matches);
  const [newChatMode, setNewChatMode] = useState<'general' | 'agent'>('general');
  const [newChatAgentId, setNewChatAgentId] = useState('');
  const [newChatAgentSearch, setNewChatAgentSearch] = useState('');
  const [newChatModel, setNewChatModel] = useState('openai/gpt-4o-mini');
  const [propertiesModeView, setPropertiesModeView] = useState<PropertiesModeView>('general');
  const [propertiesAgentId, setPropertiesAgentId] = useState('');
  const [propertiesModel, setPropertiesModel] = useState('openai/gpt-4o-mini');
  const [propertiesToolIds, setPropertiesToolIds] = useState<string[]>([]);
  const [propertiesAccess, setPropertiesAccess] = useState<ChatAccess>('public');
  const [propertiesAllowedText, setPropertiesAllowedText] = useState('');
  const [propertiesSaving, setPropertiesSaving] = useState(false);
  const [propertiesError, setPropertiesError] = useState<string | null>(null);
  const [streamEvents, setStreamEvents] = useState<LiveChatEvent[]>([]);
  const [streamConnected, setStreamConnected] = useState(false);
  const [isAwaitingLateReply, setIsAwaitingLateReply] = useState(false);
  const [isQuickPromptsOpen, setIsQuickPromptsOpen] = useState(false);
  const [optimisticPendingMessage, setOptimisticPendingMessage] = useState<{
    chatId: string;
    message: ChatMessageType;
    objectUrls: string[];
  } | null>(null);
  const [debugThinkingPreview, setDebugThinkingPreview] = useState<{
    chatId: string;
    label: string;
    detail: string;
    message: ChatMessageType;
  } | null>(null);
  const [composerPrefill, setComposerPrefill] = useState<{ text: string; token: number } | null>(null);
  const [assistantResponseSlot, setAssistantResponseSlot] = useState<{
    label: string;
    detail: string;
    chatId: string;
    visualKey: string;
    startedAt: string;
    actualMessageId: string | null;
  } | null>(null);
  const [enteringMessageIds, setEnteringMessageIds] = useState<string[]>([]);

  const menuRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const assistantSlotNodeRef = useRef<HTMLDivElement | null>(null);
  const shareToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageEnterCleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollAnimationFrameRef = useRef<number | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const previousMessageCountRef = useRef(0);
  const initializedAnimatedChatIdsRef = useRef<Set<string>>(new Set());
  const animatedMessageIdsRef = useRef<Set<string>>(new Set());
  const messageNodeRefs = useRef(new Map<string, HTMLDivElement>());
  const messageVisualKeyByIdRef = useRef(new Map<string, string>());
  const knownChatIds = useMemo(() => new Set((chats ?? []).map((chat) => chat.id)), [chats]);
  const requestedChatId = searchParams.get('chat');
  const safeActiveChatId = activeChatId && (chats == null || chats.length === 0 || knownChatIds.has(activeChatId))
    ? activeChatId
    : null;
  const filteredNewChatAgents = useMemo(() => {
    const query = newChatAgentSearch.trim().toLowerCase();
    return (agents ?? []).filter((agent) => {
      if (!query) return true;
      const haystack = [
        agent.name,
        agent.description ?? '',
        agent.chat_description ?? '',
        agent.owner_name ?? '',
        agent.owner_username ?? '',
        agent.model_label ?? '',
        agent.model_external_id ?? '',
      ].join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [agents, newChatAgentSearch]);
  const visibleNewChatAgents = filteredNewChatAgents.slice(0, 24);

  const { data: activeChatData, isLoading: activeChatLoading, error: activeChatError } = useChat(safeActiveChatId ?? undefined);
  const { data: activeChatStats, isLoading: chatStatsLoading } = useChatStats(
    safeActiveChatId ?? undefined,
    isPropertiesOpen,
  );
  const activeChat = activeChatData?.chat ?? null;
  const isActiveChatResolved = Boolean(safeActiveChatId && activeChat?.id === safeActiveChatId);
  const messages = activeChatData?.messages ?? [];
  const debugThinkingForActiveChat = debugThinkingPreview && debugThinkingPreview.chatId === activeChat?.id
    ? debugThinkingPreview
    : null;
  const optimisticMessageForActiveChat = optimisticPendingMessage && optimisticPendingMessage.chatId === activeChat?.id
    ? optimisticPendingMessage.message
    : null;
  const assistantResponseSlotForActiveChat = assistantResponseSlot && assistantResponseSlot.chatId === activeChat?.id
    ? assistantResponseSlot
    : null;
  const displayedMessages = useMemo(
    () => {
      const nextMessages = [...messages];

      if (debugThinkingForActiveChat) {
        nextMessages.push(debugThinkingForActiveChat.message);
      }

      if (optimisticMessageForActiveChat) {
        const optimisticCreatedAt = Date.parse(optimisticMessageForActiveChat.created_at);
        const hasServerReplacement = messages.some((message) => (
          message.role === 'user'
          && message.content === optimisticMessageForActiveChat.content
          && Math.abs(Date.parse(message.created_at) - optimisticCreatedAt) < 15_000
        ));

        if (!hasServerReplacement) {
          nextMessages.push(optimisticMessageForActiveChat);
        }
      }

      return nextMessages;
    },
    [messages, debugThinkingForActiveChat, optimisticMessageForActiveChat],
  );

  const showLocalError = (message: string) => {
    setLocalNoticeTone('error');
    setLocalError(message);
  };

  const showLocalWarning = (message: string) => {
    setLocalNoticeTone('warning');
    setLocalError(message);
  };

  useEffect(() => {
    if (!safeActiveChatId || !activeChatError) return;
    if (getApiErrorCode(activeChatError) !== 'NOT_FOUND') return;
    setActiveChatId(isDesktop ? chats?.[0]?.id ?? null : null);
  }, [activeChatError, chats, isDesktop, safeActiveChatId]);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    const onChange = (event: MediaQueryListEvent) => setIsDesktop(event.matches);
    setIsDesktop(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (isDesktop && !activeChatId && chats && chats.length > 0) {
      setActiveChatId(chats[0].id);
    }
  }, [activeChatId, chats, isDesktop]);

  useEffect(() => {
    if (!requestedChatId || !chats?.some((chat) => chat.id === requestedChatId)) return;
    setActiveChatId(requestedChatId);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('chat');
    setSearchParams(nextParams, { replace: true });
  }, [requestedChatId, chats, searchParams, setSearchParams]);

  useEffect(() => {
    if (!chats || chats.length === 0 || !activeChatId) return;
    if (chats.some((chat) => chat.id === activeChatId)) return;
    setActiveChatId(isDesktop ? chats[0]?.id ?? null : null);
  }, [activeChatId, chats, isDesktop]);

  useEffect(() => {
    const showDebugThinking = (
      input?: string | { text?: string; label?: string; detail?: string },
    ) => {
      if (!activeChat) {
        console.warn('[llmstore] Откройте чат перед запуском debug thinking preview.');
        return false;
      }

      const payload = typeof input === 'string' ? { text: input } : (input ?? {});
      const text = payload.text?.trim() || 'Тестовое сообщение для просмотра анимации.';
      const label = payload.label?.trim() || 'Думаю...';
      const detail = payload.detail?.trim() || 'Демо-режим: можно спокойно оценить анимацию и компоновку пузыря.';

      setDebugThinkingPreview({
        chatId: activeChat.id,
        label,
        detail,
        message: {
          id: `debug-fake-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          role: 'user',
          content: text,
          run_id: null,
          usage: null,
          attachments: [],
          latency_ms: null,
          created_at: new Date().toISOString(),
        },
      });
      setAssistantResponseSlot({
        chatId: activeChat.id,
        visualKey: `assistant-slot-debug-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        startedAt: new Date().toISOString(),
        label,
        detail,
        actualMessageId: null,
      });

      console.info('[llmstore] Debug thinking preview shown.');
      return true;
    };

    const clearDebugThinking = () => {
      setDebugThinkingPreview(null);
      setAssistantResponseSlot(null);
      console.info('[llmstore] Debug thinking preview cleared.');
    };

    window.llmstoreDebugShowThinking = showDebugThinking;
    window.llmstoreDebugClearThinking = clearDebugThinking;

    return () => {
      if (window.llmstoreDebugShowThinking === showDebugThinking) {
        delete window.llmstoreDebugShowThinking;
      }
      if (window.llmstoreDebugClearThinking === clearDebugThinking) {
        delete window.llmstoreDebugClearThinking;
      }
    };
  }, [activeChat]);

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<string>;
      if (typeof custom.detail === 'string' && custom.detail.length > 0) {
        setActiveChatId(custom.detail);
      }
    };
    window.addEventListener('select-chat', handler as EventListener);
    return () => window.removeEventListener('select-chat', handler as EventListener);
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('mobile-chat-active', { detail: Boolean(activeChatId) }));
  }, [activeChatId]);

  useEffect(() => {
    setStreamEvents([]);
    setStreamConnected(false);

    if (
      !safeActiveChatId
      || !isActiveChatResolved
      || !activeChat
      || (activeChat.mode !== 'agent' && (activeChat.tool_ids?.length ?? 0) === 0)
    ) {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      return;
    }

    const source = new EventSource(`/api/chats/${safeActiveChatId}/events`, { withCredentials: true });
    eventSourceRef.current = source;

    const pushEvent = (eventName: string, payload: {
      label?: string;
      status?: string;
      tool_name?: string;
      ts?: string;
      error?: string;
    }) => {
      if (eventName === 'connected') {
        setStreamConnected(true);
        return;
      }

      setStreamEvents((prev) => [
        ...prev.slice(-19),
        {
          id: `${eventName}-${payload.ts ?? Date.now()}-${prev.length}`,
          event: eventName,
          label: payload.label || eventName,
          status: payload.status,
          tool_name: payload.tool_name,
          ts: payload.ts,
          error: payload.error,
        },
      ]);
    };

    const bind = (eventName: string) => {
      source.addEventListener(eventName, (raw) => {
        const message = raw as MessageEvent<string>;
        try {
          pushEvent(eventName, JSON.parse(message.data) as {
            label?: string;
            status?: string;
            tool_name?: string;
            ts?: string;
            error?: string;
          });
        } catch {
          pushEvent(eventName, { label: eventName });
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
  }, [activeChat?.id, activeChat?.mode, activeChat?.tool_ids?.length, isActiveChatResolved, safeActiveChatId]);

  useEffect(() => {
    const handler = () => setActiveChatId(null);
    window.addEventListener('show-chat-list', handler);
    return () => window.removeEventListener('show-chat-list', handler);
  }, []);

  useEffect(() => {
    if (!openMenu) return;
    const onClickOutside = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setOpenMenu(null);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [openMenu]);

  useEffect(() => {
    const urls = optimisticPendingMessage?.objectUrls ?? [];
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [optimisticPendingMessage?.objectUrls]);

  useEffect(() => {
    if (!activeChat?.id || activeChatLoading) return;
    if (initializedAnimatedChatIdsRef.current.has(activeChat.id)) return;

    initializedAnimatedChatIdsRef.current.add(activeChat.id);
    messages.forEach((message) => animatedMessageIdsRef.current.add(message.id));
    setEnteringMessageIds([]);
  }, [activeChat?.id, activeChatLoading, messages]);

  useEffect(() => {
    const nextMessageIds = displayedMessages.map((message) => message.id);
    const nextEnteringIds = nextMessageIds.filter((id) => !animatedMessageIdsRef.current.has(id));
    if (nextEnteringIds.length === 0) return;

    nextEnteringIds.forEach((id) => animatedMessageIdsRef.current.add(id));
    setEnteringMessageIds((prev) => {
      const next = [...prev];
      nextEnteringIds.forEach((id) => {
        if (!next.includes(id)) next.push(id);
      });
      return next;
    });

    if (messageEnterCleanupTimerRef.current) {
      clearTimeout(messageEnterCleanupTimerRef.current);
    }

    messageEnterCleanupTimerRef.current = setTimeout(() => {
      setEnteringMessageIds([]);
      messageEnterCleanupTimerRef.current = null;
    }, 420);
  }, [displayedMessages]);

  useEffect(() => {
    const optimisticMessageId = optimisticMessageForActiveChat?.id;
    const container = messagesScrollRef.current;
    if (!container || !optimisticMessageId) return;

    if (scrollAnimationFrameRef.current) {
      cancelAnimationFrame(scrollAnimationFrameRef.current);
      scrollAnimationFrameRef.current = null;
    }

    const anchorNode = messageNodeRefs.current.get(optimisticMessageId);
    if (!anchorNode) return;

    const startTop = container.scrollTop;
    const targetTop = Math.max(0, anchorNode.offsetTop - 4);
    if (Math.abs(targetTop - startTop) < 1) {
      return;
    }

    const startTime = performance.now();
    const duration = 300;

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);

      container.scrollTop = startTop + ((targetTop - startTop) * eased);

      if (progress < 1) {
        scrollAnimationFrameRef.current = requestAnimationFrame(step);
        return;
      }

      container.scrollTop = targetTop;
      scrollAnimationFrameRef.current = null;
    };

    scrollAnimationFrameRef.current = requestAnimationFrame(step);

    return () => {
      if (scrollAnimationFrameRef.current) {
        cancelAnimationFrame(scrollAnimationFrameRef.current);
        scrollAnimationFrameRef.current = null;
      }
    };
  }, [optimisticMessageForActiveChat?.id]);

  useEffect(() => {
    if (assistantResponseSlotForActiveChat) return;

    const container = messagesScrollRef.current;
    if (!container) return;

    if (scrollAnimationFrameRef.current) {
      cancelAnimationFrame(scrollAnimationFrameRef.current);
      scrollAnimationFrameRef.current = null;
    }

    const startTop = container.scrollTop;
    const targetTop = Math.max(0, container.scrollHeight - container.clientHeight);
    if (targetTop <= startTop + 1) {
      return;
    }

    const startTime = performance.now();
    const duration = 320;

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);

      container.scrollTop = startTop + ((targetTop - startTop) * eased);

      if (progress < 1) {
        scrollAnimationFrameRef.current = requestAnimationFrame(step);
        return;
      }

      container.scrollTop = targetTop;
      scrollAnimationFrameRef.current = null;
    };

    scrollAnimationFrameRef.current = requestAnimationFrame(step);

    return () => {
      if (scrollAnimationFrameRef.current) {
        cancelAnimationFrame(scrollAnimationFrameRef.current);
        scrollAnimationFrameRef.current = null;
      }
    };
  }, [assistantResponseSlotForActiveChat, displayedMessages.length, streamEvents.length]);

  useEffect(() => {
    if (!assistantResponseSlotForActiveChat?.actualMessageId) return;

    const container = messagesScrollRef.current;
    const slotNode = assistantSlotNodeRef.current;
    if (!container || !slotNode) return;

    let observer: ResizeObserver | null = null;
    let rafId: number | null = null;

    const ensureSlotVisible = () => {
      const measureOverflow = () => (
        (slotNode.offsetTop + slotNode.offsetHeight) - (container.scrollTop + container.clientHeight) + 12
      );

      const initialOverflow = measureOverflow();
      if (initialOverflow <= 2) {
        return;
      }

      if (scrollAnimationFrameRef.current) {
        cancelAnimationFrame(scrollAnimationFrameRef.current);
        scrollAnimationFrameRef.current = null;
      }

      const startTop = container.scrollTop;
      const startTime = performance.now();
      const duration = 320;

      const step = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const liveOverflow = Math.max(0, measureOverflow());
        const liveTargetTop = startTop + initialOverflow + Math.max(0, liveOverflow - initialOverflow);

        container.scrollTop = startTop + ((liveTargetTop - startTop) * eased);

        if (progress < 1) {
          scrollAnimationFrameRef.current = requestAnimationFrame(step);
          return;
        }

        container.scrollTop += Math.max(0, measureOverflow());
        scrollAnimationFrameRef.current = null;
      };

      scrollAnimationFrameRef.current = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(() => {
      ensureSlotVisible();
    });

    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        ensureSlotVisible();
      });
      observer.observe(slotNode);
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      observer?.disconnect();
    };
  }, [assistantResponseSlotForActiveChat?.actualMessageId]);

  useEffect(() => {
    if (!isPropertiesOpen || !activeChat) return;
    const activeAgent = (agents ?? []).find((agent) => agent.id === (activeChat.agent_id ?? '')) ?? null;
    setPropertiesModeView(
      activeChat.mode === 'general'
        ? 'general'
        : activeAgent?.is_coding_model
          ? 'coding'
          : 'other',
    );
    setPropertiesAgentId(activeChat.agent_id ?? '');
    setPropertiesModel(activeChat.model_external_id ?? 'openai/gpt-4o-mini');
    setPropertiesToolIds(activeChat.tool_ids ?? []);
    setPropertiesAccess(activeChat.access ?? 'public');
    setPropertiesAllowedText((activeChat.access_identifiers ?? []).join('\n'));
  }, [isPropertiesOpen, activeChat, agents]);

  useEffect(() => {
    setIsQuickPromptsOpen(displayedMessages.length === 0);
    previousMessageCountRef.current = displayedMessages.length;
    setComposerPrefill(null);
  }, [activeChat?.id]);

  useEffect(() => {
    if (previousMessageCountRef.current === 0 && displayedMessages.length > 0) {
      setIsQuickPromptsOpen(false);
    }
    previousMessageCountRef.current = displayedMessages.length;
  }, [displayedMessages.length]);

  useEffect(() => {
    return () => {
      if (shareToastTimerRef.current) clearTimeout(shareToastTimerRef.current);
      if (messageEnterCleanupTimerRef.current) clearTimeout(messageEnterCleanupTimerRef.current);
      if (scrollAnimationFrameRef.current) cancelAnimationFrame(scrollAnimationFrameRef.current);
    };
  }, []);

  const filteredChats = useMemo(() => {
    if (!chats) return [];
    if (!search.trim()) return chats;
    const q = search.trim().toLowerCase();
    return chats.filter((chat) => {
      const title = (chat.title || '').toLowerCase();
      const preview = (chat.last_message_preview || '').toLowerCase();
      return title.includes(q) || preview.includes(q);
    });
  }, [chats, search]);

  const draftChats = filteredChats.filter((chat) => chat.message_count === 0);
  const regularChats = filteredChats.filter((chat) => chat.message_count > 0);
  const showMobileList = !isDesktop && !activeChatId;
  const showSidebar = isDesktop || showMobileList;
  const showChatPane = isDesktop || !!activeChatId;

  const modeOptions = useMemo(
    () => [
      { value: 'general', label: 'Общение' },
      ...(agents ?? []).map((agent) => {
        const pricing = formatAgentPricing(agent);
        return {
          value: `agent:${agent.id}`,
          label: `Агент: ${agent.name}${pricing ? ` (${pricing})` : ''}`,
        };
      }),
    ],
    [agents],
  );
  const propertiesModeOptions = useMemo(
    () => [
      { value: 'general', label: 'Общение' },
      { value: 'coding', label: 'Coding' },
      { value: 'other', label: 'Другие' },
    ],
    [],
  );
  const generalModelOptions = useMemo(
    () => GENERAL_MODELS.map((model) => ({
      value: model.value,
      label: `${model.label} • ${formatGeneralModelPricing(model)}`,
    })),
    [],
  );
  const sortedAgentOptions = useMemo(
    () => [...(agents ?? [])].sort((left, right) => {
      const leftPrice = (left.pricing_input_usd_per_million ?? Number.POSITIVE_INFINITY)
        + (left.pricing_output_usd_per_million ?? Number.POSITIVE_INFINITY);
      const rightPrice = (right.pricing_input_usd_per_million ?? Number.POSITIVE_INFINITY)
        + (right.pricing_output_usd_per_million ?? Number.POSITIVE_INFINITY);

      if (leftPrice !== rightPrice) {
        return leftPrice - rightPrice;
      }

      return left.name.localeCompare(right.name, 'ru');
    }),
    [agents],
  );
  const codingAgentOptions = useMemo(
    () => sortedAgentOptions.filter((agent) => agent.is_coding_model),
    [sortedAgentOptions],
  );
  const otherAgentOptions = useMemo(
    () => sortedAgentOptions.filter((agent) => !agent.is_coding_model),
    [sortedAgentOptions],
  );
  const propertiesSelectedAgent = useMemo(
    () => (agents ?? []).find((agent) => agent.id === propertiesAgentId) ?? null,
    [agents, propertiesAgentId],
  );
  const propertiesSelectedGeneralModel = useMemo(
    () => GENERAL_MODELS.find((model) => model.value === propertiesModel) ?? null,
    [propertiesModel],
  );
  const propertiesAvailableTools = useMemo(
    () => availableTools ?? [],
    [availableTools],
  );
  const propertiesSelectedTools = useMemo(
    () => propertiesAvailableTools.filter((tool) => propertiesToolIds.includes(tool.id)),
    [propertiesAvailableTools, propertiesToolIds],
  );
  const quickConnectTools = useMemo(
    () => propertiesAvailableTools.filter((tool) => (
      tool.slug === 'http-request' || tool.slug === 'web-search-cascade'
    )),
    [propertiesAvailableTools],
  );
  const isPropertiesAgentMode = propertiesModeView !== 'general';

  const activeModeValue = useMemo(() => {
    if (!activeChat) return '';
    if (activeChat.mode === 'general') return 'general';
    return activeChat.agent_id ? `agent:${activeChat.agent_id}` : 'general';
  }, [activeChat]);

  const activeAgentListMeta = useMemo(() => {
    if (!activeChat?.agent_id) return null;
    return (agents ?? []).find((a) => a.id === activeChat.agent_id) ?? null;
  }, [activeChat?.agent_id, agents]);

  const activeAgentName = activeChatData?.chat.agent_name ?? activeAgentListMeta?.name ?? null;
  const activeAgentDescription =
    activeChatData?.chat.agent_chat_description
    ?? activeAgentListMeta?.chat_description
    ?? activeAgentListMeta?.description
    ?? null;
  const activeAgentPricing = activeAgentListMeta ? formatAgentPricing(activeAgentListMeta) : null;
  const activeGeneralModel = useMemo(
    () => GENERAL_MODELS.find((model) => model.value === activeChat?.model_external_id) ?? null,
    [activeChat?.model_external_id],
  );
  const activeStarterPrompts =
    activeChatData?.chat.agent_starter_prompts
    ?? activeAgentListMeta?.starter_prompts
    ?? [];
  const canShowQuickPrompts = activeChat?.mode === 'agent' && activeStarterPrompts.length > 0;
  const hasAvailableBalance = profile ? Number(profile.balance_usd) > 0 : true;
  const isSubmittingMessage = sendMessageMutation.isPending || uploadFilesMutation.isPending || isAwaitingLateReply;
  const sidebarLoading = chatsLoading || agentsLoading;
  const userMessageAuthorLabel = profile?.username?.trim()
    ? (
      <UserLink
        username={profile.username.trim()}
        name={profile.name?.trim() || null}
        className="hover:text-primary hover:underline"
      />
    )
    : (profile?.name?.trim() || 'Вы');

  const getAssistantAuthorLabel = (message: ChatMessageType) => {
    const usageModel = getUsageModel(message.usage);
    if (usageModel) return usageModel;

    if (activeChat?.model_external_id?.trim()) {
      return activeChat.model_external_id.trim();
    }

    return 'AI';
  };

  useEffect(() => {
    if (!assistantResponseSlotForActiveChat || assistantResponseSlotForActiveChat.actualMessageId) return;

    const resolvedAssistant = [...messages].reverse().find((message) => (
      message.role === 'assistant' && Date.parse(message.created_at) >= Date.parse(assistantResponseSlotForActiveChat.startedAt)
    ));

    if (!resolvedAssistant) return;

    setAssistantResponseSlot((prev) => (
      prev && prev.chatId === activeChat?.id
        ? { ...prev, actualMessageId: resolvedAssistant.id }
        : prev
    ));
  }, [activeChat?.id, assistantResponseSlotForActiveChat, messages]);

  const createNewChat = async () => setIsCreateDialogOpen(true);

  const triggerImportChat = () => {
    importFileInputRef.current?.click();
  };

  const handleImportChatFile = async (event: { target: HTMLInputElement & EventTarget }) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setLocalError(null);
    try {
      const imported = await importChatBundleMutation.mutateAsync(file);
      setActiveChatId(imported.id);
      setLocalNoticeTone('warning');
      setLocalError(`Чат импортирован: ${imported.title}`);
    } catch (error) {
      showLocalError(getApiErrorMessage(error) ?? 'Не удалось импортировать чат');
    }
  };

  const exportChatBundle = async (chatId: string) => {
    setLocalError(null);
    setOpenMenu(null);
    try {
      const bundle = await chatsApi.exportBundle(chatId);
      downloadChatBundle(bundle.filename, bundle.payload);
    } catch (error) {
      showLocalError(getApiErrorMessage(error) ?? 'Не удалось экспортировать чат');
    }
  };

  const createChatFromDialog = async () => {
    setLocalError(null);
    if (newChatMode === 'agent' && !newChatAgentId) {
      showLocalError('Выберите агента для нового чата');
      return;
    }

    try {
      const created = await createChatMutation.mutateAsync({
        mode: newChatMode,
        title: 'Новый чат',
        agent_id: newChatMode === 'agent' ? newChatAgentId : null,
        model_external_id: newChatMode === 'general' ? newChatModel : null,
      });
      setActiveChatId(created.id);
      setIsCreateDialogOpen(false);
      setNewChatMode('general');
      setNewChatAgentId('');
      setNewChatAgentSearch('');
      setNewChatModel('openai/gpt-4o-mini');
    } catch {
      showLocalError('Не удалось создать чат');
    }
  };

  const updateActiveGeneralModel = async (modelExternalId: string) => {
    if (!activeChat || activeChat.mode !== 'general') return;
    if (activeChat.model_external_id === modelExternalId) return;

    setLocalError(null);
    try {
      await updateChatMutation.mutateAsync({
        chatId: activeChat.id,
        mode: 'general',
        agent_id: null,
        model_external_id: modelExternalId,
      });
    } catch {
      showLocalError('Не удалось сменить модель чата');
    }
  };

  const renameChat = async (chat: ChatListItem) => {
    const next = window.prompt('Новое имя чата', chat.title);
    if (!next) return;
    const title = next.trim();
    if (!title) return;
    setLocalError(null);
    try {
      await updateChatMutation.mutateAsync({ chatId: chat.id, title });
    } catch {
      showLocalError('Не удалось переименовать чат');
    } finally {
      setOpenMenu(null);
    }
  };

  const deleteChat = async (chatId: string) => {
    setLocalError(null);
    try {
      await deleteChatMutation.mutateAsync(chatId);
      if (activeChatId === chatId) setActiveChatId(null);
    } catch {
      showLocalError('Не удалось удалить чат');
    } finally {
      setOpenMenu(null);
    }
  };

  const shareChat = async (chatId: string) => {
    setLocalError(null);
    try {
      const { share_token } = await shareChatMutation.mutateAsync(chatId);
      const url = `${window.location.origin}/shared/chats/${share_token}`;
      await navigator.clipboard.writeText(url);
      setShareToastVisible(true);
      if (shareToastTimerRef.current) clearTimeout(shareToastTimerRef.current);
      shareToastTimerRef.current = setTimeout(() => setShareToastVisible(false), 2000);
    } catch {
      showLocalError('Не удалось поделиться чатом');
    } finally {
      setOpenMenu(null);
    }
  };

  const openProperties = (chatId: string) => {
    setActiveChatId(chatId);
    setOpenMenu(null);
    setPropertiesError(null);
    setIsPropertiesOpen(true);
  };

  const togglePropertiesTool = (toolId: string) => {
    setPropertiesToolIds((prev) => (
      prev.includes(toolId)
        ? prev.filter((id) => id !== toolId)
        : [...prev, toolId]
    ));
  };

  const saveProperties = async () => {
    if (!activeChat) return;
    setLocalError(null);
    setPropertiesError(null);
    if (isPropertiesAgentMode && !propertiesAgentId) {
      setPropertiesError('Выберите агента для режима чата');
      return;
    }
    const accessIdentifiers = propertiesAllowedText
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (propertiesAccess === 'restricted' && accessIdentifiers.length === 0) {
      setPropertiesError('Для ограниченного доступа укажите хотя бы один email или @логин');
      return;
    }
    setPropertiesSaving(true);
    try {
      await updateChatMutation.mutateAsync({
        chatId: activeChat.id,
        mode: isPropertiesAgentMode ? 'agent' : 'general',
        agent_id: isPropertiesAgentMode ? propertiesAgentId : null,
        model_external_id: isPropertiesAgentMode ? null : propertiesModel,
        tool_ids: propertiesToolIds,
        access: propertiesAccess,
        access_identifiers: accessIdentifiers,
      });
      setIsPropertiesOpen(false);
    } catch (error) {
      setPropertiesError(getApiErrorMessage(error) ?? 'Не удалось сохранить свойства чата');
    } finally {
      setPropertiesSaving(false);
    }
  };

  const handleModeChange = async (value: string) => {
    if (!activeChat) return;
    setLocalError(null);
    try {
      if (value === 'general') {
        await updateChatMutation.mutateAsync({ chatId: activeChat.id, mode: 'general', agent_id: null });
        return;
      }
      if (value.startsWith('agent:')) {
        await updateChatMutation.mutateAsync({
          chatId: activeChat.id,
          mode: 'agent',
          agent_id: value.replace('agent:', ''),
        });
      }
    } catch {
      showLocalError('Не удалось изменить режим чата');
    }
  };

  const handlePropertiesModeViewChange = (value: string) => {
    const nextValue = value as PropertiesModeView;
    setPropertiesModeView(nextValue);

    if (nextValue === 'coding') {
      const currentIsCoding = codingAgentOptions.some((agent) => agent.id === propertiesAgentId);
      if (!currentIsCoding && codingAgentOptions[0]) {
        setPropertiesAgentId(codingAgentOptions[0].id);
      }
      return;
    }

    if (nextValue === 'other') {
      const currentIsOther = otherAgentOptions.some((agent) => agent.id === propertiesAgentId);
      if (!currentIsOther && otherAgentOptions[0]) {
        setPropertiesAgentId(otherAgentOptions[0].id);
      }
    }
  };

  const recoverLateAssistantReply = async (chatId: string, startedAt: string) => {
    setIsAwaitingLateReply(true);

    const startedAtMs = Date.parse(startedAt);
    const deadline = Date.now() + 180_000;

    while (Date.now() < deadline) {
      await sleep(4_000);

      try {
        const latest = await chatsApi.get(chatId);
        queryClient.setQueryData<ChatDetails>(['chats', chatId], latest);
        queryClient.invalidateQueries({ queryKey: ['chats'] });
        queryClient.invalidateQueries({ queryKey: ['profile'] });

        const hasAssistantReply = latest.messages.some((message) => (
          message.role === 'assistant' && Date.parse(message.created_at) >= startedAtMs
        ));

        if (hasAssistantReply) {
          setLocalError(null);
          setIsAwaitingLateReply(false);
          return true;
        }
      } catch {
        // The run may still be finishing in the background.
      }
    }

    setIsAwaitingLateReply(false);
    return false;
  };

  const sendMessage = async (content: string, files: File[] = []) => {
    if (!activeChat) return;
    if (!hasAvailableBalance) {
      setIsTopUpOpen(true);
      showLocalError('У вас не осталось баланса. Скоро вы сможете пополнить его на сайте, а пока можете написать Родиону.');
      return;
    }

    const chatId = activeChat.id;
    const optimisticAttachments = files.map((file) => ({
      filename: file.name,
      original_name: file.name,
      mime_type: file.type || 'application/octet-stream',
      size: file.size,
      kind: inferOptimisticAttachmentKind(file),
      url: URL.createObjectURL(file),
    }));

    setLocalError(null);
    setStreamEvents([]);
    setOptimisticPendingMessage({
      chatId,
      objectUrls: optimisticAttachments.map((file) => file.url),
      message: {
        id: `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        role: 'user',
        content,
        run_id: null,
        usage: null,
        attachments: optimisticAttachments,
        latency_ms: null,
        created_at: new Date().toISOString(),
      },
    });
    const startedAt = new Date().toISOString();
    setAssistantResponseSlot({
      chatId,
      visualKey: `assistant-slot-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      startedAt,
      label: 'Думаю...',
      detail: 'Собираю ответ, инструменты и preview, если он нужен.',
      actualMessageId: null,
    });

    try {
      const attachments = files.length > 0 ? await uploadFilesMutation.mutateAsync(files) : [];
      const result = await sendMessageMutation.mutateAsync({ chatId, content, attachments });
      const optimisticVisualKey = optimisticPendingMessage?.chatId === chatId
        ? optimisticPendingMessage.message.id
        : result.user_message.id;
      animatedMessageIdsRef.current.add(result.user_message.id);
      messageVisualKeyByIdRef.current.set(result.user_message.id, optimisticVisualKey);

      queryClient.setQueryData<ChatDetails>(['chats', chatId], (prev) => {
        if (!prev) return prev;

        const nextMessages = prev.messages.filter((message) => (
          message.id !== result.user_message.id && message.id !== result.assistant_message.id
        ));

        return {
          ...prev,
          chat: {
            ...prev.chat,
            ...result.chat,
          },
          messages: [...nextMessages, result.user_message, result.assistant_message],
        };
      });

      setAssistantResponseSlot((prev) => (
        prev && prev.chatId === chatId
          ? { ...prev, actualMessageId: result.assistant_message.id }
          : prev
      ));
      setOptimisticPendingMessage((prev) => (prev?.chatId === chatId ? null : prev));
    } catch (err) {
      setOptimisticPendingMessage((prev) => (prev?.chatId === chatId ? null : prev));
      const code = getApiErrorCode(err);
      const status = getApiErrorStatus(err);
      if (code === 'INSUFFICIENT_BALANCE') {
        setAssistantResponseSlot((prev) => (prev?.chatId === chatId ? null : prev));
        setIsTopUpOpen(true);
        showLocalError(getApiErrorMessage(err) || 'У вас не осталось баланса. Скоро вы сможете пополнить его на сайте.');
        return;
      }
      if (status === 504) {
        showLocalWarning('Ответ от модели занял слишком много времени. Проверяю, не завершился ли он в фоне...');
        const recovered = await recoverLateAssistantReply(chatId, startedAt);
        if (!recovered) {
          setAssistantResponseSlot((prev) => (prev?.chatId === chatId ? null : prev));
          showLocalError('Провайдер слишком долго отвечал, и запрос оборвался по таймауту. Попробуйте ещё раз или выберите более быстрый агент.');
        }
        return;
      }
      setAssistantResponseSlot((prev) => (prev?.chatId === chatId ? null : prev));
      showLocalError(err instanceof Error ? err.message : 'Не удалось отправить сообщение');
    }
  };

  const editMessage = async (messageId: string, content: string) => {
    if (!activeChat) return;

    setLocalError(null);
    setStreamEvents([]);
    setOptimisticPendingMessage(null);
    setDebugThinkingPreview(null);
    setAssistantResponseSlot((prev) => (prev?.chatId === activeChat.id ? null : prev));

    try {
      await truncateChatFromMessageMutation.mutateAsync({
        chatId: activeChat.id,
        messageId,
      });

      queryClient.setQueryData<ChatDetails>(['chats', activeChat.id], (prev) => {
        if (!prev) return prev;
        const targetIndex = prev.messages.findIndex((message) => message.id === messageId);
        if (targetIndex === -1) return prev;

        return {
          ...prev,
          messages: prev.messages.slice(0, targetIndex),
        };
      });

      setComposerPrefill({
        text: content,
        token: Date.now(),
      });
    } catch (error) {
      throw new Error(getApiErrorMessage(error) ?? 'Не удалось подготовить сообщение к редактированию');
    }
  };

  const assistantSlotResolvedMessage = assistantResponseSlotForActiveChat?.actualMessageId
    ? messages.find((message) => message.id === assistantResponseSlotForActiveChat.actualMessageId) ?? null
    : null;

  const renderChatRow = (chat: ChatListItem) => (
    <div
      key={chat.id}
      className={cn(
        'relative rounded-md px-2 py-2 transition-colors',
        activeChatId === chat.id ? 'bg-accent text-foreground' : 'hover:bg-accent/60',
      )}
    >
      <button type="button" onClick={() => setActiveChatId(chat.id)} className="w-full pr-8 text-left">
        <p className="truncate text-sm font-medium">{chat.title}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {getChatListMeta(chat)}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {formatChatPreview(chat.last_message_preview) || (chat.mode === 'general' ? 'Общение' : 'Чат с ботом')}
        </p>
        <p className="text-xs text-muted-foreground">{formatDate(chat.last_message_at)}</p>
      </button>

      <div className="absolute right-2 top-2" ref={openMenu?.kind === 'chat' && openMenu.id === chat.id ? menuRef : null}>
        <button
          type="button"
          className="h-7 w-7 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            setOpenMenu((prev) => (prev?.kind === 'chat' && prev.id === chat.id ? null : { kind: 'chat', id: chat.id }));
          }}
          aria-label="Действия чата"
        >
          ...
        </button>
        {openMenu?.kind === 'chat' && openMenu.id === chat.id && (
          <div className="absolute right-0 top-8 z-20 w-44 rounded-md border bg-white p-1 shadow-lg">
            <button type="button" className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={() => renameChat(chat)}>
              Переименовать
            </button>
            <button type="button" className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={() => openProperties(chat.id)}>
              Свойства
            </button>
            <button type="button" className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={() => exportChatBundle(chat.id)}>
              Экспортировать
            </button>
            <button type="button" className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={() => deleteChat(chat.id)}>
              Удалить
            </button>
            <button type="button" className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={() => shareChat(chat.id)}>
              Поделиться
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="px-4 py-6">
      <input
        ref={importFileInputRef}
        type="file"
        accept=".json,.llmchat,.llmchat.json,application/json,text/json,text/plain"
        className="hidden"
        onChange={handleImportChatFile}
      />

      <div className={cn('pointer-events-none fixed left-1/2 top-4 z-[70] -translate-x-1/2 rounded-lg border border-emerald-200 bg-emerald-500 px-4 py-2 text-sm font-medium text-white shadow-lg transition-all duration-500', shareToastVisible ? 'translate-y-0 opacity-100' : '-translate-y-16 opacity-0')}>
        Ссылка скопирована
      </div>

      <div className="mx-auto flex h-[calc(100vh-12rem)] max-w-7xl overflow-hidden rounded-xl border bg-white">
        {showSidebar && (
        <aside className={cn('flex w-full shrink-0 flex-col', isDesktop ? 'max-w-xs border-r' : 'max-w-none')}>
          <div className="border-b p-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Button className="w-full" onClick={createNewChat} disabled={createChatMutation.isPending}>Новый чат</Button>
              <Button variant="outline" className="w-full" onClick={triggerImportChat} disabled={importChatBundleMutation.isPending}>
                {importChatBundleMutation.isPending ? 'Импорт...' : 'Импорт'}
              </Button>
            </div>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск чата..." />
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-4">
            {sidebarLoading && <div className="flex justify-center py-8"><Spinner /></div>}
            {!sidebarLoading && draftChats.length > 0 && <section className="space-y-1"><p className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Черновики</p>{draftChats.map(renderChatRow)}</section>}
            {!sidebarLoading && regularChats.length > 0 && <section className="space-y-1"><p className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Чаты</p>{regularChats.map(renderChatRow)}</section>}
            {!sidebarLoading && (!chats || chats.length === 0) && <div className="p-2 text-sm text-muted-foreground space-y-2"><p>У вас пока нет чатов.</p><button type="button" className="text-primary hover:underline" onClick={createNewChat}>Создать первый чат</button></div>}
          </div>
        </aside>
        )}

        {showChatPane && (
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="border-b px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate font-semibold">{activeChat?.title ?? 'Чаты'}</h1>
              <p className="truncate text-xs text-muted-foreground">
                {activeChat?.mode === 'general'
                  ? `OpenRouter: ${activeChat?.model_external_id ?? 'openai/gpt-4o-mini'}`
                  : activeAgentName
                    ? `Агент: ${activeAgentName}`
                    : 'Чат с агентом'}
              </p>
            </div>
            {activeChat && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportChatBundle(activeChat.id)}
                >
                  Экспорт
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => shareChat(activeChat.id)}
                  disabled={shareChatMutation.isPending}
                >
                  Поделиться
                </Button>
                <Select options={modeOptions} value={activeModeValue} onChange={(e) => handleModeChange(e.target.value)} className="w-64" />
              </div>
            )}
          </div>

          <div ref={messagesScrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {activeChatLoading && displayedMessages.length === 0 && <div className="flex justify-center py-8"><Spinner /></div>}
            {!activeChatLoading && activeChat && displayedMessages.length === 0 && (
              <div className="py-8">
                {activeChat.mode === 'agent' && (activeAgentName || activeStarterPrompts.length > 0 || activeAgentDescription) ? (
                  <div className="mx-auto max-w-3xl rounded-xl border bg-muted/20 p-5 space-y-4">
                    <div>
                      <h3 className="text-base font-semibold">{activeAgentName ?? 'Агент'}</h3>
                      {activeAgentPricing ? (
                        <p className="mt-1 text-xs text-muted-foreground">{activeAgentPricing}</p>
                      ) : null}
                      <p className="mt-1 text-sm text-muted-foreground">
                        {activeAgentDescription || 'Опишите задачу агенту простыми словами, и он начнет работу.'}
                      </p>
                    </div>
                    {activeStarterPrompts.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Примеры сообщений</p>
                        <div className="flex flex-wrap gap-2">
                          {activeStarterPrompts.map((prompt, idx) => (
                            <Button key={`${prompt}-${idx}`} type="button" variant="outline" size="sm" disabled={isSubmittingMessage || !hasAvailableBalance} onClick={() => sendMessage(prompt)}>
                              {prompt}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : activeChat.mode === 'general' ? (
                  <div className="mx-auto max-w-3xl rounded-xl border bg-muted/20 p-5 space-y-4">
                    <div>
                      <h3 className="text-base font-semibold">
                        {activeGeneralModel?.label ?? activeChat.model_external_id ?? 'OpenRouter'}
                      </h3>
                      <div className="mt-3 max-w-md">
                        <Select
                          value={activeChat.model_external_id ?? 'openai/gpt-4o-mini'}
                          options={generalModelOptions}
                          onChange={(e) => updateActiveGeneralModel(e.target.value)}
                          disabled={updateChatMutation.isPending}
                          className="w-full"
                        />
                      </div>
                      {activeGeneralModel ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatGeneralModelPricing(activeGeneralModel)}
                        </p>
                      ) : null}
                      <p className="mt-1 text-sm text-muted-foreground">
                        {activeGeneralModel?.description || 'Выбрана модель для обычного общения через OpenRouter. Отправьте первое сообщение, чтобы начать диалог.'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground">История пока пустая. Отправьте первое сообщение.</div>
                )}
              </div>
            )}
            {!activeChatLoading && !activeChat && <div className="py-12 text-center text-muted-foreground">Выберите чат слева или создайте новый.</div>}
            {streamEvents.length > 0 && (
              <div className="mx-auto max-w-3xl rounded-xl border border-sky-200 bg-sky-50/80 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-sky-950">Живой процесс выполнения</p>
                    <p className="text-xs text-sky-900/70">
                      {streamConnected ? 'SSE подключен' : 'Ожидаю переподключение к SSE'}
                    </p>
                  </div>
                  {isSubmittingMessage && (
                    <div className="flex items-center gap-2 text-xs text-sky-900/80">
                      <Spinner size="sm" /> Агент работает
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  {streamEvents.map((event) => (
                    <div key={event.id} className="rounded-lg border border-sky-200/80 bg-white/80 px-3 py-2">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm text-slate-900">{event.label}</p>
                          {(event.tool_name || event.status || event.error) && (
                            <p className="mt-1 text-xs text-slate-500">
                              {[event.tool_name, event.status, event.error].filter(Boolean).join(' • ')}
                            </p>
                          )}
                        </div>
                        {event.ts && (
                          <span className="shrink-0 text-[11px] text-slate-400">
                            {formatDate(event.ts)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {displayedMessages
              .filter((msg) => msg.id !== assistantResponseSlotForActiveChat?.actualMessageId)
              .map((msg: ChatMessageType) => (
              <div
                key={messageVisualKeyByIdRef.current.get(msg.id) ?? msg.id}
                ref={(node) => {
                  if (node) {
                    messageNodeRefs.current.set(msg.id, node);
                  } else {
                    messageNodeRefs.current.delete(msg.id);
                  }
                }}
              >
                {(() => {
                  const resolvedAttachments = msg.attachments ?? extractAttachments(msg.usage);
                  const shouldAnimateMessage = msg.id.startsWith('optimistic-') || msg.id.startsWith('debug-fake-');
                  const canEditUserMessage = (
                    msg.role === 'user'
                    && Boolean(activeChat)
                    && !msg.id.startsWith('optimistic-')
                    && !msg.id.startsWith('debug-fake-')
                    && resolvedAttachments.length === 0
                  );

                  return (
                <ChatMessage
                  role={msg.role}
                  content={msg.content}
                  animateOnMount={shouldAnimateMessage}
                  authorLabel={msg.role === 'user' ? userMessageAuthorLabel : getAssistantAuthorLabel(msg)}
                  attachments={resolvedAttachments}
                  toolTraces={msg.role === 'assistant' ? extractToolTraces(msg.usage) : undefined}
                  codingReport={msg.role === 'assistant' ? extractCodingReport(msg.usage, msg.content) : undefined}
                  previewPageUrl={msg.role === 'assistant' && activeChat
                    ? (activeChat.share_token
                      ? `/api/shared/chats/${activeChat.share_token}/messages/${msg.id}/preview`
                      : `/api/chats/${activeChat.id}/messages/${msg.id}/preview`)
                    : undefined}
                  canEditPreview={msg.role === 'assistant' && Boolean(activeChat)}
                  onSavePreview={msg.role === 'assistant' && activeChat
                    ? async (payload) => {
                      try {
                        await updatePreviewMutation.mutateAsync({
                          chatId: activeChat.id,
                          messageId: msg.id,
                          ...payload,
                        });
                      } catch (error) {
                        throw new Error(getApiErrorMessage(error) ?? 'Не удалось сохранить preview');
                      }
                    }
                    : undefined}
                  canRunProject={msg.role === 'assistant' && Boolean(activeChat)}
                  onRunProject={msg.role === 'assistant' && activeChat
                    ? async () => chatsApi.runProject(activeChat.id, msg.id)
                    : undefined}
                  canEditMessage={canEditUserMessage}
                  onEditMessage={canEditUserMessage
                    ? async () => {
                      await editMessage(msg.id, msg.content);
                    }
                    : undefined}
                  canDeleteMessage={Boolean(activeChat) && !msg.id.startsWith('optimistic-') && !msg.id.startsWith('debug-fake-')}
                  onDeleteMessage={activeChat
                    && !msg.id.startsWith('optimistic-')
                    && !msg.id.startsWith('debug-fake-')
                    ? async () => {
                      try {
                        await deleteChatMessageMutation.mutateAsync({
                          chatId: activeChat.id,
                          messageId: msg.id,
                        });
                      } catch (error) {
                        throw new Error(getApiErrorMessage(error) ?? 'Не удалось удалить сообщение');
                      }
                    }
                    : undefined}
                />
                  );
                })()}
                {msg.role === 'assistant' && (
                  <div className="mt-1 ml-1">
                    <RunMetadata
                      usage={extractUsage(msg.usage)}
                      latencyMs={msg.latency_ms ?? undefined}
                      createdAt={msg.created_at}
                      agentName={activeChat?.mode === 'agent' ? (activeAgentName ?? undefined) : undefined}
                    />
                  </div>
                )}
              </div>
            ))}
            {assistantResponseSlotForActiveChat && (
              <div
                key={assistantResponseSlotForActiveChat.visualKey}
                ref={(node) => {
                  assistantSlotNodeRef.current = node;
                }}
              >
                {assistantSlotResolvedMessage ? (
                  <>
                    <ChatMessage
                      role={assistantSlotResolvedMessage.role}
                      content={assistantSlotResolvedMessage.content}
                      animateOnMount={false}
                      authorLabel={getAssistantAuthorLabel(assistantSlotResolvedMessage)}
                      attachments={assistantSlotResolvedMessage.attachments ?? extractAttachments(assistantSlotResolvedMessage.usage)}
                      toolTraces={extractToolTraces(assistantSlotResolvedMessage.usage)}
                      codingReport={extractCodingReport(assistantSlotResolvedMessage.usage, assistantSlotResolvedMessage.content)}
                      previewPageUrl={activeChat
                        ? (activeChat.share_token
                          ? `/api/shared/chats/${activeChat.share_token}/messages/${assistantSlotResolvedMessage.id}/preview`
                          : `/api/chats/${activeChat.id}/messages/${assistantSlotResolvedMessage.id}/preview`)
                        : undefined}
                      canEditPreview={Boolean(activeChat)}
                      onSavePreview={activeChat
                        ? async (payload) => {
                          try {
                            await updatePreviewMutation.mutateAsync({
                              chatId: activeChat.id,
                              messageId: assistantSlotResolvedMessage.id,
                              ...payload,
                            });
                          } catch (error) {
                            throw new Error(getApiErrorMessage(error) ?? 'Не удалось сохранить preview');
                          }
                        }
                        : undefined}
                      canRunProject={Boolean(activeChat)}
                      onRunProject={activeChat
                        ? async () => chatsApi.runProject(activeChat.id, assistantSlotResolvedMessage.id)
                        : undefined}
                      canDeleteMessage={Boolean(activeChat)}
                      onDeleteMessage={activeChat
                        ? async () => {
                          try {
                            await deleteChatMessageMutation.mutateAsync({
                              chatId: activeChat.id,
                              messageId: assistantSlotResolvedMessage.id,
                            });
                            setAssistantResponseSlot((prev) => (
                              prev?.actualMessageId === assistantSlotResolvedMessage.id ? null : prev
                            ));
                          } catch (error) {
                            throw new Error(getApiErrorMessage(error) ?? 'Не удалось удалить сообщение');
                          }
                        }
                        : undefined}
                    />
                    <div className="mt-1 ml-1">
                      <RunMetadata
                        usage={extractUsage(assistantSlotResolvedMessage.usage)}
                        latencyMs={assistantSlotResolvedMessage.latency_ms ?? undefined}
                        createdAt={assistantSlotResolvedMessage.created_at}
                        agentName={activeChat?.mode === 'agent' ? (activeAgentName ?? undefined) : undefined}
                      />
                    </div>
                  </>
                ) : (
                  <ChatThinkingBubble
                    label={assistantResponseSlotForActiveChat.label}
                    detail={assistantResponseSlotForActiveChat.detail}
                  />
                )}
              </div>
            )}
          </div>

          {localError && (
            <div
              className={cn(
                'border-t px-4 py-2 text-sm',
                localNoticeTone === 'warning'
                  ? 'border-amber-200/80 bg-amber-50 text-amber-900'
                  : 'bg-destructive/10 text-destructive',
              )}
            >
              {localError}
            </div>
          )}

          <div className="border-t px-4 py-3 space-y-3">
            {canShowQuickPrompts && displayedMessages.length > 0 && (
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[11px] font-normal text-muted-foreground hover:text-foreground"
                  onClick={() => setIsQuickPromptsOpen((prev) => !prev)}
                >
                  {isQuickPromptsOpen ? 'Скрыть подсказки' : 'Подсказки'}
                </Button>
              </div>
            )}
            {canShowQuickPrompts && displayedMessages.length > 0 && isQuickPromptsOpen && (
              <div className="flex flex-wrap gap-2">
                {activeStarterPrompts.map((prompt, idx) => (
                  <Button key={`quick-${prompt}-${idx}`} type="button" variant="outline" size="sm" disabled={isSubmittingMessage || !hasAvailableBalance} onClick={() => sendMessage(prompt)}>
                    {prompt}
                  </Button>
                ))}
              </div>
            )}
            {!hasAvailableBalance && activeChat && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <TopUpHelp settings={appSettings} />
                <div className="mt-3">
                  <Link to="/profile">
                    <Button size="sm">Открыть профиль</Button>
                  </Link>
                </div>
              </div>
            )}
            <ChatInput
              onSend={sendMessage}
              allowAttachments
              prefill={composerPrefill}
              disabled={!activeChat || isSubmittingMessage || !hasAvailableBalance}
              placeholder={
                !activeChat
                  ? 'Сначала выберите чат'
                  : hasAvailableBalance
                    ? 'Введите сообщение...'
                    : 'Баланс закончился'
              }
            />
          </div>
        </section>
        )}
      </div>

      {isTopUpOpen && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/40 p-4" onClick={() => setIsTopUpOpen(false)}>
          <div className="w-full max-w-md rounded-xl border bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-b px-5 py-4"><h3 className="text-lg font-semibold">Недостаточно баланса</h3></div>
            <div className="px-5 py-4">
              <TopUpHelp settings={appSettings} />
            </div>
            <div className="border-t px-5 py-4 flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsTopUpOpen(false)}>Закрыть</Button>
              <Link to="/profile" onClick={() => setIsTopUpOpen(false)}><Button size="sm">Открыть профиль</Button></Link>
            </div>
          </div>
        </div>
      )}

      {isCreateDialogOpen && (
        <div
          className="fixed inset-0 z-[86] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setIsCreateDialogOpen(false)}
        >
          <div
            className="w-full max-w-xl rounded-2xl border bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b px-6 py-5">
              <h3 className="text-xl font-semibold">Новый чат</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Выберите режим, чтобы начать диалог.
              </p>
            </div>

            <div className="px-6 py-5 space-y-5">
              <div className="rounded-xl border bg-muted/20 p-4 space-y-2">
                <p className="text-sm font-medium">Режим чата</p>
                <Select
                  value={newChatMode}
                  onChange={(e) => setNewChatMode(e.target.value as 'general' | 'agent')}
                  options={[
                    { value: 'general', label: 'Общение через OpenRouter' },
                    { value: 'agent', label: 'Чат с агентом' },
                  ]}
                  className="w-full"
                />
              </div>

              {newChatMode === 'general' && (
                <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Выберите модель для общения</p>
                    <p className="text-xs text-muted-foreground">
                      Под каждой моделью видно, для чего она лучше подходит и сколько стоит.
                    </p>
                  </div>
                  <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border bg-background p-2">
                    {GENERAL_MODELS.map((model) => {
                      const isSelected = newChatModel === model.value;

                      return (
                        <button
                          key={model.value}
                          type="button"
                          onClick={() => setNewChatModel(model.value)}
                          className={cn(
                            'w-full rounded-lg border px-3 py-3 text-left transition-colors',
                            isSelected
                              ? 'border-primary bg-primary/8 shadow-sm'
                              : 'border-border bg-background hover:border-primary/30 hover:bg-accent/40',
                          )}
                        >
                          <p className="text-sm font-medium text-foreground">{model.label}</p>
                          <p className="mt-1 break-all text-xs text-muted-foreground">{model.value}</p>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">{model.description}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{formatGeneralModelPricing(model)}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {newChatMode === 'agent' && (
                <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Выберите агента</p>
                    <p className="text-xs text-muted-foreground">
                      Ищите по названию, описанию или автору. Если поле пустое, ниже показаны самые популярные агенты.
                    </p>
                  </div>
                  <Input
                    value={newChatAgentSearch}
                    onChange={(e) => setNewChatAgentSearch(e.target.value)}
                    placeholder="Поиск агентов по названию, описанию или автору..."
                  />
                  {(agents ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Сейчас нет доступных активных агентов.
                    </p>
                  ) : visibleNewChatAgents.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      По вашему запросу агенты не найдены.
                    </p>
                  ) : (
                    <div className="max-h-80 space-y-2 overflow-y-auto rounded-xl border bg-background p-2">
                      <p className="px-2 pt-1 text-xs text-muted-foreground">
                        {newChatAgentSearch.trim() ? 'Результаты поиска' : 'Популярные агенты'}
                      </p>
                      {visibleNewChatAgents.map((agent) => {
                        const isSelected = newChatAgentId === agent.id;

                        return (
                          <button
                            key={agent.id}
                            type="button"
                            onClick={() => setNewChatAgentId(agent.id)}
                            className={cn(
                              'w-full rounded-lg border px-3 py-3 text-left transition-colors',
                              isSelected
                                ? 'border-primary bg-primary/8 shadow-sm'
                                : 'border-border bg-background hover:border-primary/30 hover:bg-accent/40',
                            )}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-medium text-foreground">{agent.name}</p>
                              <Badge variant={agent.is_owner ? 'secondary' : 'outline'}>
                                {agent.is_owner ? 'мой' : 'публичный'}
                              </Badge>
                              <Badge variant="outline">{agent.total_runs.toLocaleString('ru-RU')} запуск.</Badge>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Автор:{' '}
                              <UserLink
                                username={agent.owner_username}
                                name={agent.owner_name}
                                fallback="пользователь"
                                className="hover:text-foreground hover:underline"
                              />
                            </p>
                            {agent.chat_description && (
                              <p className="mt-1 text-xs leading-5 text-muted-foreground">{agent.chat_description}</p>
                            )}
                            {formatAgentPricing(agent) && (
                              <p className="mt-1 text-xs text-muted-foreground">{formatAgentPricing(agent)}</p>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="border-t px-6 py-4 flex items-center justify-end gap-2 bg-muted/10 rounded-b-2xl">
              <Button variant="outline" size="sm" onClick={() => setIsCreateDialogOpen(false)}>
                Отмена
              </Button>
              <Button
                size="sm"
                onClick={createChatFromDialog}
                disabled={createChatMutation.isPending || (newChatMode === 'agent' && !newChatAgentId)}
              >
                {createChatMutation.isPending ? 'Создаю...' : 'Создать чат'}
              </Button>
            </div>
          </div>
        </div>
      )}
      {isPropertiesOpen && activeChat && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={() => setIsPropertiesOpen(false)}>
          <div className="w-full max-w-3xl rounded-xl border bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-b px-5 py-4 flex items-start justify-between gap-4">
              <div><h2 className="text-lg font-semibold">Свойства чата</h2><p className="text-sm text-muted-foreground">{activeChat.title}</p></div>
              <Button variant="ghost" size="sm" onClick={() => setIsPropertiesOpen(false)}>Закрыть</Button>
            </div>
            <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-xl border bg-muted/10 p-3 space-y-1">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Текущий режим</p>
                  <p className="text-sm font-medium">{activeChat.mode === 'general' ? 'Общение' : 'Агент'}</p>
                </div>
                <div className="rounded-xl border bg-muted/10 p-3 space-y-1">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Текущий агент</p>
                  <p className="text-sm font-medium">{activeChatStats?.chat.agent_name ?? '—'}</p>
                </div>
                <div className="rounded-xl border bg-muted/10 p-3 space-y-1">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Создан</p>
                  <p className="text-sm font-medium">{formatDate(activeChat.created_at)}</p>
                </div>
                <div className="rounded-xl border bg-muted/10 p-3 space-y-1">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Обновлен</p>
                  <p className="text-sm font-medium">{formatDate(activeChat.updated_at)}</p>
                </div>
                <div className="rounded-xl border bg-muted/10 p-3 space-y-1">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Инструменты</p>
                  <p className="text-sm font-medium">{activeChat.tools.length}</p>
                </div>
              </div>

              <div className="rounded-2xl border bg-muted/10 p-4 space-y-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Как чат должен отвечать</p>
                  <p className="text-xs text-muted-foreground">
                    Можно переключить обычный чат в режим агента и обратно прямо отсюда.
                  </p>
                </div>

                {propertiesModeView === 'general' ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Режим чата</p>
                      <Select
                        options={propertiesModeOptions}
                        value={propertiesModeView}
                        onChange={(e) => handlePropertiesModeViewChange(e.target.value)}
                        className="w-full max-w-sm"
                      />
                      <p className="text-xs text-muted-foreground">
                        {propertiesSelectedGeneralModel
                          ? `Сейчас выбрана: ${propertiesSelectedGeneralModel.label} • ${formatGeneralModelPricing(propertiesSelectedGeneralModel)}`
                          : 'Если у чата старая модель, выбери новую из каталога ниже.'}
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">Каталог моделей для общения</p>
                        <p className="text-xs text-muted-foreground">Под каждой моделью видно, для чего она лучше подходит и сколько стоит</p>
                      </div>
                      <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border bg-background p-2">
                        {GENERAL_MODELS.map((model) => {
                          const isSelected = propertiesModel === model.value;

                          return (
                            <button
                              key={model.value}
                              type="button"
                              onClick={() => setPropertiesModel(model.value)}
                              className={cn(
                                'w-full rounded-lg border px-3 py-3 text-left transition-colors',
                                isSelected
                                  ? 'border-primary bg-primary/8 shadow-sm'
                                  : 'border-border bg-background hover:border-primary/30 hover:bg-accent/40',
                              )}
                            >
                              <p className="text-sm font-medium text-foreground">{model.label}</p>
                              <p className="mt-1 break-all text-xs text-muted-foreground">{model.value}</p>
                              <p className="mt-1 text-xs leading-5 text-muted-foreground">{model.description}</p>
                              <p className="mt-1 text-xs text-muted-foreground">{formatGeneralModelPricing(model)}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Режим чата</p>
                      <Select
                        options={propertiesModeOptions}
                        value={propertiesModeView}
                        onChange={(e) => handlePropertiesModeViewChange(e.target.value)}
                        className="w-full max-w-sm"
                      />
                      <p className="text-xs text-muted-foreground">
                        {propertiesSelectedAgent
                          ? `Сейчас выбран: ${propertiesSelectedAgent.model_label ?? propertiesSelectedAgent.name}${formatAgentPricing(propertiesSelectedAgent) ? ` • ${formatAgentPricing(propertiesSelectedAgent)}` : ''}`
                          : 'Выберите агента ниже. Для coding-моделей сразу видна ориентировочная стоимость input/output.'}
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">Каталог агентов</p>
                        <p className="text-xs text-muted-foreground">Модель и цена показаны отдельно для удобного выбора</p>
                      </div>
                      <div className="space-y-3">
                        {propertiesModeView === 'coding' && codingAgentOptions.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">Подходят для кодинга</p>
                            <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border bg-background p-2">
                              {codingAgentOptions.map((agent) => {
                                const isSelected = propertiesAgentId === agent.id;
                                const agentMeta = buildAgentMetaLabel(agent);
                                const pricingLabel = formatAgentPricing(agent);

                                return (
                                  <button
                                    key={agent.id}
                                    type="button"
                                    onClick={() => setPropertiesAgentId(agent.id)}
                                    className={cn(
                                      'w-full rounded-lg border px-3 py-3 text-left transition-colors',
                                      isSelected
                                        ? 'border-primary bg-primary/8 shadow-sm'
                                        : 'border-border bg-background hover:border-primary/30 hover:bg-accent/40',
                                    )}
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-foreground">
                                          {agent.model_label ?? agent.name}
                                        </p>
                                        {agentMeta ? (
                                          <p className="mt-1 break-all text-xs text-muted-foreground">
                                            {agentMeta}
                                          </p>
                                        ) : null}
                                        <p className="mt-1 text-xs text-muted-foreground">
                                          {pricingLabel || 'Цена для этой модели пока не указана'}
                                        </p>
                                      </div>
                                      <span className="shrink-0 rounded-full border border-sky-300/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700">
                                        coding
                                      </span>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {propertiesModeView === 'other' && otherAgentOptions.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">Остальные агенты</p>
                            <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl border bg-background p-2">
                              {otherAgentOptions.map((agent) => {
                                const isSelected = propertiesAgentId === agent.id;
                                const agentMeta = buildAgentMetaLabel(agent);
                                const pricingLabel = formatAgentPricing(agent);

                                return (
                                  <button
                                    key={agent.id}
                                    type="button"
                                    onClick={() => setPropertiesAgentId(agent.id)}
                                    className={cn(
                                      'w-full rounded-lg border px-3 py-3 text-left transition-colors',
                                      isSelected
                                        ? 'border-primary bg-primary/8 shadow-sm'
                                        : 'border-border bg-background hover:border-primary/30 hover:bg-accent/40',
                                    )}
                                  >
                                    <p className="truncate text-sm font-medium text-foreground">{agent.name}</p>
                                    {agentMeta ? (
                                      <p className="mt-1 break-all text-xs text-muted-foreground">
                                        {agentMeta}
                                      </p>
                                    ) : null}
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {pricingLabel || (agent.chat_description ?? agent.description ?? 'Без дополнительного описания')}
                                    </p>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {propertiesModeView === 'coding' && codingAgentOptions.length === 0 && (
                          <div className="rounded-lg border bg-background px-3 py-4 text-sm text-muted-foreground">
                            Сейчас нет доступных coding-агентов.
                          </div>
                        )}
                        {propertiesModeView === 'other' && otherAgentOptions.length === 0 && (
                          <div className="rounded-lg border bg-background px-3 py-4 text-sm text-muted-foreground">
                            Нет доступных агентов для выбора.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="rounded-xl border bg-background/80 p-4 space-y-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Инструменты чата</p>
                    <p className="text-xs text-muted-foreground">
                      В обычном режиме можно быстро подключить инструменты, чтобы чат умел ходить в интернет,
                      делать HTTP-запросы и вызывать другие встроенные функции.
                    </p>
                  </div>

                  {propertiesModeView !== 'general' ? (
                    <div className="rounded-lg border bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
                      Сейчас выбран режим агента. Инструменты будут браться из самого агента, а выбранные здесь
                      chat-tools снова заработают после возврата в режим “Общение”.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Подключено сейчас</p>
                        {propertiesSelectedTools.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {propertiesSelectedTools.map((tool) => (
                              <Badge key={tool.id} variant="outline" className="gap-1 rounded-full px-3 py-1">
                                <span>{tool.name}</span>
                                <button
                                  type="button"
                                  className="text-muted-foreground transition hover:text-foreground"
                                  onClick={() => togglePropertiesTool(tool.id)}
                                >
                                  ×
                                </button>
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            Пока ничего не подключено. Чат будет отвечать как обычная модель без tool calling.
                          </p>
                        )}
                      </div>

                      {quickConnectTools.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Быстро подключить</p>
                          <div className="flex flex-wrap gap-2">
                            {quickConnectTools.map((tool) => {
                              const isSelected = propertiesToolIds.includes(tool.id);
                              return (
                                <Button
                                  key={tool.id}
                                  type="button"
                                  size="sm"
                                  variant={isSelected ? 'primary' : 'outline'}
                                  onClick={() => togglePropertiesTool(tool.id)}
                                >
                                  {isSelected ? 'Отключить' : 'Подключить'} {tool.name}
                                </Button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Все доступные инструменты</p>
                          <p className="text-xs text-muted-foreground">{propertiesToolIds.length} выбрано</p>
                        </div>
                        {propertiesAvailableTools.length > 0 ? (
                          <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border bg-background p-2">
                            {propertiesAvailableTools.map((tool) => {
                              const isSelected = propertiesToolIds.includes(tool.id);
                              return (
                                <button
                                  key={tool.id}
                                  type="button"
                                  onClick={() => togglePropertiesTool(tool.id)}
                                  className={cn(
                                    'w-full rounded-lg border px-3 py-3 text-left transition-colors',
                                    isSelected
                                      ? 'border-primary bg-primary/8 shadow-sm'
                                      : 'border-border bg-background hover:border-primary/30 hover:bg-accent/40',
                                  )}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium text-foreground">{tool.name}</p>
                                      <p className="mt-1 break-all text-xs text-muted-foreground">{tool.slug}</p>
                                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                        {tool.description || 'Без дополнительного описания'}
                                      </p>
                                    </div>
                                    <Badge variant={isSelected ? 'success' : 'secondary'}>
                                      {isSelected ? 'Подключен' : 'Выключен'}
                                    </Badge>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="rounded-lg border bg-background px-3 py-4 text-sm text-muted-foreground">
                            Сейчас нет доступных инструментов.
                          </div>
                        )}
                      </div>

                      <p className="text-xs text-muted-foreground">
                        Например, если включить <span className="font-mono">http-request</span>, чат сможет сам
                        сходить по URL и принести ответ в диалог.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {chatStatsLoading ? <div className="flex justify-center py-6"><Spinner /></div> : null}
              {!chatStatsLoading && activeChatStats && (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Статистика чата</p>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <div className="rounded-lg border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Сообщений</p><p className="text-base font-semibold">{formatInt(activeChatStats.chat.message_count)}</p></div>
                      <div className="rounded-lg border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Ответов ассистента</p><p className="text-base font-semibold">{formatInt(activeChatStats.chat.assistant_messages)}</p></div>
                      <div className="rounded-lg border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Токенов всего</p><p className="text-base font-semibold">{formatInt(activeChatStats.totals.total_tokens)}</p></div>
                      <div className="rounded-lg border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Токены prompt</p><p className="text-base font-semibold">{formatInt(activeChatStats.totals.prompt_tokens)}</p></div>
                      <div className="rounded-lg border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Токены completion</p><p className="text-base font-semibold">{formatInt(activeChatStats.totals.completion_tokens)}</p></div>
                      <div className="rounded-lg border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Время ответов</p><p className="text-base font-semibold">{formatDuration(activeChatStats.totals.total_latency_ms)}</p></div>
                      <div className="rounded-lg border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Стоимость ($)</p><p className="text-base font-semibold">{formatMoney(activeChatStats.totals.usd_cost, 'USD')}</p></div>
                      <div className="rounded-lg border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Стоимость (₽)</p><p className="text-base font-semibold">{formatMoney(activeChatStats.totals.rub_cost, 'RUB')}</p></div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium">Расход по моделям</p>
                    {activeChatStats.by_model.length === 0 ? (
                      <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
                        Пока нет данных по расходу.
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-lg border">
                        <table className="min-w-full text-sm">
                          <thead className="bg-muted/30 text-left">
                            <tr>
                              <th className="px-3 py-2 font-medium">Модель</th>
                              <th className="px-3 py-2 font-medium">Сообщений</th>
                              <th className="px-3 py-2 font-medium">Токены</th>
                              <th className="px-3 py-2 font-medium">$</th>
                              <th className="px-3 py-2 font-medium">₽</th>
                            </tr>
                          </thead>
                          <tbody>
                            {activeChatStats.by_model.map((row) => (
                              <tr key={row.model} className="border-t">
                                <td className="px-3 py-2">{row.model}</td>
                                <td className="px-3 py-2">{formatInt(row.messages)}</td>
                                <td className="px-3 py-2">{formatInt(row.total_tokens)}</td>
                                <td className="px-3 py-2">{formatMoney(row.usd_cost, 'USD')}</td>
                                <td className="px-3 py-2">{formatMoney(row.rub_cost, 'RUB')}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div className="rounded-2xl border bg-muted/10 p-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Доступ к чату</p>
                    <Select
                      options={CHAT_ACCESS_OPTIONS}
                      value={propertiesAccess}
                      onChange={(e) => setPropertiesAccess(e.target.value as ChatAccess)}
                      className="w-full"
                    />
                    <p className="text-xs text-muted-foreground">
                      В галерею и по публичной ссылке попадают только общие чаты.
                    </p>
                  </div>
                  {propertiesAccess === 'restricted' ? (
                    <div className="space-y-2">
                    <p className="text-sm font-medium">Разрешённые email и логины</p>
                    <textarea
                      value={propertiesAllowedText}
                      onChange={(e) => setPropertiesAllowedText(e.target.value)}
                      className="min-h-32 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-input"
                      placeholder={"Один email или @логин на строку\nuser@example.com\n@rodion"}
                    />
                    <p className="text-xs text-muted-foreground">
                      Используется только для режима “Ограниченный”.
                    </p>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="border-t px-5 py-4 flex items-center justify-between gap-3">
              <div className="min-h-5 text-sm text-destructive">
                {propertiesError ?? ''}
              </div>
              <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsPropertiesOpen(false)}>Отмена</Button>
              <Button size="sm" onClick={saveProperties} disabled={propertiesSaving}>{propertiesSaving ? 'Сохраняю...' : 'Сохранить'}</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

