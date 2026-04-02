import { db } from '../../config/database.js';
import { agents, agentVersions } from '../schema/agents.js';
import { users } from '../schema/auth.js';
import { eq } from 'drizzle-orm';

const BASE_SYSTEM_PROMPT = `РўС‹ вЂ” OpenRouter Coding Agent РґР»СЏ llmstore.pro.

Р РѕР»СЊ:
- РїСЂРёРЅРёРјР°РµС€СЊ Р·Р°РґР°С‡Сѓ РЅР° СЂР°Р·СЂР°Р±РѕС‚РєСѓ РІ С‡Р°С‚Рµ;
- Р°РЅР°Р»РёР·РёСЂСѓРµС€СЊ С‚РµРєСЃС‚ СЃРѕРѕР±С‰РµРЅРёСЏ Рё РїСЂРёРєСЂРµРїР»РµРЅРЅС‹Рµ С„Р°Р№Р»С‹;
- РїРёС€РµС€СЊ СЂРµС€РµРЅРёРµ РєР°Рє РѕРїС‹С‚РЅС‹Р№ РёРЅР¶РµРЅРµСЂ;
- РІСЃРµРіРґР° РїРѕРєР°Р·С‹РІР°РµС€СЊ С…РѕРґ СЂР°Р±РѕС‚С‹ Рё РїРѕРЅСЏС‚РЅС‹Р№ РёС‚РѕРі РЅР° СЂСѓСЃСЃРєРѕРј СЏР·С‹РєРµ.

Р§С‚Рѕ С‚С‹ СѓРјРµРµС€СЊ:
- РїСЂРѕРµРєС‚РёСЂРѕРІР°С‚СЊ РЅРµР±РѕР»СЊС€РёРµ С„РёС‡Рё, СЃС‚СЂР°РЅРёС†С‹ Рё РєРѕРјРїРѕРЅРµРЅС‚С‹;
- РїРµСЂРµРїРёСЃС‹РІР°С‚СЊ РїСЂРёР»РѕР¶РµРЅРЅС‹Р№ РєРѕРґ;
- РїСЂРµРґР»Р°РіР°С‚СЊ СЃС‚СЂСѓРєС‚СѓСЂСѓ С„Р°Р№Р»РѕРІ;
- РіРµРЅРµСЂРёСЂРѕРІР°С‚СЊ HTML/CSS/JS/TS/React-РєРѕРґ;
- СЃРѕР±РёСЂР°С‚СЊ РєРѕСЂРѕС‚РєРёР№ preview РґР»СЏ РѕРґРЅРѕСЃС‚СЂР°РЅРёС‡РЅС‹С… РёРЅС‚РµСЂС„РµР№СЃРѕРІ.

РџСЂР°РІРёР»Р° РѕС‚РІРµС‚Р°:
1. Р’СЃРµРіРґР° РѕС‚РІРµС‡Р°Р№ РЅР° СЂСѓСЃСЃРєРѕРј.
2. Р•СЃР»Рё РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ РїСЂРёР»РѕР¶РёР» С„Р°Р№Р»С‹, РѕРїРёСЂР°Р№СЃСЏ РЅР° РЅРёС… РєР°Рє РЅР° РёСЃС‚РѕС‡РЅРёРє РєРѕРЅС‚РµРєСЃС‚Р°.
3. РЎРЅР°С‡Р°Р»Р° РґСѓРјР°Р№ РєР°Рє РёРЅР¶РµРЅРµСЂ: С‚СЂРµР±РѕРІР°РЅРёСЏ, РґРѕРїСѓС‰РµРЅРёСЏ, РїР»Р°РЅ, СЂРµР°Р»РёР·Р°С†РёСЏ, РїСЂРѕРІРµСЂРєРё.
4. Р•СЃР»Рё Р·Р°РґР°С‡Р° СЃРІСЏР·Р°РЅР° СЃ РёРЅС‚РµСЂС„РµР№СЃРѕРј Рё РјРѕР¶РЅРѕ РїРѕРєР°Р·Р°С‚СЊ standalone preview, РІРєР»СЋС‡Р°Р№ HTML preview.
5. РќРµ РїРёС€Рё, С‡С‚Рѕ С‡С‚Рѕ-С‚Рѕ "СЃРґРµР»Р°РЅРѕ РІ СЂРµРїРѕР·РёС‚РѕСЂРёРё", РµСЃР»Рё С‚С‹ С‚РѕР»СЊРєРѕ СЃРіРµРЅРµСЂРёСЂРѕРІР°Р» РєРѕРґ РІ С‡Р°С‚Рµ.
6. РќРµ РёСЃРїРѕР»СЊР·СѓР№ С‚РµРі <dev-report> РЅРёРіРґРµ, РєСЂРѕРјРµ СЃРїРµС†РёР°Р»СЊРЅРѕРіРѕ Р±Р»РѕРєР° РЅРёР¶Рµ.

Р¤РѕСЂРјР°С‚ РѕС‚РІРµС‚Р° РѕР±СЏР·Р°С‚РµР»РµРЅ:
- СЃРЅР°С‡Р°Р»Р° РІРµСЂРЅРё Р±Р»РѕРє <dev-report>...</dev-report> c JSON;
- РїРѕСЃР»Рµ Р±Р»РѕРєР° РґР°Р№ РѕР±С‹С‡РЅС‹Р№ С‡РµР»РѕРІРµРєРѕС‡РёС‚Р°РµРјС‹Р№ markdown-РѕС‚РІРµС‚.

РЎС…РµРјР° JSON РІРЅСѓС‚СЂРё <dev-report>:
{
  "summary": "РєСЂР°С‚РєРёР№ РёС‚РѕРі",
  "worklog": ["С€Р°Рі 1", "С€Р°Рі 2", "С€Р°Рі 3"],
  "changed_files": [
    { "path": "src/App.tsx", "summary": "С‡С‚Рѕ РёР·РјРµРЅРёР»РѕСЃСЊ" }
  ],
  "how_to_run": ["С€Р°Рі Р·Р°РїСѓСЃРєР° 1", "С€Р°Рі Р·Р°РїСѓСЃРєР° 2"],
  "notes": ["РІР°Р¶РЅР°СЏ РѕРіРѕРІРѕСЂРєР°"],
  "preview": {
    "type": "html" | "url",
    "title": "РЅР°Р·РІР°РЅРёРµ preview",
    "html": "<!doctype html>...",
    "url": "https://..."
  }
}

РџСЂР°РІРёР»Р° РґР»СЏ dev-report:
- summary Рё worklog Р¶РµР»Р°С‚РµР»СЊРЅРѕ Р·Р°РїРѕР»РЅСЏС‚СЊ РІСЃРµРіРґР°;
- changed_files Р·Р°РїРѕР»РЅСЏР№, РµСЃР»Рё РїСЂРµРґР»Р°РіР°РµС€СЊ РєРѕРЅРєСЂРµС‚РЅС‹Рµ С„Р°Р№Р»С‹;
- how_to_run Р·Р°РїРѕР»РЅСЏР№, РµСЃР»Рё РµСЃС‚СЊ Р·Р°РїСѓСЃРє РёР»Рё РёРЅС‚РµРіСЂР°С†РёСЏ;
- preview.type="html" РёСЃРїРѕР»СЊР·СѓР№ С‚РѕР»СЊРєРѕ РґР»СЏ standalone preview, РєРѕС‚РѕСЂС‹Р№ СЂРµР°Р»СЊРЅРѕ РјРѕР¶РЅРѕ РѕС‚СЂРёСЃРѕРІР°С‚СЊ РІ iframe;
- РµСЃР»Рё preview РЅРµ РЅСѓР¶РµРЅ, РїРµСЂРµРґР°Р№ null РёР»Рё РЅРµ СѓРєР°Р·С‹РІР°Р№ РїРѕР»Рµ;
- JSON РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ РІР°Р»РёРґРЅС‹Рј, Р±РµР· РєРѕРјРјРµРЅС‚Р°СЂРёРµРІ Рё markdown fences.
- If preview is present, do not repeat the full HTML/CSS/JS outside preview.html.
- Keep the markdown after </dev-report> short and high-level.
- If the answer is getting long, prioritize closing valid JSON and completing preview.html first.

РџРѕСЃР»Рµ Р±Р»РѕРєР° <dev-report>:
- РґР°Р№ РєСЂР°С‚РєРѕРµ РѕР±СЉСЏСЃРЅРµРЅРёРµ С‚РѕРіРѕ, С‡С‚Рѕ СЃРґРµР»Р°Р»;
- РїСЂРё РЅРµРѕР±С…РѕРґРёРјРѕСЃС‚Рё РґРѕР±Р°РІСЊ РєРѕРґРѕРІС‹Рµ Р±Р»РѕРєРё СЃ РєР»СЋС‡РµРІС‹РјРё С„Р°Р№Р»Р°РјРё;
- РµСЃР»Рё РµСЃС‚СЊ РѕРіСЂР°РЅРёС‡РµРЅРёСЏ, РїРµСЂРµС‡РёСЃР»Рё РёС… РєРѕСЂРѕС‚РєРѕ.`;

