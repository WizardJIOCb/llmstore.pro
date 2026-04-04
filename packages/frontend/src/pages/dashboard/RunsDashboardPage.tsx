import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useRunList } from '../../hooks/useAgents';
import { Card, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';

const statusLabels: Record<string, string> = {
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

const statusVariants: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  completed: 'default',
  failed: 'destructive',
  running: 'secondary',
  cancelled: 'outline',
};

export function RunsDashboardPage() {
  const [searchParams] = useSearchParams();
  const agentId = searchParams.get('agentId')?.trim() || undefined;
  const deploymentId = searchParams.get('deploymentId')?.trim() || undefined;
  const title = useMemo(() => {
    if (deploymentId) return 'Запуски deployment';
    if (agentId) return 'Запуски агента';
    return 'История запусков';
  }, [agentId, deploymentId]);
  const { data: runs, isLoading } = useRunList(agentId, deploymentId);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-2 text-2xl font-bold">{title}</h1>
      {(deploymentId || agentId) && (
        <p className="mb-6 break-all text-sm text-muted-foreground">
          {deploymentId ? `Deployment ID: ${deploymentId}` : `Agent ID: ${agentId}`}
        </p>
      )}

      {!runs || runs.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Запусков пока нет</p>
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map((run) => (
            <Card key={run.id}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={statusVariants[run.status] ?? 'secondary'}>
                        {statusLabels[run.status] ?? run.status}
                      </Badge>
                      {run.latency_ms != null && (
                        <span className="text-xs text-muted-foreground">
                          {(run.latency_ms / 1000).toFixed(1)}s
                        </span>
                      )}
                    </div>
                    {run.input_summary && (
                      <p className="text-sm truncate">{run.input_summary}</p>
                    )}
                    {run.output_summary && (
                      <p className="text-xs text-muted-foreground truncate mt-1">
                        {run.output_summary}
                      </p>
                    )}
                    {run.error_message && (
                      <p className="text-xs text-destructive truncate mt-1">
                        {run.error_message}
                      </p>
                    )}
                    {run.chat_id && (
                      <div className="mt-2">
                        <Link
                          to={`/chats?chat=${encodeURIComponent(run.chat_id)}`}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          {run.chat_title ? `Перейти в чат: ${run.chat_title}` : 'Перейти в чат'}
                        </Link>
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                    {new Date(run.started_at).toLocaleString('ru-RU')}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
