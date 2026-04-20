import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';

interface Template {
  id: string;
  name: string;
  description: string;
  icon: string;
}

const templates: Template[] = [
  {
    id: 'agent-wizard',
    name: 'Мастер создания агента',
    description: 'Пошаговый конструктор: ответьте на вопросы о роли, действиях, тоне и правилах, и получите готового агента.',
    icon: '🧭',
  },
  {
    id: 'dtf-news',
    name: 'DTF News Agent',
    description: 'AI-агент для получения и анализа новостей с DTF.ru. Умеет получать ленту статей, загружать полный текст и делать краткие пересказы.',
    icon: '📰',
  },
  {
    id: 'openrouter-coding',
    name: 'OpenRouter Coding Agent',
    description: 'Агент для задач по разработке: принимает ТЗ и кодовые файлы, показывает ход работы, список изменённых файлов и может вернуть preview прямо в чате.',
    icon: '🛠',
  },
  {
    id: 'landing-web-search',
    name: 'Landing Builder + Web Search',
    description: 'Агент для лендингов: сначала читает ссылки из промпта через HTTP Request, затем добирает факты через Web Search Cascade и возвращает HTML preview без шаблонной отсебятины.',
    icon: '🛰',
  },
  {
    id: 'creative-landing-builder',
    name: 'Creative Landing Builder',
    description: 'Creative-first агент для ярких, мемных, сюжетных и более дерзких лендингов: сначала собирает фактуру по ссылкам и поиску, затем превращает её в сильный визуальный концепт.',
    icon: '🎭',
  },
  {
    id: 'kimi-orchestrator',
    name: 'Kimi K2.5 Orchestrator',
    description: 'Отдельный orchestration-first шаблон под лендинги, large fullstack и большую аналитику: сначала план и декомпозиция, потом код.',
    icon: '🧩',
  },
  {
    id: 'blank',
    name: 'Пустой агент',
    description: 'Создайте агента с нуля. Выберите инструменты и напишите системный промпт самостоятельно.',
    icon: '🤖',
  },
];

interface TemplatePickerProps {
  onSelect: (templateId: string) => void;
}

export function TemplatePicker({ onSelect }: TemplatePickerProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {templates.map((t) => (
        <Card
          key={t.id}
          className="cursor-pointer transition-colors hover:border-primary"
          onClick={() => onSelect(t.id)}
        >
          <CardHeader>
            <div className="mb-2 text-3xl">{t.icon}</div>
            <CardTitle>{t.name}</CardTitle>
            <CardDescription>{t.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" size="sm" className="w-full">
              Выбрать
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
