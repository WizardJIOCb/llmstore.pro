import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { ProfileLeaderboardEntry, ProfileLeaderboardSort } from '@llmstore/shared';
import { useChangePassword, useCreateAliceLinkCode, useProfile, useProfileLeaderboard, useUnlinkAccount, useUpdateProfile } from '../../hooks/useProfile';
import { useRunList } from '../../hooks/useAgents';
import { useCreateChat } from '../../hooks/useChats';
import { useTopUpStatus } from '../../hooks/usePayments';
import { authApi } from '../../lib/api/auth';
import { chatsApi, type ChatListItem } from '../../lib/api/chats';
import { getOAuthLinkUrl } from '../../lib/api/profile';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Spinner } from '../../components/ui/Spinner';
import { UserLink } from '../../components/users/UserLink';
import { formatRub, formatUsd, formatUsdRubPair } from '../../lib/utils';

const ROLE_LABELS: Record<string, string> = {
  user: 'Пользователь',
  power_user: 'Продвинутый',
  curator: 'Куратор',
  admin: 'Администратор',
};

const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google',
  yandex: 'Яндекс',
  mailru: 'Mail.ru',
  vk: 'VK',
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  chat_usage: 'Списание за чат',
  agent_run_usage: 'Списание за запуск агента',
  signup_bonus: 'Стартовый бонус',
  topup: 'Пополнение баланса',
  admin_adjustment: 'Корректировка администратором',
  admin_credit: 'Пополнение администратором',
  admin_debit: 'Списание администратором',
};

const LINKABLE_PROVIDERS = ['google', 'yandex', 'vk'];
type HistoryTab = 'all' | 'topup' | 'writeoff';
const LEADERBOARD_PAGE_SIZE = 20;
const LEADERBOARD_SORT_OPTIONS: Array<{ value: ProfileLeaderboardSort; label: string; shortLabel: string }> = [
  { value: 'tokens', label: 'По токенам во всех чатах', shortLabel: 'Токены' },
  { value: 'cost', label: 'По цене во всех чатах', shortLabel: 'Цена' },
  { value: 'chats', label: 'По количеству чатов', shortLabel: 'Чаты' },
  { value: 'messages', label: 'По сообщениям', shortLabel: 'Сообщения' },
];
const RUN_STATUS_LABELS: Record<string, string> = {
  pending: 'Ожидание',
  preparing: 'Подготовка',
  running: 'Выполняется',
  waiting_for_tool: 'Ожидание инструмента',
  tool_executing: 'Инструмент работает',
  continuing: 'Продолжение',
  completed: 'Завершён',
  failed: 'Ошибка',
  cancelled: 'Отменён',
};
const RUN_STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  completed: 'default',
  failed: 'destructive',
  running: 'secondary',
  cancelled: 'outline',
};

function formatTokens(value: number): string {
  if (value > 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value > 1000) return `${(value / 1000).toFixed(1)}K`;
  return String(value);
}

function formatRankLabel(rank: number | null | undefined): string | null {
  if (!rank || rank < 1) return null;
  return `Топ ${rank}`;
}

function formatLeaderboardPosition(position: number | null | undefined): string | null {
  if (!position || position < 1) return null;
  return `#${position.toLocaleString('ru-RU')}`;
}

function renderBalanceHistoryTitle(item: { title: string; chat_id?: string | null }) {
  if (!item.chat_id) {
    return <p className="truncate font-medium">{item.title}</p>;
  }

  return (
    <Link
      to={`/chats?chat=${encodeURIComponent(item.chat_id)}`}
      className="block truncate font-medium text-primary hover:underline"
      title="Открыть связанный чат"
    >
      {item.title}
    </Link>
  );
}

function buildPageNumbers(currentPage: number, totalPages: number): number[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, idx) => idx + 1);
  }

  const pages = new Set<number>([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  return Array.from(pages)
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b);
}

function getLeaderboardMedal(position: number | null | undefined) {
  if (position === 1) {
    return {
      label: 'Золото',
      badgeClass: 'border border-amber-300 bg-amber-100 text-amber-900',
      cardClass: 'border-amber-200 bg-[linear-gradient(135deg,rgba(251,191,36,0.20),rgba(255,255,255,1))]',
      rowClass: 'bg-amber-50/60',
      numberClass: 'bg-amber-500 text-white',
    };
  }

  if (position === 2) {
    return {
      label: 'Серебро',
      badgeClass: 'border border-slate-300 bg-slate-100 text-slate-800',
      cardClass: 'border-slate-200 bg-[linear-gradient(135deg,rgba(203,213,225,0.35),rgba(255,255,255,1))]',
      rowClass: 'bg-slate-50/80',
      numberClass: 'bg-slate-500 text-white',
    };
  }

  if (position === 3) {
    return {
      label: 'Бронза',
      badgeClass: 'border border-orange-300 bg-orange-100 text-orange-900',
      cardClass: 'border-orange-200 bg-[linear-gradient(135deg,rgba(251,146,60,0.22),rgba(255,255,255,1))]',
      rowClass: 'bg-orange-50/70',
      numberClass: 'bg-orange-500 text-white',
    };
  }

  return null;
}

function leaderboardValue(entry: ProfileLeaderboardEntry, sort: ProfileLeaderboardSort, usdToRubRate: number): string {
  if (sort === 'tokens') return formatTokens(entry.total_tokens);
  if (sort === 'cost') return formatUsdRubPair(entry.total_cost_usd, usdToRubRate);
  if (sort === 'chats') return entry.chats_count.toLocaleString('ru-RU');
  return entry.messages_count.toLocaleString('ru-RU');
}

