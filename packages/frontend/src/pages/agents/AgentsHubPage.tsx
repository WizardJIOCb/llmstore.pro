import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAgentList, useDeleteAgent, useAgentStats } from '../../hooks/useAgents';
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

const emptyStats: AgentStats = {
  agent_id: '',
  total_runs: 0,
  total_prompt_tokens: 0,
  total_completion_tokens: 0,
  total_cost: '0',
  total_latency_ms: 0,
  last_run_at: null,
};

function StatsRow({ stats }: { stats: AgentStats }) {
  const totalTokens = stats.total_prompt_tokens + stats.total_completion_tokens;
  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground">
      <span title="Запусков">{stats.total_runs} запуск.</span>
      <span title="Токенов">{formatTokens(totalTokens)} ток.</span>
      <span title="Стоимость">{formatCost(stats.total_cost)}</span>
      <span title="Время">{formatTime(stats.total_latency_ms)}</span>
    </div>
  );
}

export function AgentsHubPage() {
  const { data: agents, isLoading: agentsLoading } = useAgentList();
  const { data: statsMap } = useAgentStats();
  const deleteAgent = useDeleteAgent();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const filtered = useMemo(() => {
    if (!agents) return [];
    return agents.filter((agent) => {
      if (statusFilter !== 'all' && agent.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const name = (agent.name || '').toLowerCase();
        const desc = (agent.description || '').toLowerCase();
        if (!name.includes(q) && !desc.includes(q)) return false;
      }
      return true;
    });
  }, [agents, search, statusFilter]);

  if (agentsLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Мои агенты</h1>
        <Link to="/builder/agent">
          <Button>Создать агента</Button>
        </Link>
      </div>

      {agents && agents.length > 0 && (
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1">
            <Input
              placeholder="Поиск по названию..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
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

      {!agents || agents.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">У вас ещё нет агентов</p>
          <Link to="/builder/agent">
            <Button>Создать первого агента</Button>
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Ничего не найдено</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((agent) => {
            const stats = statsMap?.[agent.id] ?? emptyStats;
            return (
              <Card key={agent.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{agent.name}</CardTitle>
                    <Badge variant={statusVariants[agent.status] ?? 'secondary'}>
                      {statusLabels[agent.status] ?? agent.status}
                    </Badge>
                  </div>
                  {agent.description && (
                    <CardDescription>{agent.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="mb-3">
                    <StatsRow stats={stats} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Link to={`/playground/agent/${agent.id}`}>
                      <Button variant="primary" size="sm">Площадка</Button>
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
    </div>
  );
}
