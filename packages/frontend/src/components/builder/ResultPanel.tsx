import type { StackRecommendation, StackBuilderInput } from '@llmstore/shared';
import { RecommendedCard } from './RecommendedCard';
import { RationalePanel } from './RationalePanel';
import { ActionBar } from './ActionBar';
import { Badge } from '../ui';
import { costBandLabels } from '../../lib/label-maps';

interface ResultPanelProps {
  result: StackRecommendation;
  answers: StackBuilderInput;
  onReset: () => void;
}

const winnerSections: {
  key: keyof Pick<
    StackRecommendation,
    'best_overall' | 'cheapest' | 'best_privacy' | 'best_russian' | 'best_self_hosted'
  >;
  label: string;
  variant: 'primary' | 'secondary';
}[] = [
  { key: 'best_overall', label: 'Лучший выбор', variant: 'primary' },
  { key: 'cheapest', label: 'Самый доступный', variant: 'secondary' },
  { key: 'best_privacy', label: 'Лучшая приватность', variant: 'secondary' },
  { key: 'best_russian', label: 'Лучший для русского', variant: 'secondary' },
  { key: 'best_self_hosted', label: 'Лучший self-hosted', variant: 'secondary' },
];

export function ResultPanel({ result, answers, onReset }: ResultPanelProps) {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Рекомендации</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Оценили {result.all_scored.length} решений из каталога
          </p>
        </div>
        <Badge variant="outline" className="text-sm">
          {costBandLabels[result.cost_band]}
        </Badge>
      </div>

      {/* Action bar */}
      <ActionBar result={result} answers={answers} onReset={onReset} />

      {/* Winner cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {winnerSections.map(({ key, label, variant }) => {
          const item = result[key];
          if (!item) return null;
          return (
            <RecommendedCard key={key} item={item} label={label} variant={variant} />
          );
        })}
      </div>

      {/* Rationale */}
      <RationalePanel
        rationale={result.rationale}
        tradeoffs={result.tradeoffs}
        nextSteps={result.next_steps}
      />

      {/* All scored items table */}
      {result.all_scored.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Все оценённые решения ({result.all_scored.length})
          </h3>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium">#</th>
                  <th className="px-3 py-2 text-left font-medium">Название</th>
                  <th className="px-3 py-2 text-left font-medium">Тип</th>
                  <th className="px-3 py-2 text-right font-medium">Оценка</th>
                  <th className="px-3 py-2 text-center font-medium">Уверенность</th>
                </tr>
              </thead>
              <tbody>
                {result.all_scored.map((s, i) => (
                  <tr key={s.catalog_item.id} className="border-b last:border-0">
                    <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-2 font-medium">{s.catalog_item.title}</td>
                    <td className="px-3 py-2 text-muted-foreground">{s.catalog_item.type}</td>
                    <td className="px-3 py-2 text-right font-mono">{s.score}</td>
                    <td className="px-3 py-2 text-center">
                      <Badge
                        variant={
                          s.confidence === 'high'
                            ? 'success'
                            : s.confidence === 'medium'
                              ? 'warning'
                              : 'secondary'
                        }
                      >
                        {s.confidence}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
