# LLMStore.pro

AI-агенты, инструменты и модели — маркетплейс и конструктор для работы с LLM, агентскими чатами, каталогом моделей/инструментов, публикацией сгенерированных страниц и запуском небольших project deployments.

## О проекте

LLMStore.pro объединяет несколько продуктовых частей:

- каталог AI-моделей, инструментов, prompt packs, агентов, стеков и developer assets;
- чат с обычным режимом и режимом агента, вложениями, shared links, публичными чатами и live-прогрессом выполнения;
- конструктор агентов с версиями, system/developer prompts, tool bindings и runtime config;
- агентский runtime с вызовами OpenRouter, инструментами, tool traces, учётом стоимости, контекста и токенов;
- генерацию и хранение chat files, HTML preview, публикацию landing pages и Project Bundle deployments;
- админ-панель для каталога, новостей, статей, пользователей, платежей, tools, runtime и настроек;
- новости, статьи, комментарии, профили пользователей, галерею и публичные страницы чатов/агентов/моделей;
- интеграции Telegram и Alice, включая Telegram bot quickstart и webhook/project deployment сценарии.

## Технологический стек

- Monorepo на npm workspaces: `packages/shared`, `packages/backend`, `packages/frontend`.
- TypeScript во всех пакетах.
- Backend: Node.js, Express, Drizzle ORM, PostgreSQL, Redis sessions, BullMQ/ioredis, Passport OAuth, Nodemailer, Pino.
- Frontend: React 19, Vite, React Router, TanStack Query, Zustand, React Hook Form, Tiptap, React Markdown + remark-gfm, Lucide icons.
- База данных: PostgreSQL 16 в dev через Docker Compose.
- Кэш/сессии/очереди: Redis 7 в dev через Docker Compose.
- LLM provider layer: OpenRouter-compatible chat/runtime client.
- Хранение файлов: локальные `uploads/` и `private-uploads/`, включая `uploads/chat/` для вложений и сгенерированных файлов чатов.
- Production: nginx reverse proxy, PM2 для backend, статическая сборка frontend, `deploy.sh` для обновления сервера.

## Структура репозитория

- `packages/shared` — общие типы, схемы и код, который используется backend и frontend.
- `packages/backend` — API, auth, база, runtime агентов, tools, платежи, админка и интеграции.
- `packages/frontend` — React-приложение, страницы, компоненты, hooks, API-клиенты и UI.
- `packages/backend/src/db/schema` — Drizzle-схемы таблиц по доменам: auth, catalog, models, agents, runtime, news, comments, payments, app settings, analytics, integrations.
- `packages/backend/src/db/seed` — начальные данные каталога, use cases, tags, built-in tools и стартовые агенты.
- `packages/backend/src/modules` — backend-модули по доменам.
- `packages/frontend/src/pages` — route-level страницы приложения.
- `packages/frontend/src/components` — UI, chat/agent components, admin/editor/news/catalog components.
- `scripts` — серверные backup/restore scripts, git hooks checks и служебные проверки.
- `docker-compose.yml` — локальные PostgreSQL и Redis.
- `deploy.sh` — основной production deploy script.

## Backend-модули

- `auth` — регистрация, логин, email verification, OAuth, login activity, signup bonus.
- `profile` — профиль пользователя и публичные страницы.
- `catalog` — каталог моделей, инструментов, агентов, prompt packs, стеков и статей каталога.
- `agent-builder` — создание и редактирование агентов, версий, prompts, tool config и starter prompts.
- `agent-runtime` — чаты, agent runs, OpenRouter calls, контекст, slash-команды, tool calls, files, previews, shared chats, Project Bundle deployments и публикации.
- `tool-execution` — исполнители built-in tools: web search, HTTP request, DTF tools, JSON transform, template renderer, create chat files и orchestrator worker.
- `stack-builder` — мастер подбора стека/агентского сценария.
- `news` и `articles` — новости, статьи, rich content, публикации и редакторские сценарии.
- `comments` — комментарии к контенту.
- `payments` — пополнение баланса, транзакции и админские операции по платежам.
- `admin` — управление пользователями, каталогом, агентами, tools, настройками, runtime, платежами и аналитикой.
- `telegram` — Telegram integration routes и webhook/project deployment сценарии.
- `alice` — интеграция Alice.
- `app-settings` — глобальные настройки приложения и activity tracking.

## Основные таблицы и данные

- `users`, auth/session-related tables — пользователи, роли, активность и авторизация.
- `catalog_items`, `categories`, `tags`, `use_cases` и meta/reaction/bookmark/report/view tables — каталог и пользовательские реакции.
- `ai_models`, `model_price_snapshots` — модели, OpenRouter ids, контекст, модальности и цены.
- `agents`, `agent_versions`, `tool_definitions`, `agent_version_tools` — агенты, версии и инструменты.
- `agent_runs`, `agent_run_messages`, `agent_run_tool_calls` — история запусков агентов и трассировка инструментов.
- `chat_conversations`, `chat_conversation_messages`, `chat_message_files` — чаты, сообщения, вложения и сгенерированные файлы.
- `chat_project_deployments`, `chat_project_deployment_services` — Project Bundle deployments и связанные сервисы.
- `published_landings` — опубликованные preview/landing pages.
- `news`, `articles`, `comments`, `payments`, `app_settings`, analytics/source cache tables — контент, платежи, настройки и аналитика.

