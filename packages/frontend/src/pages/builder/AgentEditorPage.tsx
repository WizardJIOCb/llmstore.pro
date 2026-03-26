import { useParams, useNavigate } from 'react-router-dom';
import { useAgent, useBuiltinTools, useUpdateAgent, useDeleteAgent } from '../../hooks/useAgents';
import { AgentForm } from '../../components/agents/AgentForm';
import { Spinner } from '../../components/ui/Spinner';
import { Button } from '../../components/ui/Button';

export function AgentEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: agent, isLoading } = useAgent(id);
  const { data: tools, isLoading: toolsLoading } = useBuiltinTools();
  const updateAgent = useUpdateAgent();
  const deleteAgent = useDeleteAgent();

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

  const initialVisibility: 'public' | 'private' = agent.visibility === 'public' ? 'public' : 'private';
  const initialData = {
    name: agent.name,
    description: agent.description ?? '',
    visibility: initialVisibility,
    system_prompt: agent.version?.system_prompt ?? '',
    tool_ids: agent.tools.map((t) => t.id),
    runtime_config: (agent.version?.runtime_config as {
      max_iterations: number;
      temperature: number;
      max_tokens: number;
      chat_intro?: string;
      starter_prompts?: string[];
    }) ?? { max_iterations: 4, temperature: 0.3, max_tokens: 4096, chat_intro: '', starter_prompts: [] },
  };

  const handleSubmit = async (data: {
    name: string;
    description: string;
    visibility: 'public' | 'private';
    system_prompt: string;
    tool_ids: string[];
    runtime_config: {
      max_iterations: number;
      temperature: number;
      max_tokens: number;
      chat_intro?: string;
      starter_prompts?: string[];
    };
  }) => {
    await updateAgent.mutateAsync({
      id: agent.id,
      name: data.name,
      description: data.description,
      visibility: data.visibility,
      system_prompt: data.system_prompt,
      tool_ids: data.tool_ids,
      runtime_config: data.runtime_config,
    });
    navigate(`/playground/agent/${agent.id}`);
  };

  const handleDelete = async () => {
    const ok = window.confirm(`Удалить агента "${agent.name}"? Это действие нельзя отменить.`);
    if (!ok) return;
    await deleteAgent.mutateAsync(agent.id);
    navigate('/my/agents');
  };

  const isActive = agent.status === 'active';
  const handleToggleStatus = async () => {
    const nextStatus = isActive ? 'archived' : 'active';
    const ok = window.confirm(
      isActive
        ? `Отключить агента "${agent.name}"? Он исчезнет из выбора в новых чатах.`
        : `Включить агента "${agent.name}"? Он появится в выборе в новых чатах.`,
    );
    if (!ok) return;
    await updateAgent.mutateAsync({ id: agent.id, status: nextStatus });
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
        key={agent.id}
        initialData={initialData}
        tools={tools ?? []}
        onSubmit={handleSubmit}
        isSubmitting={updateAgent.isPending}
        submitLabel="Сохранить изменения"
        actions={[
          {
            label: isActive ? 'Отключить' : 'Включить',
            onClick: handleToggleStatus,
            disabled: updateAgent.isPending || deleteAgent.isPending,
            variant: 'outline',
          },
          {
            label: 'Удалить агента',
            onClick: handleDelete,
            disabled: updateAgent.isPending || deleteAgent.isPending,
            variant: 'destructive',
          },
        ]}
      />

      {updateAgent.isError && (
        <p className="mt-4 text-sm text-destructive">
          Ошибка сохранения: {(updateAgent.error as Error).message}
        </p>
      )}
      {deleteAgent.isError && (
        <p className="mt-2 text-sm text-destructive">
          Ошибка удаления: {(deleteAgent.error as Error).message}
        </p>
      )}
    </div>
  );
}
