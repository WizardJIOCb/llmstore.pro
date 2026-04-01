import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ChatInput } from '../../components/agents/ChatInput';
import { ChatMessage } from '../../components/agents/ChatMessage';
import { RunMetadata } from '../../components/agents/RunMetadata';
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
  useSendChatMessage,
  useUpdateChatMessagePreview,
  useUploadChatFiles,
  useShareChatById,
  useUpdateChat,
} from '../../hooks/useChats';
import { useAppSettings } from '../../hooks/useAppSettings';
import { useProfile } from '../../hooks/useProfile';
import { chatsApi } from '../../lib/api/chats';
import type {
  ChatAccess,
  ChatDetails,
  ChatListItem,
  ChatMessage as ChatMessageType,
  CodingReport,
  ToolTrace,
} from '../../lib/api/chats';
import { cn } from '../../lib/utils';
import { TopUpHelp } from '../../components/billing/TopUpHelp';

const GENERAL_MODELS = [
  { value: 'openai/gpt-4o-mini', label: 'OpenAI GPT-4o Mini' },
  { value: 'openai/gpt-4o', label: 'OpenAI GPT-4o' },
  { value: 'google/gemini-2.0-flash-001', label: 'Gemini 2.0 Flash' },
  { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
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
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency,
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(value);
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

function getApiErrorCode(err: unknown): string | undefined {
  const maybe = err as { response?: { data?: { error?: { code?: string } } } };
  return maybe?.response?.data?.error?.code;
}

function getApiErrorMessage(err: unknown): string | undefined {
  const maybe = err as { response?: { data?: { error?: { message?: string } } } };
  return maybe?.response?.data?.error?.message;
}

function getApiErrorStatus(err: unknown): number | undefined {
  const maybe = err as { response?: { status?: number } };
  return maybe?.response?.status;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function ChatsPage() {
  const queryClient = useQueryClient();
  const { data: chats, isLoading: chatsLoading } = useChatsList();
  const { data: agents, isLoading: agentsLoading } = useChatAgents();
  const { data: appSettings } = useAppSettings();
  const { data: profile } = useProfile();
  const createChatMutation = useCreateChat();
  const updateChatMutation = useUpdateChat();
  const deleteChatMutation = useDeleteChat();
  const deleteChatMessageMutation = useDeleteChatMessage();
  const shareChatMutation = useShareChatById();
  const sendMessageMutation = useSendChatMessage();
  const updatePreviewMutation = useUpdateChatMessagePreview();
  const uploadFilesMutation = useUploadChatFiles();

  const [search, setSearch] = useState('');
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<MenuItem>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [shareToastVisible, setShareToastVisible] = useState(false);
  const [isPropertiesOpen, setIsPropertiesOpen] = useState(false);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia('(min-width: 768px)').matches);
  const [newChatMode, setNewChatMode] = useState<'general' | 'agent'>('general');
  const [newChatAgentId, setNewChatAgentId] = useState('');
  const [propertiesModel, setPropertiesModel] = useState('openai/gpt-4o-mini');
  const [propertiesAccess, setPropertiesAccess] = useState<ChatAccess>('public');
  const [propertiesAllowedText, setPropertiesAllowedText] = useState('');
  const [propertiesSaving, setPropertiesSaving] = useState(false);
  const [streamEvents, setStreamEvents] = useState<LiveChatEvent[]>([]);
  const [streamConnected, setStreamConnected] = useState(false);
  const [isAwaitingLateReply, setIsAwaitingLateReply] = useState(false);
  const [isQuickPromptsOpen, setIsQuickPromptsOpen] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const shareToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const previousMessageCountRef = useRef(0);
  const knownChatIds = useMemo(() => new Set((chats ?? []).map((chat) => chat.id)), [chats]);
  const safeActiveChatId = activeChatId && (chats == null || chats.length === 0 || knownChatIds.has(activeChatId))
    ? activeChatId
    : null;

  const { data: activeChatData, isLoading: activeChatLoading, error: activeChatError } = useChat(safeActiveChatId ?? undefined);
  const { data: activeChatStats, isLoading: chatStatsLoading } = useChatStats(
    safeActiveChatId ?? undefined,
    isPropertiesOpen,
  );
  const activeChat = activeChatData?.chat ?? null;
  const isActiveChatResolved = Boolean(safeActiveChatId && activeChat?.id === safeActiveChatId);
  const messages = activeChatData?.messages ?? [];

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
    if (!chats || chats.length === 0 || !activeChatId) return;
    if (chats.some((chat) => chat.id === activeChatId)) return;
    setActiveChatId(isDesktop ? chats[0]?.id ?? null : null);
  }, [activeChatId, chats, isDesktop]);

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

    if (!safeActiveChatId || !isActiveChatResolved || !activeChat || activeChat.mode !== 'agent') {
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
  }, [activeChat?.id, activeChat?.mode, isActiveChatResolved, safeActiveChatId]);

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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamEvents, sendMessageMutation.isPending, isAwaitingLateReply]);

  useEffect(() => {
    if (!isPropertiesOpen || !activeChat) return;
    setPropertiesModel(activeChat.model_external_id ?? 'openai/gpt-4o-mini');
    setPropertiesAccess(activeChat.access ?? 'public');
    setPropertiesAllowedText((activeChat.access_identifiers ?? []).join('\n'));
  }, [isPropertiesOpen, activeChat]);

  useEffect(() => {
    setIsQuickPromptsOpen(messages.length === 0);
    previousMessageCountRef.current = messages.length;
  }, [activeChat?.id]);

  useEffect(() => {
    if (previousMessageCountRef.current === 0 && messages.length > 0) {
      setIsQuickPromptsOpen(false);
    }
    previousMessageCountRef.current = messages.length;
  }, [messages.length]);

  useEffect(() => {
    return () => {
      if (shareToastTimerRef.current) clearTimeout(shareToastTimerRef.current);
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
      ...(agents ?? []).map((agent) => ({ value: `agent:${agent.id}`, label: `Агент: ${agent.name}` })),
    ],
    [agents],
  );

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
  const activeStarterPrompts =
    activeChatData?.chat.agent_starter_prompts
    ?? activeAgentListMeta?.starter_prompts
    ?? [];
  const canShowQuickPrompts = activeChat?.mode === 'agent' && activeStarterPrompts.length > 0;
  const hasAvailableBalance = profile ? Number(profile.balance_usd) > 0 : true;
  const isSubmittingMessage = sendMessageMutation.isPending || uploadFilesMutation.isPending || isAwaitingLateReply;

  const sidebarLoading = chatsLoading || agentsLoading;

  const createNewChat = async () => setIsCreateDialogOpen(true);

  const createChatFromDialog = async () => {
    setLocalError(null);
    if (newChatMode === 'agent' && !newChatAgentId) {
      setLocalError('Выберите агента для нового чата');
      return;
    }

    try {
      const created = await createChatMutation.mutateAsync({
        mode: newChatMode,
        title: 'Новый чат',
        agent_id: newChatMode === 'agent' ? newChatAgentId : null,
      });
      setActiveChatId(created.id);
      setIsCreateDialogOpen(false);
      setNewChatMode('general');
      setNewChatAgentId('');
    } catch {
      setLocalError('Не удалось создать чат');
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
      setLocalError('Не удалось переименовать чат');
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
      setLocalError('Не удалось удалить чат');
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
      setLocalError('Не удалось поделиться чатом');
    } finally {
      setOpenMenu(null);
    }
  };

  const openProperties = (chatId: string) => {
    setActiveChatId(chatId);
    setOpenMenu(null);
    setIsPropertiesOpen(true);
  };

  const saveProperties = async () => {
    if (!activeChat) return;
    setLocalError(null);
    setPropertiesSaving(true);
    const accessIdentifiers = propertiesAllowedText
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
    try {
      await updateChatMutation.mutateAsync({
        chatId: activeChat.id,
        model_external_id: propertiesModel,
        access: propertiesAccess,
        access_identifiers: accessIdentifiers,
      });
      setIsPropertiesOpen(false);
    } catch (error) {
      setLocalError(getApiErrorMessage(error) ?? 'Не удалось сохранить свойства чата');
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
      setLocalError('Не удалось изменить режим чата');
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
      setLocalError('У вас не осталось баланса. Скоро вы сможете пополнить его на сайте, а пока можете написать Родиону.');
      return;
    }
    setLocalError(null);
    setStreamEvents([]);
    const startedAt = new Date().toISOString();
    try {
      const attachments = files.length > 0 ? await uploadFilesMutation.mutateAsync(files) : [];
      await sendMessageMutation.mutateAsync({ chatId: activeChat.id, content, attachments });
    } catch (err) {
      const code = getApiErrorCode(err);
      const status = getApiErrorStatus(err);
      if (code === 'INSUFFICIENT_BALANCE') {
        setIsTopUpOpen(true);
        setLocalError(getApiErrorMessage(err) || 'У вас не осталось баланса. Скоро вы сможете пополнить его на сайте.');
        return;
      }
      if (status === 504) {
        setLocalError('Ответ от модели занял слишком много времени. Проверяю, не завершился ли он в фоне...');
        const recovered = await recoverLateAssistantReply(activeChat.id, startedAt);
        if (!recovered) {
          setLocalError('Провайдер слишком долго отвечал, и запрос оборвался по таймауту. Попробуйте ещё раз или выберите более быстрый агент.');
        }
        return;
      }
      setLocalError(err instanceof Error ? err.message : 'Не удалось отправить сообщение');
    }
  };

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
      <div className={cn('pointer-events-none fixed left-1/2 top-4 z-[70] -translate-x-1/2 rounded-lg border border-emerald-200 bg-emerald-500 px-4 py-2 text-sm font-medium text-white shadow-lg transition-all duration-500', shareToastVisible ? 'translate-y-0 opacity-100' : '-translate-y-16 opacity-0')}>
        Ссылка скопирована
      </div>

      <div className="mx-auto flex h-[calc(100vh-12rem)] max-w-7xl overflow-hidden rounded-xl border bg-white">
        {showSidebar && (
        <aside className={cn('flex w-full shrink-0 flex-col', isDesktop ? 'max-w-xs border-r' : 'max-w-none')}>
          <div className="border-b p-3 space-y-3">
            <Button className="w-full" onClick={createNewChat} disabled={createChatMutation.isPending}>Новый чат</Button>
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
                  onClick={() => shareChat(activeChat.id)}
                  disabled={shareChatMutation.isPending}
                >
                  Поделиться
                </Button>
                <Select options={modeOptions} value={activeModeValue} onChange={(e) => handleModeChange(e.target.value)} className="w-64" />
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {activeChatLoading && messages.length === 0 && <div className="flex justify-center py-8"><Spinner /></div>}
            {!activeChatLoading && activeChat && messages.length === 0 && (
              <div className="py-8">
                {activeChat.mode === 'agent' && (activeAgentName || activeStarterPrompts.length > 0 || activeAgentDescription) ? (
                  <div className="mx-auto max-w-3xl rounded-xl border bg-muted/20 p-5 space-y-4">
                    <div>
                      <h3 className="text-base font-semibold">{activeAgentName ?? 'Агент'}</h3>
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
            {messages.map((msg: ChatMessageType) => (
              <div key={msg.id}>
                <ChatMessage
                  role={msg.role}
                  content={msg.content}
                  attachments={msg.attachments ?? extractAttachments(msg.usage)}
                  toolTraces={msg.role === 'assistant' ? extractToolTraces(msg.usage) : undefined}
                  codingReport={msg.role === 'assistant' ? extractCodingReport(msg.usage, msg.content) : undefined}
                  previewPageUrl={msg.role === 'assistant' && activeChat ? `/api/chats/${activeChat.id}/messages/${msg.id}/preview` : undefined}
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
                  canDeleteMessage={Boolean(activeChat)}
                  onDeleteMessage={activeChat
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
            {isSubmittingMessage && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> {isAwaitingLateReply ? 'Проверяю, не завершился ли ответ в фоне...' : 'Думаю...'}</div>}
            <div ref={messagesEndRef} />
          </div>

          {localError && <div className="border-t px-4 py-2 text-sm text-destructive bg-destructive/10">{localError}</div>}

          <div className="border-t px-4 py-3 space-y-3">
            {canShowQuickPrompts && messages.length > 0 && (
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
            {canShowQuickPrompts && messages.length > 0 && isQuickPromptsOpen && (
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

              {newChatMode === 'agent' && (
                <div className="rounded-xl border bg-muted/20 p-4 space-y-2">
                  <p className="text-sm font-medium">Выберите агента</p>
                  <Select
                    value={newChatAgentId}
                    onChange={(e) => setNewChatAgentId(e.target.value)}
                    options={[
                      { value: '', label: 'Выберите агента...' },
                      ...(agents ?? []).map((agent) => ({
                        value: agent.id,
                        label: agent.is_owner ? `${agent.name} (мой)` : `${agent.name} (общий)`,
                      })),
                    ]}
                    className="w-full"
                  />
                  {(agents ?? []).length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Сейчас нет доступных активных агентов.
                    </p>
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
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1"><p className="text-xs uppercase tracking-wide text-muted-foreground">Режим</p><p className="text-sm font-medium">{activeChat.mode === 'general' ? 'Общение' : 'Агент'}</p></div>
                <div className="space-y-1"><p className="text-xs uppercase tracking-wide text-muted-foreground">Агент</p><p className="text-sm font-medium">{activeChatStats?.chat.agent_name ?? '—'}</p></div>
                <div className="space-y-1"><p className="text-xs uppercase tracking-wide text-muted-foreground">Создан</p><p className="text-sm font-medium">{formatDate(activeChat.created_at)}</p></div>
                <div className="space-y-1"><p className="text-xs uppercase tracking-wide text-muted-foreground">Обновлен</p><p className="text-sm font-medium">{formatDate(activeChat.updated_at)}</p></div>
              </div>
              <div className="space-y-2"><p className="text-sm font-medium">Модель OpenRouter</p><Select options={GENERAL_MODELS} value={propertiesModel} onChange={(e) => setPropertiesModel(e.target.value)} className="w-full max-w-md" /></div>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
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
                <div className="space-y-2">
                  <p className="text-sm font-medium">Разрешённые email и логины</p>
                  <textarea
                    value={propertiesAllowedText}
                    onChange={(e) => setPropertiesAllowedText(e.target.value)}
                    disabled={propertiesAccess !== 'restricted'}
                    className="min-h-32 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-input"
                    placeholder={"Один email или @логин на строку\nuser@example.com\n@rodion"}
                  />
                  <p className="text-xs text-muted-foreground">
                    Используется только для режима “Ограниченный”.
                  </p>
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
                      <div className="rounded-lg border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Стоимость (USD)</p><p className="text-base font-semibold">{formatMoney(activeChatStats.totals.usd_cost, 'USD')}</p></div>
                      <div className="rounded-lg border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Стоимость (RUB)</p><p className="text-base font-semibold">{formatMoney(activeChatStats.totals.rub_cost, 'RUB')}</p></div>
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
                              <th className="px-3 py-2 font-medium">USD</th>
                              <th className="px-3 py-2 font-medium">RUB</th>
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
            </div>
            <div className="border-t px-5 py-4 flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsPropertiesOpen(false)}>Отмена</Button>
              <Button size="sm" onClick={saveProperties} disabled={propertiesSaving}>{propertiesSaving ? 'Сохраняю...' : 'Сохранить'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

