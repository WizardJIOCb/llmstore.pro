import { db } from '../../config/database.js';
import { toolDefinitions } from '../schema/agents.js';
import { chatConversations } from '../schema/runtime.js';
import { eq, sql } from 'drizzle-orm';

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
    name: 'Web Search Cascade',
    slug: 'web-search-cascade',
    tool_type: 'http_request' as const,
    description: 'Каскадный веб-поиск по нескольким бесплатным провайдерам с fallback на следующий источник при ошибке или пустой выдаче.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Поисковый запрос' },
        max_results: { type: 'number', description: 'Максимум результатов (по умолчанию 5)', default: 5 },
        topic: {
          type: 'string',
          enum: ['general', 'news'],
          description: 'Тип поиска: general или news',
          default: 'general',
        },
      },
      required: ['query'],
    },
    output_schema: {
      type: 'object',
      properties: {
        provider: { type: ['string', 'null'] },
        success: { type: 'boolean' },
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              url: { type: 'string' },
              snippet: { type: 'string' },
              source: { type: 'string' },
              published_at: { type: ['string', 'null'] },
            },
          },
        },
        attempts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              provider: { type: 'string' },
              status: { type: 'string' },
              reason: { type: 'string' },
              result_count: { type: 'number' },
            },
          },
        },
      },
    },
    config_json: {
      timeout_ms: 12000,
      max_results: 5,
      provider_order: ['tavily', 'brave', 'google_cse', 'exa', 'serpapi', 'duckduckgo_html'],
    },
    is_builtin: true,
    is_active: true,
  },
  {
    name: 'LLM Orchestrator Worker',
    slug: 'llm-orchestrator-worker',
    tool_type: 'knowledge_lookup' as const,
    description: 'Запускает отдельную worker-модель через OpenRouter для подзадачи оркестратора: frontend, backend, fullstack, analysis, content или review.',
    input_schema: {
      type: 'object',
      properties: {
        worker_role: {
          type: 'string',
          enum: ['frontend', 'backend', 'fullstack', 'analysis', 'content', 'review', 'general'],
          description: 'Тип worker-подзадачи',
          default: 'general',
        },
        task: { type: 'string', description: 'Подзадача для worker-модели' },
        context: { type: 'string', description: 'Дополнительный контекст, который нужно передать worker-модели' },
        constraints: { type: 'string', description: 'Ограничения, trade-offs и важные условия' },
        expected_output: { type: 'string', description: 'Какой результат ожидается от worker-модели' },
        preferred_model: { type: 'string', description: 'Необязательный override модели из разрешённого списка' },
      },
      required: ['task'],
    },
    output_schema: {
      type: 'object',
      properties: {
        worker_role: { type: 'string' },
        worker_model: { type: 'string' },
        requested_model: { type: 'string' },
        task: { type: 'string' },
        result: { type: 'string' },
        usage: {
          type: ['object', 'null'],
          properties: {
            provider: { type: 'string' },
            model_external_id: { type: 'string' },
            prompt_tokens: { type: 'number' },
            completion_tokens: { type: 'number' },
            total_tokens: { type: 'number' },
            estimated_cost: { type: 'string' },
          },
        },
      },
    },
    config_json: {
      timeout_ms: 90000,
      max_tokens: 4096,
      temperature: 0.2,
      allowed_models: [
        'anthropic/claude-sonnet-4.6',
        'openai/gpt-5.4',
        'openai/gpt-5.4-mini',
        'openai/gpt-5.3-codex',
        'qwen/qwen3-coder-plus',
        'google/gemini-2.5-pro',
        'moonshotai/kimi-k2.5',
      ],
      default_models_by_role: {
        frontend: 'anthropic/claude-sonnet-4.6',
        backend: 'qwen/qwen3-coder-plus',
        fullstack: 'openai/gpt-5.4',
        analysis: 'moonshotai/kimi-k2.5',
        content: 'anthropic/claude-sonnet-4.6',
        review: 'openai/gpt-5.3-codex',
        general: 'openai/gpt-5.4-mini',
      },
    },
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
    name: 'Create Chat Files',
    slug: 'create-chat-files',
    tool_type: 'mock_tool' as const,
    description: 'Creates downloadable files for the current chat response. Use it when the user asks for a file, export, report, dataset, code file, spreadsheet, CSV, XLSX, XLS, JSON, HTML, markdown, or similar artifact.',
    input_schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          minItems: 1,
          maxItems: 8,
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Download filename, for example report.md, data.csv, report.xlsx, or legacy-report.xls.',
              },
              mime_type: {
                type: 'string',
                description: 'Optional MIME type.',
              },
              content: {
                type: 'string',
                minLength: 1,
                description: 'Required unless content_base64 is provided. Non-empty UTF-8 file content. For .xlsx/.xls, provide table data as CSV, HTML table, markdown table, JSON array of objects, or JSON rows; the tool converts it to an Excel workbook.',
              },
              content_base64: {
                type: 'string',
                minLength: 1,
                description: 'Required unless content is provided. Non-empty base64 content for binary files.',
              },
            },
            required: ['name'],
          },
        },
      },
      required: ['files'],
    },
    output_schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              filename: { type: 'string' },
              original_name: { type: 'string' },
              mime_type: { type: 'string' },
              kind: { type: 'string' },
              size: { type: 'number' },
            },
          },
        },
      },
    },
    config_json: {
      max_files: 8,
      max_file_size_bytes: 2 * 1024 * 1024,
      max_total_size_bytes: 8 * 1024 * 1024,
    },
    is_builtin: true,
    is_active: true,
  },
  {
    name: 'Workspace List Files',
    slug: 'workspace-list-files',
    tool_type: 'mock_tool' as const,
    description: 'Lists files and directories in the current project workspace. Use before reading or editing when you need to discover paths.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Workspace directory path. Empty string means project root.', default: '' },
        max_items: { type: 'number', description: 'Maximum items to return, up to 200.', default: 200 },
      },
    },
    output_schema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              path: { type: 'string' },
              type: { type: 'string', enum: ['file', 'directory'] },
              size: { type: ['number', 'null'] },
              updated_at: { type: ['string', 'null'] },
            },
          },
        },
        truncated: { type: 'boolean' },
      },
    },
    config_json: { max_read_bytes: 512 * 1024, max_write_bytes: 1024 * 1024 },
    is_builtin: true,
    is_active: true,
  },
  {
    name: 'Workspace Read File',
    slug: 'workspace-read-file',
    tool_type: 'mock_tool' as const,
    description: 'Reads a UTF-8 text file from the current project workspace. Always read a file before editing it unless the user gave exact full content.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Workspace file path, for example README.md or src/App.tsx.' },
      },
      required: ['path'],
    },
    output_schema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
        size: { type: 'number' },
        updated_at: { type: 'string' },
      },
    },
    config_json: { max_read_bytes: 512 * 1024, max_write_bytes: 1024 * 1024 },
    is_builtin: true,
    is_active: true,
  },
  {
    name: 'Workspace Write File',
    slug: 'workspace-write-file',
    tool_type: 'mock_tool' as const,
    description: 'Creates, overwrites, or appends to a UTF-8 text file in the current project workspace. Use mode append for simple additions.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Workspace file path.' },
        content: { type: 'string', minLength: 1, description: 'Non-empty UTF-8 file content.' },
        mode: { type: 'string', enum: ['overwrite', 'append'], default: 'overwrite' },
      },
      required: ['path', 'content'],
    },
    output_schema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        mode: { type: 'string' },
        size: { type: 'number' },
        updated_at: { type: 'string' },
      },
    },
    config_json: { max_read_bytes: 512 * 1024, max_write_bytes: 1024 * 1024 },
    is_builtin: true,
    is_active: true,
  },
  {
    name: 'Workspace Edit File',
    slug: 'workspace-edit-file',
    tool_type: 'mock_tool' as const,
    description: 'Edits an existing workspace text file by exact string replacement. Read the file first, then provide exact search text and replacement.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Workspace file path.' },
        search: { type: 'string', minLength: 1, description: 'Exact text to find.' },
        replace: { type: 'string', description: 'Replacement text.' },
        replace_all: { type: 'boolean', default: false, description: 'Replace all matches instead of just the first one.' },
      },
      required: ['path', 'search', 'replace'],
    },
    output_schema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        replacements: { type: 'number' },
        available_matches: { type: 'number' },
        size: { type: 'number' },
        updated_at: { type: 'string' },
      },
    },
    config_json: { max_read_bytes: 512 * 1024, max_write_bytes: 1024 * 1024 },
    is_builtin: true,
    is_active: true,
  },
  {
    name: 'Workspace Delete File',
    slug: 'workspace-delete-file',
    tool_type: 'mock_tool' as const,
    description: 'Deletes one file from the current project workspace. Use only when the user explicitly asks to delete a file.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Workspace file path to delete.' },
      },
      required: ['path'],
    },
    output_schema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        deleted: { type: 'boolean' },
        size: { type: 'number' },
      },
    },
    config_json: { max_read_bytes: 512 * 1024, max_write_bytes: 1024 * 1024 },
    is_builtin: true,
    is_active: true,
  },
  {
    name: 'DTF Latest Feed',
    slug: 'dtf-latest-feed',
    tool_type: 'http_request' as const,
    description: 'Получает список последних статей с DTF.ru, отсортированный по дате публикации: самые новые сверху. Возвращает заголовки, авторов, ссылки и статистику.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Количество статей (по умолчанию 10)', default: 10 },
      },
    },
    output_schema: {
      type: 'object',
      properties: {
        articles: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              url: { type: 'string' },
              author: { type: 'string' },
              snippet: { type: 'string' },
              published_at: { type: ['string', 'null'] },
              comments_count: { type: 'number' },
              reactions_count: { type: 'number' },
              reactions_summary: { type: 'string' },
              reaction_breakdown: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'number' },
                    label: { type: 'string' },
                    count: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      },
    },
    config_json: { handler: 'dtf_latest_feed', timeout_ms: 15000 },
    is_builtin: true,
    is_active: true,
  },
  {
    name: 'DTF Article Fetch',
    slug: 'dtf-article-fetch',
    tool_type: 'http_request' as const,
    description: 'Загружает и извлекает текст конкретной статьи с DTF.ru по URL.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL статьи на DTF.ru' },
      },
      required: ['url'],
    },
    output_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        author: { type: 'string' },
        text: { type: 'string' },
        published_at: { type: 'string' },
      },
    },
    config_json: { handler: 'dtf_article_fetch', timeout_ms: 15000, allowed_domains: ['dtf.ru'] },
    is_builtin: true,
    is_active: true,
  },
  {
    name: 'DTF Search Articles',
    slug: 'dtf-search-articles',
    tool_type: 'http_request' as const,
    description: 'Ищет статьи на DTF.ru по теме, игре, компании, человеку или ключевому слову. Результаты возвращаются по дате публикации: самые новые сверху. Подходит для запросов вроде "новости по Doom", "что пишут про Silent Hill" или "материалы про Nintendo".',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Поисковый запрос: игра, тема, компания, персона или ключевые слова',
        },
        period: {
          type: 'string',
          enum: ['day', 'week', 'month', 'year', 'all'],
          description: 'Период фильтрации результатов: day — за день, week — за неделю, month — за месяц, year — за год, all — за всё доступное время',
          default: 'all',
        },
        limit: {
          type: 'number',
          description: 'Количество статей (по умолчанию 10, максимум 30)',
          default: 10,
        },
      },
      required: ['query'],
    },
    output_schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        period: { type: 'string' },
        articles: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              url: { type: 'string' },
              author: { type: 'string' },
              snippet: { type: 'string' },
              published_at: { type: ['string', 'null'] },
              comments_count: { type: 'number' },
              reactions_count: { type: 'number' },
              reactions_summary: { type: 'string' },
              favorites_count: { type: 'number' },
              views_count: { type: 'number' },
              is_editorial: { type: 'boolean' },
            },
          },
        },
        fetched_at: { type: 'string' },
      },
    },
    config_json: { handler: 'dtf_search_articles', timeout_ms: 20000 },
    is_builtin: true,
    is_active: true,
  },
  {
    name: 'DTF Popular Feed',
    slug: 'dtf-popular-feed',
    tool_type: 'http_request' as const,
    description: 'Получает популярные/обсуждаемые статьи с DTF, отсортированные по количеству комментариев. Позволяет фильтровать по периоду: за день, неделю, месяц.',
    input_schema: {
      type: 'object',
      properties: {
        sorting: {
          type: 'string',
          enum: ['hotness', 'popular'],
          description: 'Тип сортировки: hotness — актуальные горячие темы, popular — популярные статьи',
          default: 'hotness',
        },
        period: {
          type: 'string',
          enum: ['day', 'week', 'month', 'year', 'all'],
          description: 'Период фильтрации: day — за день, week — за неделю, month — за месяц, year — за год, all — за всё время',
          default: 'day',
        },
        limit: {
          type: 'number',
          description: 'Количество статей (по умолчанию 10)',
          default: 10,
        },
      },
    },
    output_schema: {
      type: 'object',
      properties: {
        articles: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              url: { type: 'string' },
              author: { type: 'string' },
              snippet: { type: 'string' },
              published_at: { type: ['string', 'null'] },
              comments_count: { type: 'number' },
              reactions_count: { type: 'number' },
              reactions_summary: { type: 'string' },
              reaction_breakdown: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'number' },
                    label: { type: 'string' },
                    count: { type: 'number' },
                  },
                },
              },
              favorites_count: { type: 'number' },
            },
          },
        },
        sorting: { type: 'string' },
        period: { type: 'string' },
      },
    },
    config_json: { handler: 'dtf_popular_feed', timeout_ms: 15000 },
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
      .onConflictDoUpdate({
        target: toolDefinitions.slug,
        set: {
          name: tool.name,
          tool_type: tool.tool_type,
          description: tool.description,
          input_schema: tool.input_schema,
          output_schema: tool.output_schema,
          config_json: tool.config_json,
          is_builtin: tool.is_builtin,
          is_active: tool.is_active,
        },
      });
  }
  const [fileTool] = await db
    .select({ id: toolDefinitions.id })
    .from(toolDefinitions)
    .where(eq(toolDefinitions.slug, 'create-chat-files'))
    .limit(1);

  if (fileTool) {
    await db.update(chatConversations)
      .set({
        settings_json: sql<Record<string, unknown>>`jsonb_set(
          coalesce(${chatConversations.settings_json}, '{}'::jsonb),
          '{tool_ids}',
          case
            when coalesce(
              case
                when jsonb_typeof(${chatConversations.settings_json}->'tool_ids') = 'array'
                  then ${chatConversations.settings_json}->'tool_ids'
                else '[]'::jsonb
              end,
              '[]'::jsonb
            ) ? ${fileTool.id}
            then coalesce(
              case
                when jsonb_typeof(${chatConversations.settings_json}->'tool_ids') = 'array'
                  then ${chatConversations.settings_json}->'tool_ids'
                else '[]'::jsonb
              end,
              '[]'::jsonb
            )
            else coalesce(
              case
                when jsonb_typeof(${chatConversations.settings_json}->'tool_ids') = 'array'
                  then ${chatConversations.settings_json}->'tool_ids'
                else '[]'::jsonb
              end,
              '[]'::jsonb
            ) || to_jsonb(${fileTool.id}::text)
          end,
          true
        )`,
        updated_at: new Date(),
      })
      .where(eq(chatConversations.mode, 'general'));
  }
  console.log(`Seeded ${builtinTools.length} built-in tools`);
}
