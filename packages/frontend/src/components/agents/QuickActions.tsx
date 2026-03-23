import { Button } from '../ui/Button';

const quickActions = [
  { label: 'Последние новости', prompt: 'Покажи 10 последних постов на DTF' },
  { label: 'Топ за день', prompt: 'Какие самые обсуждаемые статьи на DTF сегодня?' },
  { label: 'Краткий пересказ', prompt: 'Получи последние статьи и сделай краткий пересказ самой интересной' },
];

interface QuickActionsProps {
  onSelect: (prompt: string) => void;
  disabled?: boolean;
}

export function QuickActions({ onSelect, disabled }: QuickActionsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {quickActions.map((action) => (
        <Button
          key={action.label}
          variant="outline"
          size="sm"
          onClick={() => onSelect(action.prompt)}
          disabled={disabled}
        >
          {action.label}
        </Button>
      ))}
    </div>
  );
}
