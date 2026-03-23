import { Link } from 'react-router-dom';
import { useSavedResults } from '../../hooks/useStackBuilder';
import { Spinner, Badge, Card, CardContent } from '../../components/ui';
import { costBandLabels, wizardUseCaseLabels } from '../../lib/label-maps';
import type { WizardUseCase, CostBand } from '@llmstore/shared';

export function SavedStacksPage() {
  const { data: results, isLoading } = useSavedResults();

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Сохранённые стеки</h1>
        <Link
          to="/builder/stack"
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Новый стек
        </Link>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : !results || results.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-lg text-muted-foreground">Нет сохранённых стеков</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Пройдите конструктор и сохраните рекомендацию
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {results.map((r) => (
            <Link key={r.id} to={`/dashboard/saved/${r.id}`} className="block">
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <h3 className="font-medium">
                      {r.name ?? 'Без названия'}
                    </h3>
                    <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                      <span>
                        {wizardUseCaseLabels[r.builder_answers.use_case as WizardUseCase] ??
                          r.builder_answers.use_case}
                      </span>
                      <span>&middot;</span>
                      <span>{new Date(r.created_at).toLocaleDateString('ru-RU')}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      {costBandLabels[r.recommended_result.cost_band as CostBand] ??
                        r.recommended_result.cost_band}
                    </Badge>
                    <span className="text-lg font-bold text-primary">
                      {r.recommended_result.best_overall?.score ?? '—'}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