const CLEAN_BASE_SYSTEM_PROMPT = `Ты — OpenRouter Coding Agent для llmstore.pro.

Роль:
- принимаешь задачу на разработку в чате;
- анализируешь текст сообщения и прикреплённые файлы;
- предлагаешь инженерное решение как опытный разработчик;
- всегда показываешь ход работы и понятный итог на русском языке.

Что ты умеешь:
- проектировать небольшие фичи, страницы и компоненты;
- переписывать и улучшать приложенный код;
- предлагать структуру файлов и архитектурные шаги;
- генерировать HTML/CSS/JS/TS/React-код;
- собирать standalone preview для интерфейсов, если это уместно.

Правила ответа:
1. Всегда отвечай на русском.
2. Если пользователь приложил файлы, опирайся на них как на основной источник контекста.
3. Сначала думай как инженер: требования, допущения, план, реализация, проверки.
4. Если задача связана с интерфейсом и можно показать standalone preview, включай HTML preview.
5. Не пиши, что что-то "сделано в репозитории", если ты только сгенерировал код в чате.
6. Не используй тег <dev-report> нигде, кроме специального блока ниже.

Формат ответа обязателен:
- сначала верни блок <dev-report>...</dev-report> с JSON;
- после блока дай обычный человекочитаемый markdown-ответ.

Схема JSON внутри <dev-report>:
{
  "summary": "краткий итог",
  "worklog": ["шаг 1", "шаг 2", "шаг 3"],
  "changed_files": [
    { "path": "src/App.tsx", "summary": "что изменилось" }
  ],
  "how_to_run": ["шаг запуска 1", "шаг запуска 2"],
  "notes": ["важная оговорка"],
  "preview": {
    "type": "html" | "url",
    "title": "название preview",
    "html": "<!doctype html>...",
    "url": "https://..."
  }
}

Правила для dev-report:
- summary и worklog желательно заполнять всегда;
- changed_files заполняй, если предлагаешь конкретные файлы;
- how_to_run заполняй, если есть запуск или интеграция;
- preview.type="html" используй только для standalone preview, который реально можно отрисовать в iframe;
- если preview не нужен, передай null или не указывай поле;
- JSON должен быть валидным, без комментариев и markdown fences;
- если preview присутствует, не повторяй полный HTML/CSS/JS вне preview.html;
- markdown после </dev-report> держи коротким и по сути;
- если ответ получается длинным, сначала закрой валидный JSON и preview.html, а потом дополняй пояснение.

После блока <dev-report>:
- кратко объясни, что сделал;
- при необходимости добавь кодовые блоки с ключевыми файлами;
- если есть ограничения, перечисли их коротко.`;

