import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  ArrowRightLeft,
  Bot,
  Download,
  Globe,
  Link2,
  Lock,
  PencilLine,
  Pin,
  Settings2,
  Share2,
  Trash2,
} from 'lucide-react';
import { ChatInput } from '../../components/agents/ChatInput';
import { ChatLiveProgressPanel, ChatLiveProgressTrailingBusy } from '../../components/agents/ChatLiveProgressPanel';
import { ChatMessage } from '../../components/agents/ChatMessage';
import { ChatThinkingBubble } from '../../components/agents/ChatThinkingBubble';
import { RunMetadata } from '../../components/agents/RunMetadata';
import { OAuthButtons } from '../../components/auth/OAuthButtons';
import { TurnstileWidget } from '../../components/auth/TurnstileWidget';
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
  useTransferChat,
  useUpdateChatMessagePreview,
  useUploadChatFiles,
  useShareChatById,
  useUpdateChat,
  useImportChatBundle,
} from '../../hooks/useChats';
import { useBuiltinTools } from '../../hooks/useAgents';
import { useAppSettings } from '../../hooks/useAppSettings';
import { useAuth } from '../../hooks/useAuth';
import { useProfile } from '../../hooks/useProfile';
import { chatsApi } from '../../lib/api/chats';
import { getOrCreateDeviceFingerprint } from '../../lib/device-fingerprint';
import { appendLiveProgressEvent, createLiveProgressEvent } from '../../lib/chat-live-progress';
import { applyLiveBalanceDelta, shouldApplyLiveBalanceEvent } from '../../lib/live-balance';
import { UserLink } from '../../components/users/UserLink';
import type {
  ChatAccess,
  ChatAgentOption,
  ChatAttachment,
  ChatDetails,
  ChatListItem,
  ChatMessage as ChatMessageType,
  ChatMode,
  ChatPendingRunState,
  CodingReport,
  PublishedLanding,
  ToolTrace,
} from '../../lib/api/chats';
import { GENERAL_CHAT_MODELS, type GeneralModelOption } from '../../lib/chat-models';
import { cn, formatRub, formatUsd } from '../../lib/utils';
import { TopUpHelp } from '../../components/billing/TopUpHelp';

type PropertiesModeView = 'general' | 'coding' | 'other';
type LocalNoticeAction = {
  label: string;
  onClick: () => void;
};
const PENDING_REPLY_RECOVERY_WINDOW_MS = 5 * 60_000;
const TIMEOUT_REPLY_RECOVERY_WINDOW_MS = 12_000;
const TIMEOUT_REPLY_RECOVERY_ATTEMPT_MS = 4_000;
const DIALOG_CLOSE_ANIMATION_MS = 200;
const LIVE_AUTO_SCROLL_THRESHOLD_PX = 50;
const EMPTY_MESSAGES: ChatMessageType[] = [];
const LAST_CHAT_SELECTION_STORAGE_KEY = 'llmstore.last-chat-selection';
const CHAT_LIST_SCROLL_STORAGE_KEY = 'llmstore.chat-list-scroll-top';
const GUEST_CHAT_DRAFT_STORAGE_KEY = 'llmstore.guest-chat-draft';

interface GuestChatDraft {
  id: string;
  message: string;
  created_at: string;
}

interface PersistedChatSelection {
  activeChatId: string | null;
  adminViewChatId: string | null;
}

function readGuestChatDraft(): GuestChatDraft | null {
  try {
    const raw = window.localStorage.getItem(GUEST_CHAT_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GuestChatDraft>;
    if (
      typeof parsed.id !== 'string'
      || typeof parsed.message !== 'string'
      || typeof parsed.created_at !== 'string'
      || !parsed.message.trim()
    ) {
      return null;
    }
    return {
      id: parsed.id,
      message: parsed.message,
      created_at: parsed.created_at,
    };
  } catch {
    return null;
  }
}

function writeGuestChatDraft(draft: GuestChatDraft): void {
  try {
    window.localStorage.setItem(GUEST_CHAT_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // noop
  }
}

function clearGuestChatDraft(): void {
  try {
    window.localStorage.removeItem(GUEST_CHAT_DRAFT_STORAGE_KEY);
  } catch {
    // noop
  }
}

const GENERAL_MODELS: GeneralModelOption[] = GENERAL_CHAT_MODELS;

const CHAT_ACCESS_OPTIONS = [
  { value: 'public', label: 'Общий' },
  { value: 'private', label: 'Приватный' },
  { value: 'restricted', label: 'Ограниченный' },
];

function ChatPrivacyIcon({ access, className }: { access: ChatAccess; className?: string }) {
  if (access === 'public') return null;

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
      aria-hidden="true"
    >
      <path d="M8 10V7a4 4 0 1 1 8 0v3" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="5" y="10" width="14" height="10" rx="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function getChatPrivacyQuickActionLabel(access: ChatAccess): string {
  return access === 'public' ? 'Сделать приватным' : 'Сделать публичным';
}

function getChatPrivacyTitle(access: ChatAccess): string {
  return access === 'restricted' ? 'Ограниченный чат' : 'Приватный чат';
}

function getChatWebsiteTitle(chat: Pick<ChatListItem, 'has_site_preview' | 'has_published_landing'>): string {
  return chat.has_published_landing ? 'Сайт опубликован' : 'Есть лендинг или сайт';
}

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
  if (chat.is_admin_view) {
    const ownerLabel = chat.owner_name?.trim()
      || (chat.owner_username ? `@${chat.owner_username}` : '')
      || chat.owner_email?.trim()
      || 'другого пользователя';
    return `Чужой чат • ${ownerLabel}`;
  }

  if (chat.mode === 'agent') {
    const parts = ['Агент'];
    if (chat.effective_model_label?.trim()) parts.push(chat.effective_model_label.trim());
    if (chat.agent_name?.trim()) parts.push(chat.agent_name.trim());
    return parts.join(' • ');
  }

  if (chat.effective_model_label?.trim()) {
    return `Общение • ${chat.effective_model_label.trim()}`;
  }

  return 'Общение';
}

function getChatOwnerLabel(chat: Pick<ChatListItem, 'owner_name' | 'owner_username' | 'owner_email'>): string {
  return chat.owner_name?.trim()
    || (chat.owner_username ? `@${chat.owner_username}` : '')
    || chat.owner_email?.trim()
    || 'другой пользователь';
}

function getChatActionIcon(
  action: 'rename' | 'pin' | 'unpin' | 'properties' | 'export' | 'privacy' | 'transfer' | 'delete' | 'share' | 'copy_link' | 'agents',
  access?: ChatAccess,
) {
  switch (action) {
    case 'rename':
      return <PencilLine className="h-4 w-4 shrink-0 text-slate-500" />;
    case 'pin':
      return <ArrowUp className="h-4 w-4 shrink-0 text-slate-500" />;
    case 'unpin':
      return <ArrowDown className="h-4 w-4 shrink-0 text-slate-500" />;
    case 'properties':
      return <Settings2 className="h-4 w-4 shrink-0 text-slate-500" />;
    case 'export':
      return <Download className="h-4 w-4 shrink-0 text-slate-500" />;
    case 'privacy':
      return access === 'public'
        ? <Lock className="h-4 w-4 shrink-0 text-slate-500" />
        : <Globe className="h-4 w-4 shrink-0 text-slate-500" />;
    case 'transfer':
      return <ArrowRightLeft className="h-4 w-4 shrink-0 text-slate-500" />;
    case 'delete':
      return <Trash2 className="h-4 w-4 shrink-0 text-red-500" />;
    case 'share':
      return <Share2 className="h-4 w-4 shrink-0 text-slate-500" />;
    case 'copy_link':
      return <Link2 className="h-4 w-4 shrink-0 text-slate-500" />;
    case 'agents':
      return <Bot className="h-4 w-4 shrink-0 text-slate-500" />;
    default:
      return null;
  }
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
    charged_cost: typeof value.charged_cost === 'string' ? value.charged_cost : undefined,
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

function hasHtmlPreviewMessage(message: ChatMessageType): boolean {
  if (message.role !== 'assistant') return false;
  const preview = extractCodingReport(message.usage, message.content)?.preview;
  return preview?.type === 'html' && typeof preview.html === 'string' && preview.html.length > 0;
}

function formatChatPreview(preview: string | null): string | null {
  if (!preview) return preview;
  const cleaned = preview.replace(/<dev-report>\s*[\s\S]*?(?:\s*<\/dev-report>|$)/gi, '').trim();
  if (cleaned) return cleaned;
  const summaryMatch = preview.match(/"summary"\s*:\s*"([^"]+)/);
  return summaryMatch?.[1] ?? preview;
}

type MenuItem =
  | { kind: 'chat'; id: string }
  | { kind: 'active-chat-actions' }
  | null;

interface LiveChatEvent {
  id: string;
  event: string;
  label: string;
  detail?: string;
  status?: string;
  tool_name?: string;
  ts?: string;
  error?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  estimated_cost?: string;
  usd_to_rub_rate?: number;
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

function getScrollDistanceFromBottom(container: HTMLElement): number {
  return Math.max(
    0,
    container.scrollHeight - container.clientHeight - container.scrollTop,
  );
}

function isPendingRunTerminal(pendingRun?: ChatPendingRunState | null): boolean {
  if (!pendingRun) return false;
  if (pendingRun.is_terminal != null) return pendingRun.is_terminal;
  return ['completed', 'failed', 'cancelled'].includes((pendingRun.status ?? '').trim().toLowerCase());
}

function isPendingRunLive(pendingRun?: ChatPendingRunState | null): boolean {
  return Boolean(pendingRun) && !isPendingRunTerminal(pendingRun);
}

function isPendingRunProblematicTerminal(pendingRun?: ChatPendingRunState | null): boolean {
  if (!pendingRun || !isPendingRunTerminal(pendingRun)) return false;
  return pendingRun.result_status === 'partial' || pendingRun.result_status === 'failed_no_result' || pendingRun.result_status === 'failed_partial';
}

const LONG_RUN_FAILED_NO_RESULT_NOTICE = 'Run завершился без финального результата. Ответ в чат не доехал полностью.';
const LONG_RUN_PARTIAL_NOTICE = 'Run завершился, но итоговый результат сохранился только частично. Лучше упростить задачу или попросить продолжить точечно.';
const LIVE_PARTIAL_RESULT_NOTICE = 'Это промежуточный результат. Пока pending_run активен, чат ещё не завершён.';

function isLongRunTerminalNotice(value: string | null | undefined): boolean {
  return value === LONG_RUN_FAILED_NO_RESULT_NOTICE || value === LONG_RUN_PARTIAL_NOTICE;
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

function readPersistedChatSelection(): PersistedChatSelection {
  if (typeof window === 'undefined') {
    return { activeChatId: null, adminViewChatId: null };
  }

  try {
    const raw = window.localStorage.getItem(LAST_CHAT_SELECTION_STORAGE_KEY);
    if (!raw) {
      return { activeChatId: null, adminViewChatId: null };
    }

    const parsed = JSON.parse(raw) as {
      activeChatId?: unknown;
      adminViewChatId?: unknown;
    };

    return {
      activeChatId: typeof parsed.activeChatId === 'string' && parsed.activeChatId.trim()
        ? parsed.activeChatId.trim()
        : null,
      adminViewChatId: typeof parsed.adminViewChatId === 'string' && parsed.adminViewChatId.trim()
        ? parsed.adminViewChatId.trim()
        : null,
    };
  } catch {
    return { activeChatId: null, adminViewChatId: null };
  }
}

function writePersistedChatSelection(selection: PersistedChatSelection) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(LAST_CHAT_SELECTION_STORAGE_KEY, JSON.stringify(selection));
  } catch {
    // Ignore storage write issues and keep chat UX working.
  }
}

function readPersistedChatListScrollTop(): number {
  if (typeof window === 'undefined') return 0;

  try {
    const raw = window.sessionStorage.getItem(CHAT_LIST_SCROLL_STORAGE_KEY);
    if (!raw) return 0;

    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 0;
    }

    return Math.round(parsed);
  } catch {
    return 0;
  }
}

function writePersistedChatListScrollTop(scrollTop: number): void {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(
      CHAT_LIST_SCROLL_STORAGE_KEY,
      String(Math.max(0, Math.round(scrollTop))),
    );
  } catch {
    // Ignore storage write issues and keep chat UX working.
  }
}

function snapScrollContainerToBottom(container: HTMLDivElement | null, passes = 3) {
  if (!container || typeof window === 'undefined') return;

  const apply = () => {
    container.scrollTop = container.scrollHeight;
  };

  apply();

  let pass = 0;
  const step = () => {
    apply();
    pass += 1;
    if (pass < passes) {
      window.requestAnimationFrame(step);
    }
  };

  window.requestAnimationFrame(step);
  window.setTimeout(apply, 90);
}

