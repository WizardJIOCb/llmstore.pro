import { useParams, Link } from 'react-router-dom';
import { useSavedResult } from '../../hooks/useStackBuilder';
import { ResultPanel } from '../../components/builder/ResultPanel';
import { Spinner } from '../../components/ui';
import type { StackBuilderInput } from '@llmstore/shared';

export function SavedStackDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useSavedResult(id ?? '');

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <p className="text-lg text-muted-foreground">Результат не найден</p>
        <Link to="/dashboard/saved" className="mt-4 text-primary hover:underline">
          Вернуться к сохранённым
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <Link
          to="/dashboard/saved"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Сохранённые стеки
        </Link>
        {data.name && <h1 className="mt-2 text-2xl font-bold">{data.name}</h1>}
      </div>
      <ResultPanel
        result={data.recommended_result}
        answers={data.builder_answers as StackBuilderInput}
        onReset={() => window.location.assign('/builder/stack')}
      />
    </div>
  );
}