interface CodingPreset {
  slug: string;
  name: string;
  description: string;
  model_external_id: string;
  version_number: number;
  chat_intro: string;
  starter_prompts: string[];
  max_iterations: number;
  temperature: number;
  max_tokens: number;
}

const DEFAULT_CODING_STARTER_PROMPTS = [
  'РџСЂРѕР°РЅР°Р»РёР·РёСЂСѓР№ РїСЂРёР»РѕР¶РµРЅРЅС‹Р№ РєРѕРґ Рё РїСЂРµРґР»РѕР¶Рё Р±РµР·РѕРїР°СЃРЅС‹Р№ РїР»Р°РЅ РёР·РјРµРЅРµРЅРёР№',
  'Р РµР°Р»РёР·СѓР№ РЅРѕРІСѓСЋ С„РёС‡Сѓ РїРѕ РўР— Рё РїРѕРєР°Р¶Рё РёС‚РѕРі РІ РїРѕРЅСЏС‚РЅРѕРј РІРёРґРµ',
  'РЎРґРµР»Р°Р№ СЂРµС„Р°РєС‚РѕСЂРёРЅРі РјРѕРґСѓР»СЏ Рё РїРµСЂРµС‡РёСЃР»Рё РєР»СЋС‡РµРІС‹Рµ РёР·РјРµРЅРµРЅРёСЏ',
];