function GuestChatsPage() {
  const { register } = useAuth();
  const [registerForm, setRegisterForm] = useState({ username: '', email: '', password: '' });
  const [registerError, setRegisterError] = useState('');
  const [registerLoading, setRegisterLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [draft, setDraft] = useState<GuestChatDraft | null>(() => readGuestChatDraft());
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() || '';
  const isTurnstileEnabled = Boolean(turnstileSiteKey);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('mobile-chat-active', { detail: false }));
  }, []);

  const nextUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/chats?guest_auth=1`
    : '/chats?guest_auth=1';

  const handleGuestSend = async (message: string) => {
    const trimmed = message.trim();
    if (!trimmed) return;

    const nextDraft: GuestChatDraft = {
      id: `guest-chat-${Date.now()}`,
      message: trimmed,
      created_at: new Date().toISOString(),
    };
    writeGuestChatDraft(nextDraft);
    setDraft(nextDraft);
    setRegisterError('');
  };

  const handleGuestRegister = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!draft?.message.trim()) {
      setRegisterError('Сначала напишите сообщение выше.');
      return;
    }

    if (!registerForm.username.trim()) {
      setRegisterError('Введите логин.');
      return;
    }

    if (isTurnstileEnabled && !turnstileToken) {
      setRegisterError('Подтвердите, что вы не робот.');
      return;
    }

    setRegisterError('');
    setRegisterLoading(true);

    try {
      await register({
        email: registerForm.email.trim(),
        password: registerForm.password,
        username: registerForm.username.trim(),
        device_fingerprint: getOrCreateDeviceFingerprint(),
        turnstile_token: turnstileToken || undefined,
      });

      window.location.assign(nextUrl);
    } catch (err: any) {
      const responseError = err?.response?.data?.error;
      const usernameErrors = responseError?.details?.fieldErrors?.username;
      const emailErrors = responseError?.details?.fieldErrors?.email;
      const passwordErrors = responseError?.details?.fieldErrors?.password;

      if (Array.isArray(usernameErrors) && usernameErrors.length > 0) {
        setRegisterError('Логин может содержать только латинские буквы, цифры и _.');
      } else if (Array.isArray(emailErrors) && emailErrors.length > 0) {
        setRegisterError('Проверьте email: он должен быть в корректном формате.');
      } else if (Array.isArray(passwordErrors) && passwordErrors.length > 0) {
        setRegisterError('Пароль должен быть длиной от 8 до 128 символов.');
      } else {
        setRegisterError(responseError?.message || 'Не удалось зарегистрироваться.');
      }
    } finally {
      setRegisterLoading(false);
    }
  };

  return (
    <div className="flex h-[calc(100dvh-4rem)] min-h-[calc(100dvh-4rem)] w-full max-w-full flex-col overflow-hidden px-4 py-4">
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 overflow-hidden rounded-xl border bg-white">
        <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="border-b px-4 py-4">
            <div className="space-y-1">
              <h1 className="text-lg font-semibold text-slate-950">Чаты</h1>
              <p className="text-sm text-muted-foreground">
                Можно сразу написать сообщение. После быстрого входа через VK, Яндекс или Google мы автоматически отправим его в чат и покажем ответ.
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto bg-[linear-gradient(180deg,#ffffff,#f8fafc)] px-4 py-6">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
              {!draft && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white/90 p-5 text-sm text-slate-600 shadow-sm">
                  Напишите любой вопрос или задачу. Мы попросим быстро войти через соцлогин и сразу продолжим уже в полноценном чате LLMStore.
                </div>
              )}

              {draft && (
                <>
                  <div className="ml-auto max-w-[85%] rounded-2xl bg-slate-950 px-4 py-3 text-sm text-white shadow-sm">
                    {draft.message}
                  </div>
                  <div className="max-w-[85%] rounded-2xl border border-cyan-200 bg-[linear-gradient(135deg,rgba(236,254,255,0.92),rgba(239,246,255,0.94))] px-4 py-4 shadow-sm">
                    <p className="text-sm font-medium text-slate-950">
                      Чтобы отправить сообщение на обработку, войдите или зарегистрируйтесь за 10 секунд.
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      После авторизации мы автоматически создадим чат, отправим это сообщение и покажем ответ здесь же.
                    </p>
                    <div className="mt-4">
                      <OAuthButtons next={nextUrl} />
                    </div>
                    <div className="relative my-4">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t border-cyan-200/80" />
                      </div>
                      <div className="relative flex justify-center text-[10px] uppercase tracking-[0.2em]">
                        <span className="bg-[linear-gradient(135deg,rgba(236,254,255,0.96),rgba(239,246,255,0.98))] px-2 text-slate-400">или регистрация</span>
                      </div>
                    </div>
                    <form className="space-y-3" onSubmit={handleGuestRegister}>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-700">Логин</label>
                        <Input
                          value={registerForm.username}
                          onChange={(e) => setRegisterForm((prev) => ({ ...prev, username: e.target.value }))}
                          placeholder="username"
                          autoComplete="username"
                          required
                          disabled={registerLoading}
                        />
                        <p className="mt-1 text-xs text-slate-500">
                          Только латинские буквы, цифры и <code>_</code>.
                        </p>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-700">Email</label>
                        <Input
                          type="email"
                          value={registerForm.email}
                          onChange={(e) => setRegisterForm((prev) => ({ ...prev, email: e.target.value }))}
                          placeholder="you@example.com"
                          autoComplete="email"
                          required
                          disabled={registerLoading}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-700">Пароль</label>
                        <Input
                          type="password"
                          value={registerForm.password}
                          onChange={(e) => setRegisterForm((prev) => ({ ...prev, password: e.target.value }))}
                          placeholder="Минимум 8 символов"
                          autoComplete="new-password"
                          minLength={8}
                          required
                          disabled={registerLoading}
                        />
                      </div>
                      {isTurnstileEnabled && (
                        <div className="rounded-xl border border-cyan-200/80 bg-white/70 p-3">
                          <TurnstileWidget
                            siteKey={turnstileSiteKey}
                            onVerify={(token) => {
                              setTurnstileToken(token);
                              setRegisterError('');
                            }}
                            onExpire={() => setTurnstileToken('')}
                            onError={() => {
                              setTurnstileToken('');
                              setRegisterError('Не удалось загрузить защитную проверку.');
                            }}
                          />
                        </div>
                      )}
                      {registerError && (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                          {registerError}
                        </div>
                      )}
                      <Button type="submit" className="w-full" disabled={registerLoading}>
                        {registerLoading ? 'Регистрирую...' : 'Зарегистрироваться и отправить'}
                      </Button>
                    </form>
                    <p className="mt-3 text-xs text-slate-500">
                      Можно войти через VK, Яндекс, Google или сразу зарегистрироваться по email.
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="border-t bg-white px-4 py-4">
            <div className="mx-auto w-full max-w-3xl">
              <ChatInput
                onSend={handleGuestSend}
                disabled={false}
                allowAttachments={false}
                placeholder="Напишите сообщение, и мы продолжим после быстрого входа..."
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function AuthenticatedChatsPage() {
  const initialChatSelectionRef = useRef<PersistedChatSelection | null>(null);
  if (!initialChatSelectionRef.current) {
    initialChatSelectionRef.current = readPersistedChatSelection();
  }

  const { isAdmin, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: chats, isLoading: chatsLoading } = useChatsList(isAuthenticated);
  const { data: agents, isLoading: agentsLoading } = useChatAgents(isAuthenticated);
  const { data: availableTools } = useBuiltinTools(isAuthenticated);
  const { data: appSettings } = useAppSettings();
  const { data: profile } = useProfile(isAuthenticated);
  const createChatMutation = useCreateChat();
  const updateChatMutation = useUpdateChat();
  const deleteChatMutation = useDeleteChat();
  const transferChatMutation = useTransferChat();
  const deleteChatMessageMutation = useDeleteChatMessage();
  const truncateChatFromMessageMutation = useTruncateChatFromMessage();
  const shareChatMutation = useShareChatById();
  const sendMessageMutation = useSendChatMessage();
  const updatePreviewMutation = useUpdateChatMessagePreview();
  const uploadFilesMutation = useUploadChatFiles();
  const importChatBundleMutation = useImportChatBundle();

  const [search, setSearch] = useState('');
  const [activeChatId, setActiveChatId] = useState<string | null>(initialChatSelectionRef.current.activeChatId);
  const [openMenu, setOpenMenu] = useState<MenuItem>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localNoticeTone, setLocalNoticeTone] = useState<'error' | 'warning'>('error');
  const [localNoticeAction, setLocalNoticeAction] = useState<LocalNoticeAction | null>(null);
  const [shareToastVisible, setShareToastVisible] = useState(false);
  const [adminViewChatId, setAdminViewChatId] = useState<string | null>(initialChatSelectionRef.current.adminViewChatId);
  const [isPropertiesOpen, setIsPropertiesOpen] = useState(false);
  const [isPropertiesClosing, setIsPropertiesClosing] = useState(false);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  const [isTopUpClosing, setIsTopUpClosing] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isCreateDialogClosing, setIsCreateDialogClosing] = useState(false);
  const [deleteDialogChat, setDeleteDialogChat] = useState<ChatListItem | null>(null);
  const [deleteDialogClosing, setDeleteDialogClosing] = useState(false);
  const [transferDialogChat, setTransferDialogChat] = useState<ChatListItem | null>(null);
  const [transferDialogClosing, setTransferDialogClosing] = useState(false);
  const [transferIdentifier, setTransferIdentifier] = useState('');
  const [transferDialogError, setTransferDialogError] = useState<string | null>(null);
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
  const [propertiesNote, setPropertiesNote] = useState('');
  const [propertiesSaving, setPropertiesSaving] = useState(false);
  const [propertiesError, setPropertiesError] = useState<string | null>(null);
  const [streamEvents, setStreamEvents] = useState<LiveChatEvent[]>([]);
  const [streamConnected, setStreamConnected] = useState(false);
  const [isAwaitingLateReply, setIsAwaitingLateReply] = useState(false);
  const [runtimeActiveChatIds, setRuntimeActiveChatIds] = useState<string[]>([]);
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
  const [publishedLandingByMessageId, setPublishedLandingByMessageId] = useState<Record<string, PublishedLanding | null>>({});
  const [landingActionMessageIds, setLandingActionMessageIds] = useState<string[]>([]);
  const guestDraftDispatchRef = useRef<string | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);
  const chatListScrollRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const messagesContentRef = useRef<HTMLDivElement | null>(null);
  const assistantSlotNodeRef = useRef<HTMLDivElement | null>(null);
  const pendingProgressAnchorRef = useRef<HTMLDivElement | null>(null);
  const shareToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const createDialogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deleteDialogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const propertiesDialogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const topUpDialogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transferDialogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageEnterCleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollAnimationFrameRef = useRef<number | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const persistedChatListScrollTopRef = useRef(readPersistedChatListScrollTop());
  const hasRestoredChatListScrollRef = useRef(false);
  const shouldScrollChatListToTopRef = useRef(false);
  const pendingChatListScrollIdRef = useRef<string | null>(null);
  const liveBalanceSeenCostsRef = useRef<Record<string, number>>({});
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const previousMessageCountRef = useRef(0);
  const previousStreamEventsCountRef = useRef(0);
  const liveAutoScrollPinnedRef = useRef(true);
  const initializedAnimatedChatIdsRef = useRef<Set<string>>(new Set());
  const animatedMessageIdsRef = useRef<Set<string>>(new Set());
  const lateReplyRecoveryAttemptedRef = useRef<Set<string>>(new Set());
  const chatRowRefs = useRef(new Map<string, HTMLDivElement>());
  const messageNodeRefs = useRef(new Map<string, HTMLDivElement>());
  const messageVisualKeyByIdRef = useRef(new Map<string, string>());
  const knownChatIds = useMemo(() => new Set((chats ?? []).map((chat) => chat.id)), [chats]);
  const snapMessagesToBottom = (passes = 4) => {
    const container = messagesScrollRef.current;
    if (!container || typeof window === 'undefined') return;

    const apply = () => {
      if (!liveAutoScrollPinnedRef.current) return;
      container.scrollTop = container.scrollHeight;
    };

    apply();

    let pass = 0;
    const step = () => {
      apply();
      pass += 1;
      if (pass < passes) {
        window.requestAnimationFrame(step);
      }
    };

    window.requestAnimationFrame(step);
    window.setTimeout(apply, 90);
    window.setTimeout(apply, 180);
  };
  const markChatRuntimeActive = (chatId: string) => {
    setRuntimeActiveChatIds((prev) => (prev.includes(chatId) ? prev : [...prev, chatId]));
  };
  const markChatRuntimeIdle = (chatId: string) => {
    setRuntimeActiveChatIds((prev) => prev.filter((id) => id !== chatId));
  };
  const activeRuntimeChatIds = useMemo(() => {
    const ids = new Set(runtimeActiveChatIds);

    if (optimisticPendingMessage?.chatId) {
      ids.add(optimisticPendingMessage.chatId);
    }

    if (assistantResponseSlot?.chatId && !assistantResponseSlot.actualMessageId) {
      ids.add(assistantResponseSlot.chatId);
    }

    for (const chat of chats ?? []) {
      if (chat.has_active_deployment) {
        ids.add(chat.id);
      }
    }

    return ids;
  }, [
    assistantResponseSlot?.actualMessageId,
    assistantResponseSlot?.chatId,
    chats,
    optimisticPendingMessage?.chatId,
    runtimeActiveChatIds,
  ]);
  const requestedChatId = searchParams.get('chat');
  const requestedAdminChatId = searchParams.get('admin_chat_id');
  const requestedPrefill = searchParams.get('prefill');
  const shouldResumeGuestDraft = searchParams.get('guest_auth') === '1' || searchParams.get('oauth') === 'success';
  const activeAdminViewChatId = isAdmin ? (requestedAdminChatId ?? adminViewChatId) : null;
  const isAdminRequestedChat = Boolean(activeAdminViewChatId);
  const safeActiveChatId = activeChatId && (
    chats == null
    || chats.length === 0
    || knownChatIds.has(activeChatId)
    || (isAdminRequestedChat && activeChatId === activeAdminViewChatId)
  )
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

  const { data: activeChatData, isLoading: activeChatLoading, error: activeChatError } = useChat(
    safeActiveChatId ?? undefined,
    { adminView: Boolean(isAdminRequestedChat && safeActiveChatId === activeAdminViewChatId) },
  );
  const { data: activeChatStats, isLoading: chatStatsLoading } = useChatStats(
    safeActiveChatId ?? undefined,
    isPropertiesOpen,
    { adminView: Boolean(isAdminRequestedChat && safeActiveChatId === activeAdminViewChatId) },
  );
  const activeChat = activeChatData?.chat ?? null;
  const activeChatMenuTarget: ChatListItem | null = activeChat
    ? { ...activeChat, last_message_preview: null }
    : null;
  const isAdminForeignChat = Boolean(activeChat?.is_admin_view);
  const activeChatOwnerLabel = activeChat ? getChatOwnerLabel(activeChat) : '';
  const isActiveChatResolved = Boolean(safeActiveChatId && activeChat?.id === safeActiveChatId);
  const messages = activeChatData?.messages ?? EMPTY_MESSAGES;
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
  const activePreviewMessageIds = useMemo(
    () => messages.filter(hasHtmlPreviewMessage).map((message) => message.id),
    [messages],
  );
  const mobileChatActionButtonClass = 'flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-sm font-medium text-slate-900 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60';

  const persistChatListScrollTop = (scrollTop?: number) => {
    const nextScrollTop = typeof scrollTop === 'number'
      ? scrollTop
      : chatListScrollRef.current?.scrollTop;

    if (typeof nextScrollTop !== 'number' || !Number.isFinite(nextScrollTop)) return;

    const normalizedScrollTop = Math.max(0, Math.round(nextScrollTop));
    persistedChatListScrollTopRef.current = normalizedScrollTop;
    writePersistedChatListScrollTop(normalizedScrollTop);
  };

  useEffect(() => {
    if (!shouldResumeGuestDraft) return;

    const draft = readGuestChatDraft();
    if (!draft?.message.trim()) return;
    if (guestDraftDispatchRef.current === draft.id) return;
    if (sendMessageMutation.isPending || createChatMutation.isPending) return;

    guestDraftDispatchRef.current = draft.id;

    const sendDraft = async () => {
      try {
        let chatId = safeActiveChatId;
        if (!chatId || !knownChatIds.has(chatId) || isAdminForeignChat) {
          const createdChat = await createChatMutation.mutateAsync({});
          shouldScrollChatListToTopRef.current = true;
          persistChatListScrollTop(0);
          chatId = createdChat.id;
          setActiveChatId(createdChat.id);
        }

        await performSendMessage({ chatId, content: draft.message });
        clearGuestChatDraft();

        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('guest_auth');
        nextParams.delete('oauth');
        nextParams.delete('provider');
        nextParams.delete('message');
        setSearchParams(nextParams, { replace: true });
      } catch {
        guestDraftDispatchRef.current = null;
        showLocalError('Не удалось автоматически отправить сообщение после входа');
      }
    };

    void sendDraft();
  }, [
    shouldResumeGuestDraft,
    searchParams,
    setSearchParams,
    safeActiveChatId,
    knownChatIds,
    isAdminForeignChat,
    createChatMutation,
    sendMessageMutation.isPending,
    createChatMutation.isPending,
  ]);

  const showLocalError = (message: string, action: LocalNoticeAction | null = null) => {
    setLocalNoticeTone('error');
    setLocalNoticeAction(action);
    setLocalError(message);
  };

  const showLocalWarning = (message: string, action: LocalNoticeAction | null = null) => {
    setLocalNoticeTone('warning');
    setLocalNoticeAction(action);
    setLocalError(message);
  };

  const clearTransportTimeoutNotice = () => {
    setLocalError((prev) => (
      prev && (
        prev.includes('Провайдер не успел вернуть ответ вовремя')
        || prev.includes('Ответ от модели занял слишком много времени')
      )
        ? null
        : prev
    ));
    setLocalNoticeAction((prev) => (prev?.label === 'Повторить' ? null : prev));
  };

  useEffect(() => {
    if (localError) return;
    setLocalNoticeAction(null);
  }, [localError]);

  useEffect(() => {
    if (!activeChatId) return;

    writePersistedChatSelection({
      activeChatId,
      adminViewChatId: activeChatId === adminViewChatId ? adminViewChatId : null,
    });
  }, [activeChatId, adminViewChatId]);

  useEffect(() => {
    if (!safeActiveChatId || !activeChatError) return;
    if (getApiErrorCode(activeChatError) !== 'NOT_FOUND') return;
    setActiveChatId(isDesktop ? chats?.[0]?.id ?? null : null);
  }, [activeChatError, chats, isDesktop, safeActiveChatId]);

  useEffect(() => {
    if (!activeChat || isAdminForeignChat) {
      setPublishedLandingByMessageId((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }

    if (activePreviewMessageIds.length === 0) {
      setPublishedLandingByMessageId((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }

    let cancelled = false;

    void Promise.all(
      activePreviewMessageIds.map(async (messageId) => {
        try {
          const landing = await chatsApi.getPublishedLanding(activeChat.id, messageId);
          return [messageId, landing] as const;
        } catch (error) {
          if (getApiErrorStatus(error) === 404) {
            return [messageId, null] as const;
          }
          throw error;
        }
      }),
    )
      .then((entries) => {
        if (cancelled) return;
        const nextState: Record<string, PublishedLanding | null> = {};
        entries.forEach(([messageId, landing]) => {
          nextState[messageId] = landing;
        });
        setPublishedLandingByMessageId(nextState);
      })
      .catch(() => {
        if (!cancelled) {
          setPublishedLandingByMessageId((prev) => (Object.keys(prev).length === 0 ? prev : {}));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeChat, activePreviewMessageIds, isAdminForeignChat]);

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
    const handlePageHide = () => {
      persistChatListScrollTop();
    };

    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      persistChatListScrollTop();
    };
  }, []);

  useEffect(() => {
    if (!requestedChatId || !chats?.some((chat) => chat.id === requestedChatId)) return;
    pendingChatListScrollIdRef.current = requestedChatId;
    setActiveChatId(requestedChatId);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('chat');
    setSearchParams(nextParams, { replace: true });
  }, [requestedChatId, chats, searchParams, setSearchParams]);

  useEffect(() => {
    if (!isAdmin || !requestedAdminChatId) return;
    pendingChatListScrollIdRef.current = requestedAdminChatId;
    setAdminViewChatId(requestedAdminChatId);
    setActiveChatId(requestedAdminChatId);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('admin_chat_id');
    setSearchParams(nextParams, { replace: true });
  }, [isAdmin, requestedAdminChatId, searchParams, setSearchParams]);

  useEffect(() => {
    if (pendingChatListScrollIdRef.current) return;
    if (shouldScrollChatListToTopRef.current) return;
    if (hasRestoredChatListScrollRef.current) return;
    if (chatsLoading) return;

    const container = chatListScrollRef.current;
    if (!container) return;

    hasRestoredChatListScrollRef.current = true;
    const savedScrollTop = persistedChatListScrollTopRef.current;
    if (savedScrollTop <= 0) return;

    const restoreScrollPosition = () => {
      container.scrollTop = savedScrollTop;
    };

    window.requestAnimationFrame(() => {
      restoreScrollPosition();
      window.requestAnimationFrame(restoreScrollPosition);
    });
    window.setTimeout(restoreScrollPosition, 90);
  }, [chats, chatsLoading]);

  useEffect(() => {
    if (!shouldScrollChatListToTopRef.current) return;

    const container = chatListScrollRef.current;
    if (!container) return;

    shouldScrollChatListToTopRef.current = false;

    const scrollToTop = () => {
      container.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
      persistChatListScrollTop(0);
    };

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(scrollToTop);
    });
  }, [activeChatId, chats]);

  useEffect(() => {
    const pendingChatId = pendingChatListScrollIdRef.current;
    if (!pendingChatId || activeChatId !== pendingChatId) return;

    const container = chatListScrollRef.current;
    const row = chatRowRefs.current.get(pendingChatId);
    if (!container || !row) return;

    pendingChatListScrollIdRef.current = null;

    const scrollToChatRow = () => {
      const containerRect = container.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      const nextTop = rowRect.top - containerRect.top + container.scrollTop - 8;
      container.scrollTo({
        top: Math.max(0, nextTop),
        behavior: 'smooth',
      });
    };

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(scrollToChatRow);
    });
  }, [activeChatId, chats]);

  useEffect(() => {
    if (!activeChatId || !adminViewChatId) return;
    if (activeChatId !== adminViewChatId) return;
    if (activeChat?.is_admin_view) return;
    if (knownChatIds.has(activeChatId)) {
      setAdminViewChatId(null);
    }
  }, [activeChat?.is_admin_view, activeChatId, adminViewChatId, knownChatIds]);

  useEffect(() => {
    if (!chats || chats.length === 0 || !activeChatId) return;
    if (isAdminForeignChat) return;
    if (chats.some((chat) => chat.id === activeChatId)) return;
    setActiveChatId(isDesktop ? chats[0]?.id ?? null : null);
  }, [activeChatId, chats, isAdminForeignChat, isDesktop]);

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
        pendingChatListScrollIdRef.current = custom.detail;
        setActiveChatId(custom.detail);
      }
    };
    window.addEventListener('select-chat', handler as EventListener);
    return () => window.removeEventListener('select-chat', handler as EventListener);
  }, []);

  useEffect(() => {
    const handler = () => {
      openCreateDialog();
    };

    window.addEventListener('open-create-chat', handler);
    return () => window.removeEventListener('open-create-chat', handler);
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
      || isAdminForeignChat
      || (activeChat.mode !== 'agent' && (activeChat.tool_ids?.length ?? 0) === 0)
    ) {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      return;
    }

    const source = new EventSource(`/api/chats/${safeActiveChatId}/events`, { withCredentials: true });
    eventSourceRef.current = source;

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

          if (safeActiveChatId) {
            setAssistantResponseSlot((prev) => {
              if (!prev || prev.chatId !== safeActiveChatId || prev.actualMessageId) {
                return prev;
              }

              if (eventName === 'chat.run.failed') {
                return {
                  ...prev,
                  label: 'Ответ не получен',
                  detail: payload.error?.trim() || payload.detail?.trim() || payload.label?.trim() || 'Выполнение завершилось с ошибкой.',
                };
              }

              if (eventName === 'chat.run.completed' || eventName === 'chat.message.completed') {
                return {
                  ...prev,
                  label: 'Ответ почти готов',
                  detail: payload.detail?.trim() || payload.label?.trim() || 'Финализирую сообщение и сохраняю результат.',
                };
              }

              if (
                eventName === 'chat.run.started'
                || eventName === 'chat.run.status'
                || eventName === 'chat.run.tool.started'
                || eventName === 'chat.run.tool.finished'
              ) {
                clearTransportTimeoutNotice();
                return {
                  ...prev,
                  label: eventName === 'chat.run.tool.started'
                    ? 'Инструменты работают'
                    : eventName === 'chat.run.tool.finished'
                      ? 'Инструменты обновились'
                      : 'Агент работает',
                  detail: payload.detail?.trim() || payload.label?.trim() || payload.tool_name?.trim() || prev.detail,
                };
              }

              return prev;
            });

          if (
                eventName === 'chat.message.accepted'
                || eventName === 'chat.run.started'
                || eventName === 'chat.run.tool.started'
            ) {
              clearTransportTimeoutNotice();
              markChatRuntimeActive(safeActiveChatId);
            }

            if (eventName === 'chat.run.status') {
              if ((payload.status?.trim() ?? '').toLowerCase() !== 'failed') {
                clearTransportTimeoutNotice();
              }
              const status = payload.status?.trim();
              if (status === 'completed' || status === 'failed' || status === 'cancelled') {
                markChatRuntimeIdle(safeActiveChatId);
              } else {
                markChatRuntimeActive(safeActiveChatId);
              }
            }

            if (
              eventName === 'chat.message.completed'
              || eventName === 'chat.run.completed'
              || eventName === 'chat.run.failed'
              || eventName === 'chat.run.skipped'
            ) {
              if (eventName !== 'chat.run.failed') {
                clearTransportTimeoutNotice();
              }
              markChatRuntimeIdle(safeActiveChatId);
            }

            if (
              eventName === 'chat.message.accepted'
              || eventName === 'chat.message.completed'
              || eventName === 'chat.run.completed'
              || eventName === 'chat.run.failed'
              || (eventName === 'chat.run.status' && payload.status === 'continuing_output')
            ) {
              void queryClient.invalidateQueries({ queryKey: ['chats', safeActiveChatId] });
              void queryClient.invalidateQueries({ queryKey: ['chats'] });
              void queryClient.invalidateQueries({ queryKey: ['profile'] });
            }
          }
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
  }, [activeChat?.id, activeChat?.mode, activeChat?.tool_ids?.length, isActiveChatResolved, isAdminForeignChat, safeActiveChatId]);

  const setLandingActionBusy = (messageId: string, isBusy: boolean) => {
    setLandingActionMessageIds((prev) => (
      isBusy
        ? (prev.includes(messageId) ? prev : [...prev, messageId])
        : prev.filter((id) => id !== messageId)
    ));
  };

  const publishMessageLanding = async (
    chatId: string,
    messageId: string,
    payload?: { subdomain?: string | null; title?: string | null },
  ) => {
    setLandingActionBusy(messageId, true);
    try {
      const landing = await chatsApi.publishLanding(chatId, messageId, payload);
      setPublishedLandingByMessageId((prev) => ({ ...prev, [messageId]: landing }));
      await queryClient.invalidateQueries({ queryKey: ['chats'] });
      return landing;
    } catch (error) {
      throw new Error(getApiErrorMessage(error) ?? 'Не удалось опубликовать лендинг');
    } finally {
      setLandingActionBusy(messageId, false);
    }
  };

  const unpublishMessageLanding = async (chatId: string, messageId: string) => {
    setLandingActionBusy(messageId, true);
    try {
      await chatsApi.unpublishLanding(chatId, messageId);
      setPublishedLandingByMessageId((prev) => ({ ...prev, [messageId]: null }));
      await queryClient.invalidateQueries({ queryKey: ['chats'] });
    } catch (error) {
      throw new Error(getApiErrorMessage(error) ?? 'Не удалось снять публикацию');
    } finally {
      setLandingActionBusy(messageId, false);
    }
  };

  const updateMessageLanding = async (
    chatId: string,
    messageId: string,
    payload: { subdomain?: string | null; title?: string | null; slug?: string | null; description?: string | null },
  ) => {
    setLandingActionBusy(messageId, true);
    try {
      const landing = await chatsApi.updateLanding(chatId, messageId, payload);
      setPublishedLandingByMessageId((prev) => ({ ...prev, [messageId]: landing }));
      await queryClient.invalidateQueries({ queryKey: ['chats'] });
      return landing;
    } catch (error) {
      throw new Error(getApiErrorMessage(error) ?? 'Не удалось изменить URL сайта');
    } finally {
      setLandingActionBusy(messageId, false);
    }
  };

  useEffect(() => {
    const handler = () => setActiveChatId(null);
    window.addEventListener('show-chat-list', handler);
    return () => window.removeEventListener('show-chat-list', handler);
  }, []);

  useEffect(() => {
    const handler = () => {
      if (!activeChatId) return;

      const container = messagesScrollRef.current;
      if (!container) return;
      liveAutoScrollPinnedRef.current = true;

      if (scrollAnimationFrameRef.current) {
        cancelAnimationFrame(scrollAnimationFrameRef.current);
        scrollAnimationFrameRef.current = null;
      }

      snapScrollContainerToBottom(container, 4);
    };

    window.addEventListener('scroll-chat-to-bottom', handler);
    return () => window.removeEventListener('scroll-chat-to-bottom', handler);
  }, [activeChatId]);

  useEffect(() => {
    const container = messagesScrollRef.current;
    if (!container) return;

    const syncPinnedState = () => {
      const isPinned = getScrollDistanceFromBottom(container) <= LIVE_AUTO_SCROLL_THRESHOLD_PX;
      liveAutoScrollPinnedRef.current = isPinned;

      if (!isPinned && scrollAnimationFrameRef.current) {
        cancelAnimationFrame(scrollAnimationFrameRef.current);
        scrollAnimationFrameRef.current = null;
      }
    };

    syncPinnedState();
    container.addEventListener('scroll', syncPinnedState, { passive: true });

    return () => {
      container.removeEventListener('scroll', syncPinnedState);
    };
  }, [activeChat?.id]);

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
    if (!activeChat?.id || activeChatLoading) return;

    const container = messagesScrollRef.current;
    if (!container) return;

    if (scrollAnimationFrameRef.current) {
      cancelAnimationFrame(scrollAnimationFrameRef.current);
      scrollAnimationFrameRef.current = null;
    }

    liveAutoScrollPinnedRef.current = true;
    snapScrollContainerToBottom(container, 4);

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(() => {
      snapScrollContainerToBottom(container, 2);
    });
    observer.observe(container);

    const disconnectTimer = window.setTimeout(() => {
      observer.disconnect();
    }, 420);

    return () => {
      observer.disconnect();
      window.clearTimeout(disconnectTimer);
    };
  }, [activeChat?.id, activeChatLoading, displayedMessages.length]);

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
    const container = messagesScrollRef.current;
    const previousCount = previousStreamEventsCountRef.current;
    const nextCount = streamEvents.length;

    previousStreamEventsCountRef.current = nextCount;

    if (!assistantResponseSlotForActiveChat || !container) return;
    if (nextCount === 0 || nextCount <= previousCount) return;
    if (!liveAutoScrollPinnedRef.current) {
      return;
    }
    snapMessagesToBottom(5);
  }, [assistantResponseSlotForActiveChat, streamEvents.length]);

  useEffect(() => {
    const container = messagesScrollRef.current;
    if (!assistantResponseSlotForActiveChat || !container) return;

    const scheduleScroll = () => {
      if (!liveAutoScrollPinnedRef.current) return;
      snapMessagesToBottom(4);
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
    };
  }, [assistantResponseSlotForActiveChat?.chatId, assistantResponseSlotForActiveChat?.actualMessageId, streamEvents.length]);

  useEffect(() => {
    if (assistantResponseSlotForActiveChat) return;

    const container = messagesScrollRef.current;
    if (!container) return;
    if (!liveAutoScrollPinnedRef.current) return;
    snapMessagesToBottom(4);
  }, [assistantResponseSlotForActiveChat, displayedMessages.length, streamEvents.length]);

  useEffect(() => {
    if (!assistantResponseSlotForActiveChat?.actualMessageId) return;

    const container = messagesScrollRef.current;
    const slotNode = assistantSlotNodeRef.current;
    if (!container || !slotNode) return;

    let observer: ResizeObserver | null = null;
    let rafId: number | null = null;

    const ensureSlotVisible = () => {
      if (!liveAutoScrollPinnedRef.current) return;
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
    const container = messagesScrollRef.current;
    const content = messagesContentRef.current;
    if (!container || !content) return;
    if (!assistantResponseSlotForActiveChat) return;

    const scheduleScroll = () => {
      if (!liveAutoScrollPinnedRef.current) return;
      snapMessagesToBottom(4);
    };

    const resizeObserver = new ResizeObserver(() => {
      scheduleScroll();
    });
    resizeObserver.observe(content);
    if (assistantSlotNodeRef.current) {
      resizeObserver.observe(assistantSlotNodeRef.current);
    }

    const mutationObserver = new MutationObserver(() => {
      scheduleScroll();
    });
    mutationObserver.observe(content, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    scheduleScroll();

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [
    assistantResponseSlotForActiveChat,
    streamEvents.length,
    displayedMessages.length,
  ]);

  useEffect(() => {
    if (!activeChat?.id) return;
    if (isPendingRunLive(activeChat.pending_run)) {
      markChatRuntimeActive(activeChat.id);
      return;
    }
    if (activeChat.pending_run && isPendingRunTerminal(activeChat.pending_run)) {
      markChatRuntimeIdle(activeChat.id);
      return;
    }
    if (optimisticMessageForActiveChat) return;
    if (assistantResponseSlotForActiveChat) return;
    if (isAwaitingLateReply) return;

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) {
      markChatRuntimeIdle(activeChat.id);
      return;
    }

    if (lastMessage.role === 'assistant') {
      markChatRuntimeIdle(activeChat.id);
      return;
    }

    const lastCreatedAtMs = Date.parse(lastMessage.created_at);
    if (Number.isNaN(lastCreatedAtMs) || (Date.now() - lastCreatedAtMs) > PENDING_REPLY_RECOVERY_WINDOW_MS) {
      markChatRuntimeIdle(activeChat.id);
    }
  }, [
    activeChat?.id,
    activeChat?.pending_run,
    messages,
    optimisticMessageForActiveChat,
    assistantResponseSlotForActiveChat,
    isAwaitingLateReply,
  ]);

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
    setPropertiesToolIds(activeChat.chat_tool_ids ?? activeChat.tool_ids ?? []);
    setPropertiesAccess(activeChat.access ?? 'public');
    setPropertiesAllowedText((activeChat.access_identifiers ?? []).join('\n'));
    setPropertiesNote(activeChat.note ?? '');
  }, [isPropertiesOpen, activeChat, agents]);

  useEffect(() => {
    setIsQuickPromptsOpen(displayedMessages.length === 0);
    previousMessageCountRef.current = displayedMessages.length;
    setComposerPrefill(null);
  }, [activeChat?.id]);

  useEffect(() => {
    if (!activeChat?.id || !requestedPrefill) return;

    setComposerPrefill({
      text: requestedPrefill,
      token: Date.now(),
    });
  }, [activeChat?.id, requestedPrefill]);

  useEffect(() => {
    if (previousMessageCountRef.current === 0 && displayedMessages.length > 0) {
      setIsQuickPromptsOpen(false);
    }
    previousMessageCountRef.current = displayedMessages.length;
  }, [displayedMessages.length]);

  useEffect(() => {
    return () => {
      if (shareToastTimerRef.current) clearTimeout(shareToastTimerRef.current);
      if (createDialogTimerRef.current) clearTimeout(createDialogTimerRef.current);
      if (deleteDialogTimerRef.current) clearTimeout(deleteDialogTimerRef.current);
      if (propertiesDialogTimerRef.current) clearTimeout(propertiesDialogTimerRef.current);
      if (topUpDialogTimerRef.current) clearTimeout(topUpDialogTimerRef.current);
      if (transferDialogTimerRef.current) clearTimeout(transferDialogTimerRef.current);
      if (messageEnterCleanupTimerRef.current) clearTimeout(messageEnterCleanupTimerRef.current);
      if (scrollAnimationFrameRef.current) cancelAnimationFrame(scrollAnimationFrameRef.current);
    };
  }, []);

  const filteredChats = useMemo(() => {
    const baseChats = [...(chats ?? [])];
    if (activeChat?.is_admin_view && !baseChats.some((chat) => chat.id === activeChat.id)) {
      baseChats.unshift({
        ...activeChat,
        last_message_preview: messages[messages.length - 1]?.content ?? null,
        message_count: messages.length,
      });
    }

    if (!search.trim()) return baseChats;
    const q = search.trim().toLowerCase();
    return baseChats.filter((chat) => {
      const title = (chat.title || '').toLowerCase();
      const preview = (chat.last_message_preview || '').toLowerCase();
      const owner = getChatOwnerLabel(chat).toLowerCase();
      return title.includes(q) || preview.includes(q) || owner.includes(q);
    });
  }, [activeChat, chats, messages, search]);

  const draftChats = filteredChats.filter((chat) => chat.message_count === 0);
  const regularChats = filteredChats.filter((chat) => chat.message_count > 0);
  const isMobileChatOpen = !isDesktop && Boolean(activeChatId);

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
  const propertiesAgentToolIds = useMemo(
    () => new Set(activeChat?.agent_tool_ids ?? []),
    [activeChat?.agent_tool_ids],
  );
  const propertiesEffectiveToolIds = useMemo(
    () => new Set(activeChat?.effective_tool_ids ?? activeChat?.tool_ids ?? []),
    [activeChat?.effective_tool_ids, activeChat?.tool_ids],
  );
  const propertiesAgentTools = useMemo(
    () => activeChat?.agent_tools ?? [],
    [activeChat?.agent_tools],
  );
  const propertiesEffectiveTools = useMemo(
    () => activeChat?.effective_tools ?? activeChat?.tools ?? propertiesSelectedTools,
    [activeChat?.effective_tools, activeChat?.tools, propertiesSelectedTools],
  );
  const quickConnectTools = useMemo(
    () => propertiesAvailableTools.filter((tool) => (
      (tool.slug === 'http-request' || tool.slug === 'web-search-cascade')
      && !propertiesEffectiveToolIds.has(tool.id)
    )),
    [propertiesAvailableTools, propertiesEffectiveToolIds],
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

  const syncProjectRunCount = (chatId: string, messageId: string, projectRunCount: number | null) => {
    if (typeof projectRunCount !== 'number') return;

    queryClient.setQueryData<ChatDetails | undefined>(['chats', chatId], (current) => {
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

  useEffect(() => {
    if (!activeChat?.id || messages.length === 0) return;
    if (optimisticMessageForActiveChat) return;
    if (assistantResponseSlotForActiveChat) return;

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'user') return;

    const startedAtMs = Date.parse(lastMessage.created_at);
    if (Number.isNaN(startedAtMs)) return;
    if ((Date.now() - startedAtMs) > PENDING_REPLY_RECOVERY_WINDOW_MS) return;

    const recoveryKey = `${activeChat.id}:${lastMessage.id}:${lastMessage.created_at}`;
    if (lateReplyRecoveryAttemptedRef.current.has(recoveryKey)) return;
    lateReplyRecoveryAttemptedRef.current.add(recoveryKey);

    setAssistantResponseSlot({
      chatId: activeChat.id,
      visualKey: `assistant-slot-recovered-${lastMessage.id}`,
      startedAt: lastMessage.created_at,
      label: 'Думаю...',
      detail: 'Восстанавливаю ответ после перезагрузки страницы.',
      actualMessageId: null,
    });

    void recoverLateAssistantReply(activeChat.id, lastMessage.created_at, {
      trackAwaitingState: false,
    }).then((recovered) => {
      if (recovered) return;
      setAssistantResponseSlot((prev) => {
        if (!prev || prev.chatId !== activeChat.id) {
          return prev;
        }

        if (prev.startedAt !== lastMessage.created_at || prev.actualMessageId) {
          return prev;
        }

        return null;
      });
    });
  }, [activeChat?.id, assistantResponseSlotForActiveChat, messages, optimisticMessageForActiveChat]);

  const openCreateDialog = () => {
    if (createDialogTimerRef.current) clearTimeout(createDialogTimerRef.current);
    setIsCreateDialogClosing(false);
    setIsCreateDialogOpen(true);
  };

  const closeCreateDialog = () => {
    if (createChatMutation.isPending || !isCreateDialogOpen) return;
    setIsCreateDialogClosing(true);
    if (createDialogTimerRef.current) clearTimeout(createDialogTimerRef.current);
    createDialogTimerRef.current = setTimeout(() => {
      setIsCreateDialogOpen(false);
      setIsCreateDialogClosing(false);
      createDialogTimerRef.current = null;
    }, DIALOG_CLOSE_ANIMATION_MS);
  };

  const openPropertiesDialog = () => {
    if (propertiesDialogTimerRef.current) clearTimeout(propertiesDialogTimerRef.current);
    setIsPropertiesClosing(false);
    setIsPropertiesOpen(true);
  };

  const closePropertiesDialog = () => {
    if (propertiesSaving || !isPropertiesOpen) return;
    setIsPropertiesClosing(true);
    if (propertiesDialogTimerRef.current) clearTimeout(propertiesDialogTimerRef.current);
    propertiesDialogTimerRef.current = setTimeout(() => {
      setIsPropertiesOpen(false);
      setIsPropertiesClosing(false);
      propertiesDialogTimerRef.current = null;
    }, DIALOG_CLOSE_ANIMATION_MS);
  };

  const openTopUpDialog = () => {
    if (topUpDialogTimerRef.current) clearTimeout(topUpDialogTimerRef.current);
    setIsTopUpClosing(false);
    setIsTopUpOpen(true);
  };

  const closeTopUpDialog = () => {
    if (!isTopUpOpen) return;
    setIsTopUpClosing(true);
    if (topUpDialogTimerRef.current) clearTimeout(topUpDialogTimerRef.current);
    topUpDialogTimerRef.current = setTimeout(() => {
      setIsTopUpOpen(false);
      setIsTopUpClosing(false);
      topUpDialogTimerRef.current = null;
    }, DIALOG_CLOSE_ANIMATION_MS);
  };

  const createNewChat = async () => openCreateDialog();

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
      shouldScrollChatListToTopRef.current = true;
      persistChatListScrollTop(0);
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
      shouldScrollChatListToTopRef.current = true;
      persistChatListScrollTop(0);
      setActiveChatId(created.id);
      if (createDialogTimerRef.current) clearTimeout(createDialogTimerRef.current);
      setIsCreateDialogOpen(false);
      setIsCreateDialogClosing(false);
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

  const requestDeleteChat = (chat: ChatListItem) => {
    if (deleteDialogTimerRef.current) clearTimeout(deleteDialogTimerRef.current);
    setDeleteDialogClosing(false);
    setDeleteDialogChat(chat);
    setOpenMenu(null);
  };

  const requestTransferChat = (chat: ChatListItem) => {
    if (transferDialogTimerRef.current) clearTimeout(transferDialogTimerRef.current);
    setTransferDialogClosing(false);
    setTransferDialogError(null);
    setTransferIdentifier('');
    setTransferDialogChat(chat);
    setOpenMenu(null);
  };

  const closeDeleteDialog = () => {
    if (deleteChatMutation.isPending || !deleteDialogChat) return;
    setDeleteDialogClosing(true);
    if (deleteDialogTimerRef.current) clearTimeout(deleteDialogTimerRef.current);
    deleteDialogTimerRef.current = setTimeout(() => {
      setDeleteDialogChat(null);
      setDeleteDialogClosing(false);
      deleteDialogTimerRef.current = null;
    }, DIALOG_CLOSE_ANIMATION_MS);
  };

  const closeTransferDialog = () => {
    if (transferChatMutation.isPending || !transferDialogChat) return;
    setTransferDialogClosing(true);
    if (transferDialogTimerRef.current) clearTimeout(transferDialogTimerRef.current);
    transferDialogTimerRef.current = setTimeout(() => {
      setTransferDialogChat(null);
      setTransferDialogClosing(false);
      setTransferIdentifier('');
      setTransferDialogError(null);
      transferDialogTimerRef.current = null;
    }, DIALOG_CLOSE_ANIMATION_MS);
  };

  const deleteChat = async (chatId: string) => {
    setLocalError(null);
    try {
      await deleteChatMutation.mutateAsync(chatId);
      if (activeChatId === chatId) setActiveChatId(null);
      if (deleteDialogTimerRef.current) clearTimeout(deleteDialogTimerRef.current);
      setDeleteDialogChat(null);
      setDeleteDialogClosing(false);
    } catch {
      showLocalError('Не удалось удалить чат');
    }
  };

  const transferChat = async () => {
    if (!transferDialogChat) return;

    const identifier = transferIdentifier.trim();
    if (!identifier) {
      setTransferDialogError('Укажите логин или email аккаунта');
      return;
    }

    setTransferDialogError(null);
    setLocalError(null);

    try {
      const result = await transferChatMutation.mutateAsync({
        chatId: transferDialogChat.id,
        identifier,
      });
      if (activeChatId === transferDialogChat.id) {
        setActiveChatId(null);
      }
      if (transferDialogTimerRef.current) clearTimeout(transferDialogTimerRef.current);
      setTransferDialogChat(null);
      setTransferDialogClosing(false);
      setTransferIdentifier('');
      showLocalWarning(
        `Чат передан аккаунту ${result.transferred_to.name?.trim() || (result.transferred_to.username ? `@${result.transferred_to.username}` : result.transferred_to.email)}`,
      );
    } catch (error) {
      setTransferDialogError(getApiErrorMessage(error) ?? 'Не удалось передать чат');
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

  const copyChatLink = async (chatId: string) => {
    setLocalError(null);
    try {
      const url = `${window.location.origin}/chats?chat=${chatId}`;
      await navigator.clipboard.writeText(url);
      setShareToastVisible(true);
      if (shareToastTimerRef.current) clearTimeout(shareToastTimerRef.current);
      shareToastTimerRef.current = setTimeout(() => setShareToastVisible(false), 2000);
    } catch {
      showLocalError('Не удалось скопировать ссылку на чат');
    } finally {
      setOpenMenu(null);
    }
  };

  const toggleChatPrivacy = async (chat: ChatListItem) => {
    setLocalError(null);
    try {
      await updateChatMutation.mutateAsync({
        chatId: chat.id,
        access: chat.access === 'public' ? 'private' : 'public',
      });
    } catch {
      showLocalError('Не удалось изменить приватность чата');
    } finally {
      setOpenMenu(null);
    }
  };

  const pinChatToTop = async (chat: ChatListItem) => {
    setLocalError(null);
    try {
      await updateChatMutation.mutateAsync({
        chatId: chat.id,
        pin_to_top: true,
      });
    } catch {
      showLocalError('Не удалось закрепить чат сверху');
    } finally {
      setOpenMenu(null);
    }
  };

  const unpinChatFromTop = async (chat: ChatListItem) => {
    setLocalError(null);
    try {
      await updateChatMutation.mutateAsync({
        chatId: chat.id,
        unpin_from_top: true,
      });
    } catch {
      showLocalError('Не удалось открепить чат');
    } finally {
      setOpenMenu(null);
    }
  };

  const openProperties = (chatId: string) => {
    setActiveChatId(chatId);
    setOpenMenu(null);
    setPropertiesError(null);
    openPropertiesDialog();
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
        note: propertiesNote.trim() || null,
        mode: isPropertiesAgentMode ? 'agent' : 'general',
        agent_id: isPropertiesAgentMode ? propertiesAgentId : null,
        model_external_id: isPropertiesAgentMode ? null : propertiesModel,
        tool_ids: propertiesToolIds,
        access: propertiesAccess,
        access_identifiers: accessIdentifiers,
      });
      if (propertiesDialogTimerRef.current) clearTimeout(propertiesDialogTimerRef.current);
      setIsPropertiesOpen(false);
      setIsPropertiesClosing(false);
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

  const recoverLateAssistantReply = async (
    chatId: string,
    startedAt: string,
    options: {
      trackAwaitingState?: boolean;
      windowMs?: number;
      attemptIntervalMs?: number;
      expectedUserContent?: string;
    } = {},
  ) => {
    markChatRuntimeActive(chatId);
    const trackAwaitingState = options.trackAwaitingState ?? true;
    const windowMs = options.windowMs ?? PENDING_REPLY_RECOVERY_WINDOW_MS;
    const attemptIntervalMs = options.attemptIntervalMs ?? 4_000;
    const expectedUserContent = options.expectedUserContent?.trim() || null;
    if (trackAwaitingState) {
      setIsAwaitingLateReply(true);
    }

    const startedAtMs = Date.parse(startedAt);
    const deadline = Number.isNaN(startedAtMs)
      ? Date.now() + windowMs
      : startedAtMs + windowMs;

    while (Date.now() < deadline) {
      await sleep(attemptIntervalMs);

      try {
        const latest = await chatsApi.get(chatId);
        queryClient.setQueryData<ChatDetails>(['chats', chatId], latest);
        queryClient.invalidateQueries({ queryKey: ['chats'] });
        queryClient.invalidateQueries({ queryKey: ['profile'] });

        const hasExpectedUserMessage = latest.messages.some((message) => {
          if (message.role !== 'user') return false;
          if (expectedUserContent && message.content !== expectedUserContent) return false;
          return Date.parse(message.created_at) >= (startedAtMs - 60_000);
        });

        if (hasExpectedUserMessage) {
          setOptimisticPendingMessage((prev) => (prev?.chatId === chatId ? null : prev));
        }

        const hasAssistantReply = latest.messages.some((message) => (
          message.role === 'assistant' && Date.parse(message.created_at) >= startedAtMs
        ));

        if (hasAssistantReply) {
          setLocalError(null);
          markChatRuntimeIdle(chatId);
          if (trackAwaitingState) {
            setIsAwaitingLateReply(false);
          }
          return true;
        }
      } catch {
        // The run may still be finishing in the background.
      }
    }

    if (trackAwaitingState) {
      setIsAwaitingLateReply(false);
    }
    markChatRuntimeIdle(chatId);
    return false;
  };

  async function performSendMessage(input: { chatId: string; content: string; files?: File[] }) {
    if (!hasAvailableBalance) {
      openTopUpDialog();
      showLocalError('У вас не осталось баланса. Скоро вы сможете пополнить его на сайте, а пока можете написать Родиону.');
      return;
    }

    const { chatId, content } = input;
    const files = [...(input.files ?? [])];
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
    markChatRuntimeActive(chatId);

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
          message.id !== result.user_message.id && (!result.assistant_message || message.id !== result.assistant_message.id)
        ));

        return {
          ...prev,
          chat: {
            ...prev.chat,
            ...result.chat,
          },
          messages: result.assistant_message
            ? [...nextMessages, result.user_message, result.assistant_message]
            : [...nextMessages, result.user_message],
        };
      });

      if (!result.assistant_message) {
        const pendingProgressEvent = result.pending_run
          ? createLiveProgressEvent('pending.snapshot', {
            label: result.pending_run.label,
            detail: result.pending_run.detail,
            status: result.pending_run.status,
            tool_name: result.pending_run.tool_name ?? undefined,
            ts: result.pending_run.started_at,
            error: result.pending_run.error ?? undefined,
          }, 0)
          : null;
        setAssistantResponseSlot((prev) => (
          prev && prev.chatId === chatId
            ? {
              ...prev,
              label: pendingProgressEvent?.label ?? 'Агент работает',
              detail: pendingProgressEvent?.detail ?? result.pending_run?.detail ?? 'Сообщение принято. Живой прогресс и частичный результат будут появляться прямо в чате.',
            }
            : prev
        ));
        setOptimisticPendingMessage((prev) => (prev?.chatId === chatId ? null : prev));
        markChatRuntimeActive(chatId);
        return;
      }

      const assistantMessage = result.assistant_message;
      setAssistantResponseSlot((prev) => (
        prev && prev.chatId === chatId
          ? { ...prev, actualMessageId: assistantMessage.id }
          : prev
      ));
      setOptimisticPendingMessage((prev) => (prev?.chatId === chatId ? null : prev));
      markChatRuntimeIdle(chatId);
    } catch (err) {
      const code = getApiErrorCode(err);
      const status = getApiErrorStatus(err);
      if (code === 'INSUFFICIENT_BALANCE') {
        setOptimisticPendingMessage((prev) => (prev?.chatId === chatId ? null : prev));
        setAssistantResponseSlot((prev) => (prev?.chatId === chatId ? null : prev));
        markChatRuntimeIdle(chatId);
        openTopUpDialog();
        showLocalError(getApiErrorMessage(err) || 'У вас не осталось баланса. Скоро вы сможете пополнить его на сайте.');
        return;
      }
      if (status === 504) {
        setAssistantResponseSlot((prev) => (
          prev?.chatId === chatId
            ? {
              ...prev,
              label: 'Ответ задерживается',
              detail: 'Проверяю, не успел ли он сохраниться в фоне. Ваше сообщение остаётся в чате.',
            }
            : prev
        ));
        const recovered = await recoverLateAssistantReply(chatId, startedAt, {
          windowMs: TIMEOUT_REPLY_RECOVERY_WINDOW_MS,
          attemptIntervalMs: TIMEOUT_REPLY_RECOVERY_ATTEMPT_MS,
          expectedUserContent: content,
        });
        if (recovered) {
          setLocalError(null);
          return;
        }
        if (!recovered) {
          setAssistantResponseSlot((prev) => (prev?.chatId === chatId ? null : prev));
          markChatRuntimeIdle(chatId);
          showLocalError(
            'Провайдер не успел вернуть ответ вовремя. Мы остановили ожидание честно, без вечного “думаю”. Попробуйте ещё раз, упростите задачу или выберите более быстрый агент.',
            {
              label: 'Повторить',
              onClick: () => {
                if (safeActiveChatId !== chatId) {
                  setActiveChatId(chatId);
                }
                void performSendMessage({ chatId, content, files });
              },
            },
          );
        }
        return;
      }
      setOptimisticPendingMessage((prev) => (prev?.chatId === chatId ? null : prev));
      setAssistantResponseSlot((prev) => (prev?.chatId === chatId ? null : prev));
      markChatRuntimeIdle(chatId);
      showLocalError(err instanceof Error ? err.message : 'Не удалось отправить сообщение');
    }
  }

  const sendMessage = async (content: string, files: File[] = []) => {
    if (!activeChat) return;
    if (isAdminForeignChat) return;
    await performSendMessage({ chatId: activeChat.id, content, files });
  };

  const editMessage = async (messageId: string, content: string) => {
    if (!activeChat) return;
    if (isAdminForeignChat) return;

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

  useEffect(() => {
    if (!activeChat?.id) return;

    const pendingRun = activeChat.pending_run;
    if (!pendingRun) return;
    const pendingProgressEvent = createLiveProgressEvent('pending.snapshot', {
      label: pendingRun.label,
      detail: pendingRun.detail,
      status: pendingRun.status,
      tool_name: pendingRun.tool_name ?? undefined,
      ts: pendingRun.started_at,
      error: pendingRun.error ?? undefined,
    }, 0);

    if (isPendingRunLive(pendingRun)) {
      clearTransportTimeoutNotice();
      markChatRuntimeActive(activeChat.id);
      setAssistantResponseSlot((prev) => {
        if (prev?.chatId === activeChat.id) {
          if (prev.actualMessageId) return prev;
          return {
            ...prev,
            startedAt: pendingRun.started_at || prev.startedAt,
            label: pendingProgressEvent.label,
            detail: pendingProgressEvent.detail ?? pendingRun.detail ?? prev.detail,
          };
        }

        return {
          chatId: activeChat.id,
          visualKey: `assistant-slot-runtime-${pendingRun.run_id}`,
          startedAt: pendingRun.started_at,
          label: pendingProgressEvent.label,
          detail: pendingProgressEvent.detail ?? pendingRun.detail ?? 'Собираю ответ и показываю прогресс по мере поступления шагов.',
          actualMessageId: null,
        };
      });
      return;
    }

    if (pendingRun && isPendingRunTerminal(pendingRun)) {
      clearTransportTimeoutNotice();
      markChatRuntimeIdle(activeChat.id);
      setAssistantResponseSlot((prev) => (
        prev?.chatId === activeChat.id && !prev.actualMessageId ? null : prev
      ));
    }
  }, [activeChat?.id, activeChat?.pending_run]);

  useEffect(() => {
    const pendingRun = activeChat?.pending_run;
    if (!pendingRun || !isPendingRunProblematicTerminal(pendingRun)) return;
    if (localError) return;

    showLocalWarning(
      pendingRun.result_status === 'failed_no_result'
        ? LONG_RUN_FAILED_NO_RESULT_NOTICE
        : LONG_RUN_PARTIAL_NOTICE,
    );
  }, [activeChat?.pending_run, localError]);

  useEffect(() => {
    if (!isLongRunTerminalNotice(localError)) return;

    const pendingRun = activeChat?.pending_run;
    if (pendingRun && isPendingRunProblematicTerminal(pendingRun)) return;

    setLocalError(null);
    setLocalNoticeAction(null);
  }, [activeChat?.id, activeChat?.pending_run, localError]);

  const renderChatRow = (chat: ChatListItem) => (
    <div
      key={chat.id}
      ref={(node) => {
        if (node) {
          chatRowRefs.current.set(chat.id, node);
        } else {
          chatRowRefs.current.delete(chat.id);
        }
      }}
      className={cn(
        'relative rounded-md px-2 py-2 transition-colors',
        activeChatId === chat.id ? 'bg-accent text-foreground' : 'hover:bg-accent/60',
      )}
      onContextMenu={(e) => {
        if (chat.is_admin_view) return;
        e.preventDefault();
        setOpenMenu({ kind: 'chat', id: chat.id });
      }}
    >
      {(() => {
        const livePendingRun = isPendingRunLive(chat.pending_run ?? null)
          ? (chat.pending_run ?? null)
          : (activeChatId === chat.id && activeChat?.pending_run && isPendingRunLive(activeChat.pending_run)
            ? activeChat.pending_run
            : null);
        const rowHasLiveRun = Boolean(livePendingRun) || activeRuntimeChatIds.has(chat.id);
        const rowHasPartialRun = Boolean(livePendingRun?.is_partial);
        const previewText = livePendingRun
          ? `${livePendingRun.label}. Чат ещё не завершён.`
          : (formatChatPreview(chat.last_message_preview) || (chat.mode === 'general' ? 'Общение' : 'Чат с ботом'));
        return (
          <>
      <button type="button" onClick={() => setActiveChatId(chat.id)} className="w-full pr-8 text-left">
        <div className="flex items-center gap-1 pr-2">
          {rowHasLiveRun && (
            <span
              className={cn(
                'h-2.5 w-2.5 shrink-0 rounded-full animate-pulse',
                rowHasPartialRun
                  ? 'bg-amber-500 shadow-[0_0_0_3px_rgba(245,158,11,0.18)]'
                  : 'bg-emerald-500 shadow-[0_0_0_3px_rgba(34,197,94,0.16)]',
              )}
              aria-label={rowHasPartialRun ? 'Run ещё дособирает финальный результат' : 'Runtime выполняется'}
              title={rowHasPartialRun ? 'Run ещё дособирает финальный результат' : 'Runtime выполняется'}
            />
          )}
          {chat.access !== 'public' && (
            <span
              className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-slate-500"
              aria-label={getChatPrivacyTitle(chat.access)}
              title={getChatPrivacyTitle(chat.access)}
            >
              <ChatPrivacyIcon access={chat.access} className="h-3.5 w-3.5" />
            </span>
          )}
          {chat.pinned_at && (
            <span
              className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-amber-200/80 bg-amber-50 text-amber-500"
              aria-label="Чат закреплён сверху"
              title="Чат закреплён сверху"
            >
              <Pin className="h-2.75 w-2.75 -rotate-12" />
            </span>
          )}
          {chat.has_site_preview && (
            <span
              className={cn(
                'inline-flex h-4 w-4 shrink-0 items-center justify-center',
                chat.has_published_landing ? 'text-emerald-600' : 'text-slate-500',
              )}
              aria-label={getChatWebsiteTitle(chat)}
              title={getChatWebsiteTitle(chat)}
            >
              <Globe className="h-3.5 w-3.5" />
            </span>
          )}
          <p className="min-w-0 flex-1 truncate text-sm font-medium">{chat.title}</p>
          {chat.is_admin_view && (
            <span className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
              Чужой чат
            </span>
          )}
        </div>
        <p className="truncate text-[11px] text-muted-foreground">
          {getChatListMeta(chat)}
        </p>
        {chat.note?.trim() ? (
          <p className="truncate text-[11px] text-sky-700/90">
            {chat.note.trim().replace(/\s+/g, ' ')}
          </p>
        ) : null}
        {chat.is_admin_view && (
          <p className="truncate text-[11px] text-amber-700">
            Владелец: {getChatOwnerLabel(chat)}
          </p>
        )}
        <p className="truncate text-xs text-muted-foreground">
          {previewText}
        </p>
        <p className="text-xs text-muted-foreground">{formatDate(chat.last_message_at)}</p>
      </button>

      {!chat.is_admin_view && (
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
          <div className="absolute right-0 top-8 z-20 min-w-[190px] rounded-md border bg-white p-1 shadow-lg">
            <button type="button" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={() => renameChat(chat)}>
              {getChatActionIcon('rename')}
              <span>Переименовать</span>
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
              onClick={() => void pinChatToTop(chat)}
              disabled={updateChatMutation.isPending}
            >
              {getChatActionIcon('pin')}
              <span>Закрепить сверху</span>
            </button>
            {chat.pinned_at && (
              <button
                type="button"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
              onClick={() => void unpinChatFromTop(chat)}
              disabled={updateChatMutation.isPending}
            >
              {getChatActionIcon('unpin')}
              <span>Открепить</span>
            </button>
            )}
            <button type="button" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={() => openProperties(chat.id)}>
              {getChatActionIcon('properties')}
              <span>Свойства</span>
            </button>
            <button type="button" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={() => exportChatBundle(chat.id)}>
              {getChatActionIcon('export')}
              <span>Экспортировать</span>
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
              onClick={() => toggleChatPrivacy(chat)}
              disabled={updateChatMutation.isPending}
            >
              {getChatActionIcon('privacy', chat.access)}
              <span>{getChatPrivacyQuickActionLabel(chat.access)}</span>
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
              onClick={() => requestTransferChat(chat)}
              disabled={transferChatMutation.isPending}
            >
              {getChatActionIcon('transfer')}
              <span>Передать</span>
            </button>
            <button type="button" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={() => requestDeleteChat(chat)}>
              {getChatActionIcon('delete')}
              <span>Удалить</span>
            </button>
            <button type="button" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={() => void copyChatLink(chat.id)}>
              {getChatActionIcon('copy_link')}
              <span>Скопировать ссылку</span>
            </button>
            <button type="button" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={() => shareChat(chat.id)}>
              {getChatActionIcon('share')}
              <span>Поделиться</span>
            </button>
          </div>
        )}
      </div>
      )}
          </>
        );
      })()}
    </div>
  );

  return (
    <div className="flex h-[calc(100dvh-4rem)] min-h-[calc(100dvh-4rem)] w-full max-w-full flex-col overflow-x-hidden px-4 py-4">
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

      <div className={cn('mx-auto flex min-h-0 w-full max-w-full flex-1 overflow-hidden rounded-xl border bg-white', !isDesktop && 'relative')}>
        <aside
          className={cn(
            'flex min-w-0 w-full shrink-0 flex-col',
            isDesktop
              ? 'max-w-xs border-r'
              : 'absolute inset-0 z-10 max-w-none bg-white transition-[transform,opacity,filter] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
            !isDesktop && (isMobileChatOpen
              ? '-translate-x-[18%] opacity-0 blur-[2px] pointer-events-none'
              : 'translate-x-0 opacity-100'),
          )}
        >
          <div className="border-b p-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Button className="w-full" onClick={createNewChat} disabled={createChatMutation.isPending}>Новый чат</Button>
              <Button variant="outline" className="w-full" onClick={triggerImportChat} disabled={importChatBundleMutation.isPending}>
                {importChatBundleMutation.isPending ? 'Импорт...' : 'Импорт'}
              </Button>
            </div>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск чата..." />
          </div>
          <div
            ref={chatListScrollRef}
            className="flex-1 overflow-y-auto p-2 space-y-4"
            onScroll={() => persistChatListScrollTop()}
          >
            {sidebarLoading && <div className="flex justify-center py-8"><Spinner /></div>}
            {!sidebarLoading && draftChats.length > 0 && <section className="space-y-1"><p className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{`Черновики: ${draftChats.length}`}</p>{draftChats.map(renderChatRow)}</section>}
            {!sidebarLoading && regularChats.length > 0 && <section className="space-y-1"><p className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{`Чаты: ${regularChats.length}`}</p>{regularChats.map(renderChatRow)}</section>}
            {!sidebarLoading && (!chats || chats.length === 0) && (
              <div className="flex min-h-full flex-1 items-center">
                <div className="w-full rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-4 text-center shadow-sm">
                <p className="text-sm font-medium text-slate-900">У вас пока нет чатов</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Создайте первый чат и начните общение или работу с агентом.
                </p>
                <Button className="mt-4 w-full" onClick={createNewChat} disabled={createChatMutation.isPending}>
                  {createChatMutation.isPending ? 'Создаю...' : 'Создать первый чат'}
                </Button>
                </div>
              </div>
            )}
          </div>
        </aside>

        <section
          className={cn(
            'flex min-w-0 w-full max-w-full flex-1 flex-col overflow-x-hidden',
            !isDesktop && 'absolute inset-0 z-20 bg-white transition-[transform,opacity,filter] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
            !isDesktop && (isMobileChatOpen
              ? 'translate-x-0 opacity-100'
              : 'translate-x-full opacity-0 blur-[2px] pointer-events-none'),
          )}
        >
          <div className="flex flex-col gap-3 border-b px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex min-w-0 items-center gap-2">
                    {activeChat && activeChat.access !== 'public' && (
                      <span
                        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-600"
                        aria-label={getChatPrivacyTitle(activeChat.access)}
                        title={getChatPrivacyTitle(activeChat.access)}
                      >
                        <ChatPrivacyIcon access={activeChat.access} className="h-3.5 w-3.5" />
                      </span>
                    )}
                    <h1 className="min-w-0 flex-1 truncate font-semibold">{activeChat?.title ?? 'Чаты'}</h1>
                  </div>
                  {isAdminForeignChat ? (
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                        Чужой чат
                      </Badge>
                    </div>
                  ) : null}
                  <p className="truncate text-[11px] leading-4 text-muted-foreground">
                    {isAdminForeignChat
                      ? `Чужой чат • ${activeChatOwnerLabel}`
                      : activeChat?.mode === 'general'
                      ? `OpenRouter: ${activeChat?.model_external_id ?? 'openai/gpt-4o-mini'}`
                      : activeAgentName
                        ? `Агент: ${activeAgentName}`
                        : 'Чат с агентом'}
                  </p>
                </div>
                {activeChat && !isAdminForeignChat && (
                  <div className="relative md:hidden" ref={openMenu?.kind === 'active-chat-actions' ? menuRef : null}>
                    <button
                      type="button"
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900"
                      onClick={() => setOpenMenu((prev) => (prev?.kind === 'active-chat-actions' ? null : { kind: 'active-chat-actions' }))}
                      aria-label="Действия текущего чата"
                    >
                      ...
                    </button>
                    {openMenu?.kind === 'active-chat-actions' && (
                      <div className="absolute right-0 top-11 z-30 w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                        <button
                          type="button"
                          className={mobileChatActionButtonClass}
                          onClick={() => {
                            if (!activeChatMenuTarget) return;
                            void renameChat(activeChatMenuTarget);
                          }}
                        >
                          <span className="flex items-center gap-2">
                            {getChatActionIcon('rename')}
                            <span>Переименовать</span>
                          </span>
                          <span className="text-xs text-slate-400">↗</span>
                        </button>
                        <button
                          type="button"
                          className={`${mobileChatActionButtonClass} mt-2`}
                          onClick={() => {
                            if (!activeChatMenuTarget) return;
                            void pinChatToTop(activeChatMenuTarget);
                          }}
                          disabled={updateChatMutation.isPending}
                        >
                          <span className="flex items-center gap-2">
                            {getChatActionIcon('pin')}
                            <span>Закрепить сверху</span>
                          </span>
                          <span className="text-xs text-slate-400">↗</span>
                        </button>
                        {activeChatMenuTarget?.pinned_at && (
                          <button
                            type="button"
                            className={`${mobileChatActionButtonClass} mt-2`}
                            onClick={() => {
                              if (!activeChatMenuTarget) return;
                              void unpinChatFromTop(activeChatMenuTarget);
                            }}
                            disabled={updateChatMutation.isPending}
                          >
                            <span className="flex items-center gap-2">
                              {getChatActionIcon('unpin')}
                              <span>Открепить</span>
                            </span>
                            <span className="text-xs text-slate-400">↗</span>
                          </button>
                        )}
                        <button
                          type="button"
                          className={`${mobileChatActionButtonClass} mt-2`}
                          onClick={() => {
                            if (!activeChatMenuTarget) return;
                            openProperties(activeChatMenuTarget.id);
                          }}
                        >
                          <span className="flex items-center gap-2">
                            {getChatActionIcon('properties')}
                            <span>Свойства</span>
                          </span>
                          <span className="text-xs text-slate-400">↗</span>
                        </button>
                        <button
                          type="button"
                          className={`${mobileChatActionButtonClass} mt-2`}
                          onClick={() => {
                            setOpenMenu(null);
                            exportChatBundle(activeChat.id);
                          }}
                        >
                          <span className="flex items-center gap-2">
                            {getChatActionIcon('export')}
                            <span>Экспорт</span>
                          </span>
                          <span className="text-xs text-slate-400">↗</span>
                        </button>
                        <button
                          type="button"
                          className={`${mobileChatActionButtonClass} mt-2`}
                          onClick={() => {
                            setOpenMenu(null);
                            void shareChat(activeChat.id);
                          }}
                          disabled={shareChatMutation.isPending}
                        >
                          <span className="flex items-center gap-2">
                            {getChatActionIcon('share')}
                            <span>{shareChatMutation.isPending ? 'Поделиться...' : 'Поделиться'}</span>
                          </span>
                          <span className="text-xs text-slate-400">↗</span>
                        </button>
                        <button
                          type="button"
                          className={`${mobileChatActionButtonClass} mt-2`}
                          onClick={() => {
                            if (!activeChatMenuTarget) return;
                            void copyChatLink(activeChatMenuTarget.id);
                          }}
                        >
                          <span className="flex items-center gap-2">
                            {getChatActionIcon('copy_link')}
                            <span>Скопировать ссылку</span>
                          </span>
                          <span className="text-xs text-slate-400">↗</span>
                        </button>
                        <button
                          type="button"
                          className={`${mobileChatActionButtonClass} mt-2`}
                          onClick={() => {
                            if (!activeChatMenuTarget) return;
                            void toggleChatPrivacy(activeChatMenuTarget);
                          }}
                          disabled={updateChatMutation.isPending}
                        >
                          <span className="flex items-center gap-2">
                            {getChatActionIcon('privacy', activeChatMenuTarget?.access)}
                            <span>{activeChatMenuTarget ? getChatPrivacyQuickActionLabel(activeChatMenuTarget.access) : 'Изменить приватность'}</span>
                          </span>
                          <span className="text-xs text-slate-400">↗</span>
                        </button>
                        <button
                          type="button"
                          className={`${mobileChatActionButtonClass} mt-2`}
                          onClick={() => {
                            if (!activeChatMenuTarget) return;
                            requestTransferChat(activeChatMenuTarget);
                          }}
                          disabled={transferChatMutation.isPending}
                        >
                          <span className="flex items-center gap-2">
                            {getChatActionIcon('transfer')}
                            <span>Передать</span>
                          </span>
                          <span className="text-xs text-slate-400">↗</span>
                        </button>
                        <button
                          type="button"
                          className={`${mobileChatActionButtonClass} mt-2 border-red-200 bg-red-50 text-red-700 hover:border-red-300 hover:bg-red-100`}
                          onClick={() => {
                            if (!activeChatMenuTarget) return;
                            requestDeleteChat(activeChatMenuTarget);
                          }}
                        >
                          <span className="flex items-center gap-2">
                            {getChatActionIcon('delete')}
                            <span>Удалить</span>
                          </span>
                          <span className="text-xs text-red-300">↗</span>
                        </button>
                        <div className="mt-2 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
                          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            {getChatActionIcon('agents')}
                            <span>Список агентов</span>
                          </p>
                          <Select
                            options={modeOptions}
                            value={activeModeValue}
                            onChange={(e) => {
                              handleModeChange(e.target.value);
                              setOpenMenu(null);
                            }}
                            className="w-full bg-white"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            {activeChat && (
              <div className="hidden w-full flex-wrap items-center gap-2 md:flex xl:w-auto xl:justify-end">
                {!isAdminForeignChat ? (
                  <>
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
                      onClick={() => copyChatLink(activeChat.id)}
                    >
                      Скопировать ссылку
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => shareChat(activeChat.id)}
                      disabled={shareChatMutation.isPending}
                    >
                      Поделиться
                    </Button>
                    <Select
                      options={modeOptions}
                      value={activeModeValue}
                      onChange={(e) => handleModeChange(e.target.value)}
                      wrapperClassName="min-w-0 flex-1 basis-full md:basis-auto md:max-w-[420px] xl:max-w-none"
                      className="min-w-0 w-full xl:w-64"
                    />
                  </>
                ) : (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Чужой чат открыт только для чтения
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="route-transition-shell flex min-h-0 flex-1 flex-col">
            <div
              key={activeChat?.id ?? '__empty__'}
              className={cn(
                'route-transition__content animate-[fadeIn_160ms_ease-out] flex min-h-0 flex-1 flex-col',
              )}
            >
              <div ref={messagesScrollRef} className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pt-2 pb-4 md:py-4">
                <div ref={messagesContentRef} className="space-y-4">
            {isAdminForeignChat && (
              <div className="mx-auto max-w-3xl rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Открыт чат другого пользователя в режиме только для чтения. Владелец: {activeChatOwnerLabel}.
              </div>
            )}
            {activeChatLoading && displayedMessages.length === 0 && <div className="flex justify-center py-8"><Spinner /></div>}
            {!activeChatLoading && activeChat && displayedMessages.length === 0 && (
              <div className="py-3 md:py-8">
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
                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                          {activeStarterPrompts.map((prompt, idx) => (
                            <Button
                              key={`${prompt}-${idx}`}
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-auto w-full justify-start whitespace-normal rounded-xl border-slate-300 bg-white px-3 py-2.5 text-left text-[13px] leading-5 text-slate-800 shadow-sm hover:bg-slate-50 sm:w-auto sm:max-w-full"
                              disabled={isSubmittingMessage || !hasAvailableBalance || isAdminForeignChat}
                              onClick={() => sendMessage(prompt)}
                            >
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
                          disabled={updateChatMutation.isPending || isAdminForeignChat}
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
                  createdAt={msg.created_at}
                  animateOnMount={shouldAnimateMessage}
                  authorLabel={msg.role === 'user' ? userMessageAuthorLabel : getAssistantAuthorLabel(msg)}
                  attachments={resolvedAttachments}
                  toolTraces={msg.role === 'assistant' ? extractToolTraces(msg.usage) : undefined}
                  codingReport={msg.role === 'assistant' ? extractCodingReport(msg.usage, msg.content) : undefined}
                  projectRunCount={msg.project_run_count}
                  previewPageUrl={msg.role === 'assistant' && activeChat
                    ? (activeChat.share_token
                      ? `/api/shared/chats/${activeChat.share_token}/messages/${msg.id}/preview`
                      : `/api/chats/${activeChat.id}/messages/${msg.id}/preview`)
                    : undefined}
                  canEditPreview={msg.role === 'assistant' && Boolean(activeChat) && !isAdminForeignChat}
                  onSavePreview={msg.role === 'assistant' && activeChat
                    && !isAdminForeignChat
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
                  canRunProject={msg.role === 'assistant' && Boolean(activeChat) && !isAdminForeignChat}
                  onRunProject={msg.role === 'assistant' && activeChat
                    && !isAdminForeignChat
                    ? async () => {
                      const result = await chatsApi.runProject(activeChat.id, msg.id);
                      syncProjectRunCount(activeChat.id, msg.id, result.project_run_count);
                      return result;
                    }
                    : undefined}
                  canManageDeployment={msg.role === 'assistant' && Boolean(activeChat) && !isAdminForeignChat}
                  onLoadProjectDeployment={msg.role === 'assistant' && activeChat
                    && !isAdminForeignChat
                    ? async () => chatsApi.getProjectDeployment(activeChat.id, msg.id)
                    : undefined}
                  onUpsertProjectDeployment={msg.role === 'assistant' && activeChat
                    && !isAdminForeignChat
                    ? async (payload) => chatsApi.upsertProjectDeployment(activeChat.id, msg.id, payload)
                    : undefined}
                  onStartProjectDeployment={msg.role === 'assistant' && activeChat
                    && !isAdminForeignChat
                    ? async () => chatsApi.startProjectDeployment(activeChat.id, msg.id)
                    : undefined}
                  onReinstallProjectDeploymentWebhook={msg.role === 'assistant' && activeChat
                    && !isAdminForeignChat
                    ? async () => chatsApi.reinstallProjectDeploymentWebhook(activeChat.id, msg.id)
                    : undefined}
                  onStopProjectDeployment={msg.role === 'assistant' && activeChat
                    && !isAdminForeignChat
                    ? async () => chatsApi.stopProjectDeployment(activeChat.id, msg.id)
                    : undefined}
                  publishedLanding={msg.role === 'assistant' ? (publishedLandingByMessageId[msg.id] ?? null) : undefined}
                  publishingLanding={msg.role === 'assistant' ? landingActionMessageIds.includes(msg.id) : undefined}
                  onPublishLanding={msg.role === 'assistant' && activeChat
                    && !isAdminForeignChat
                    ? async (payload) => publishMessageLanding(activeChat.id, msg.id, payload)
                    : undefined}
                  onUpdateLanding={msg.role === 'assistant' && activeChat
                    && !isAdminForeignChat
                    ? async (payload) => updateMessageLanding(activeChat.id, msg.id, payload)
                    : undefined}
                  onUnpublishLanding={msg.role === 'assistant' && activeChat
                    && !isAdminForeignChat
                    ? async () => unpublishMessageLanding(activeChat.id, msg.id)
                    : undefined}
                  onFixProjectError={msg.role === 'assistant' && activeChat
                    && !isAdminForeignChat
                    ? async (prompt) => sendMessage(prompt)
                    : undefined}
                  canEditMessage={canEditUserMessage && !isAdminForeignChat}
                  onEditMessage={canEditUserMessage
                    && !isAdminForeignChat
                    ? async () => {
                      await editMessage(msg.id, msg.content);
                    }
                    : undefined}
                  canDeleteMessage={Boolean(activeChat) && !isAdminForeignChat && !msg.id.startsWith('optimistic-') && !msg.id.startsWith('debug-fake-')}
                  onDeleteMessage={activeChat
                    && !isAdminForeignChat
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
                    {null}
                    <ChatMessage
                      role={assistantSlotResolvedMessage.role}
                      content={assistantSlotResolvedMessage.content}
                      createdAt={assistantSlotResolvedMessage.created_at}
                      animateOnMount={false}
                      authorLabel={getAssistantAuthorLabel(assistantSlotResolvedMessage)}
                      attachments={assistantSlotResolvedMessage.attachments ?? extractAttachments(assistantSlotResolvedMessage.usage)}
                      toolTraces={extractToolTraces(assistantSlotResolvedMessage.usage)}
                      codingReport={extractCodingReport(assistantSlotResolvedMessage.usage, assistantSlotResolvedMessage.content)}
                      projectRunCount={assistantSlotResolvedMessage.project_run_count}
                      previewPageUrl={activeChat
                        ? (activeChat.share_token
                          ? `/api/shared/chats/${activeChat.share_token}/messages/${assistantSlotResolvedMessage.id}/preview`
                          : `/api/chats/${activeChat.id}/messages/${assistantSlotResolvedMessage.id}/preview`)
                        : undefined}
                      canEditPreview={Boolean(activeChat) && !isAdminForeignChat}
                      onSavePreview={activeChat
                        && !isAdminForeignChat
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
                      canRunProject={Boolean(activeChat) && !isAdminForeignChat}
                      onRunProject={activeChat
                        && !isAdminForeignChat
                        ? async () => {
                          const result = await chatsApi.runProject(activeChat.id, assistantSlotResolvedMessage.id);
                          syncProjectRunCount(activeChat.id, assistantSlotResolvedMessage.id, result.project_run_count);
                          return result;
                        }
                        : undefined}
                      canManageDeployment={Boolean(activeChat) && !isAdminForeignChat}
                      onLoadProjectDeployment={activeChat
                        && !isAdminForeignChat
                        ? async () => chatsApi.getProjectDeployment(activeChat.id, assistantSlotResolvedMessage.id)
                        : undefined}
                      onUpsertProjectDeployment={activeChat
                        && !isAdminForeignChat
                        ? async (payload) => chatsApi.upsertProjectDeployment(activeChat.id, assistantSlotResolvedMessage.id, payload)
                        : undefined}
                      onStartProjectDeployment={activeChat
                        && !isAdminForeignChat
                        ? async () => chatsApi.startProjectDeployment(activeChat.id, assistantSlotResolvedMessage.id)
                        : undefined}
                      onReinstallProjectDeploymentWebhook={activeChat
                        && !isAdminForeignChat
                        ? async () => chatsApi.reinstallProjectDeploymentWebhook(activeChat.id, assistantSlotResolvedMessage.id)
                        : undefined}
                      onStopProjectDeployment={activeChat
                        && !isAdminForeignChat
                        ? async () => chatsApi.stopProjectDeployment(activeChat.id, assistantSlotResolvedMessage.id)
                        : undefined}
                      publishedLanding={publishedLandingByMessageId[assistantSlotResolvedMessage.id] ?? null}
                      publishingLanding={landingActionMessageIds.includes(assistantSlotResolvedMessage.id)}
                      onPublishLanding={activeChat
                        && !isAdminForeignChat
                        ? async (payload) => publishMessageLanding(activeChat.id, assistantSlotResolvedMessage.id, payload)
                        : undefined}
                      onUpdateLanding={activeChat
                        && !isAdminForeignChat
                        ? async (payload) => updateMessageLanding(activeChat.id, assistantSlotResolvedMessage.id, payload)
                        : undefined}
                      onUnpublishLanding={activeChat
                        && !isAdminForeignChat
                        ? async () => unpublishMessageLanding(activeChat.id, assistantSlotResolvedMessage.id)
                        : undefined}
                      onFixProjectError={activeChat
                        && !isAdminForeignChat
                        ? async (prompt) => sendMessage(prompt)
                        : undefined}
                      canDeleteMessage={Boolean(activeChat) && !isAdminForeignChat}
                      onDeleteMessage={activeChat
                        && !isAdminForeignChat
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
                    {!activeChat?.pending_run || !isPendingRunLive(activeChat.pending_run) ? (
                    <div className="mt-1 ml-1">
                      <RunMetadata
                        usage={extractUsage(assistantSlotResolvedMessage.usage)}
                        latencyMs={assistantSlotResolvedMessage.latency_ms ?? undefined}
                        agentName={activeChat?.mode === 'agent' ? (activeAgentName ?? undefined) : undefined}
                      />
                    </div>
                    ) : null}
                  </>
                ) : activeChat?.pending_run && isPendingRunLive(activeChat.pending_run) ? (
                  <div className="rounded-xl border border-border/70 bg-background/50 p-4 text-sm text-muted-foreground">
                    Ожидаю первый фрагмент ответа...
                  </div>
                ) : (
                  <ChatThinkingBubble
                    label={assistantResponseSlotForActiveChat.label}
                    detail={assistantResponseSlotForActiveChat.detail}
                    startedAt={assistantResponseSlotForActiveChat.startedAt}
                  />
                )}
              </div>
            )}
            {assistantResponseSlotForActiveChat && activeChat?.pending_run && isPendingRunLive(activeChat.pending_run) && (
              <div ref={pendingProgressAnchorRef} className="mt-3 space-y-3">
                <ChatLiveProgressPanel
                  events={streamEvents}
                  connected={streamConnected}
                  trailing={isSubmittingMessage ? <ChatLiveProgressTrailingBusy /> : null}
                />
                <ChatThinkingBubble
                  label={assistantResponseSlotForActiveChat.label}
                  detail={assistantResponseSlotForActiveChat.detail}
                  startedAt={assistantResponseSlotForActiveChat.startedAt}
                />
              </div>
            )}
            </div>
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
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>{localError}</div>
                {localNoticeAction ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className={cn(
                      'h-8 shrink-0',
                      localNoticeTone === 'warning'
                        ? 'border-amber-300 bg-white/70 text-amber-900 hover:bg-white'
                        : 'border-destructive/20 bg-background text-destructive hover:bg-background',
                    )}
                    onClick={localNoticeAction.onClick}
                  >
                    {localNoticeAction.label}
                  </Button>
                ) : null}
              </div>
            </div>
          )}

          <div className="border-t px-4 py-3 space-y-3">
            {canShowQuickPrompts && displayedMessages.length > 0 && isQuickPromptsOpen && (
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {activeStarterPrompts.map((prompt, idx) => (
                  <Button
                    key={`quick-${prompt}-${idx}`}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-auto w-full justify-start whitespace-normal rounded-xl border-slate-300 bg-white px-3 py-2.5 text-left text-[13px] leading-5 text-slate-800 shadow-sm hover:bg-slate-50 sm:w-auto sm:max-w-full"
                    disabled={isSubmittingMessage || !hasAvailableBalance || isAdminForeignChat}
                    onClick={() => sendMessage(prompt)}
                  >
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
              quickAction={canShowQuickPrompts && displayedMessages.length > 0 ? {
                label: isQuickPromptsOpen ? 'Скрыть подсказки' : 'Показать подсказки',
                onClick: () => setIsQuickPromptsOpen((prev) => !prev),
                active: isQuickPromptsOpen,
                disabled: !activeChat || isAdminForeignChat || isSubmittingMessage || !hasAvailableBalance,
              } : null}
              disabled={!activeChat || isAdminForeignChat || isSubmittingMessage || !hasAvailableBalance}
              placeholder={
                !activeChat
                  ? 'Сначала выберите чат'
                  : isAdminForeignChat
                    ? 'Чат другого пользователя открыт только для чтения'
                    : hasAvailableBalance
                      ? 'Введите сообщение...'
                    : 'Баланс закончился'
              }
            />
          </div>
            </div>
          </div>
        </section>
      </div>

      {isTopUpOpen && (
        <div
          className={cn(
            'fixed inset-0 z-[85] flex items-center justify-center bg-black/40 p-4',
            isTopUpClosing ? 'animate-[fadeOut_200ms_ease-in_forwards]' : 'animate-[fadeIn_180ms_ease-out]',
          )}
          onClick={closeTopUpDialog}
        >
          <div
            className={cn(
              'w-full max-w-md rounded-xl border bg-white shadow-2xl',
              isTopUpClosing ? 'animate-[zoomOut_200ms_ease-in_forwards]' : 'animate-[zoomIn_220ms_ease-out]',
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b px-5 py-4"><h3 className="text-lg font-semibold">Недостаточно баланса</h3></div>
            <div className="px-5 py-4">
              <TopUpHelp settings={appSettings} />
            </div>
            <div className="border-t px-5 py-4 flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={closeTopUpDialog}>Закрыть</Button>
              <Link to="/profile" onClick={closeTopUpDialog}><Button size="sm">Открыть профиль</Button></Link>
            </div>
          </div>
        </div>
      )}

      {isCreateDialogOpen && (
        <div
          className={cn(
            'fixed inset-0 z-[86] flex items-start justify-center overflow-y-auto bg-black/50 px-4 pb-6 pt-10 sm:items-center sm:p-4',
            isCreateDialogClosing ? 'animate-[fadeOut_200ms_ease-in_forwards]' : 'animate-[fadeIn_180ms_ease-out]',
          )}
          onClick={closeCreateDialog}
        >
          <div
            className={cn(
              'flex w-full max-w-xl max-h-[calc(100dvh-2.5rem)] flex-col rounded-2xl border bg-white shadow-2xl sm:max-h-[calc(100dvh-4rem)]',
              isCreateDialogClosing ? 'animate-[zoomOut_200ms_ease-in_forwards]' : 'animate-[zoomIn_220ms_ease-out]',
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b px-6 py-5">
              <h3 className="text-xl font-semibold">Новый чат</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Выберите режим, чтобы начать диалог.
              </p>
            </div>

            <div className="space-y-5 overflow-y-auto px-6 py-5">
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
              <Button variant="outline" size="sm" onClick={closeCreateDialog}>
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
      {deleteDialogChat && (
        <div
          className={cn(
            'fixed inset-0 z-[87] flex items-center justify-center bg-black/50 p-4',
            deleteDialogClosing ? 'animate-[fadeOut_200ms_ease-in_forwards]' : 'animate-[fadeIn_180ms_ease-out]',
          )}
          onClick={closeDeleteDialog}
        >
          <div
            className={cn(
              'w-full max-w-md rounded-2xl border bg-white shadow-2xl',
              deleteDialogClosing ? 'animate-[zoomOut_200ms_ease-in_forwards]' : 'animate-[zoomIn_220ms_ease-out]',
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b px-6 py-5">
              <h3 className="text-xl font-semibold">Удалить чат?</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Чат <span className="font-medium text-foreground">«{deleteDialogChat.title}»</span> будет удалён без возможности восстановления.
              </p>
            </div>

            <div className="px-6 py-5 space-y-3">
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                Будут удалены сообщения, превью и история этого чата.
              </div>
            </div>

            <div className="border-t px-6 py-4 flex items-center justify-end gap-2 bg-muted/10 rounded-b-2xl">
              <Button
                variant="outline"
                size="sm"
                onClick={closeDeleteDialog}
                disabled={deleteChatMutation.isPending}
              >
                Отмена
              </Button>
              <Button
                size="sm"
                className="bg-red-600 text-white hover:bg-red-700"
                onClick={() => void deleteChat(deleteDialogChat.id)}
                disabled={deleteChatMutation.isPending}
              >
                {deleteChatMutation.isPending ? 'Удаляю...' : 'Удалить чат'}
              </Button>
            </div>
          </div>
        </div>
      )}
      {transferDialogChat && (
        <div
          className={cn(
            'fixed inset-0 z-[88] flex items-center justify-center bg-black/50 p-4',
            transferDialogClosing ? 'animate-[fadeOut_200ms_ease-in_forwards]' : 'animate-[fadeIn_180ms_ease-out]',
          )}
          onClick={closeTransferDialog}
        >
          <div
            className={cn(
              'w-full max-w-md rounded-2xl border bg-white shadow-2xl',
              transferDialogClosing ? 'animate-[zoomOut_200ms_ease-in_forwards]' : 'animate-[zoomIn_220ms_ease-out]',
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b px-6 py-5">
              <h3 className="text-xl font-semibold">Передать чат?</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Чат <span className="font-medium text-foreground">«{transferDialogChat.title}»</span> будет передан на другой аккаунт и исчезнет из вашего списка.
              </p>
            </div>

            <div className="space-y-4 px-6 py-5">
              <div className="space-y-2">
                <label htmlFor="transfer-chat-identifier" className="text-sm font-medium">
                  Логин или email получателя
                </label>
                <Input
                  id="transfer-chat-identifier"
                  value={transferIdentifier}
                  onChange={(e) => setTransferIdentifier(e.target.value)}
                  placeholder="@login или user@example.com"
                  autoFocus
                  disabled={transferChatMutation.isPending}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void transferChat();
                    }
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Можно указать `@username`, `username` или email аккаунта, которому нужно передать проект.
                </p>
              </div>

              {transferDialogError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {transferDialogError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 rounded-b-2xl border-t bg-muted/10 px-6 py-4">
              <Button
                variant="outline"
                size="sm"
                onClick={closeTransferDialog}
                disabled={transferChatMutation.isPending}
              >
                Отмена
              </Button>
              <Button
                size="sm"
                onClick={() => void transferChat()}
                disabled={transferChatMutation.isPending}
              >
                {transferChatMutation.isPending ? 'Передаю...' : 'Передать чат'}
              </Button>
            </div>
          </div>
        </div>
      )}
      {isPropertiesOpen && activeChat && (
        <div
          className={cn(
            'fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4',
            isPropertiesClosing ? 'animate-[fadeOut_200ms_ease-in_forwards]' : 'animate-[fadeIn_180ms_ease-out]',
          )}
          onClick={closePropertiesDialog}
        >
          <div
            className={cn(
              'w-full max-w-3xl rounded-xl border bg-white shadow-2xl',
              isPropertiesClosing ? 'animate-[zoomOut_200ms_ease-in_forwards]' : 'animate-[zoomIn_220ms_ease-out]',
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b px-5 py-4 flex items-start justify-between gap-4">
              <div><h2 className="text-lg font-semibold">Свойства чата</h2><p className="text-sm text-muted-foreground">{activeChat.title}</p></div>
              <Button variant="ghost" size="sm" onClick={closePropertiesDialog}>Закрыть</Button>
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
                  <p className="text-sm font-medium">{(activeChat.effective_tools ?? activeChat.tools).length}</p>
                </div>
              </div>

              <div className="rounded-2xl border bg-muted/10 p-4 space-y-4">
                <div className="rounded-xl border bg-background/80 p-4 space-y-2">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Пометка для себя</p>
                    <p className="text-xs text-muted-foreground">
                      Короткая заметка, чтобы в списке чатов было понятно, что это за диалог.
                    </p>
                  </div>
                  <textarea
                    value={propertiesNote}
                    onChange={(e) => setPropertiesNote(e.target.value.slice(0, 300))}
                    className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-input"
                    placeholder="Например: Лендинг про Марс, хороший результат от Claude, нужен потом экспорт"
                  />
                  <p className="text-xs text-muted-foreground">
                    {propertiesNote.trim().length}/300
                  </p>
                </div>

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
                      Подключите дополнительные инструменты для этого чата. В обычном режиме они работают напрямую,
                      а в режиме агента добавляются поверх инструментов самого агента.
                    </p>
                  </div>

                  <div className="space-y-4">
                    {propertiesModeView !== 'general' && (
                      <div className="rounded-lg border bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
                        Сейчас выбран режим агента. Эти инструменты будут доступны как дополнительные:
                        агент сможет использовать и свои встроенные tools, и выбранные здесь chat-tools.
                      </div>
                    )}

                    <div className="space-y-2">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Подключено сейчас</p>
                      {propertiesEffectiveTools.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {propertiesEffectiveTools.map((tool) => {
                            const isAgentTool = propertiesAgentToolIds.has(tool.id);
                            const isChatTool = propertiesToolIds.includes(tool.id);
                            return (
                            <Badge key={tool.id} variant="outline" className="gap-1 rounded-full px-3 py-1">
                              <span>{tool.name}</span>
                              {isAgentTool && (
                                <span className="text-[10px] uppercase tracking-wide text-sky-700">встроен в агента</span>
                              )}
                              {!isAgentTool && isChatTool && (
                                <button
                                  type="button"
                                  className="text-muted-foreground transition hover:text-foreground"
                                  onClick={() => togglePropertiesTool(tool.id)}
                                >
                                  ×
                                </button>
                              )}
                            </Badge>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Пока ничего не подключено. Будут доступны только встроенные возможности выбранной модели или агента.
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
                        <p className="text-xs text-muted-foreground">{propertiesEffectiveTools.length} активно</p>
                      </div>
                      {propertiesAvailableTools.length > 0 ? (
                        <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border bg-background p-2">
                          {propertiesAvailableTools.map((tool) => {
                            const isSelected = propertiesToolIds.includes(tool.id);
                            const isAgentTool = propertiesAgentToolIds.has(tool.id);
                            const isEffective = propertiesEffectiveToolIds.has(tool.id);
                            return (
                              <button
                                key={tool.id}
                                type="button"
                                onClick={() => {
                                  if (isAgentTool) return;
                                  togglePropertiesTool(tool.id);
                                }}
                                disabled={isAgentTool}
                                className={cn(
                                  'w-full rounded-lg border px-3 py-3 text-left transition-colors',
                                  isAgentTool
                                    ? 'cursor-default border-sky-200 bg-sky-50/70'
                                    : isSelected
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
                                  <Badge variant={isAgentTool ? 'outline' : isEffective ? 'success' : 'secondary'}>
                                    {isAgentTool ? 'Встроен' : isEffective ? 'Подключен' : 'Выключен'}
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
                      Например, если включить <span className="font-mono">web-search-cascade</span>, агент сможет
                      сначала собрать информацию из интернета, а потом использовать её в ответе или в генерации лендинга.
                    </p>
                  </div>
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
              <Button variant="outline" size="sm" onClick={closePropertiesDialog}>Отмена</Button>
              <Button size="sm" onClick={saveProperties} disabled={propertiesSaving}>{propertiesSaving ? 'Сохраняю...' : 'Сохранить'}</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ChatsPage() {
  const { isAuthenticated } = useAuth();

  return isAuthenticated ? <AuthenticatedChatsPage /> : <GuestChatsPage />;
}
