import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useProfile, useUpdateProfile, useUnlinkAccount } from '../../hooks/useProfile';
import { getOAuthLinkUrl } from '../../lib/api/profile';
import { USD_TO_RUB_RATE } from '@llmstore/shared';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Spinner } from '../../components/ui/Spinner';

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
};

const LINKABLE_PROVIDERS = ['google', 'yandex', 'mailru'];

export function ProfilePage() {
  const { data: profile, isLoading, error } = useProfile();
  const updateMutation = useUpdateProfile();
  const unlinkMutation = useUnlinkAccount();
  const [searchParams, setSearchParams] = useSearchParams();

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [oauthMessage, setOauthMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Handle OAuth callback params
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

  // Auto-dismiss notification
  useEffect(() => {
    if (oauthMessage) {
      const timer = setTimeout(() => setOauthMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [oauthMessage]);

  const handleStartEdit = () => {
    if (!profile) return;
    setEditName(profile.name || '');
    setEditUsername(profile.username || '');
    setEditing(true);
  };

  const handleSave = () => {
    updateMutation.mutate(
      { name: editName, username: editUsername },
      { onSuccess: () => setEditing(false) },
    );
  };

  const handleUnlink = (provider: string) => {
    if (!confirm(`Отвязать ${PROVIDER_LABELS[provider] || provider}?`)) return;
    unlinkMutation.mutate(provider);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-16 flex justify-center">
        <Spinner />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-destructive">Ошибка загрузки профиля</p>
      </div>
    );
  }

  const linkedProviders = new Set(profile.linked_accounts.map((a) => a.provider));

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 space-y-6">
      <h1 className="text-2xl font-bold">Профиль</h1>

      {/* OAuth notification */}
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

      {/* User Info */}
      <Card>
        <CardHeader>
          <CardTitle>Информация</CardTitle>
        </CardHeader>
        <CardContent>
          {!editing ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-lg font-semibold text-muted-foreground">
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
                <p className="text-sm text-muted-foreground">Логин: @{profile.username}</p>
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
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  placeholder="username"
                />
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

      {/* Balance */}
      <Card>
        <CardHeader>
          <CardTitle>Баланс</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-4">
            <span className="text-3xl font-bold">${Number(profile.balance_usd).toFixed(2)}</span>
            <span className="text-lg text-muted-foreground">
              ~ {Number(profile.balance_rub).toLocaleString('ru-RU')} ₽
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Курс: 1 USD = {USD_TO_RUB_RATE} ₽ (фиксированный). Для пополнения обратитесь к администратору.
          </p>
        </CardContent>
      </Card>

      {/* Usage Stats */}
      <Card>
        <CardHeader>
          <CardTitle>Использование</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <p className="text-2xl font-bold">{profile.usage.total_runs}</p>
              <p className="text-xs text-muted-foreground">Запусков</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <p className="text-2xl font-bold">
                {profile.usage.total_tokens > 1_000_000
                  ? `${(profile.usage.total_tokens / 1_000_000).toFixed(1)}M`
                  : profile.usage.total_tokens > 1000
                    ? `${(profile.usage.total_tokens / 1000).toFixed(1)}K`
                    : profile.usage.total_tokens}
              </p>
              <p className="text-xs text-muted-foreground">Токенов</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <p className="text-2xl font-bold">${Number(profile.usage.total_cost_usd).toFixed(4)}</p>
              <p className="text-xs text-muted-foreground">Потрачено</p>
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
                      <th className="pb-2 font-medium text-right">Стоимость</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.usage.per_agent.map((agent) => (
                      <tr key={agent.agent_id} className="border-b last:border-0">
                        <td className="py-2">{agent.agent_name}</td>
                        <td className="py-2 text-right">{agent.total_runs}</td>
                        <td className="py-2 text-right">
                          {agent.total_tokens > 1000
                            ? `${(agent.total_tokens / 1000).toFixed(1)}K`
                            : agent.total_tokens}
                        </td>
                        <td className="py-2 text-right">${Number(agent.total_cost).toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Linked Accounts */}
      <Card>
        <CardHeader>
          <CardTitle>Привязанные аккаунты</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {LINKABLE_PROVIDERS.map((provider) => {
              const isLinked = linkedProviders.has(provider);
              return (
                <div key={provider} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{PROVIDER_LABELS[provider]}</span>
                    {isLinked && <Badge variant="success">Привязан</Badge>}
                  </div>
                  {isLinked ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUnlink(provider)}
                      disabled={unlinkMutation.isPending}
                    >
                      Отвязать
                    </Button>
                  ) : (
                    <a href={getOAuthLinkUrl(provider)}>
                      <Button variant="outline" size="sm">
                        Привязать
                      </Button>
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

      {/* Limits */}
      <Card>
        <CardHeader>
          <CardTitle>Лимиты</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Макс. агентов</span>
              <span className="font-medium">
                {profile.limits.max_agents === -1 ? 'Без ограничений' : profile.limits.max_agents}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Макс. запусков / день</span>
              <span className="font-medium">
                {profile.limits.max_runs_per_day === -1 ? 'Без ограничений' : profile.limits.max_runs_per_day}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Макс. токенов / запуск</span>
              <span className="font-medium">
                {profile.limits.max_tokens_per_run === -1
                  ? 'Без ограничений'
                  : profile.limits.max_tokens_per_run.toLocaleString('ru-RU')}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