function eventTypeLabel(type: string): string {
  return EVENT_TYPE_LABELS[type] ?? `Событие: ${type}`;
}

function getApiErrorMessage(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;

  const maybeMessage = (
    error as {
      response?: {
        data?: {
          error?: {
            message?: string;
          };
        };
      };
    }
  ).response?.data?.error?.message;

  return typeof maybeMessage === 'string' && maybeMessage.trim()
    ? maybeMessage
    : undefined;
}

export function ProfilePage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: profile, isLoading, error } = useProfile();
  const updateMutation = useUpdateProfile();
  const changePasswordMutation = useChangePassword();
  const createAliceLinkCodeMutation = useCreateAliceLinkCode();
  const unlinkMutation = useUnlinkAccount();
  const createChat = useCreateChat();
  const [searchParams, setSearchParams] = useSearchParams();
  const returnedTopUpId = searchParams.get('topup_id');
  const topUpStatusQuery = useTopUpStatus(returnedTopUpId);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordFormError, setPasswordFormError] = useState<string | null>(null);
  const [passwordSuccessMessage, setPasswordSuccessMessage] = useState<string | null>(null);
  const [historyTab, setHistoryTab] = useState<HistoryTab>('all');
  const [historyPageSize, setHistoryPageSize] = useState<5 | 10 | 20>(5);
  const [historyPage, setHistoryPage] = useState(1);
  const [oauthMessage, setOauthMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [emailVerificationMessage, setEmailVerificationMessage] = useState<string | null>(null);
  const [emailVerificationSending, setEmailVerificationSending] = useState(false);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
  const [leaderboardSort, setLeaderboardSort] = useState<ProfileLeaderboardSort>('tokens');
  const [leaderboardPage, setLeaderboardPage] = useState(1);
  const [usageChatError, setUsageChatError] = useState<string | null>(null);
  const [pendingUsageAgentId, setPendingUsageAgentId] = useState<string | null>(null);
  const tokenLeaderboardQuery = useProfileLeaderboard('tokens', true, 1, 1);
  const leaderboardQuery = useProfileLeaderboard(leaderboardSort, isLeaderboardOpen, leaderboardPage, LEADERBOARD_PAGE_SIZE);
  const runsQuery = useRunList();

  useEffect(() => {
    const oauth = searchParams.get('oauth');
    const provider = searchParams.get('provider');
    const message = searchParams.get('message');

    if (oauth === 'success') {
      setOauthMessage({
        type: 'success',
        text: provider
          ? `${PROVIDER_LABELS[provider] || provider} успешно привязан`
          : 'Аккаунт успешно привязан',
      });
      setSearchParams({}, { replace: true });
    } else if (oauth === 'error') {
      setOauthMessage({
        type: 'error',
        text: message || 'Ошибка при привязке аккаунта',
      });
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!oauthMessage) return;
    const timer = setTimeout(() => setOauthMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [oauthMessage]);

  useEffect(() => {
    if (topUpStatusQuery.data?.status === 'succeeded') {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    }
  }, [queryClient, topUpStatusQuery.data?.status]);

  useEffect(() => {
    if (!isLeaderboardOpen) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsLeaderboardOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLeaderboardOpen]);

  useEffect(() => {
    setLeaderboardPage(1);
  }, [leaderboardSort]);

  const handleStartEdit = () => {
    if (!profile) return;
    setEditName(profile.name || '');
    setEditing(true);
  };

  const handleSave = () => {
    updateMutation.mutate(
      { name: editName },
      { onSuccess: () => setEditing(false) },
    );
  };

  const clearPasswordFeedback = () => {
    setPasswordFormError(null);
    setPasswordSuccessMessage(null);
    changePasswordMutation.reset();
  };

  const handlePasswordSubmit = () => {
    if (!profile) return;

    clearPasswordFeedback();
    const hasPassword = profile.has_password;

    if (hasPassword && currentPassword.length === 0) {
      setPasswordFormError('Укажите текущий пароль');
      return;
    }

    if (newPassword.length < 8) {
      setPasswordFormError('Новый пароль должен быть не короче 8 символов');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordFormError('Подтверждение пароля не совпадает');
      return;
    }

    changePasswordMutation.mutate(
      {
        current_password: hasPassword ? currentPassword : undefined,
        new_password: newPassword,
      },
      {
        onSuccess: () => {
          setCurrentPassword('');
          setNewPassword('');
          setConfirmPassword('');
          setPasswordSuccessMessage(
            hasPassword
              ? 'Пароль обновлён'
              : 'Пароль установлен. Теперь можно входить по email или логину и паролю.',
          );
        },
      },
    );
  };

  const handleUnlink = (provider: string) => {
    if (!confirm(`Отвязать ${PROVIDER_LABELS[provider] || provider}?`)) return;
    unlinkMutation.mutate(provider);
  };

  const handleResendEmailVerification = async () => {
    setEmailVerificationSending(true);
    setEmailVerificationMessage(null);
    try {
      const result = await authApi.resendEmailVerification();
      setEmailVerificationMessage(
        result.alreadyVerified
          ? 'Email уже подтверждён.'
          : 'Письмо отправлено повторно. Проверьте входящие.',
      );
    } catch (err: any) {
      setEmailVerificationMessage(err.response?.data?.error?.message || 'Не удалось отправить письмо.');
    } finally {
      setEmailVerificationSending(false);
    }
  };

  const handleUsageAgentClick = async (agentId: string) => {
    if (pendingUsageAgentId) return;

    setUsageChatError(null);
    setPendingUsageAgentId(agentId);

    try {
      const cachedChats = queryClient.getQueryData<ChatListItem[]>(['chats']);
      const chatList = cachedChats ?? (
        await queryClient.fetchQuery<ChatListItem[]>({
          queryKey: ['chats'],
          queryFn: chatsApi.list,
        })
      );

      const existingChat = chatList.find((chat) => chat.mode === 'agent' && chat.agent_id === agentId);
      if (existingChat) {
        navigate(`/chats?chat=${existingChat.id}`);
        return;
      }

      const createdChat = await createChat.mutateAsync({
        mode: 'agent',
        title: 'Новый чат',
        agent_id: agentId,
      });

      navigate(`/chats?chat=${createdChat.id}`);
    } catch (actionError) {
      setUsageChatError(
        getApiErrorMessage(actionError)
          ?? 'Не удалось открыть чат с этим агентом.',
      );
    } finally {
      setPendingUsageAgentId(null);
    }
  };

  const historyItems = useMemo(() => {
    if (!profile) return [];
    if (historyTab === 'all') return profile.balance_history;
    return profile.balance_history.filter((item) => item.category === historyTab);
  }, [profile, historyTab]);

  const totalHistoryPages = useMemo(
    () => Math.max(1, Math.ceil(historyItems.length / historyPageSize)),
    [historyItems.length, historyPageSize],
  );

  useEffect(() => {
    setHistoryPage(1);
  }, [historyTab, historyPageSize]);

  useEffect(() => {
    if (historyPage > totalHistoryPages) setHistoryPage(totalHistoryPages);
  }, [historyPage, totalHistoryPages]);

  const paginatedHistoryItems = useMemo(() => {
    const start = (historyPage - 1) * historyPageSize;
    return historyItems.slice(start, start + historyPageSize);
  }, [historyItems, historyPage, historyPageSize]);

  const historyPageNumbers = useMemo(() => {
    return buildPageNumbers(historyPage, totalHistoryPages);
  }, [historyPage, totalHistoryPages]);

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-16 flex justify-center">
        <Spinner />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-16 text-center">
        <p className="text-destructive">Ошибка загрузки профиля</p>
      </div>
    );
  }

  const linkedProviders = new Set(profile.linked_accounts.map((a) => a.provider));
  const usdToRubRate = profile.usd_to_rub_rate;
  const returnedTopUp = topUpStatusQuery.data;
  const returnedTopUpStatus = returnedTopUp?.status;
  const returnedTopUpIsProcessing = returnedTopUpStatus === 'pending' || returnedTopUpStatus === 'waiting_for_capture';
  const returnedTopUpIsSucceeded = returnedTopUpStatus === 'succeeded';
  const returnedTopUpIsCanceled = returnedTopUpStatus === 'canceled';
  const tokenLeaderboardRank = tokenLeaderboardQuery.data?.current_user?.rank ?? null;
  const tokenLeaderboardLabel = formatRankLabel(tokenLeaderboardRank);
  const activeLeaderboard = isLeaderboardOpen ? leaderboardQuery.data : null;
  const activeLeaderboardCurrentUser = isLeaderboardOpen
    ? leaderboardQuery.data?.current_user ?? null
    : tokenLeaderboardQuery.data?.current_user ?? null;
  const currentLeaderboardPage = activeLeaderboard?.page ?? 1;
  const leaderboardTotalPages = activeLeaderboard?.total_pages ?? 1;
  const leaderboardPageNumbers = buildPageNumbers(currentLeaderboardPage, leaderboardTotalPages);
  const activeLeaderboardCurrentUserPage = activeLeaderboardCurrentUser
    ? Math.max(1, Math.ceil(activeLeaderboardCurrentUser.position / (activeLeaderboard?.per_page ?? LEADERBOARD_PAGE_SIZE)))
    : null;
  const showPinnedCurrentUser = Boolean(
    activeLeaderboardCurrentUser
      && !activeLeaderboard?.entries.some((entry) => entry.user_id === activeLeaderboardCurrentUser.user_id),
  );
  const lastVisibleLeaderboardEntry = activeLeaderboard?.entries.at(-1);
  const featuredLeaderboardEntries = currentLeaderboardPage === 1
    ? activeLeaderboard?.entries.filter((entry) => entry.position <= 3).slice(0, 3) ?? []
    : [];
  const leaderboardEntriesStart = activeLeaderboard?.entries[0]?.position
    ?? ((currentLeaderboardPage - 1) * (activeLeaderboard?.per_page ?? LEADERBOARD_PAGE_SIZE) + 1);
  const leaderboardEntriesEnd = lastVisibleLeaderboardEntry?.position
    ?? Math.min(currentLeaderboardPage * (activeLeaderboard?.per_page ?? LEADERBOARD_PAGE_SIZE), activeLeaderboard?.total_users ?? 0);
  const recentRuns = (runsQuery.data ?? []).slice(0, 8);

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 space-y-6">
      <h1 className="text-2xl font-bold">Профиль</h1>

      {oauthMessage && (
        <div
          className={`p-3 rounded-lg text-sm ${
            oauthMessage.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {oauthMessage.text}
        </div>
      )}

      {!profile.email_verified_at && profile.has_pending_email_verification && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">Email пока не подтверждён.</p>
              <p className="mt-1 text-amber-800/80">
                Если для стартового бонуса включено подтверждение email, бонус начислится после перехода по ссылке из письма.
              </p>
              {emailVerificationMessage ? (
                <p className="mt-2 text-amber-800">{emailVerificationMessage}</p>
              ) : null}
            </div>
            <Button variant="outline" size="sm" onClick={handleResendEmailVerification} disabled={emailVerificationSending}>
              {emailVerificationSending ? 'Отправляю...' : 'Отправить письмо ещё раз'}
            </Button>
          </div>
        </div>
      )}

      {returnedTopUpId && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            returnedTopUpIsSucceeded
              ? 'border-green-200 bg-green-50 text-green-800'
              : returnedTopUpIsCanceled
                ? 'border-red-200 bg-red-50 text-red-800'
                : 'border-blue-200 bg-blue-50 text-blue-800'
          }`}
        >
          {topUpStatusQuery.isLoading && 'Проверяем статус платежа...'}
          {topUpStatusQuery.isError && 'Не удалось проверить статус пополнения. Обновите страницу чуть позже.'}
          {!topUpStatusQuery.isLoading && !topUpStatusQuery.isError && returnedTopUp && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">
                  {returnedTopUpIsSucceeded && 'Платёж подтверждён, баланс уже пополнен.'}
                  {returnedTopUpIsCanceled && 'Платёж отменён или не был завершён.'}
                  {returnedTopUpIsProcessing && 'Платёж создан и ещё обрабатывается YooKassa.'}
                </p>
                <p className="text-xs opacity-80">
                  {formatRub(returnedTopUp.amount_rub, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} → {formatUsd(returnedTopUp.amount_usd, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                </p>
              </div>
              {returnedTopUpIsProcessing && returnedTopUp.confirmation_url && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { window.location.href = returnedTopUp.confirmation_url!; }}
                >
                  Продолжить оплату
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Алиса</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant={profile.alice?.status.is_linked ? 'success' : 'outline'}>
              {profile.alice?.status.is_linked ? 'Аккаунт Алисы привязан' : 'Аккаунт Алисы пока не привязан'}
            </Badge>
            {profile.alice?.status.last_seen_at ? (
              <Badge variant="outline">
                Активность: {new Date(profile.alice.status.last_seen_at).toLocaleString('ru-RU')}
              </Badge>
            ) : null}
          </div>

          <div className="rounded-lg border bg-muted/30 p-4 text-sm">
            <p className="font-medium">Как привязать Алису</p>
            <p className="mt-2 text-muted-foreground">
              Получите одноразовый код и скажите: <span className="font-medium">«Алиса, запусти навык LLM Store и привяжи аккаунт 123456»</span>.
            </p>
            <p className="mt-2 text-muted-foreground">
              После этого новые запросы и Alice-чат будут связаны с вашим аккаунтом LLM Store.
            </p>
          </div>

          {profile.alice?.link_code ? (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Код привязки</p>
                  <p className="mt-1 text-3xl font-bold tracking-[0.2em]">{profile.alice.link_code.code}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Действует до {new Date(profile.alice.link_code.expires_at).toLocaleString('ru-RU')}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    После истечения срока можно будет получить новый код.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void navigator.clipboard.writeText(profile.alice!.link_code!.code)}
                  >
                    Скопировать код
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <Button
              onClick={() => createAliceLinkCodeMutation.mutate()}
              disabled={createAliceLinkCodeMutation.isPending}
            >
              {createAliceLinkCodeMutation.isPending ? 'Создаю код...' : 'Получить код привязки'}
            </Button>
          )}

          {createAliceLinkCodeMutation.error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {getApiErrorMessage(createAliceLinkCodeMutation.error) ?? 'Не удалось создать код привязки Алисы.'}
            </div>
          ) : null}

          {profile.alice?.status.linked_skill_user_id ? (
            <div className="rounded-lg border p-4 text-sm">
              <p className="font-medium">Текущая привязка</p>
              <p className="mt-2 break-all text-muted-foreground">
                Skill user id: {profile.alice.status.linked_skill_user_id}
              </p>
              {profile.alice.status.linked_at ? (
                <p className="mt-1 text-muted-foreground">
                  Привязан: {new Date(profile.alice.status.linked_at).toLocaleString('ru-RU')}
                </p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Информация</CardTitle>
        </CardHeader>
        <CardContent>
          {!editing ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt=""
                    className="w-12 h-12 rounded-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.nextElementSibling?.classList.remove('hidden');
                    }}
                  />
                ) : null}
                <div className={`w-12 h-12 rounded-full bg-muted flex items-center justify-center text-lg font-semibold text-muted-foreground${profile.avatar_url ? ' hidden' : ''}`}>
                  {(profile.name || profile.email)[0].toUpperCase()}
                </div>
                <div>
                  <p className="font-medium">{profile.name || 'Без имени'}</p>
                  <p className="text-sm text-muted-foreground">{profile.email}</p>
                </div>
                <Badge variant="secondary" className="ml-auto">
                  {ROLE_LABELS[profile.role] || profile.role}
                </Badge>
              </div>
              {profile.username && (
                <p className="text-sm text-muted-foreground">
                  Логин:{' '}
                  <UserLink
                    username={profile.username}
                    name={null}
                    className="hover:text-primary hover:underline"
                  />
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                Зарегистрирован: {new Date(profile.created_at).toLocaleDateString('ru-RU')}
              </p>
              <Button variant="outline" size="sm" onClick={handleStartEdit}>
                Редактировать
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Имя</label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Ваше имя"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Логин</label>
                <Input
                  value={profile.username || ''}
                  disabled
                  placeholder="Логин не редактируется"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Логин в профиле сейчас не изменяется.
                </p>
              </div>
              {updateMutation.error && (
                <p className="text-sm text-destructive">
                  {(updateMutation.error as any)?.response?.data?.error?.message || 'Ошибка сохранения'}
                </p>
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? 'Сохранение...' : 'Сохранить'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                  Отмена
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>


      <Card>
        <CardHeader>
          <CardTitle>Баланс</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-4">
            <span className="text-3xl font-bold">{formatUsd(profile.balance_usd)}</span>
            <span className="text-lg text-muted-foreground">
              ~ {formatRub(profile.balance_rub)}
            </span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Курс: $1 = {formatRub(usdToRubRate, { minimumFractionDigits: 0, maximumFractionDigits: 4 })}.
          </p>
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Мы в процессе подключения платежей. Возможность пополнения баланса скоро появится.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>История баланса</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={historyTab === 'all' ? 'primary' : 'outline'} onClick={() => setHistoryTab('all')}>
                Все
              </Button>
              <Button size="sm" variant={historyTab === 'topup' ? 'primary' : 'outline'} onClick={() => setHistoryTab('topup')}>
                Пополнение
              </Button>
              <Button size="sm" variant={historyTab === 'writeoff' ? 'primary' : 'outline'} onClick={() => setHistoryTab('writeoff')}>
                Списание
              </Button>
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              Показывать
              <select
                className="h-8 rounded-md border bg-background px-2 text-foreground"
                value={historyPageSize}
                onChange={(e) => setHistoryPageSize(Number(e.target.value) as 5 | 10 | 20)}
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
              </select>
            </label>
          </div>
          {historyItems.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              История пока пустая
            </div>
          ) : (
            <div className="space-y-2">
              {paginatedHistoryItems.map((item) => {
                const amount = Number(item.amount_usd);
                const sign = item.direction === 'credit' ? '+' : '-';
                const amountRub = amount * usdToRubRate;
                return (
                  <div key={item.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        {renderBalanceHistoryTitle(item)}
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(item.created_at).toLocaleString('ru-RU')}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Badge variant={item.direction === 'credit' ? 'success' : 'destructive'}>
                            {item.direction === 'credit' ? 'Пополнение' : 'Списание'}
                          </Badge>
                          <Badge variant="outline">{eventTypeLabel(item.event_type)}</Badge>
                          {item.model && <Badge variant="outline">{item.model}</Badge>}
                          <Badge variant="outline">Токены: {formatTokens(item.tokens)}</Badge>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`font-semibold ${item.direction === 'credit' ? 'text-green-700' : 'text-red-600'}`}>
                          {sign}{formatUsd(amount, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {sign}{formatRub(amountRub)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <p className="text-xs text-muted-foreground">
                  {`Записи ${(historyPage - 1) * historyPageSize + 1}-${Math.min(historyPage * historyPageSize, historyItems.length)} из ${historyItems.length}`}
                </p>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="outline" onClick={() => setHistoryPage((p) => Math.max(1, p - 1))} disabled={historyPage === 1}>
                    {'<'}
                  </Button>
                  {historyPageNumbers.map((pageNumber, idx) => {
                    const prev = historyPageNumbers[idx - 1];
                    const hasGap = prev && pageNumber - prev > 1;
                    return (
                      <div key={pageNumber} className="flex items-center gap-1">
                        {hasGap ? <span className="px-1 text-muted-foreground">...</span> : null}
                        <Button size="sm" variant={historyPage === pageNumber ? 'primary' : 'outline'} onClick={() => setHistoryPage(pageNumber)}>
                          {pageNumber}
                        </Button>
                      </div>
                    );
                  })}
                  <Button size="sm" variant="outline" onClick={() => setHistoryPage((p) => Math.min(totalHistoryPages, p + 1))} disabled={historyPage === totalHistoryPages}>
                    {'>'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Использование</CardTitle>
        </CardHeader>
        <CardContent>
          {usageChatError ? (
            <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {usageChatError}
            </div>
          ) : null}
          <div className="mb-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <p className="text-2xl font-bold">{profile.usage.total_runs}</p>
              <p className="text-xs text-muted-foreground">Запусков</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <p className="text-2xl font-bold">{formatTokens(profile.usage.total_tokens)}</p>
              <p className="text-xs text-muted-foreground">Токенов</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <p className="text-xl font-bold break-words">{formatUsdRubPair(profile.usage.total_cost_usd, usdToRubRate)}</p>
              <div className="mt-2 flex min-h-10 flex-col items-center justify-center gap-1">
                {tokenLeaderboardLabel ? (
                  <button
                    type="button"
                    className="rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-900 transition hover:bg-amber-200"
                    onClick={() => {
                      setLeaderboardSort('tokens');
                      setLeaderboardPage(1);
                      setIsLeaderboardOpen(true);
                    }}
                  >
                    {tokenLeaderboardLabel}
                  </button>
                ) : tokenLeaderboardQuery.isLoading ? (
                  <span className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Рейтинг...</span>
                ) : null}
                <p className="text-xs text-muted-foreground">Потрачено</p>
              </div>
            </div>
          </div>

          {profile.usage.per_agent.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium mb-2">По агентам</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 font-medium">Агент</th>
                      <th className="pb-2 font-medium text-right">Запуски</th>
                      <th className="pb-2 font-medium text-right">Токены</th>
                      <th className="pb-2 font-medium text-right">Стоимость ($/₽)</th>
                    </tr>
                  </thead>
                  <tbody>
                      {profile.usage.per_agent.map((agent) => (
                        <tr key={agent.agent_id} className="border-b last:border-0">
                          <td className="py-2">
                            <button
                              type="button"
                              onClick={() => void handleUsageAgentClick(agent.agent_id)}
                              disabled={pendingUsageAgentId !== null}
                              className="text-left text-primary transition hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
                            >
                              {pendingUsageAgentId === agent.agent_id ? 'Открываю чат...' : agent.agent_name}
                            </button>
                          </td>
                          <td className="py-2 text-right">{agent.total_runs}</td>
                        <td className="py-2 text-right">{formatTokens(agent.total_tokens)}</td>
                        <td className="py-2 text-right">{formatUsdRubPair(agent.total_cost, usdToRubRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Запуски</CardTitle>
            <Link to="/dashboard/runs">
              <Button variant="outline" size="sm">Все запуски</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {runsQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : runsQuery.isError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              Не удалось загрузить запуски. Попробуйте обновить страницу чуть позже.
            </div>
          ) : recentRuns.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              Запусков пока нет.
            </div>
          ) : (
            <div className="space-y-3">
              {recentRuns.map((run) => (
                <div key={run.id} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <Badge variant={RUN_STATUS_VARIANTS[run.status] ?? 'secondary'}>
                          {RUN_STATUS_LABELS[run.status] ?? run.status}
                        </Badge>
                        {run.latency_ms != null ? (
                          <span className="text-xs text-muted-foreground">
                            {(run.latency_ms / 1000).toFixed(1)}s
                          </span>
                        ) : null}
                      </div>
                      {run.input_summary ? (
                        <p className="truncate text-sm">{run.input_summary}</p>
                      ) : (
                        <p className="text-sm text-muted-foreground">Запуск без краткого описания</p>
                      )}
                      {run.output_summary ? (
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {run.output_summary}
                        </p>
                      ) : null}
                      {run.error_message ? (
                        <p className="mt-1 truncate text-xs text-destructive">
                          {run.error_message}
                        </p>
                      ) : null}
                      {run.chat_id ? (
                        <div className="mt-2">
                          <Link
                            className="text-xs font-medium text-primary hover:underline"
                            to={`/chats?chat=${encodeURIComponent(run.chat_id)}`}
                          >
                            {run.chat_title ? `Открыть чат: ${run.chat_title}` : 'Открыть чат'}
                          </Link>
                        </div>
                      ) : null}
                    </div>
                    <div className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(run.started_at).toLocaleString('ru-RU')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Привязанные аккаунты</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {isLeaderboardOpen && (
              <div
                className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4"
                onClick={() => setIsLeaderboardOpen(false)}
              >
                <div
                  className="w-full max-w-5xl rounded-2xl border bg-background shadow-2xl"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="flex items-start justify-between gap-4 border-b p-6">
                    <div>
                      <h2 className="text-xl font-semibold">Рейтинг пользователей</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Сортировка по активности во всех чатах.
                        {activeLeaderboardCurrentUser ? ` Ваше место: ${formatLeaderboardPosition(activeLeaderboardCurrentUser.position)}.` : ''}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setIsLeaderboardOpen(false)}>
                      Закрыть
                    </Button>
                  </div>

                  <div className="space-y-4 p-6">
                    <div className="flex flex-wrap gap-2">
                      {LEADERBOARD_SORT_OPTIONS.map((option) => (
                        <Button
                          key={option.value}
                          size="sm"
                          variant={leaderboardSort === option.value ? 'primary' : 'outline'}
                          onClick={() => {
                            setLeaderboardSort(option.value);
                            setLeaderboardPage(1);
                          }}
                        >
                          {option.shortLabel}
                        </Button>
                      ))}
                    </div>

                    {activeLeaderboardCurrentUser && (
                      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Ваша позиция</p>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <p className="text-lg font-semibold">{formatLeaderboardPosition(activeLeaderboardCurrentUser.position)}</p>
                              {activeLeaderboardCurrentUser.rank !== activeLeaderboardCurrentUser.position ? (
                                <span className="text-xs text-muted-foreground">{formatRankLabel(activeLeaderboardCurrentUser.rank)}</span>
                              ) : null}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-muted-foreground">
                              {leaderboardValue(activeLeaderboardCurrentUser, leaderboardSort, usdToRubRate)}
                            </p>
                            {activeLeaderboardCurrentUserPage && activeLeaderboardCurrentUserPage !== currentLeaderboardPage ? (
                              <Button
                                className="mt-2"
                                size="sm"
                                variant="outline"
                                onClick={() => setLeaderboardPage(activeLeaderboardCurrentUserPage)}
                              >
                                Перейти к моей странице
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    )}

                    {leaderboardQuery.isLoading ? (
                      <div className="flex justify-center py-12">
                        <Spinner />
                      </div>
                    ) : leaderboardQuery.isError ? (
                      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                        Не удалось загрузить рейтинг. Попробуйте обновить страницу чуть позже.
                      </div>
                    ) : activeLeaderboard ? (
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                          <p>
                            В рейтинге сейчас {activeLeaderboard.total_users.toLocaleString('ru-RU')} пользователей.
                          </p>
                          <p>
                            {activeLeaderboard.total_users > 0
                              ? `Показаны места ${leaderboardEntriesStart.toLocaleString('ru-RU')}-${leaderboardEntriesEnd.toLocaleString('ru-RU')} • страница ${currentLeaderboardPage} из ${leaderboardTotalPages}`
                              : 'Пока нет участников'}
                            {leaderboardQuery.isFetching ? ' • Обновляем...' : ''}
                          </p>
                        </div>
                        {featuredLeaderboardEntries.length > 0 && (
                          <div className="grid gap-3 md:grid-cols-3">
                            {featuredLeaderboardEntries.map((entry) => {
                              const medal = getLeaderboardMedal(entry.position);
                              return (
                                <div
                                  key={`featured-${entry.user_id}`}
                                  className={`rounded-2xl border p-4 shadow-sm ${medal?.cardClass ?? 'bg-background'} ${entry.is_current_user ? 'ring-2 ring-primary/20' : ''}`}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                      {entry.avatar_url ? (
                                        <img
                                          src={entry.avatar_url}
                                          alt=""
                                          className="h-12 w-12 rounded-full border border-white/70 object-cover shadow-sm"
                                        />
                                      ) : (
                                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/80 text-sm font-semibold text-slate-700 shadow-sm">
                                          {(entry.name || entry.username || '?').slice(0, 1).toUpperCase()}
                                        </div>
                                      )}
                                      <div className="min-w-0">
                                        <Badge variant="outline" className={medal?.badgeClass}>
                                          {medal?.label ?? 'Топ'}
                                        </Badge>
                                        <div className="mt-2">
                                          <UserLink
                                            username={entry.username}
                                            name={entry.name}
                                            className="truncate font-semibold hover:text-primary hover:underline"
                                          />
                                          {entry.is_current_user ? (
                                            <p className="text-xs text-primary">Это вы</p>
                                          ) : null}
                                        </div>
                                      </div>
                                    </div>
                                    <div className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold shadow-sm ${medal?.numberClass ?? 'bg-primary text-primary-foreground'}`}>
                                      {entry.position}
                                    </div>
                                  </div>

                                  <div className="mt-4 rounded-xl border border-white/60 bg-white/70 px-3 py-3">
                                    <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                                      {LEADERBOARD_SORT_OPTIONS.find((option) => option.value === leaderboardSort)?.shortLabel ?? 'Метрика'}
                                    </p>
                                    <p className="mt-1 text-lg font-semibold">
                                      {leaderboardValue(entry, leaderboardSort, usdToRubRate)}
                                    </p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        <div className="max-h-[55vh] overflow-auto rounded-xl border">
                          <table className="w-full min-w-[760px] text-sm">
                            <thead className="sticky top-0 bg-background">
                              <tr className="border-b text-left text-muted-foreground">
                                <th className="px-4 py-3 font-medium">Место</th>
                                <th className="px-4 py-3 font-medium">Пользователь</th>
                                <th className="px-4 py-3 text-right font-medium">Токены</th>
                                <th className="px-4 py-3 text-right font-medium">Цена</th>
                                <th className="px-4 py-3 text-right font-medium">Чаты</th>
                                <th className="px-4 py-3 text-right font-medium">Сообщения</th>
                              </tr>
                            </thead>
                            <tbody>
                              {activeLeaderboard.entries.map((entry) => (
                                <tr
                                  key={entry.user_id}
                                  className={`${entry.position === 1 ? 'bg-amber-50/60' : entry.position === 2 ? 'bg-slate-50/80' : entry.position === 3 ? 'bg-orange-50/70' : ''} ${entry.is_current_user ? 'ring-1 ring-primary/10 bg-primary/5' : ''} border-b last:border-0`}
                                >
                                  <td className="px-4 py-3 font-medium">
                                    <div className="flex flex-col">
                                      <span>{formatLeaderboardPosition(entry.position)}</span>
                                      {getLeaderboardMedal(entry.position) ? (
                                        <Badge variant="outline" className={`mt-1 w-fit ${getLeaderboardMedal(entry.position)?.badgeClass}`}>
                                          {getLeaderboardMedal(entry.position)?.label}
                                        </Badge>
                                      ) : null}
                                      {entry.rank !== entry.position ? (
                                        <span className="text-xs font-normal text-muted-foreground">{formatRankLabel(entry.rank)}</span>
                                      ) : null}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-3">
                                      {entry.avatar_url ? (
                                        <img
                                          src={entry.avatar_url}
                                          alt=""
                                          className="h-9 w-9 rounded-full object-cover"
                                        />
                                      ) : (
                                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                                          {(entry.name || entry.username || '?').slice(0, 1).toUpperCase()}
                                        </div>
                                      )}
                                      <div className="min-w-0">
                                        <UserLink
                                          username={entry.username}
                                          name={entry.name}
                                          className="truncate font-medium hover:text-primary hover:underline"
                                        />
                                        {entry.is_current_user && (
                                          <p className="text-xs text-primary">Это вы</p>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-right">{formatTokens(entry.total_tokens)}</td>
                                  <td className="px-4 py-3 text-right">{formatUsdRubPair(entry.total_cost_usd, usdToRubRate)}</td>
                                  <td className="px-4 py-3 text-right">{entry.chats_count.toLocaleString('ru-RU')}</td>
                                  <td className="px-4 py-3 text-right">{entry.messages_count.toLocaleString('ru-RU')}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {activeLeaderboard.total_pages > 1 && (
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="text-xs text-muted-foreground">
                              Страница {currentLeaderboardPage} из {leaderboardTotalPages}
                            </p>
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setLeaderboardPage((p) => Math.max(1, p - 1))}
                                disabled={currentLeaderboardPage === 1 || leaderboardQuery.isFetching}
                              >
                                {'<'}
                              </Button>
                              {leaderboardPageNumbers.map((pageNumber, idx) => {
                                const prev = leaderboardPageNumbers[idx - 1];
                                const hasGap = prev && pageNumber - prev > 1;
                                return (
                                  <div key={pageNumber} className="flex items-center gap-1">
                                    {hasGap ? <span className="px-1 text-muted-foreground">...</span> : null}
                                    <Button
                                      size="sm"
                                      variant={currentLeaderboardPage === pageNumber ? 'primary' : 'outline'}
                                      onClick={() => setLeaderboardPage(pageNumber)}
                                      disabled={leaderboardQuery.isFetching && currentLeaderboardPage !== pageNumber}
                                    >
                                      {pageNumber}
                                    </Button>
                                  </div>
                                );
                              })}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setLeaderboardPage((p) => Math.min(leaderboardTotalPages, p + 1))}
                                disabled={currentLeaderboardPage === leaderboardTotalPages || leaderboardQuery.isFetching}
                              >
                                {'>'}
                              </Button>
                            </div>
                          </div>
                        )}

                        {showPinnedCurrentUser && activeLeaderboardCurrentUser && (
                          <div className="rounded-xl border border-dashed p-4">
                            <p className="mb-2 text-sm font-medium">Вы вне видимой части таблицы</p>
                            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                              <UserLink
                                username={activeLeaderboardCurrentUser.username}
                                name={activeLeaderboardCurrentUser.name}
                                className="font-medium hover:text-primary hover:underline"
                              />
                              <span>{formatLeaderboardPosition(activeLeaderboardCurrentUser.position)}</span>
                              <span>{leaderboardValue(activeLeaderboardCurrentUser, leaderboardSort, usdToRubRate)}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                        Рейтинг пока пустой.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            {LINKABLE_PROVIDERS.map((provider) => {
              const isLinked = linkedProviders.has(provider);
              return (
                <div key={provider} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{PROVIDER_LABELS[provider]}</span>
                    {isLinked && <Badge variant="success">Привязан</Badge>}
                  </div>
                  {isLinked ? (
                    <Button variant="outline" size="sm" onClick={() => handleUnlink(provider)} disabled={unlinkMutation.isPending}>
                      Отвязать
                    </Button>
                  ) : (
                    <a href={getOAuthLinkUrl(provider)}>
                      <Button variant="outline" size="sm">Привязать</Button>
                    </a>
                  )}
                </div>
              );
            })}
          </div>
          {unlinkMutation.error && (
            <p className="text-sm text-destructive mt-2">
              {(unlinkMutation.error as any)?.response?.data?.error?.message || 'Ошибка при отвязке'}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Лимиты</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Макс. агентов</span>
              <span className="font-medium">{profile.limits.max_agents === -1 ? 'Без ограничений' : profile.limits.max_agents}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Макс. запусков / день</span>
              <span className="font-medium">{profile.limits.max_runs_per_day === -1 ? 'Без ограничений' : profile.limits.max_runs_per_day}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Макс. токенов / запуск</span>
              <span className="font-medium">
                {profile.limits.max_tokens_per_run === -1 ? 'Без ограничений' : profile.limits.max_tokens_per_run.toLocaleString('ru-RU')}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Безопасность</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-4 text-sm">
            <p className="font-medium">
              {profile.has_password ? 'Сменить пароль' : 'Задать пароль'}
            </p>
            <p className="mt-1 text-muted-foreground">
              {profile.has_password
                ? 'Пароль используется для входа по email или логину. Чтобы изменить его, подтвердите текущий пароль.'
                : 'Сейчас пароль для этого аккаунта не задан. После установки вы сможете входить по email или логину и паролю.'}
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {profile.has_password ? (
              <div className="md:col-span-2">
                <label className="text-sm font-medium">Текущий пароль</label>
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => {
                    clearPasswordFeedback();
                    setCurrentPassword(e.target.value);
                  }}
                  placeholder="Введите текущий пароль"
                  autoComplete="current-password"
                />
              </div>
            ) : null}

            <div>
              <label className="text-sm font-medium">Новый пароль</label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => {
                  clearPasswordFeedback();
                  setNewPassword(e.target.value);
                }}
                placeholder="Минимум 8 символов"
                autoComplete="new-password"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Повторите пароль</label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => {
                  clearPasswordFeedback();
                  setConfirmPassword(e.target.value);
                }}
                placeholder="Повторите новый пароль"
                autoComplete="new-password"
              />
            </div>
          </div>

          {passwordSuccessMessage ? (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              {passwordSuccessMessage}
            </div>
          ) : null}

          {passwordFormError || changePasswordMutation.error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {passwordFormError || (changePasswordMutation.error as any)?.response?.data?.error?.message || 'Не удалось изменить пароль'}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {profile.has_password
                ? 'Если забыли пароль, администратор тоже может задать новый в панели пользователей.'
                : 'Это не отвяжет ваши OAuth-аккаунты, а просто добавит ещё один способ входа.'}
            </p>
            <Button size="sm" onClick={handlePasswordSubmit} disabled={changePasswordMutation.isPending}>
              {changePasswordMutation.isPending
                ? (profile.has_password ? 'Сохраняю...' : 'Устанавливаю...')
                : (profile.has_password ? 'Обновить пароль' : 'Установить пароль')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