## Механика чата и агентов

- Чат может работать как `general` или как `agent`.
- Модель выбирается из настроек чата, агента или дефолтной модели; в UI показывается размер context window и примерное использование.
- Контекст собирается из system prompt чата, system/developer prompt агента, context blocks, истории сообщений, вложений, preview context и описаний tools.
- Slash-команды позволяют смотреть состояние чата, менять модель, просматривать и редактировать контекст без отправки команды в LLM.
- Runtime поддерживает tool calls, live progress events, tool traces, usage/cost metadata и сохранение результатов в сообщения.
- Для изображений может использоваться временная model switch логика: ответ показывает фактически использованную модель, а чат возвращается к исходной.
- HTML/artifact workflows сохраняют файлы чата, показывают preview, позволяют открыть редактор/экспорт и публиковать landing page на поддомен.
- Project Bundle deployments используются для сценариев вроде Telegram webhook ботов: deployment хранит entrypoint, env, статус, public token и lifecycle.

## Frontend-приложение

Основные страницы:

- `/` — главная.
- `/tools`, `/models`, `/packs`, `/agents`, `/local`, `/assets`, `/stacks` — каталожные разделы.
- `/chats` и `/chat` — чатовый интерфейс.
- `/shared/chat/:token` и `/shared/chats/:token` — публичный shared chat.
- `/builder/agent`, `/builder/stack`, `/builder/telegram-bot` — конструкторы.
- `/my/agents`, `/playground/agent/:id`, `/dashboard/agents`, `/dashboard/runs` — рабочие зоны агентов.
- `/news`, `/articles`, `/guides`, `/gallery`, `/pricing`, `/offer`, `/contacts` — контентные и публичные разделы.
- `/admin/*` — админ-панель.

Ключевые frontend-слои:

- `lib/api/*` — API-клиенты по доменам.
- `hooks/*` — React Query hooks и доменные hooks.
- `components/agents/*` — ChatMessage, ChatInput, live progress, code blocks, tool traces, agent forms.
- `components/articles/*` — Tiptap editor и rich content rendering.
- `components/admin/*` — админские оболочки и редакторы.
- `stores/*` — Zustand stores для auth/playground/stack builder.

## Команды в чате

Slash-команды вводятся прямо в поле сообщения чата. Они выполняются сервером, не отправляются в модель и не списывают баланс.

### Общие команды

- `/help` или `/commands` — список доступных команд.
- `/status` — режим чата, агент, модель, количество сообщений, инструменты и Project deployments.
- `/settings` — быстрый снимок настроек чата: доступ, закрепление, tools, override контекста и note.

### Модели

- `/model` — показать текущую модель, model id, override чата и модель агента по умолчанию.
- `/models` — список доступных кодов моделей.
- `/model <code>` — установить модель для текущего чата, например `/model deepseek/deepseek-v4-flash:free`.
- `/model default` — сбросить override модели и вернуться к модели агента или дефолтной модели чата.

### Просмотр контекста

- `/context` — карта контекста: примерная оценка токенов, промпты, контекстные блоки, инструменты и история.
- `/context-help` или `/context-commands` — список команд для просмотра контекста.
- `/context-prompts` — текст системного промпта чата, системного промпта агента и developer prompt агента.
- `/context-blocks` — редактируемые блоки: бриф, факты, бренд, правила ответа и память чата.
- `/context-tools` — эффективный список инструментов, доступных в чате.
- `/context-history [N]` или `/context-messages [N]` — последние N сообщений с превью содержимого, по умолчанию 10, максимум 30.
- `/context-raw` — компактная raw-сборка служебного контекста без полной истории.

### Редактирование контекста

- `/context-edit`, `/context-write` или `/prompt-help` — подсказка по редактированию контекста командами.
- `/context-set <block> <text>` — заменить контекстный блок.
- `/context-add <block> <text>` или `/context-append <block> <text>` — дописать текст в конец блока.
- `/context-clear <block>` — очистить один блок.
- `/context-clear all` — очистить все редактируемые контекстные блоки.
- `/prompt-set chat <text>` — заменить системный промпт конкретного чата.
- `/context-prompt-set <text>` — короткий alias для системного промпта чата.
- `/prompt-clear chat` или `/context-prompt-clear` — очистить системный промпт чата.

Коды блоков для `/context-set`, `/context-add` и `/context-clear`:

- `brief` — бриф: цель, аудитория, оффер и задача чата.
- `facts` — проверенные факты, контакты, цены, ссылки и ограничения.
- `brand` — tone of voice, визуальный стиль, цвета и запреты бренда.
- `response_rules` — формат, структура и обязательные требования к ответам.
- `memory` — постоянные предпочтения и заметки по этому чату.

Агентские system/developer prompts через команды только просматриваются. Редактировать их нужно в настройках агента, чтобы случайно не изменить поведение всех чатов этого агента.

