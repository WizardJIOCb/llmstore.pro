import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Badge } from '../../components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { profileApi } from '../../lib/api/profile';
import { formatUsdRubPair } from '../../lib/utils';

const ROLE_LABELS: Record<string, string> = {
  user: 'Пользователь',
  power_user: 'Продвинутый',
  curator: 'Куратор',
  admin: 'Администратор',
};

function formatTokens(value: number): string {
  if (value > 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value > 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

export function PublicProfilePage() {
  const { username } = useParams<{ username: string }>();
  const { data: profile, isLoading, error } = useQuery({
    queryKey: ['public-profile', username],
    queryFn: () => profileApi.getPublicProfile(username ?? ''),
    enabled: Boolean(username),
  });

  if (isLoading) {
    return (
      <div className="container mx-auto flex max-w-4xl justify-center px-4 py-16">
        <Spinner />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-16 text-center">
        <h1 className="mb-4 text-2xl font-bold">Профиль не найден</h1>
        <Link to="/" className="text-primary hover:underline">
          На главную
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl space-y-6 px-4 py-8">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt=""
                className="h-16 w-16 rounded-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.nextElementSibling?.classList.remove('hidden');
                }}
              />
            ) : null}
            <div className={`flex h-16 w-16 items-center justify-center rounded-full bg-muted text-xl font-semibold text-muted-foreground${profile.avatar_url ? ' hidden' : ''}`}>
              {(profile.name || profile.username || '?')[0]?.toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold">{profile.name || `@${profile.username}`}</h1>
                <Badge variant="secondary">{ROLE_LABELS[profile.role] || profile.role}</Badge>
              </div>
              {profile.username && (
                <p className="mt-1 text-sm text-muted-foreground">@{profile.username}</p>
              )}
              <p className="mt-2 text-sm text-muted-foreground">
                На сайте с {new Date(profile.created_at).toLocaleDateString('ru-RU')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Использование</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg bg-muted/50 p-4 text-center">
              <p className="text-2xl font-bold">{profile.usage.total_runs}</p>
              <p className="text-xs text-muted-foreground">Запусков</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-4 text-center">
              <p className="text-2xl font-bold">{formatTokens(profile.usage.total_tokens)}</p>
              <p className="text-xs text-muted-foreground">Токенов</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-4 text-center">
              <p className="text-xl font-bold break-words">
                {formatUsdRubPair(profile.usage.total_cost_usd, profile.usd_to_rub_rate)}
              </p>
              <p className="text-xs text-muted-foreground">Потрачено</p>
            </div>
          </div>

          {profile.usage.per_agent.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Агент</th>
                    <th className="pb-2 text-right font-medium">Запуски</th>
                    <th className="pb-2 text-right font-medium">Токены</th>
                    <th className="pb-2 text-right font-medium">Стоимость ($/₽)</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.usage.per_agent.map((agent) => (
                    <tr key={agent.agent_id} className="border-b last:border-0">
                      <td className="py-2">{agent.agent_name}</td>
                      <td className="py-2 text-right">{agent.total_runs}</td>
                      <td className="py-2 text-right">{formatTokens(agent.total_tokens)}</td>
                      <td className="py-2 text-right">
                        {formatUsdRubPair(agent.total_cost, profile.usd_to_rub_rate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Публичной истории запусков пока нет.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
