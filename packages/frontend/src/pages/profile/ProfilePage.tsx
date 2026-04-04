import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import type { ProfileLeaderboardEntry, ProfileLeaderboardSort } from '@llmstore/shared';
import { useChangePassword, useProfile, useProfileLeaderboard, useUnlinkAccount, useUpdateProfile } from '../../hooks/useProfile';
import { useTopUpStatus } from '../../hooks/usePayments';
import { authApi } from '../../lib/api/auth';
import { getOAuthLinkUrl } from '../../lib/api/profile';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Spinner } from '../../components/ui/Spinner';
import { UserLink } from '../../components/users/UserLink';
import { formatRub, formatUsd, formatUsdRubPair } from '../../lib/utils';

const ROLE_LABELS: Record<string, string> = {
  user: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ',
  power_user: 'РџСЂРѕРґРІРёРЅСѓС‚С‹Р№',
  curator: 'РљСѓСЂР°С‚РѕСЂ',
  admin: 'РђРґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ',
};

const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google',
  yandex: 'РЇРЅРґРµРєСЃ',
  mailru: 'Mail.ru',
  vk: 'VK',
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  chat_usage: 'РЎРїРёСЃР°РЅРёРµ Р·Р° С‡Р°С‚',
  agent_run_usage: 'РЎРїРёСЃР°РЅРёРµ Р·Р° Р·Р°РїСѓСЃРє Р°РіРµРЅС‚Р°',
  signup_bonus: 'РЎС‚Р°СЂС‚РѕРІС‹Р№ Р±РѕРЅСѓСЃ',
  topup: 'РџРѕРїРѕР»РЅРµРЅРёРµ Р±Р°Р»Р°РЅСЃР°',
  admin_adjustment: 'РљРѕСЂСЂРµРєС‚РёСЂРѕРІРєР° Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂРѕРј',
  admin_credit: 'РџРѕРїРѕР»РЅРµРЅРёРµ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂРѕРј',
  admin_debit: 'РЎРїРёСЃР°РЅРёРµ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂРѕРј',
};

const LINKABLE_PROVIDERS = ['google', 'yandex', 'vk'];
type HistoryTab = 'all' | 'topup' | 'writeoff';
const LEADERBOARD_PAGE_SIZE = 20;
const LEADERBOARD_SORT_OPTIONS: Array<{ value: ProfileLeaderboardSort; label: string; shortLabel: string }> = [
  { value: 'tokens', label: 'РџРѕ С‚РѕРєРµРЅР°Рј РІРѕ РІСЃРµС… С‡Р°С‚Р°С…', shortLabel: 'РўРѕРєРµРЅС‹' },
  { value: 'cost', label: 'РџРѕ С†РµРЅРµ РІРѕ РІСЃРµС… С‡Р°С‚Р°С…', shortLabel: 'Р¦РµРЅР°' },
  { value: 'chats', label: 'РџРѕ РєРѕР»РёС‡РµСЃС‚РІСѓ С‡Р°С‚РѕРІ', shortLabel: 'Р§Р°С‚С‹' },
  { value: 'messages', label: 'РџРѕ СЃРѕРѕР±С‰РµРЅРёСЏРј', shortLabel: 'РЎРѕРѕР±С‰РµРЅРёСЏ' },
];

function formatTokens(value: number): string {
  if (value > 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value > 1000) return `${(value / 1000).toFixed(1)}K`;
  return String(value);
}

function formatRankLabel(rank: number | null | undefined): string | null {
  if (!rank || rank < 1) return null;
  return `РўРѕРї ${rank}`;
}