AI-агенты, инструменты и модели — маркетплейс и конструктор.

## Быстрый старт

```bash
# Установка зависимостей
npm install

# Запуск Docker (PostgreSQL + Redis)
docker compose up -d

# Применить схему БД
npm run db:push

# Заполнить начальные данные (admin@llmstore.pro / admin123!)
npm run db:seed

# Запуск dev-серверов (backend + frontend)
npm run dev
```

## Управление ролями пользователей

### Назначить роль через CLI

Скрипт `set-role.ts` позволяет назначить любую роль пользователю по email.

Доступные роли: `user`, `power_user`, `curator`, `admin`

```bash
# Сделать пользователя администратором
cd packages/backend
npx tsx src/scripts/set-role.ts rodion89@list.ru admin

# Сделать пользователя куратором
npx tsx src/scripts/set-role.ts user@example.com curator

# Понизить до обычного пользователя
npx tsx src/scripts/set-role.ts user@example.com user

# Назначить power_user
npx tsx src/scripts/set-role.ts user@example.com power_user
```

### Назначить роль через SQL

```bash
# Подключиться к PostgreSQL
docker exec -it llmstore-postgres psql -U llmstore -d llmstore

# Сделать пользователя админом по email
UPDATE users SET role = 'admin' WHERE email = 'rodion89@list.ru';

# Проверить роль
SELECT email, role, status FROM users WHERE email = 'rodion89@list.ru';

# Посмотреть всех админов
SELECT email, role, created_at FROM users WHERE role = 'admin';
```

## Управление балансом

### Через API

```bash
# Узнать ID пользователя
docker exec -it llmstore-postgres psql -U llmstore -d llmstore \
  -c "SELECT id, email, balance_usd FROM users WHERE email = 'rodion89@list.ru';"

# Пополнить баланс пользователю (нужна сессия админа)
curl -X POST http://localhost:3001/api/admin/users/<USER_ID>/balance \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=<ADMIN_SESSION>" \
  -d '{"amount": 100.00, "description": "Начальное пополнение"}'

# Списать с баланса
curl -X POST http://localhost:3001/api/admin/users/<USER_ID>/balance \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=<ADMIN_SESSION>" \
  -d '{"amount": -10.00, "description": "Корректировка"}'
```

### Через SQL

```bash
# Пополнить баланс напрямую
docker exec -it llmstore-postgres psql -U llmstore -d llmstore \
  -c "UPDATE users SET balance_usd = balance_usd + 100 WHERE email = 'rodion89@list.ru';"
```

## Админ-панель

Доступна по адресу `/admin` для пользователей с ролью `admin` или `curator`.

Разделы:
- `/admin` — управление каталогом
- `/admin/users` — управление пользователями, ролями, статусами и балансом
- `/admin/agents` — просмотр всех агентов в системе

## Деплой на сервер

```bash
# 1. Обновить код
cd /var/www/llmstore.pro
git pull origin main

# 2. Собрать shared
cd packages/shared
npm run build

# 3. Применить схему БД
cd ../backend
npm run db:push

# 4. Собрать backend
npm run build

# 5. Собрать frontend
cd ../frontend
npm run build

# 6. Перезапустить backend
pm2 restart llmstore-backend

# 7. Проверить
curl http://localhost:3002/api/health
```

Основной продовый деплой-скрипт:

```bash
cd /var/www/llmstore.pro
bash deploy.sh
```

## Бэкапы на сервере

Ежедневные backup-копии хранятся в:

`/var/backups/llmstore/YYYY-MM-DD`

Внутри каждой папки по дате лежат:
- `db/llmstore.dump` — дамп PostgreSQL в формате `pg_dump --format=custom`
- `uploads/chat/` — файлы чатов для корректного восстановления вложений
- `manifest.json` — метаданные backup-копии

По умолчанию хранятся последние `3` дня.

### Установка cron-задачи

```bash
cd /var/www/llmstore.pro
bash scripts/install-server-backup-cron.sh
```

Это создаёт задачу в `/etc/cron.d/llmstore-backup`, которая запускается ежедневно в `04:10`.
Лог пишется в `/var/log/llmstore-backup.log`.

### Создать backup вручную

```bash
cd /var/www/llmstore.pro
bash scripts/server-backup.sh
```

### Восстановиться на дату

```bash
cd /var/www/llmstore.pro
bash scripts/server-restore.sh 2026-04-01 --yes
```

Что делает restore:
- останавливает backend
- восстанавливает БД из `db/llmstore.dump`
- восстанавливает `uploads/chat`
- запускает backend обратно
- проверяет `http://localhost:3002/api/health`

Файлы backup-логики в репозитории:

```bash
scripts/server-backup.sh
scripts/server-restore.sh
scripts/install-server-backup-cron.sh
scripts/BACKUPS.md
```

## npm-скрипты

```bash
npm run dev          # Запуск всех пакетов в dev-режиме
npm run build        # Сборка всех пакетов
npm run lint         # Линтинг
npm run typecheck    # Проверка типов
npm run db:push      # Применить схему к БД
npm run db:seed      # Заполнить начальные данные
npm run db:studio    # GUI для БД (Drizzle Studio)
```
