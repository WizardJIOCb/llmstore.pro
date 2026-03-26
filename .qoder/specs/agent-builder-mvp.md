# Agent Builder MVP + DTF News Agent

## Context

LLMStore.pro has a working catalog, stack builder, and auth system. The routes `/builder/agent`, `/builder/agent/:id`, `/playground/agent/:id`, `/dashboard/agents`, `/dashboard/runs` are placeholders. The DB schema for agents, versions, runs, tools, and analytics is **already defined** in Drizzle but the backend modules (`agent-builder/`, `agent-runtime/`, `openrouter/`) are empty. The goal is to implement the first working agent vertical slice: a DTF News Agent that fetches and summarizes articles from dtf.ru via tool-calling.

**OPENROUTER_API_KEY** is already configured in the server `.env`. Default model for MVP: `google/gemini-2.0-flash-001`.

---

## Implementation Phases

### Phase 0 — Prerequisites (~180 lines)

**0.1** Install `cheerio` in backend package

**0.2** Add `source_cache_entries` table  
File: `packages/backend/src/db/schema/source-cache.ts`  
Columns: id (uuid PK), cache_key (varchar 500 unique), source_type (varchar 50), content_json (jsonb), expires_at (timestamptz), created_at  
Export from `packages/backend/src/db/schema/index.ts`

**0.3** Extend `packages/backend/src/db/seed/builtin-tools.ts` with 2 DTF tools:  
- `dtf-latest-feed` (tool_type: `http_request`, config_json.handler: `dtf_latest_feed`)
- `dtf-article-fetch` (tool_type: `http_request`, config_json.handler: `dtf_article_fetch`)

**0.4** Create `packages/backend/src/db/seed/dtf-news-agent.ts`:  
- Seed `agents` row (name: DTF News Agent, slug: dtf-news-agent, owner: admin, status: active)
- Seed `agent_versions` row (version 1) with system prompt, runtime_config, tool links
- Register in seed/index.ts

**0.5** Run `drizzle-kit push` to create the new table

---

### Phase 1 — OpenRouter Client (~240 lines)

**Files:**
- `packages/backend/src/modules/openrouter/types.ts` — TS interfaces for OpenRouter API (messages, tools, response, usage)
- `packages/backend/src/modules/openrouter/client.ts` — `OpenRouterClient` class wrapping axios:
  - `chatCompletion(params)` → POST `https://openrouter.ai/api/v1/chat/completions`
  - Headers: Authorization Bearer, HTTP-Referer, X-Title
  - Handles tool_calls in response
  - Error mapping to AppError
- `packages/backend/src/modules/openrouter/index.ts` — Singleton export with `env.OPENROUTER_API_KEY`

---

### Phase 2 — DTF Source / Tool Executors (~330 lines)

**Files:**
- `packages/backend/src/modules/tool-execution/types.ts` — DtfArticleSummary, DtfFeedResult, DtfArticleResult
- `packages/backend/src/modules/tool-execution/executors/dtf-feed.executor.ts`:
  - Fetch `https://dtf.ru/new` (or `/new/all`), parse with cheerio
  - Extract: title, url, author, time, snippet
  - DB cache lookup/store in `source_cache_entries` (TTL 120s)
- `packages/backend/src/modules/tool-execution/executors/dtf-article.executor.ts`:
  - Validate URL domain is `dtf.ru` (security allowlist)
  - Fetch article, extract cleaned text with cheerio
  - DB cache (TTL 600s)
- `packages/backend/src/modules/tool-execution/executors/index.ts`:
  - `ToolExecutorRegistry` — dispatches by tool slug
  - Registers: dtf-latest-feed, dtf-article-fetch, http-request (generic), calculator, mock-tool
  - Export `executeTool(slug, input, config)` → `{ result, duration_ms }`

---

### Phase 3 — Agent CRUD API (~410 lines)

**Files:**
- `packages/backend/src/modules/agent-builder/agent.service.ts`:
  - `createAgent(userId, input)` — insert agents + return
  - `createAgentVersion(agentId, userId, input)` — insert version + link tools + update current_version_id
  - `getAgent(id, userId)` — load agent + current version + tools
  - `listAgents(userId)` — list user's agents
  - `updateAgent(id, userId, input)` — update agent fields
  - `deleteAgent(id, userId)` — delete with ownership check
  - `listBuiltinTools()` — select builtin active tools
- `packages/backend/src/modules/agent-builder/agent.controller.ts` — 7 handlers
- `packages/backend/src/modules/agent-builder/agent.validators.ts` — Zod middleware
- `packages/backend/src/modules/agent-builder/agent.routes.ts`:
  ```
  POST   /                  → requireAuth, create
  GET    /                  → requireAuth, list
  GET    /tools/builtin     → listBuiltinTools (no auth)
  GET    /:id               → requireAuth, get
  PUT    /:id               → requireAuth, update
  DELETE /:id               → requireAuth, remove
  POST   /:id/versions      → requireAuth, createVersion
  ```
- `packages/backend/src/modules/agent-builder/index.ts`
- Mount in `app.ts`: `app.use('/api/agents', agentBuilderRoutes)`

---

### Phase 4 — Runtime Engine (~400 lines)

**Files:**
- `packages/backend/src/modules/agent-runtime/runtime.service.ts` — Core loop:
  1. Load agent + version + tools from DB
  2. Resolve model → `external_model_id` from ai_models or fallback `google/gemini-2.0-flash-001`
  3. Create `agent_runs` record (status: preparing)
  4. Build messages: system_prompt → user messages
  5. Build tools array in OpenAI function format
  6. **Loop** (max `runtime_config.max_iterations`, default 4):
     - Call `openRouterClient.chatCompletion()`
     - If tool_calls: execute each via `executeTool()`, persist `agent_run_tool_calls`, add tool results to messages, continue
     - If no tool_calls: break with final answer
  7. Persist: usage_ledger, agent_run_messages, update run (completed/failed)
  8. Return: { run_id, output, tool_traces, usage }