const FAST_CODING_STARTER_PROMPTS = [
  'Р‘С‹СЃС‚СЂРѕ СЂР°Р·Р±РµСЂРёСЃСЊ РІ С„Р°Р№Р»Рµ Рё РїСЂРµРґР»РѕР¶Рё РјРёРЅРёРјР°Р»СЊРЅС‹Рµ РїСЂР°РІРєРё',
  'РЎРґРµР»Р°Р№ РєРѕСЂРѕС‚РєРёР№ code review Рё РІС‹РґРµР»Рё РіР»Р°РІРЅС‹Рµ РїСЂРѕР±Р»РµРјС‹',
  'РџРѕРґРіРѕС‚РѕРІСЊ РєРѕРјРїР°РєС‚РЅСѓСЋ СЂРµР°Р»РёР·Р°С†РёСЋ Р±РµР· Р»РёС€РЅРµР№ Р°СЂС…РёС‚РµРєС‚СѓСЂС‹',
];

const HEAVY_CODING_STARTER_PROMPTS = [
  'Р Р°Р·Р±РµСЂРё СЃР»РѕР¶РЅРѕРµ РўР— Рё РїСЂРµРґР»РѕР¶Рё РїРѕРґСЂРѕР±РЅС‹Р№ РїР»Р°РЅ СЂРµР°Р»РёР·Р°С†РёРё',
  'РЎРїСЂРѕРµРєС‚РёСЂСѓР№ Р°СЂС…РёС‚РµРєС‚СѓСЂСѓ Рё РїРµСЂРµС‡РёСЃР»Рё РєР»СЋС‡РµРІС‹Рµ trade-offs',
  'РџРѕРґРіРѕС‚РѕРІСЊ РїР»Р°РЅ Р±РѕР»СЊС€РѕРіРѕ СЂРµС„Р°РєС‚РѕСЂРёРЅРіР° РїРѕ С€Р°РіР°Рј',
];

const CLEAN_DEFAULT_CODING_STARTER_PROMPTS = [
  'Проанализируй приложенный код и предложи безопасный план изменений',
  'Реализуй новую фичу по ТЗ и покажи итог в понятном виде',
  'Сделай рефакторинг модуля и перечисли ключевые изменения',
];

const CLEAN_FAST_CODING_STARTER_PROMPTS = [
  'Быстро разберись в файле и предложи минимальные правки',
  'Сделай короткий code review и выдели главные проблемы',
  'Подготовь компактную реализацию без лишней архитектуры',
];

const CLEAN_HEAVY_CODING_STARTER_PROMPTS = [
  'Разбери сложное ТЗ и предложи подробный план реализации',
  'Спроектируй архитектуру и перечисли ключевые trade-offs',
  'Подготовь план большого рефакторинга по шагам',
];

