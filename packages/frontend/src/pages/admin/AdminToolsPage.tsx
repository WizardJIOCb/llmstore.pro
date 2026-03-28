import { useMemo, useState } from 'react';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { Button, Badge, Spinner } from '../../components/ui';
import { useAdminTools, useCreateAdminTool, useDeleteAdminTool, useUpdateAdminTool } from '../../hooks/useAdmin';
import type { AdminTool } from '../../lib/api/admin';

const toolTypeOptions = [
  'http_request',
  'calculator',
  'json_transform',
  'template_renderer',
  'knowledge_lookup',
  'mock_tool',
  'webhook_call',
];

function prettyJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

export function AdminToolsPage() {
  const { data: tools, isLoading } = useAdminTools();
  const createTool = useCreateAdminTool();
  const deleteTool = useDeleteAdminTool();
  const updateTool = useUpdateAdminTool();

  const [editingToolId, setEditingToolId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [toolType, setToolType] = useState('http_request');
  const [description, setDescription] = useState('');
  const [isBuiltin, setIsBuiltin] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [inputSchemaText, setInputSchemaText] = useState(prettyJson({
    type: 'object',
    properties: {},
    additionalProperties: false,
  }));
  const [outputSchemaText, setOutputSchemaText] = useState('');
  const [configJsonText, setConfigJsonText] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const sortedTools = useMemo(() => tools ?? [], [tools]);

  const resetForm = () => {
    setEditingToolId(null);
    setName('');
    setSlug('');
    setToolType('http_request');
    setDescription('');
    setIsBuiltin(false);
    setIsActive(true);
    setInputSchemaText(prettyJson({
      type: 'object',
      properties: {},
      additionalProperties: false,
    }));
    setOutputSchemaText('');
    setConfigJsonText('');
    setFormError(null);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      const input_schema = JSON.parse(inputSchemaText || '{}');
      const output_schema = outputSchemaText.trim() ? JSON.parse(outputSchemaText) : null;
      const config_json = configJsonText.trim() ? JSON.parse(configJsonText) : null;

      const payload = {
        name: name.trim(),
        slug: slug.trim(),
        tool_type: toolType,
        description: description.trim() || null,
        input_schema,
        output_schema,
        config_json,
        is_builtin: isBuiltin,
        is_active: isActive,
      };

      if (editingToolId) {
        await updateTool.mutateAsync({ id: editingToolId, data: payload });
      } else {
        await createTool.mutateAsync(payload);
      }
      resetForm();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Не удалось создать инструмент');
    }
  };

  const startEdit = (tool: AdminTool) => {
    setEditingToolId(tool.id);
    setName(tool.name);
    setSlug(tool.slug);
    setToolType(tool.tool_type);
    setDescription(tool.description ?? '');
    setIsBuiltin(tool.is_builtin);
    setIsActive(tool.is_active);
    setInputSchemaText(prettyJson(tool.input_schema ?? {}));
    setOutputSchemaText(tool.output_schema ? prettyJson(tool.output_schema) : '');
    setConfigJsonText(tool.config_json ? prettyJson(tool.config_json) : '');
    setFormError(null);
  };

  const isSubmitting = createTool.isPending || updateTool.isPending;
  const isMutatingList = updateTool.isPending || deleteTool.isPending;

  return (
    <AdminLayout>
      <div className="mb-6">
        <h2 className="text-xl font-semibold">Инструменты</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Созданные активные инструменты будут доступны при создании агента.
        </p>
      </div>

      <form onSubmit={handleCreate} className="mb-8 space-y-4 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">{editingToolId ? 'Редактирование инструмента' : 'Новый инструмент'}</h3>
          {editingToolId && (
            <Button type="button" variant="outline" size="sm" onClick={resetForm}>
              Отменить редактирование
            </Button>
          )}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Название</label>
            <input
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Slug</label>
            <input
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="my-tool-slug"
              required
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Тип</label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={toolType}
              onChange={(e) => setToolType(e.target.value)}
            >
              {toolTypeOptions.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Описание</label>
            <input
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Input schema (JSON)</label>
            <textarea
              className="min-h-[140px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
              value={inputSchemaText}
              onChange={(e) => setInputSchemaText(e.target.value)}
            />
          </div>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Output schema (JSON, опционально)</label>
              <textarea
                className="min-h-[64px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
                value={outputSchemaText}
                onChange={(e) => setOutputSchemaText(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Config JSON (опционально)</label>
              <textarea
                className="min-h-[64px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
                value={configJsonText}
                onChange={(e) => setConfigJsonText(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isBuiltin} onChange={(e) => setIsBuiltin(e.target.checked)} />
            Builtin
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Active
          </label>
        </div>

        {formError && <p className="text-sm text-destructive">{formError}</p>}

        <div className="flex gap-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (editingToolId ? 'Сохраняю...' : 'Создаю...') : (editingToolId ? 'Сохранить изменения' : 'Создать инструмент')}
          </Button>
          <Button type="button" variant="outline" onClick={resetForm}>
            Сбросить
          </Button>
        </div>
      </form>

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Инструмент</th>
                <th className="px-4 py-3 text-left font-medium">Тип</th>
                <th className="px-4 py-3 text-left font-medium">Статус</th>
                <th className="px-4 py-3 text-left font-medium">Обновлен</th>
                <th className="px-4 py-3 text-right font-medium">Действия</th>
              </tr>
            </thead>
            <tbody>
              {sortedTools.map((tool) => (
                <tr key={tool.id} className="border-b hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="font-medium">{tool.name}</div>
                    <div className="text-xs text-muted-foreground">{tool.slug}</div>
                  </td>
                  <td className="px-4 py-3 text-xs">{tool.tool_type}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Badge variant={tool.is_active ? 'success' : 'secondary'}>
                        {tool.is_active ? 'active' : 'disabled'}
                      </Badge>
                      {tool.is_builtin && <Badge variant="outline">builtin</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(tool.updated_at).toLocaleDateString('ru-RU')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isMutatingList}
                        onClick={() => {
                          updateTool.mutate({
                            id: tool.id,
                            data: { is_active: !tool.is_active },
                          });
                        }}
                      >
                        {tool.is_active ? 'Отключить' : 'Включить'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isMutatingList}
                        onClick={() => startEdit(tool)}
                      >
                        Редактировать
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isMutatingList}
                        className="text-destructive hover:text-destructive"
                        onClick={() => {
                          if (confirm(`Удалить инструмент "${tool.name}"?`)) {
                            deleteTool.mutate(tool.id);
                          }
                        }}
                      >
                        Удалить
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