- `packages/backend/src/modules/agent-runtime/runtime.controller.ts`:
  - `startRun` — POST, non-streaming (returns full response)
  - `getRun` — GET run with messages + tool calls
  - `listRuns` — GET runs list with filters
- `packages/backend/src/modules/agent-runtime/runtime.validators.ts`
- `packages/backend/src/modules/agent-runtime/runtime.routes.ts`:
  ```
  POST /runs          → requireAuth, startRun
  GET  /runs/:id      → requireAuth, getRun
  GET  /runs          → requireAuth, listRuns
  ```
- `packages/backend/src/modules/agent-runtime/index.ts`
- Mount in `app.ts`: `app.use('/api', agentRuntimeRoutes)`

---

### Phase 5 — Frontend API + State (~320 lines)

**Files:**
- `packages/frontend/src/lib/api/agents.ts` — agentApi object (create, list, get, update, delete, createVersion, listBuiltinTools, startRun, getRun, listRuns)
- `packages/frontend/src/hooks/useAgents.ts` — React Query hooks (useAgentList, useAgent, useCreateAgent, useUpdateAgent, useDeleteAgent, useCreateVersion, useBuiltinTools, useStartRun, useRun, useRunList)
- `packages/frontend/src/stores/agent-builder-store.ts` — Zustand: template selection, form state
- `packages/frontend/src/stores/playground-store.ts` — Zustand: messages[], toolTraces[], isRunning
- `packages/frontend/src/lib/label-maps.ts` — Add agentStatusLabels, agentRunStatusLabels

---

### Phase 6 — Frontend Pages + Components (~1400 lines)

**Components** (`packages/frontend/src/components/agents/`):
- `TemplatePicker.tsx` — Card grid (DTF News Agent + Blank Agent)
- `AgentForm.tsx` — Reusable agent config form (name, description, prompt, model, tools)
- `ToolSelector.tsx` — Checkbox list of builtin tools
- `ChatMessage.tsx` — Message bubble (user/assistant/tool)
- `ChatInput.tsx` — Textarea + send button
- `ToolTraceCard.tsx` — Expandable tool call detail
- `ToolTracePanel.tsx` — Sidebar with all tool traces
- `QuickActions.tsx` — Preset prompt buttons for DTF agent
- `RunMetadata.tsx` — Tokens/cost/latency display

**Pages:**
- `packages/frontend/src/pages/builder/AgentBuilderPage.tsx` — Template picker → form → create agent → redirect to playground
- `packages/frontend/src/pages/builder/AgentEditorPage.tsx` — Edit existing agent, create new version
- `packages/frontend/src/pages/playground/AgentPlaygroundPage.tsx` — Chat UI + tool trace sidebar + quick actions
- `packages/frontend/src/pages/dashboard/AgentsDashboardPage.tsx` — List of user's agents
- `packages/frontend/src/pages/dashboard/RunsDashboardPage.tsx` — Runs history table

---

### Phase 7 — Wiring + Deploy (~50 lines)

- Update `App.tsx` — Replace 5 placeholder routes with real components (ProtectedRoute wrapped)
- Update `AppLayout.tsx` — Ensure "Конструктор" nav link works
- TypeScript typecheck all packages
- Commit, push, deploy (pull on server, rebuild frontend, restart backend, db:push)

---

## Key Design Decisions

1. **Non-streaming MVP** — Returns full response from POST /runs. SSEEmitter exists for future streaming but adds complexity. DTF queries complete in 2-5s.

2. **DTF tools use existing `http_request` tool_type** — No enum migration needed. Dispatched by slug via config_json.handler field.

3. **Model fallback** — If version.model_id is null (no ai_models synced yet), runtime uses `google/gemini-2.0-flash-001` directly via OpenRouter.

4. **Client-side conversation state** — Playground store holds messages in memory. Each "Send" creates a new run with full message history. All runs persist server-side for dashboard.

5. **DB-backed source cache** — `source_cache_entries` table (not Redis) for DTF content. Simple TTL-based invalidation.

---

## Critical Files (highest complexity)

| File | Purpose |
|------|---------|
| `modules/agent-runtime/runtime.service.ts` | Core runtime loop — LLM + tools + persistence |
| `modules/openrouter/client.ts` | OpenRouter HTTP client with tool-calling |
| `modules/tool-execution/executors/dtf-feed.executor.ts` | DTF HTML scraper |
| `modules/agent-builder/agent.service.ts` | Agent CRUD with versioning |
| `pages/playground/AgentPlaygroundPage.tsx` | Chat + tool trace UI |

---

## Verification

1. `npx tsc --noEmit -p packages/shared/tsconfig.json` — 0 errors
2. `npx tsc --noEmit -p packages/backend/tsconfig.json` — 0 errors
3. `npx tsc --noEmit -p packages/frontend/tsconfig.json` — 0 errors
4. Run seed: `npm run db:seed` — DTF tools + agent template created
5. Manual test: `curl -X POST /api/agents/:dtf-agent-id/runs -d '{"input":{"messages":[{"role":"user","content":"Покажи 10 последних постов на DTF"}]}}'` — returns list of real DTF articles
6. Frontend: navigate to `/builder/agent`, create DTF agent from template, open playground, send message, verify response with tool traces
7. Dashboard: verify runs appear in `/dashboard/runs`

---

## Total Estimate: ~3,300 lines across ~35 files
