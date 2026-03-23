import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui';
import { useAuth } from '../../hooks/useAuth';
import { useSaveResult, useExportResult, useCreateAgentFromStack } from '../../hooks/useStackBuilder';
import type { StackRecommendation, StackBuilderInput } from '@llmstore/shared';

interface ActionBarProps {
  result: StackRecommendation;
  answers: StackBuilderInput;
  onReset: () => void;
}

export function ActionBar({ result, answers, onReset }: ActionBarProps) {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const saveMutation = useSaveResult();
  const exportMutation = useExportResult();
  const createAgentMutation = useCreateAgentFromStack();
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    await saveMutation.mutateAsync({
      builder_answers: answers,
      recommended_result: result as unknown as Record<string, unknown>,
    });
    setSaved(true);
  };

  const handleExport = async (format: 'json' | 'markdown') => {
    const res = await exportMutation.mutateAsync({
      format,
      result: result as unknown as Record<string, unknown>,
    });
    // Download as file
    const blob = new Blob(
      [typeof res.data === 'string' ? res.data : JSON.stringify(res.data, null, 2)],
      { type: format === 'markdown' ? 'text/markdown' : 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stack-recommendation.${format === 'markdown' ? 'md' : 'json'}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCreateAgent = async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    const res = await createAgentMutation.mutateAsync({
      result: result as unknown as Record<string, unknown>,
    });
    navigate(res.redirect_url);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleSave}
        disabled={saved || saveMutation.isPending}
      >
        {saved ? 'Сохранено' : saveMutation.isPending ? 'Сохранение...' : 'Сохранить'}
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={() => handleExport('json')}
        disabled={exportMutation.isPending}
      >
        Экспорт JSON
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={() => handleExport('markdown')}
        disabled={exportMutation.isPending}
      >
        Экспорт Markdown
      </Button>

      <Button
        size="sm"
        onClick={handleCreateAgent}
        disabled={createAgentMutation.isPending || !result.best_overall}
      >
        {createAgentMutation.isPending ? 'Создание...' : 'Создать агента'}
      </Button>

      <div className="flex-1" />

      <Button variant="ghost" size="sm" onClick={onReset}>
        Начать заново
      </Button>
    </div>
  );
}
