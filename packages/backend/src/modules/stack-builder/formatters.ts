import type { StackRecommendation, ScoredItem } from '@llmstore/shared';

export function toJson(result: StackRecommendation): object {
  return { ...result };
}

export function toMarkdown(result: StackRecommendation): string {
  const lines: string[] = [];

  lines.push('# Рекомендация LLMStore Stack Builder');
  lines.push('');
  lines.push(`*Сгенерировано: ${result.generated_at}*`);
  lines.push('');

  // Winners
  const winners = [
    { label: 'Лучший выбор', item: result.best_overall },
    { label: 'Самый доступный', item: result.cheapest },
    { label: 'Лучший для приватности', item: result.best_privacy },
    { label: 'Лучший для русского языка', item: result.best_russian },
    { label: 'Лучший self-hosted', item: result.best_self_hosted },
  ];

  lines.push('## Рекомендованные решения');
  lines.push('');

  for (const w of winners) {
    if (!w.item) continue;
    lines.push(`### ${w.label}: ${w.item.catalog_item.title}`);
    lines.push('');
    if (w.item.catalog_item.short_description) {
      lines.push(w.item.catalog_item.short_description);
      lines.push('');
    }
    lines.push(`- **Оценка совместимости:** ${w.item.score}`);
    lines.push(`- **Тип:** ${w.item.catalog_item.type}`);
    lines.push(`- **Уверенность:** ${w.item.confidence}`);
    lines.push('');
  }

  // All scored
  if (result.all_scored.length > 0) {
    lines.push('## Все оценённые элементы');
    lines.push('');
    lines.push('| # | Название | Тип | Оценка | Уверенность |');
    lines.push('|---|---------|-----|--------|-------------|');
    result.all_scored.forEach((s: ScoredItem, i: number) => {
      lines.push(`| ${i + 1} | ${s.catalog_item.title} | ${s.catalog_item.type} | ${s.score} | ${s.confidence} |`);
    });
    lines.push('');
  }

  // Rationale
  if (result.rationale.length > 0) {
    lines.push('## Обоснование');
    lines.push('');
    for (const r of result.rationale) {
      lines.push(r);
      lines.push('');
    }
  }

  // Tradeoffs
  if (result.tradeoffs.length > 0) {
    lines.push('## Компромиссы');
    lines.push('');
    for (const t of result.tradeoffs) {
      lines.push(`- ${t}`);
    }
    lines.push('');
  }

  // Next steps
  if (result.next_steps.length > 0) {
    lines.push('## Следующие шаги');
    lines.push('');
    for (const ns of result.next_steps) {
      lines.push(`- ${ns}`);
    }
    lines.push('');
  }

  lines.push(`**Ценовая категория:** ${result.cost_band}`);
  lines.push('');
  lines.push('---');
  lines.push('*Сгенерировано LLMStore.pro Stack Builder*');

  return lines.join('\n');
}