function formatLeaderboardPosition(position: number | null | undefined): string | null {
  if (!position || position < 1) return null;
  return `#${position.toLocaleString('ru-RU')}`;
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
      label: 'Р—РѕР»РѕС‚Рѕ',
      badgeClass: 'border border-amber-300 bg-amber-100 text-amber-900',
      cardClass: 'border-amber-200 bg-[linear-gradient(135deg,rgba(251,191,36,0.20),rgba(255,255,255,1))]',
      rowClass: 'bg-amber-50/60',
      numberClass: 'bg-amber-500 text-white',
    };
  }

  if (position === 2) {
    return {
      label: 'РЎРµСЂРµР±СЂРѕ',
      badgeClass: 'border border-slate-300 bg-slate-100 text-slate-800',
      cardClass: 'border-slate-200 bg-[linear-gradient(135deg,rgba(203,213,225,0.35),rgba(255,255,255,1))]',
      rowClass: 'bg-slate-50/80',
      numberClass: 'bg-slate-500 text-white',
    };
  }

  if (position === 3) {
    return {
      label: 'Р‘СЂРѕРЅР·Р°',
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
  return EVENT_TYPE_LABELS[type] ?? `РЎРѕР±С‹С‚РёРµ: ${type}`;
}

export function ProfilePage() {
  const queryClient = useQueryClient();
  const { data: profile, isLoading, error } = useProfile();
  const updateMutation = useUpdateProfile();
  const changePasswordMutation = useChangePassword();
  const unlinkMutation = useUnlinkAccount();
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
  const tokenLeaderboardQuery = useProfileLeaderboard('tokens', true, 1, 1);
  const leaderboardQuery = useProfileLeaderboard(leaderboardSort, isLeaderboardOpen, leaderboardPage, LEADERBOARD_PAGE_SIZE);

  useEffect(() => {
    const oauth = searchParams.get('oauth');
    const provider = searchParams.get('provider');
    const message = searchParams.get('message');

    if (oauth === 'success') {
      setOauthMessage({
        type: 'success',
        text: provider
          ? `${PROVIDER_LABELS[provider] || provider} СѓСЃРїРµС€РЅРѕ РїСЂРёРІСЏР·Р°РЅ`
          : 'РђРєРєР°СѓРЅС‚ СѓСЃРїРµС€РЅРѕ РїСЂРёРІСЏР·Р°РЅ',
      });
      setSearchParams({}, { replace: true });
    } else if (oauth === 'error') {
      setOauthMessage({
        type: 'error',
        text: message || 'РћС€РёР±РєР° РїСЂРё РїСЂРёРІСЏР·РєРµ Р°РєРєР°СѓРЅС‚Р°',
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
      setPasswordFormError('РЈРєР°Р¶РёС‚Рµ С‚РµРєСѓС‰РёР№ РїР°СЂРѕР»СЊ');
      return;
    }

    if (newPassword.length < 8) {
      setPasswordFormError('РќРѕРІС‹Р№ РїР°СЂРѕР»СЊ РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ РЅРµ РєРѕСЂРѕС‡Рµ 8 СЃРёРјРІРѕР»РѕРІ');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordFormError('РџРѕРґС‚РІРµСЂР¶РґРµРЅРёРµ РїР°СЂРѕР»СЏ РЅРµ СЃРѕРІРїР°РґР°РµС‚');
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
              ? 'РџР°СЂРѕР»СЊ РѕР±РЅРѕРІР»С‘РЅ'
              : 'РџР°СЂРѕР»СЊ СѓСЃС‚Р°РЅРѕРІР»РµРЅ. РўРµРїРµСЂСЊ РјРѕР¶РЅРѕ РІС…РѕРґРёС‚СЊ РїРѕ email РёР»Рё Р»РѕРіРёРЅСѓ Рё РїР°СЂРѕР»СЋ.',
          );
        },
      },
    );
  };

  const handleUnlink = (provider: string) => {
    if (!confirm(`РћС‚РІСЏР·Р°С‚СЊ ${PROVIDER_LABELS[provider] || provider}?`)) return;
    unlinkMutation.mutate(provider);
  };

  const handleResendEmailVerification = async () => {
    setEmailVerificationSending(true);
    setEmailVerificationMessage(null);
    try {
      const result = await authApi.resendEmailVerification();
      setEmailVerificationMessage(
        result.alreadyVerified
          ? 'Email СѓР¶Рµ РїРѕРґС‚РІРµСЂР¶РґС‘РЅ.'
          : 'РџРёСЃСЊРјРѕ РѕС‚РїСЂР°РІР»РµРЅРѕ РїРѕРІС‚РѕСЂРЅРѕ. РџСЂРѕРІРµСЂСЊС‚Рµ РІС…РѕРґСЏС‰РёРµ.',
      );
    } catch (err: any) {
      setEmailVerificationMessage(err.response?.data?.error?.message || 'РќРµ СѓРґР°Р»РѕСЃСЊ РѕС‚РїСЂР°РІРёС‚СЊ РїРёСЃСЊРјРѕ.');
    } finally {
      setEmailVerificationSending(false);
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
        <p className="text-destructive">РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё РїСЂРѕС„РёР»СЏ</p>
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

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 space-y-6">
      <h1 className="text-2xl font-bold">РџСЂРѕС„РёР»СЊ</h1>

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
              <p className="font-medium">Email РїРѕРєР° РЅРµ РїРѕРґС‚РІРµСЂР¶РґС‘РЅ.</p>
              <p className="mt-1 text-amber-800/80">
                Р•СЃР»Рё РґР»СЏ СЃС‚Р°СЂС‚РѕРІРѕРіРѕ Р±РѕРЅСѓСЃР° РІРєР»СЋС‡РµРЅРѕ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёРµ email, Р±РѕРЅСѓСЃ РЅР°С‡РёСЃР»РёС‚СЃСЏ РїРѕСЃР»Рµ РїРµСЂРµС…РѕРґР° РїРѕ СЃСЃС‹Р»РєРµ РёР· РїРёСЃСЊРјР°.
              </p>
              {emailVerificationMessage ? (
                <p className="mt-2 text-amber-800">{emailVerificationMessage}</p>
              ) : null}
            </div>
            <Button variant="outline" size="sm" onClick={handleResendEmailVerification} disabled={emailVerificationSending}>
              {emailVerificationSending ? 'РћС‚РїСЂР°РІР»СЏСЋ...' : 'РћС‚РїСЂР°РІРёС‚СЊ РїРёСЃСЊРјРѕ РµС‰С‘ СЂР°Р·'}
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
          {topUpStatusQuery.isLoading && 'РџСЂРѕРІРµСЂСЏРµРј СЃС‚Р°С‚СѓСЃ РїР»Р°С‚РµР¶Р°...'}
          {topUpStatusQuery.isError && 'РќРµ СѓРґР°Р»РѕСЃСЊ РїСЂРѕРІРµСЂРёС‚СЊ СЃС‚Р°С‚СѓСЃ РїРѕРїРѕР»РЅРµРЅРёСЏ. РћР±РЅРѕРІРёС‚Рµ СЃС‚СЂР°РЅРёС†Сѓ С‡СѓС‚СЊ РїРѕР·Р¶Рµ.'}
          {!topUpStatusQuery.isLoading && !topUpStatusQuery.isError && returnedTopUp && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">
                  {returnedTopUpIsSucceeded && 'РџР»Р°С‚С‘Р¶ РїРѕРґС‚РІРµСЂР¶РґС‘РЅ, Р±Р°Р»Р°РЅСЃ СѓР¶Рµ РїРѕРїРѕР»РЅРµРЅ.'}
                  {returnedTopUpIsCanceled && 'РџР»Р°С‚С‘Р¶ РѕС‚РјРµРЅС‘РЅ РёР»Рё РЅРµ Р±С‹Р» Р·Р°РІРµСЂС€С‘РЅ.'}
                  {returnedTopUpIsProcessing && 'РџР»Р°С‚С‘Р¶ СЃРѕР·РґР°РЅ Рё РµС‰С‘ РѕР±СЂР°Р±Р°С‚С‹РІР°РµС‚СЃСЏ YooKassa.'}
                </p>
                <p className="text-xs opacity-80">
                  {formatRub(returnedTopUp.amount_rub, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} в†’ {formatUsd(returnedTopUp.amount_usd, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                </p>
              </div>
              {returnedTopUpIsProcessing && returnedTopUp.confirmation_url && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { window.location.href = returnedTopUp.confirmation_url!; }}
                >
                  РџСЂРѕРґРѕР»Р¶РёС‚СЊ РѕРїР»Р°С‚Сѓ
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>РРЅС„РѕСЂРјР°С†РёСЏ</CardTitle>
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
                  <p className="font-medium">{profile.name || 'Р‘РµР· РёРјРµРЅРё'}</p>
                  <p className="text-sm text-muted-foreground">{profile.email}</p>
                </div>
                <Badge variant="secondary" className="ml-auto">
                  {ROLE_LABELS[profile.role] || profile.role}
                </Badge>
              </div>
              {profile.username && (
                <p className="text-sm text-muted-foreground">
                  Р›РѕРіРёРЅ:{' '}
                  <UserLink
                    username={profile.username}
                    name={null}
                    className="hover:text-primary hover:underline"
                  />
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                Р—Р°СЂРµРіРёСЃС‚СЂРёСЂРѕРІР°РЅ: {new Date(profile.created_at).toLocaleDateString('ru-RU')}
              </p>
              <Button variant="outline" size="sm" onClick={handleStartEdit}>
                Р РµРґР°РєС‚РёСЂРѕРІР°С‚СЊ
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">РРјСЏ</label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Р’Р°С€Рµ РёРјСЏ"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Р›РѕРіРёРЅ</label>
                <Input
                  value={profile.username || ''}
                  disabled
                  placeholder="Р›РѕРіРёРЅ РЅРµ СЂРµРґР°РєС‚РёСЂСѓРµС‚СЃСЏ"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Р›РѕРіРёРЅ РІ РїСЂРѕС„РёР»Рµ СЃРµР№С‡Р°СЃ РЅРµ РёР·РјРµРЅСЏРµС‚СЃСЏ.
                </p>
              </div>
              {updateMutation.error && (
                <p className="text-sm text-destructive">
                  {(updateMutation.error as any)?.response?.data?.error?.message || 'РћС€РёР±РєР° СЃРѕС…СЂР°РЅРµРЅРёСЏ'}
                </p>
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? 'РЎРѕС…СЂР°РЅРµРЅРёРµ...' : 'РЎРѕС…СЂР°РЅРёС‚СЊ'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                  РћС‚РјРµРЅР°
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>


      <Card>
        <CardHeader>
          <CardTitle>Р‘Р°Р»Р°РЅСЃ</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-4">
            <span className="text-3xl font-bold">{formatUsd(profile.balance_usd)}</span>
            <span className="text-lg text-muted-foreground">
              ~ {formatRub(profile.balance_rub)}
            </span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            РљСѓСЂСЃ: $1 = {formatRub(usdToRubRate, { minimumFractionDigits: 0, maximumFractionDigits: 4 })}.
          </p>
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            РњС‹ РІ РїСЂРѕС†РµСЃСЃРµ РїРѕРґРєР»СЋС‡РµРЅРёСЏ РїР»Р°С‚РµР¶РµР№. Р’РѕР·РјРѕР¶РЅРѕСЃС‚СЊ РїРѕРїРѕР»РЅРµРЅРёСЏ Р±Р°Р»Р°РЅСЃР° СЃРєРѕСЂРѕ РїРѕСЏРІРёС‚СЃСЏ.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>РСЃС‚РѕСЂРёСЏ Р±Р°Р»Р°РЅСЃР°</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={historyTab === 'all' ? 'primary' : 'outline'} onClick={() => setHistoryTab('all')}>
                Р’СЃРµ
              </Button>
              <Button size="sm" variant={historyTab === 'topup' ? 'primary' : 'outline'} onClick={() => setHistoryTab('topup')}>
                РџРѕРїРѕР»РЅРµРЅРёРµ
              </Button>
              <Button size="sm" variant={historyTab === 'writeoff' ? 'primary' : 'outline'} onClick={() => setHistoryTab('writeoff')}>
                РЎРїРёСЃР°РЅРёРµ
              </Button>
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              РџРѕРєР°Р·С‹РІР°С‚СЊ
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
              РСЃС‚РѕСЂРёСЏ РїРѕРєР° РїСѓСЃС‚Р°СЏ
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
                        <p className="font-medium truncate">{item.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(item.created_at).toLocaleString('ru-RU')}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Badge variant={item.direction === 'credit' ? 'success' : 'destructive'}>
                            {item.direction === 'credit' ? 'РџРѕРїРѕР»РЅРµРЅРёРµ' : 'РЎРїРёСЃР°РЅРёРµ'}
                          </Badge>
                          <Badge variant="outline">{eventTypeLabel(item.event_type)}</Badge>
                          {item.model && <Badge variant="outline">{item.model}</Badge>}
                          <Badge variant="outline">РўРѕРєРµРЅС‹: {formatTokens(item.tokens)}</Badge>
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
                  {`Р—Р°РїРёСЃРё ${(historyPage - 1) * historyPageSize + 1}-${Math.min(historyPage * historyPageSize, historyItems.length)} РёР· ${historyItems.length}`}
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
          <CardTitle>РСЃРїРѕР»СЊР·РѕРІР°РЅРёРµ</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <p className="text-2xl font-bold">{profile.usage.total_runs}</p>
              <p className="text-xs text-muted-foreground">Р—Р°РїСѓСЃРєРѕРІ</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <p className="text-2xl font-bold">{formatTokens(profile.usage.total_tokens)}</p>
              <p className="text-xs text-muted-foreground">РўРѕРєРµРЅРѕРІ</p>
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
                  <span className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Р РµР№С‚РёРЅРі...</span>
                ) : null}
                <p className="text-xs text-muted-foreground">РџРѕС‚СЂР°С‡РµРЅРѕ</p>
              </div>
            </div>
          </div>

          {profile.usage.per_agent.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium mb-2">РџРѕ Р°РіРµРЅС‚Р°Рј</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 font-medium">РђРіРµРЅС‚</th>
                      <th className="pb-2 font-medium text-right">Р—Р°РїСѓСЃРєРё</th>
                      <th className="pb-2 font-medium text-right">РўРѕРєРµРЅС‹</th>
                      <th className="pb-2 font-medium text-right">РЎС‚РѕРёРјРѕСЃС‚СЊ ($/в‚Ѕ)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.usage.per_agent.map((agent) => (
                      <tr key={agent.agent_id} className="border-b last:border-0">
                        <td className="py-2">{agent.agent_name}</td>
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
          <CardTitle>РџСЂРёРІСЏР·Р°РЅРЅС‹Рµ Р°РєРєР°СѓРЅС‚С‹</CardTitle>
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
                      <h2 className="text-xl font-semibold">Р РµР№С‚РёРЅРі РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        РЎРѕСЂС‚РёСЂРѕРІРєР° РїРѕ Р°РєС‚РёРІРЅРѕСЃС‚Рё РІРѕ РІСЃРµС… С‡Р°С‚Р°С….
                        {activeLeaderboardCurrentUser ? ` Р’Р°С€Рµ РјРµСЃС‚Рѕ: ${formatLeaderboardPosition(activeLeaderboardCurrentUser.position)}.` : ''}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setIsLeaderboardOpen(false)}>
                      Р—Р°РєСЂС‹С‚СЊ
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
                            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Р’Р°С€Р° РїРѕР·РёС†РёСЏ</p>
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
                                РџРµСЂРµР№С‚Рё Рє РјРѕРµР№ СЃС‚СЂР°РЅРёС†Рµ
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
                        РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ СЂРµР№С‚РёРЅРі. РџРѕРїСЂРѕР±СѓР№С‚Рµ РѕР±РЅРѕРІРёС‚СЊ СЃС‚СЂР°РЅРёС†Сѓ С‡СѓС‚СЊ РїРѕР·Р¶Рµ.
                      </div>
                    ) : activeLeaderboard ? (
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                          <p>
                            Р’ СЂРµР№С‚РёРЅРіРµ СЃРµР№С‡Р°СЃ {activeLeaderboard.total_users.toLocaleString('ru-RU')} РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№.
                          </p>
                          <p>
                            {activeLeaderboard.total_users > 0
                              ? `РџРѕРєР°Р·Р°РЅС‹ РјРµСЃС‚Р° ${leaderboardEntriesStart.toLocaleString('ru-RU')}-${leaderboardEntriesEnd.toLocaleString('ru-RU')} вЂў СЃС‚СЂР°РЅРёС†Р° ${currentLeaderboardPage} РёР· ${leaderboardTotalPages}`
                              : 'РџРѕРєР° РЅРµС‚ СѓС‡Р°СЃС‚РЅРёРєРѕРІ'}
                            {leaderboardQuery.isFetching ? ' вЂў РћР±РЅРѕРІР»СЏРµРј...' : ''}
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
                                          {medal?.label ?? 'РўРѕРї'}
                                        </Badge>
                                        <div className="mt-2">
                                          <UserLink
                                            username={entry.username}
                                            name={entry.name}
                                            className="truncate font-semibold hover:text-primary hover:underline"
                                          />
                                          {entry.is_current_user ? (
                                            <p className="text-xs text-primary">Р­С‚Рѕ РІС‹</p>
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
                                      {LEADERBOARD_SORT_OPTIONS.find((option) => option.value === leaderboardSort)?.shortLabel ?? 'РњРµС‚СЂРёРєР°'}
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
                                <th className="px-4 py-3 font-medium">РњРµСЃС‚Рѕ</th>
                                <th className="px-4 py-3 font-medium">РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ</th>
                                <th className="px-4 py-3 text-right font-medium">РўРѕРєРµРЅС‹</th>
                                <th className="px-4 py-3 text-right font-medium">Р¦РµРЅР°</th>
                                <th className="px-4 py-3 text-right font-medium">Р§Р°С‚С‹</th>
                                <th className="px-4 py-3 text-right font-medium">РЎРѕРѕР±С‰РµРЅРёСЏ</th>
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
                                          <p className="text-xs text-primary">Р­С‚Рѕ РІС‹</p>
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
                              РЎС‚СЂР°РЅРёС†Р° {currentLeaderboardPage} РёР· {leaderboardTotalPages}
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
                            <p className="mb-2 text-sm font-medium">Р’С‹ РІРЅРµ РІРёРґРёРјРѕР№ С‡Р°СЃС‚Рё С‚Р°Р±Р»РёС†С‹</p>
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
                        Р РµР№С‚РёРЅРі РїРѕРєР° РїСѓСЃС‚РѕР№.
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
                    {isLinked && <Badge variant="success">РџСЂРёРІСЏР·Р°РЅ</Badge>}
                  </div>
                  {isLinked ? (
                    <Button variant="outline" size="sm" onClick={() => handleUnlink(provider)} disabled={unlinkMutation.isPending}>
                      РћС‚РІСЏР·Р°С‚СЊ
                    </Button>
                  ) : (
                    <a href={getOAuthLinkUrl(provider)}>
                      <Button variant="outline" size="sm">РџСЂРёРІСЏР·Р°С‚СЊ</Button>
                    </a>
                  )}
                </div>
              );
            })}
          </div>
          {unlinkMutation.error && (
            <p className="text-sm text-destructive mt-2">
              {(unlinkMutation.error as any)?.response?.data?.error?.message || 'РћС€РёР±РєР° РїСЂРё РѕС‚РІСЏР·РєРµ'}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Р›РёРјРёС‚С‹</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">РњР°РєСЃ. Р°РіРµРЅС‚РѕРІ</span>
              <span className="font-medium">{profile.limits.max_agents === -1 ? 'Р‘РµР· РѕРіСЂР°РЅРёС‡РµРЅРёР№' : profile.limits.max_agents}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">РњР°РєСЃ. Р·Р°РїСѓСЃРєРѕРІ / РґРµРЅСЊ</span>
              <span className="font-medium">{profile.limits.max_runs_per_day === -1 ? 'Р‘РµР· РѕРіСЂР°РЅРёС‡РµРЅРёР№' : profile.limits.max_runs_per_day}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">РњР°РєСЃ. С‚РѕРєРµРЅРѕРІ / Р·Р°РїСѓСЃРє</span>
              <span className="font-medium">
                {profile.limits.max_tokens_per_run === -1 ? 'Р‘РµР· РѕРіСЂР°РЅРёС‡РµРЅРёР№' : profile.limits.max_tokens_per_run.toLocaleString('ru-RU')}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Р‘РµР·РѕРїР°СЃРЅРѕСЃС‚СЊ</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-4 text-sm">
            <p className="font-medium">
              {profile.has_password ? 'РЎРјРµРЅРёС‚СЊ РїР°СЂРѕР»СЊ' : 'Р—Р°РґР°С‚СЊ РїР°СЂРѕР»СЊ'}
            </p>
            <p className="mt-1 text-muted-foreground">
              {profile.has_password
                ? 'РџР°СЂРѕР»СЊ РёСЃРїРѕР»СЊР·СѓРµС‚СЃСЏ РґР»СЏ РІС…РѕРґР° РїРѕ email РёР»Рё Р»РѕРіРёРЅСѓ. Р§С‚РѕР±С‹ РёР·РјРµРЅРёС‚СЊ РµРіРѕ, РїРѕРґС‚РІРµСЂРґРёС‚Рµ С‚РµРєСѓС‰РёР№ РїР°СЂРѕР»СЊ.'
                : 'РЎРµР№С‡Р°СЃ РїР°СЂРѕР»СЊ РґР»СЏ СЌС‚РѕРіРѕ Р°РєРєР°СѓРЅС‚Р° РЅРµ Р·Р°РґР°РЅ. РџРѕСЃР»Рµ СѓСЃС‚Р°РЅРѕРІРєРё РІС‹ СЃРјРѕР¶РµС‚Рµ РІС…РѕРґРёС‚СЊ РїРѕ email РёР»Рё Р»РѕРіРёРЅСѓ Рё РїР°СЂРѕР»СЋ.'}
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {profile.has_password ? (
              <div className="md:col-span-2">
                <label className="text-sm font-medium">РўРµРєСѓС‰РёР№ РїР°СЂРѕР»СЊ</label>
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => {
                    clearPasswordFeedback();
                    setCurrentPassword(e.target.value);
                  }}
                  placeholder="Р’РІРµРґРёС‚Рµ С‚РµРєСѓС‰РёР№ РїР°СЂРѕР»СЊ"
                  autoComplete="current-password"
                />
              </div>
            ) : null}

            <div>
              <label className="text-sm font-medium">РќРѕРІС‹Р№ РїР°СЂРѕР»СЊ</label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => {
                  clearPasswordFeedback();
                  setNewPassword(e.target.value);
                }}
                placeholder="РњРёРЅРёРјСѓРј 8 СЃРёРјРІРѕР»РѕРІ"
                autoComplete="new-password"
              />
            </div>

            <div>
              <label className="text-sm font-medium">РџРѕРІС‚РѕСЂРёС‚Рµ РїР°СЂРѕР»СЊ</label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => {
                  clearPasswordFeedback();
                  setConfirmPassword(e.target.value);
                }}
                placeholder="РџРѕРІС‚РѕСЂРёС‚Рµ РЅРѕРІС‹Р№ РїР°СЂРѕР»СЊ"
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
              {passwordFormError || (changePasswordMutation.error as any)?.response?.data?.error?.message || 'РќРµ СѓРґР°Р»РѕСЃСЊ РёР·РјРµРЅРёС‚СЊ РїР°СЂРѕР»СЊ'}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {profile.has_password
                ? 'Р•СЃР»Рё Р·Р°Р±С‹Р»Рё РїР°СЂРѕР»СЊ, Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ С‚РѕР¶Рµ РјРѕР¶РµС‚ Р·Р°РґР°С‚СЊ РЅРѕРІС‹Р№ РІ РїР°РЅРµР»Рё РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№.'
                : 'Р­С‚Рѕ РЅРµ РѕС‚РІСЏР¶РµС‚ РІР°С€Рё OAuth-Р°РєРєР°СѓРЅС‚С‹, Р° РїСЂРѕСЃС‚Рѕ РґРѕР±Р°РІРёС‚ РµС‰С‘ РѕРґРёРЅ СЃРїРѕСЃРѕР± РІС…РѕРґР°.'}
            </p>
            <Button size="sm" onClick={handlePasswordSubmit} disabled={changePasswordMutation.isPending}>
              {changePasswordMutation.isPending
                ? (profile.has_password ? 'РЎРѕС…СЂР°РЅСЏСЋ...' : 'РЈСЃС‚Р°РЅР°РІР»РёРІР°СЋ...')
                : (profile.has_password ? 'РћР±РЅРѕРІРёС‚СЊ РїР°СЂРѕР»СЊ' : 'РЈСЃС‚Р°РЅРѕРІРёС‚СЊ РїР°СЂРѕР»СЊ')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

