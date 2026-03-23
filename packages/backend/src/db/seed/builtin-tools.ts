import { db } from '../../config/database.js';
import { toolDefinitions } from '../schema/agents.js';

const builtinTools = [
  {
    name: 'HTTP Request',
    slug: 'http-request',
    tool_type: 'http_request' as const,
    description: 'Выполняет HTTP-запрос к указанному URL. Поддерживает GET и POST.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL для запроса' },
        method: { type: 'string', enum: ['GET', 'POST'], default: 'GET' },
        headers: { type: 'object', additionalProperties: { type: 'string' } },
        body: { type: 'string', description: 'Тело запроса (для POST)' },
      },
      required: ['url'],
    },
    output_schema: {
      type: 'object',
      properties: {
        status: { type: 'number' },
        body: { type: 'string' },
      },
    },
    config_json: { timeout_ms: 10000, max_response_size: 51200 },
    is_builtin: true,
    is_active: true,
  },
  {
    name: 'Calculator',
    slug: 'calculator',
    tool_type: 'calculator' as const,
    description: 'Вычисляет математические выражения.',
    input_schema: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'Математическое выражение' },
      },
      required: ['expression'],
    },
    output_schema: {
      type: 'object',
      properties: {
        result: { type: 'number' },
      },
    },
    config_json: {},
    is_builtin: true,
    is_active: true,
  },
  {
    name: 'JSON Transform',
    slug: 'json-transform',
    tool_type: 'json_transform' as const,
    description: 'Трансформирует JSON-данные с помощью выражения JSONPath или маппинга.',
    input_schema: {
      type: 'object',
      properties: {
        input: { type: 'object', description: 'Входные JSON-данные' },
        transform: { type: 'string', description: 'Выражение трансформации' },
      },
      required: ['input', 'transform'],
    },
    output_schema: { type: 'object' },
    config_json: {},
    is_builtin: true,
    is_active: true,
  },
  {
    name: 'Template Renderer',
    slug: 'template-renderer',
    tool_type: 'template_renderer' as const,
    description: 'Рендерит текстовый шаблон с подстановкой переменных.',
    input_schema: {
      type: 'object',
      properties: {
        template: { type: 'string', description: 'Шаблон с {{переменными}}' },
        variables: { type: 'object', description: 'Значения переменных' },
      },
      required: ['template', 'variables'],
    },
    output_schema: {
      type: 'object',
      properties: {
        rendered: { type: 'string' },
      },
    },
    config_json: {},
    is_builtin: true,
    is_active: true,
  },
  {
    name: 'Webhook Call',
    slug: 'webhook-call',
    tool_type: 'webhook_call' as const,
    description: 'Отправляет POST-запрос на webhook URL с JSON-телом.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL вебхука' },
        payload: { type: 'object', description: 'JSON-данные для отправки' },
      },
      required: ['url', 'payload'],
    },
    output_schema: {
      type: 'object',
      properties: {
        status: { type: 'number' },
        response: { type: 'string' },
      },
    },
    config_json: { timeout_ms: 10000 },
    is_builtin: true,
    is_active: true,
  },
  {
    name: 'Mock Tool',
    slug: 'mock-tool',
    tool_type: 'mock_tool' as const,
    description: 'Возвращает заранее заданный ответ. Полезно для тестирования агентов.',
    input_schema: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'Любой входной текст' },
      },
      required: ['input'],
    },
    output_schema: { type: 'object' },
    config_json: { mock_response: { result: 'mock data' } },
    is_builtin: true,
    is_active: true,
  },
];

export async function seedBuiltinTools() {
  for (const tool of builtinTools) {
    await db
      .insert(toolDefinitions)
      .values(tool)
      .onConflictDoNothing({ target: toolDefinitions.slug });
  }
  console.log(`Seeded ${builtinTools.length} built-in tools`);
}
