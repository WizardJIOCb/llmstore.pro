import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  useAgentList,
  useDeleteAgent,
  useAgentStats,
  useDiscoverAgents,
  useAdoptAgent,
} from '../../hooks/useAgents';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Spinner } from '../../components/ui/Spinner';
import type { AgentStats } from '../../lib/api/agents';

const statusLabels: Record<string, string> = {
  draft: 'Черновик',
  active: 'Активный',
  archived: 'Архив',
};

const statusVariants: Record<string, 'default' | 'secondary' | 'outline'> = {
  draft: 'secondary',
  active: 'default',
  archived: 'outline',
};

const visibilityLabels: Record<string, string> = {
  public: 'Публичный',
  private: 'Приватный',
  unlisted: 'По ссылке',
};

const visibilityVariants: Record<string, 'default' | 'secondary' | 'outline'> = {
  public: 'default',
  private: 'secondary',
  unlisted: 'outline',
};

const statusFilterOptions = [
  { value: 'all', label: 'Все статусы' },
  { value: 'active', label: 'Активный' },
  { value: 'draft', label: 'Черновик' },
  { value: 'archived', label: 'Архив' },
];

function formatTokens(n: number): string {
  return n.toLocaleString('ru-RU');
}

function formatCost(cost: string): string {
  const num = parseFloat(cost);
  if (num === 0) return '$0.00';
  if (num < 0.01) return `$${num.toFixed(4)}`;
  return `$${num.toFixed(2)}`;
}

