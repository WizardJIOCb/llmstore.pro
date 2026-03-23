import type { ToolDefinition } from '../../lib/api/agents';

interface ToolSelectorProps {
  tools: ToolDefinition[];
  selected: string[];
  onChange: (ids: string[]) => void;
}

export function ToolSelector({ tools, selected, onChange }: ToolSelectorProps) {
  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  if (tools.length === 0) {
    return <p className="text-sm text-muted-foreground">Нет доступных инструментов</p>;
  }

  return (
    <div className="space-y-2">
      {tools.map((tool) => (
        <label
          key={tool.id}
          className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-accent/50 transition-colors"
        >
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-input"
            checked={selected.includes(tool.id)}
            onChange={() => toggle(tool.id)}
          />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">{tool.name}</div>
            <div className="text-xs text-muted-foreground truncate">{tool.description}</div>
          </div>
        </label>
      ))}
    </div>
  );
}