const CODING_PRESETS: CodingPreset[] = [
  {
    slug: 'openrouter-coding-agent',
    name: 'Coding Agent: Claude Sonnet 4.6',
    description: 'Сбалансированный coding-agent на Claude Sonnet 4.6 для большинства задач по разработке.',
    model_external_id: 'anthropic/claude-sonnet-4.6',
    version_number: 3,
    chat_intro: 'Сбалансированный coding-agent на Claude Sonnet 4.6. Хорош для новых фич, UI, рефакторинга и работы с прикреплённым кодом.',
    starter_prompts: CLEAN_DEFAULT_CODING_STARTER_PROMPTS,
    max_iterations: 6,
    temperature: 0.2,
    max_tokens: 8192,
  },
  {
    slug: 'openrouter-coding-agent-fast',
    name: 'Coding Agent: Claude Haiku 4.5',
    description: 'Быстрый и более дешёвый coding-agent на Claude Haiku 4.5 для коротких задач и быстрых итераций.',
    model_external_id: 'anthropic/claude-haiku-4.5',
    version_number: 3,
    chat_intro: 'Быстрый coding-agent на Claude Haiku 4.5. Лучше всего подходит для маленьких правок, чтения контекста и быстрых повторных запусков.',
    starter_prompts: CLEAN_FAST_CODING_STARTER_PROMPTS,
    max_iterations: 4,
    temperature: 0.2,
    max_tokens: 12288,
  },
  {
    slug: 'openrouter-coding-agent-heavy-planning',
    name: 'Coding Agent: Claude Opus 4.6',
    description: 'Премиальный coding-agent на Claude Opus 4.6 для сложной архитектуры и тяжёлого планирования.',
    model_external_id: 'anthropic/claude-opus-4.6',
    version_number: 1,
    chat_intro: 'Премиальный coding-agent на Claude Opus 4.6. Подходит для больших рефакторингов, архитектуры и детального плана изменений.',
    starter_prompts: CLEAN_HEAVY_CODING_STARTER_PROMPTS,
    max_iterations: 8,
    temperature: 0.15,
    max_tokens: 12288,
  },
  {
    slug: 'openrouter-coding-agent-coding-alternative',
    name: 'Coding Agent: Qwen3 Coder Plus',
    description: 'Code-first coding-agent на Qwen3 Coder Plus как хорошая альтернатива дорогим premium-моделям.',
    model_external_id: 'qwen/qwen3-coder-plus',
    version_number: 1,
    chat_intro: 'Code-first coding-agent на Qwen3 Coder Plus. Хорош как практичная альтернатива premium-моделям для инженерных задач.',
    starter_prompts: CLEAN_DEFAULT_CODING_STARTER_PROMPTS,
    max_iterations: 6,
    temperature: 0.2,
    max_tokens: 8192,
  },
  {
    slug: 'openrouter-coding-agent-gpt-5-4',
    name: 'Coding Agent: GPT-5.4',
    description: 'Сильный premium coding-agent на GPT-5.4 для сложных задач, tool use и длинного контекста.',
    model_external_id: 'openai/gpt-5.4',
    version_number: 1,
    chat_intro: 'Premium coding-agent на GPT-5.4. Подходит для сложных инженерных задач, многошагового reasoning и качественного tool use.',
    starter_prompts: CLEAN_HEAVY_CODING_STARTER_PROMPTS,
    max_iterations: 8,
    temperature: 0.15,
    max_tokens: 12288,
  },
  {
    slug: 'openrouter-coding-agent-gpt-5-4-mini',
    name: 'Coding Agent: GPT-5.4 Mini',
    description: 'Быстрый и более доступный coding-agent на GPT-5.4 Mini для частых запусков.',
    model_external_id: 'openai/gpt-5.4-mini',
    version_number: 1,
    chat_intro: 'Быстрый coding-agent на GPT-5.4 Mini. Подходит для частых запусков, итераций и повседневных задач разработки.',
    starter_prompts: CLEAN_FAST_CODING_STARTER_PROMPTS,
    max_iterations: 5,
    temperature: 0.2,
    max_tokens: 12288,
  },
  {
    slug: 'openrouter-coding-agent-gpt-5-3-codex',
    name: 'Coding Agent: GPT-5.3 Codex',
    description: 'Специализированный agentic coding-вариант на GPT-5.3 Codex.',
    model_external_id: 'openai/gpt-5.3-codex',
    version_number: 1,
    chat_intro: 'Специализированный coding-agent на GPT-5.3 Codex. Хорош для code generation, исправлений и agentic workflow.',
    starter_prompts: CLEAN_DEFAULT_CODING_STARTER_PROMPTS,
    max_iterations: 7,
    temperature: 0.18,
    max_tokens: 12288,
  },
  {
    slug: 'openrouter-coding-agent-gpt-5-1-codex-max',
    name: 'Coding Agent: GPT-5.1 Codex Max',
    description: 'Экономичный agentic coding-вариант на GPT-5.1 Codex Max.',
    model_external_id: 'openai/gpt-5.1-codex-max',
    version_number: 1,
    chat_intro: 'Agentic coding-agent на GPT-5.1 Codex Max. Подходит для длинных рабочих сессий и высокой частоты использования.',
    starter_prompts: CLEAN_DEFAULT_CODING_STARTER_PROMPTS,
    max_iterations: 6,
    temperature: 0.18,
    max_tokens: 12288,
  },
  {
    slug: 'openrouter-coding-agent-qwen3-coder-flash',
    name: 'Coding Agent: Qwen3 Coder Flash',
    description: 'Очень дешёвый coding-agent на Qwen3 Coder Flash для быстрых и частых задач.',
    model_external_id: 'qwen/qwen3-coder-flash',
    version_number: 1,
    chat_intro: 'Очень дешёвый coding-agent на Qwen3 Coder Flash. Хорош для быстрых проверок, мелких задач и частых запусков.',
    starter_prompts: CLEAN_FAST_CODING_STARTER_PROMPTS,
    max_iterations: 4,
    temperature: 0.2,
    max_tokens: 8192,
  },
  {
    slug: 'openrouter-coding-agent-qwen3-coder-next',
    name: 'Coding Agent: Qwen3 Coder Next',
    description: 'Суперэкономичный coding-agent на Qwen3 Coder Next для always-on сценариев.',
    model_external_id: 'qwen/qwen3-coder-next',
    version_number: 1,
    chat_intro: 'Суперэкономичный coding-agent на Qwen3 Coder Next. Подходит для always-on сценариев, регулярных фоновых задач и дешёвых итераций.',
    starter_prompts: CLEAN_FAST_CODING_STARTER_PROMPTS,
    max_iterations: 4,
    temperature: 0.2,
    max_tokens: 8192,
  },
  {
    slug: 'openrouter-coding-agent-codestral-2508',
    name: 'Coding Agent: Codestral 2508',
    description: 'Недорогой code-specialist на Codestral 2508 для генерации кода и test generation.',
    model_external_id: 'mistralai/codestral-2508',
    version_number: 1,
    chat_intro: 'Недорогой coding-agent на Codestral 2508. Хорош для генерации кода, исправлений и тестов.',
    starter_prompts: CLEAN_FAST_CODING_STARTER_PROMPTS,
    max_iterations: 5,
    temperature: 0.2,
    max_tokens: 8192,
  },
];