function formatTime(ms: number): string {
  if (ms === 0) return '0s';
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining.toFixed(0)}s`;
}

function formatCreatedAt(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU');
}

const emptyStats: AgentStats = {
  agent_id: '',
  total_runs: 0,
  total_prompt_tokens: 0,
  total_completion_tokens: 0,
  total_cost: '0',
  total_latency_ms: 0,
  last_run_at: null,
};

function hasUsage(stats: AgentStats): boolean {
  return stats.total_runs > 0
    || stats.total_prompt_tokens > 0
    || stats.total_completion_tokens > 0
    || Number(stats.total_cost) > 0
    || stats.total_latency_ms > 0;
}

function StatsRow({ stats, label }: { stats: AgentStats; label?: string }) {
  const totalTokens = stats.total_prompt_tokens + stats.total_completion_tokens;
  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground">
      {label && <span className="font-medium text-foreground">{label}</span>}
      <span title="Запусков">{stats.total_runs} запуск.</span>
      <span title="Токенов">{formatTokens(totalTokens)} ток.</span>
      <span title="Стоимость">{formatCost(stats.total_cost)}</span>
      <span title="Время">{formatTime(stats.total_latency_ms)}</span>
    </div>
  );
}

type HubTab = 'my' | 'search';

export function AgentsHubPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get('tab') === 'search' ? 'search' : 'my') as HubTab;

  const [searchMy, setSearchMy] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchDiscover, setSearchDiscover] = useState('');

  const { data: myAgents, isLoading: myAgentsLoading } = useAgentList();
  const { data: statsMap } = useAgentStats();
  const deleteAgent = useDeleteAgent();

  const { data: discoverAgents, isLoading: discoverLoading } = useDiscoverAgents(searchDiscover);
  const adoptAgent = useAdoptAgent();

  const filteredMyAgents = useMemo(() => {
    if (!myAgents) return [];
    return myAgents.filter((agent) => {
      if (statusFilter !== 'all' && agent.status !== statusFilter) return false;
      if (searchMy) {
        const q = searchMy.toLowerCase();
        const name = (agent.name || '').toLowerCase();
        const desc = (agent.description || '').toLowerCase();
        if (!name.includes(q) && !desc.includes(q)) return false;
      }
      return true;
    });
  }, [myAgents, searchMy, statusFilter]);

  const setTab = (nextTab: HubTab) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', nextTab);
    setSearchParams(next, { replace: true });
  };

  const handleAdopt = (agentId: string) => {
    adoptAgent.mutate(agentId, {
      onSuccess: (newAgent) => {
        navigate(`/playground/agent/${newAgent.id}`);
      },
    });
  };

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Агенты</h1>
        <Link to="/builder/agent">
          <Button>Создать агента</Button>
        </Link>
      </div>

      <div className="mb-6 flex items-center gap-2 rounded-lg border p-1 w-fit">
        <Button variant={tab === 'my' ? 'primary' : 'ghost'} size="sm" onClick={() => setTab('my')}>
          Мои агенты
        </Button>
        <Button variant={tab === 'search' ? 'primary' : 'ghost'} size="sm" onClick={() => setTab('search')}>
          Поиск
        </Button>
      </div>

      {tab === 'my' && (
        <>
          {myAgents && myAgents.length > 0 && (
            <div className="flex items-center gap-3 mb-6">
              <div className="flex-1">
                <Input
                  placeholder="Поиск по названию..."
                  value={searchMy}
                  onChange={(e) => setSearchMy(e.target.value)}
                />
              </div>
              <Select
                options={statusFilterOptions}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-40"
              />
            </div>
          )}

          {myAgentsLoading ? (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          ) : !myAgents || myAgents.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">У вас ещё нет агентов</p>
              <Link to="/builder/agent">
                <Button>Создать первого агента</Button>
              </Link>
            </div>
          ) : filteredMyAgents.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Ничего не найдено</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredMyAgents.map((agent) => {
                const myStats = statsMap?.[agent.id] ?? emptyStats;
                const totalStats: AgentStats = {
                  agent_id: agent.id,
                  total_runs: agent.total_runs ?? 0,
                  total_prompt_tokens: agent.total_prompt_tokens ?? 0,
                  total_completion_tokens: agent.total_completion_tokens ?? 0,
                  total_cost: agent.total_cost ?? '0',
                  total_latency_ms: agent.total_latency_ms ?? 0,
                  last_run_at: null,
                };
                return (
                  <Card key={agent.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">{agent.name}</CardTitle>
                        <div className="flex items-center gap-2">
                          <Badge variant={visibilityVariants[agent.visibility] ?? 'secondary'}>
                            {visibilityLabels[agent.visibility] ?? agent.visibility}
                          </Badge>
                          <Badge variant={statusVariants[agent.status] ?? 'secondary'}>
                            {statusLabels[agent.status] ?? agent.status}
                          </Badge>
                        </div>
                      </div>
                      {agent.description && (
                        <CardDescription>{agent.description}</CardDescription>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="mb-3 space-y-1">
                        <div className="text-xs text-muted-foreground">
                          Создан: {formatCreatedAt(agent.created_at)}
                        </div>
                        <StatsRow label="Всего:" stats={totalStats} />
                        {hasUsage(myStats) && (
                          <StatsRow label="Моё:" stats={myStats} />
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Link to={`/playground/agent/${agent.id}`}>
                          <Button variant="primary" size="sm">Запустить</Button>
                        </Link>
                        <Link to={`/builder/agent/${agent.id}`}>
                          <Button variant="outline" size="sm">Редактировать</Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm('Удалить этого агента?')) {
                              deleteAgent.mutate(agent.id);
                            }
                          }}
                        >
                          Удалить
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === 'search' && (
        <>
          <div className="mb-6">
            <Input
              placeholder="Искать агентов по названию, описанию или автору..."
              value={searchDiscover}
              onChange={(e) => setSearchDiscover(e.target.value)}
            />
          </div>

          {discoverLoading ? (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          ) : !discoverAgents || discoverAgents.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Публичные агенты не найдены</p>
            </div>
          ) : (
            <div className="space-y-3">
              {discoverAgents.map((agent) => {
                const totalStats: AgentStats = {
                  agent_id: agent.id,
                  total_runs: agent.total_runs ?? 0,
                  total_prompt_tokens: agent.total_prompt_tokens ?? 0,
                  total_completion_tokens: agent.total_completion_tokens ?? 0,
                  total_cost: agent.total_cost ?? '0',
                  total_latency_ms: agent.total_latency_ms ?? 0,
                  last_run_at: null,
                };
                const myStats = statsMap?.[agent.id] ?? emptyStats;

                return (
                  <Card key={agent.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between gap-4">
                        <CardTitle className="text-base">{agent.name}</CardTitle>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          Автор: {agent.owner_name || (agent.owner_username ? `@${agent.owner_username}` : 'пользователь')}
                        </span>
                      </div>
                      {agent.description && <CardDescription>{agent.description}</CardDescription>}
                    </CardHeader>
                    <CardContent>
                      <div className="mb-3 space-y-1">
                        <div className="text-xs text-muted-foreground">
                          Создан: {formatCreatedAt(agent.created_at)}
                        </div>
                        <StatsRow label="Всего:" stats={totalStats} />
                        {hasUsage(myStats) && (
                          <StatsRow label="Моё:" stats={myStats} />
                        )}
                      </div>
                      <div className="flex flex-col items-start gap-3">
                        <Button
                          size="sm"
                          onClick={() => handleAdopt(agent.id)}
                          disabled={adoptAgent.isPending}
                        >
                          Запустить
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
