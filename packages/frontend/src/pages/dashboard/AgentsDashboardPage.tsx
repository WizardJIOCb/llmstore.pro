import { Link } from 'react-router-dom';
import { useAgentList, useDeleteAgent } from '../../hooks/useAgents';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';

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

export function AgentsDashboardPage() {
  const { data: agents, isLoading } = useAgentList();
  const deleteAgent = useDeleteAgent();

  if (isLoading) {
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

      {!agents || agents.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">У вас ещё нет агентов</p>
          <Link to="/builder/agent">
            <Button>Создать первого агента</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {agents.map((agent) => (
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
          ))}
        </div>
      )}
    </div>
  );
}