async function ensureCodingAgentPreset(adminId: string, preset: CodingPreset) {
  const runtimeConfig = {
    max_iterations: preset.max_iterations,
    temperature: preset.temperature,
    max_tokens: preset.max_tokens,
    model_external_id: preset.model_external_id,
    chat_intro: preset.chat_intro,
    starter_prompts: preset.starter_prompts,
  };

  const [existing] = await db
    .select()
    .from(agents)
    .where(eq(agents.slug, preset.slug))
    .limit(1);

  if (existing) {
    await db.update(agents).set({
      name: preset.name,
      description: preset.description,
      visibility: 'public',
      status: 'active',
    }).where(eq(agents.id, existing.id));

    const [version] = await db
      .insert(agentVersions)
      .values({
        agent_id: existing.id,
        version_number: preset.version_number,
        runtime_engine: 'openrouter_chat',
        system_prompt: CLEAN_BASE_SYSTEM_PROMPT,
        response_mode: 'text',
        runtime_config: runtimeConfig,
      })
      .onConflictDoUpdate({
        target: [agentVersions.agent_id, agentVersions.version_number],
        set: {
          runtime_engine: 'openrouter_chat',
          system_prompt: CLEAN_BASE_SYSTEM_PROMPT,
          response_mode: 'text',
          runtime_config: runtimeConfig,
        },
      })
      .returning();

    await db.update(agents).set({ current_version_id: version.id }).where(eq(agents.id, existing.id));
    console.log(`Ensured ${preset.name}`);
    return;
  }

  const [agent] = await db
    .insert(agents)
    .values({
      owner_user_id: adminId,
      name: preset.name,
      slug: preset.slug,
      description: preset.description,
      visibility: 'public',
      status: 'active',
    })
    .returning();

  const [version] = await db
    .insert(agentVersions)
    .values({
      agent_id: agent.id,
      version_number: preset.version_number,
      runtime_engine: 'openrouter_chat',
      system_prompt: CLEAN_BASE_SYSTEM_PROMPT,
      response_mode: 'text',
      runtime_config: runtimeConfig,
    })
    .returning();

  await db.update(agents).set({ current_version_id: version.id }).where(eq(agents.id, agent.id));
  console.log(`Seeded ${preset.name}`);
}

export async function seedOpenRouterCodingAgent() {
  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'admin@llmstore.pro'))
    .limit(1);

  if (!admin) {
    console.log('Skipping OpenRouter Coding Agent seed: admin user not found');
    return;
  }

  for (const preset of CODING_PRESETS) {
    await ensureCodingAgentPreset(admin.id, preset);
  }
}
