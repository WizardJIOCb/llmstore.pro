import { useParams, useNavigate } from 'react-router-dom';
import { useAgent, useBuiltinTools, useCreateVersion } from '../../hooks/useAgents';
import { AgentForm } from '../../components/agents/AgentForm';
import { Spinner } from '../../components/ui/Spinner';
import { Button } from '../../components/ui/Button';

export function AgentEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: agent, isLoading } = useAgent(id);
  const { data: tools, isLoading: toolsLoading } = useBuiltinTools();
  const createVersion = useCreateVersion();

  if (isLoading || toolsLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground">Агент не найден</p>
      </div>
    );
  }

  const initialData = {
    name: agent.name,
    description: agent.description ?? '',
    system_prompt: agent.version?.system_prompt ?? '',
    tool_ids: agent.tools.map((t) => t.id),
    runtime_config: (agent.version?.runtime_config as {
      max_iterations: number;
      temperature: number;
      max_tokens: number;
    }) ?? { max_iterations: 4, temperature: 0.3, max_tokens: 4096 },
  };

  const handleSubmit = async (data: {
    name: string;
    description: string;
    system_prompt: string;
    tool_ids: string[];
    runtime_config: { max_iterations: number; temperature: number; max_tokens: number };
  }) => {
    await createVersion.mutateAsync({
      agentId: agent.id,
      system_prompt: data.system_prompt,
      tool_ids: data.tool_ids,
      runtime_config: data.runtime_config,
    });
    navigate(`/playground/agent/${agent.id}`);
  };

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Редактор: {agent.name}</h1>
        <Button variant="outline" size="sm" onClick={() => navigate(`/playground/agent/${agent.id}`)}>
          Площадка
        </Button>
      </div>

      <AgentForm
        initialData={initialData}
        tools={tools ?? []}
        onSubmit={handleSubmit}
        isSubmitting={createVersion.isPending}
        submitLabel="Сохранить новую версию"
      />

      {createVersion.isError && (
        <p className="mt-4 text-sm text-destructive">
          Ошибка: {(createVersion.error as Error).message}
        </p>
      )}
    </div>
  );
}
