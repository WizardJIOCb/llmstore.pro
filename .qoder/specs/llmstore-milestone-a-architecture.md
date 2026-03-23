# LLMStore.pro - Milestone A: Architecture & Foundation

## Context

LLMStore.pro is a new curated marketplace + catalog + builder platform for LLM tools, prompts, agents, assets, local builds, and deployable AI stacks. This plan covers **Milestone A** from the SDD: system architecture, Drizzle schema, route map, API contracts, admin content model, and phased plan. No existing code exists — this is greenfield.

**Key decisions:**
- Monorepo with npm workspaces
- Russian primary UI (i18n-ready later)
- Auth: email/password + Google/GitHub OAuth
- Docker Compose for PostgreSQL 16 + Redis 7
- Server-side sessions (httpOnly cookies), no JWT

---

## 1. Monorepo Structure

```
llmstore.pro/
├── packages/
│   ├── shared/                    # @llmstore/shared — Zod schemas, TS types, constants
│   │   ├── src/
│   │   │   ├── schemas/           # Zod validation schemas (auth, catalog, agent, run, usage, model, tool, admin, stack-builder)
│   │   │   ├── types/             # Derived TypeScript types for API contracts
│   │   │   ├── constants/         # Enums (content-types, use-cases, filters, roles, tool-types, agent-states)
│   │   │   └── utils/             # Shared helpers (slug, cost calculation, token estimation)
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── backend/                   # @llmstore/backend — Express API + BullMQ workers
│   │   ├── src/
│   │   │   ├── app.ts             # Express app factory
│   │   │   ├── server.ts          # HTTP entry point
│   │   │   ├── worker.ts          # BullMQ worker entry point (separate process)
│   │   │   ├── config/            # env.ts (Zod-validated), database.ts, redis.ts, session.ts, cors.ts
│   │   │   ├── db/
│   │   │   │   ├── schema/        # Drizzle table definitions (split by domain)
│   │   │   │   ├── migrations/    # Drizzle-generated SQL
│   │   │   │   ├── seed/          # categories, tags, use-cases, builtin-tools
│   │   │   │   └── helpers.ts     # common column helpers (timestamps, uuid pk)
│   │   │   ├── modules/           # 12 domain modules (see section 2)
│   │   │   ├── middleware/        # auth-guard, role-guard, rate-limiter, error-handler, validate, sse, request-logger
│   │   │   ├── jobs/              # BullMQ queues, workers (model-sync, cost-aggregation, cleanup), schedulers
│   │   │   ├── lib/               # logger (pino), http-client, sse-emitter, errors, pagination, slug, crypto
│   │   │   └── types/             # express.d.ts (req.user augmentation)
│   │   ├── drizzle.config.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── frontend/                  # @llmstore/frontend — Vite + React
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx            # Providers + router outlet
│       │   ├── router.tsx         # React Router route definitions
│       │   ├── pages/             # Route-level components (home, catalog, compare, builder, dashboard, admin, auth)
│       │   ├── features/          # Domain-specific components (catalog, agent-builder, playground, stack-builder, compare, dashboard, admin)
│       │   ├── components/        # Shared UI: ui/ (shadcn), layout/ (navbar, footer, sidebar), shared/ (search, filters, badges, pagination), forms/
│       │   ├── hooks/             # TanStack Query hooks (use-auth, use-catalog, use-models, use-agent, use-agent-run, use-sse, use-favorites, etc.)
│       │   ├── lib/               # api-client, api/ (endpoint functions), query-keys, utils, format-cost, format-tokens
│       │   ├── stores/            # Zustand: auth-store, compare-store, builder-store
│       │   └── styles/globals.css
│       ├── index.html
│       ├── vite.config.ts
│       ├── tailwind.config.ts
│       ├── components.json        # shadcn/ui config
│       ├── package.json
│       └── tsconfig.json
│
├── docker/
│   └── postgres/init.sql          # CREATE EXTENSION uuid-ossp, pg_trgm
├── docker-compose.yml             # PostgreSQL 16 + Redis 7
├── .env.example
├── .gitignore
├── tsconfig.base.json
├── package.json                   # npm workspaces root
└── turbo.json                     # optional build orchestration
```

**`.env.example` key vars:** `DATABASE_URL`, `REDIS_URL`, `OPENROUTER_API_KEY`, `SESSION_SECRET`, `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET`, `FRONTEND_URL`, `PORT`

---

## 2. Backend Modules

Each module is a vertical slice: `routes.ts` -> `controller.ts` -> `service.ts` + `validators.ts`.

| Module | Responsibility |
|--------|---------------|
| `auth` | Register, login, OAuth (Google/GitHub via passport), sessions, password hashing (argon2), role checks |
| `catalog` | Unified CRUD for all 9 content types. `subtype.service.ts` dispatches to correct subtype table based on content_type |
| `search` | Full-text search (pg_trgm + tsvector), faceted filtering across all metadata dimensions |
| `stack-builder` | Wizard answers -> scoring engine -> recommendation result -> save/export |
| `agent-builder` | Agent CRUD, version management, tool config, test scenarios |
| `agent-runtime` | State machine for execution. Tool call loop. SSE streaming to client. Contains `state-machine.ts`, `message-builder.ts`, `stream-handler.ts` |
| `tool-execution` | Safe execution of built-in tools. Executor per type. Sandbox enforcement (timeout, size limits, domain allowlist) |
| `openrouter` | HTTP adapter for OpenRouter API (inference + model fetch). `stream-parser.ts`, `mapper.ts`. Never exposed to frontend. |
| `usage` | Write usage_ledger, compute cost from pricing snapshots, pre-run estimation |
| `analytics` | Read-only aggregation queries for dashboards (per-user, per-agent, per-model, time-series) |
| `admin` | Admin CRUD for catalog, model sync triggers, content publishing |
| `seo` | Sitemap, structured data (JSON-LD), meta tags |

**Two processes:** `server.ts` (Express HTTP) + `worker.ts` (BullMQ: model-sync nightly, cost-aggregation hourly, cleanup).

---

## 3. Database Schema (Drizzle ORM)

### 3.1 Enums

| Enum | Values |
|------|--------|
| `user_role` | `user`, `power_user`, `curator`, `admin` |
| `user_status` | `active`, `suspended`, `deleted` |
| `auth_provider` | `email`, `google`, `github` |
| `content_type` | `tool`, `model`, `prompt_pack`, `workflow_pack`, `business_agent`, `developer_asset`, `local_build`, `stack_preset`, `guide` |
| `item_status` | `draft`, `published`, `archived` |
| `visibility` | `public`, `private`, `unlisted` |
| `pricing_type` | `free`, `paid`, `open_source`, `api_based`, `freemium`, `enterprise` |
| `deployment_type` | `cloud`, `local`, `self_hosted`, `hybrid` |
| `privacy_type` | `public_api`, `private`, `offline`, `zero_retention` |
| `language_support` | `ru`, `en`, `multilingual` |
| `difficulty` | `beginner`, `intermediate`, `advanced` |
| `readiness` | `template`, `deployable`, `production_ready` |
| `response_mode` | `text`, `json_object`, `json_schema` |
| `tool_type` | `http_request`, `calculator`, `json_transform`, `template_renderer`, `knowledge_lookup`, `mock_tool`, `webhook_call` |
| `agent_run_status` | `pending`, `preparing`, `running`, `waiting_for_tool`, `tool_executing`, `continuing`, `completed`, `failed`, `cancelled` |
| `agent_run_mode` | `chat`, `scenario`, `comparison`, `preflight` |
| `tool_call_status` | `pending`, `running`, `success`, `error`, `timeout` |
| `agent_status` | `draft`, `active`, `archived` |
| `asset_type` | `system_prompt`, `json_schema`, `output_schema`, `eval_dataset`, `tool_definition`, `rag_preset`, `guardrail_rules`, `connector_template`, `starter_template` |
| `runtime_type` | `ollama`, `lm_studio`, `llama_cpp`, `open_webui`, `vllm`, `other` |
| `budget_tier` | `free`, `low`, `medium`, `high`, `enterprise` |
| `complexity_level` | `simple`, `moderate`, `complex`, `expert` |

### 3.2 Tables Overview

**Auth:** `users`, `auth_accounts`, `sessions`
**Catalog core:** `catalog_items`, `categories`, `tags`, `use_cases`, junction tables (`catalog_item_categories/tags/use_cases`), `catalog_item_meta`
**Models:** `ai_models`, `model_price_snapshots`
**Subtypes:** `prompt_packs`, `workflow_packs`, `developer_assets`, `local_builds`, `stack_presets`
**Agent builder:** `agents`, `agent_versions`, `tool_definitions`, `agent_version_tools`, `agent_test_scenarios`
**Runtime:** `agent_runs`, `agent_run_messages`, `agent_run_tool_calls`
**Analytics:** `usage_ledger`, `cost_daily_aggregates`
**User data:** `saved_stack_results`, `favorites`

### 3.3 Key Table Definitions

**`users`**: id (uuid PK), email (unique), username (unique nullable), name, avatar_url, role (user_role, default 'user'), status (user_status, default 'active'), password_hash (nullable — null for OAuth-only), created_at, updated_at

**`auth_accounts`**: id, user_id FK, provider (auth_provider), provider_account_id, access_token (encrypted), refresh_token (encrypted), created_at. Unique: (provider, provider_account_id)

**`sessions`**: id, user_id FK, token (unique, crypto-random), expires_at (30-day TTL), created_at

**`catalog_items`**: id (uuid PK), type (content_type), title, slug (unique), short_description, full_description (markdown), status (item_status, default 'draft'), visibility (default 'public'), hero_image_url, author_user_id FK nullable, curated_score (int default 0), featured (bool default false), seo_title, seo_description, created_at, updated_at, published_at

**`catalog_item_meta`**: item_id (PK, FK 1:1), pricing_type, deployment_type, privacy_type, language_support, difficulty, readiness, vendor_name, source_url, docs_url, github_url, website_url, metadata_json (jsonb — overflow bag for hardware_requirement, business_size, etc.)

**`ai_models`**: id, catalog_item_id (unique FK), provider_source (default 'openrouter'), external_model_id (unique), canonical_slug (unique), display_name, context_length, tokenizer, modality, input_modalities (jsonb), output_modalities (jsonb), supported_parameters (jsonb), pricing_prompt (numeric(20,10)), pricing_completion (numeric(20,10)), pricing_request, pricing_image, provider_meta_json, raw_json, last_synced_at

**`model_price_snapshots`**: id, ai_model_id FK, pricing_prompt/completion/request/image (numeric(20,10)), captured_at

**`agents`**: id, owner_user_id FK, source_catalog_item_id FK nullable, name, slug (unique nullable), description, visibility (default 'private'), status (agent_status, default 'draft'), current_version_id (nullable), created_at, updated_at

**`agent_versions`**: id, agent_id FK, version_number (unique per agent), model_id FK nullable, runtime_engine (default 'openrouter_chat'), system_prompt, developer_prompt, starter_prompt_template, variables_schema (jsonb), response_mode (default 'text'), response_schema (jsonb), runtime_config (jsonb: temperature, max_tokens, top_p, stream, max_iterations, timeout_ms), routing_config (jsonb), privacy_config (jsonb), tool_config (jsonb), evaluation_config (jsonb: cost thresholds), published_at, created_at

**`tool_definitions`**: id, owner_user_id FK nullable, name, slug (unique), tool_type, description, input_schema (jsonb), output_schema (jsonb), config_json (jsonb), is_builtin (bool), is_active (bool), created_at, updated_at

**`agent_runs`**: id, agent_id FK, agent_version_id FK, user_id FK, status (agent_run_status), mode (agent_run_mode), model_id FK nullable, provider_name, external_generation_id, session_key, trace_id, started_at, completed_at, latency_ms, error_message, input_summary, output_summary, final_output, final_output_json (jsonb)

**`usage_ledger`**: id, run_id FK, provider, model_external_id, provider_name, prompt_tokens, completion_tokens, reasoning_tokens, cached_tokens, total_tokens, estimated_cost (numeric(12,8)), actual_cost (numeric(12,8)), cache_discount, currency (default 'usd'), raw_usage_json (jsonb), created_at

**`cost_daily_aggregates`**: id, user_id FK nullable, agent_id FK nullable, model_id FK nullable, day (date), total_runs, total_successful_runs, prompt_tokens (bigint), completion_tokens (bigint), reasoning_tokens (bigint), cached_tokens (bigint), actual_cost (numeric(14,8)). Unique: (user_id, agent_id, model_id, day)

### 3.4 Key Indexes

- `catalog_items`: composite on `(type, status, visibility)`, partial on `WHERE status='published' AND visibility='public'`, GIN on full-text `tsvector` (Russian config) for title + short_description
- `catalog_item_meta`: GIN on `metadata_json`
- `ai_models`: GIN on `supported_parameters` and `input_modalities`; index on `external_model_id`
- `agent_runs`: composite on `(user_id, started_at DESC)`, `(agent_id, started_at DESC)`; index on `session_key`, `status`
- `usage_ledger`: index on `run_id`, `created_at` (for aggregation range scan)
- `cost_daily_aggregates`: index on `(user_id, day)`, `(agent_id, day)`
- `model_price_snapshots`: index on `(ai_model_id, captured_at DESC)`
- All FK columns indexed explicitly (PostgreSQL does not auto-index FKs)

---

## 4. API Contract Summary

**Conventions:** Base `/api`, session cookie auth, cursor-based pagination for public endpoints, offset-based for admin. Response shape: `{ data: T, meta?: { total, cursor } }`. Errors: `{ error: { code, message, details? } }`.

### Auth
- `POST /api/auth/register` — email+password, returns user + sets session cookie
- `POST /api/auth/login` — email+password
- `POST /api/auth/logout` — clears session
- `GET /api/auth/me` — current user (auth required)
- `GET /api/auth/oauth/:provider` — 302 redirect to Google/GitHub
- `GET /api/auth/oauth/:provider/callback` — handles OAuth return, creates/links user

### Public Catalog
- `GET /api/catalog` — filtered listing with `type`, `category`, `tags`, `use_case`, `pricing`, `deployment`, `privacy`, `language`, `difficulty`, `search`, `sort`, `cursor`, `limit`
- `GET /api/catalog/:type` — convenience alias filtered by type
- `GET /api/catalog/:type/:slug` — full detail with subtype data + related items
- `GET /api/categories`, `GET /api/tags`, `GET /api/use-cases` — taxonomy lists
- `GET /api/compare?ids=...&type=...` — comparison matrix for 2-5 items of same type
- `GET /api/models` — model-specific listing with extra filters (min_context, supports_tools, supports_vision)
- `GET /api/models/:slug` — full model detail with price history

### Stack Builder
- `POST /api/builder/stack/recommend` — wizard answers -> recommendations (models, tools, local builds, packs, agents, cost band, tradeoffs)
- `POST /api/builder/stack/save` — save result
- `GET /api/builder/stack/saved` — user's saved stacks
- `POST /api/builder/stack/export` — export as JSON/markdown

### Agent Builder
- `POST /api/agents` — create agent (+ initial v1)
- `GET /api/agents` — user's agents
- `GET /api/agents/:id` — agent detail with current version
- `PATCH /api/agents/:id` — update agent metadata
- `DELETE /api/agents/:id` — soft-delete (archive)
- `POST /api/agents/:id/versions` — create new version with full config
- `GET /api/agents/:id/versions` — version history
- CRUD for `test-scenarios` under `/api/agents/:id/test-scenarios`

### Tools
- `GET /api/tools` — list (filter by type, builtin, search)
- `POST /api/tools` — create custom tool
- `GET/PATCH/DELETE /api/tools/:id`

### Runtime
- `POST /api/agent-runs/start` — start run (returns run_id + stream_url)
- `POST /api/agent-runs/estimate` — preflight cost estimation (no execution)
- `GET /api/agent-runs/:id` — full run detail (messages, tool calls, usage, cost)
- `GET /api/agent-runs/:id/stream` — SSE event stream
- `POST /api/agent-runs/:id/retry` — re-run with optional model override
- `POST /api/agent-runs/:id/compare` — spawn parallel runs on different models
- `GET /api/agent-runs` — user's run history (filterable)

### Analytics
- `GET /api/dashboard/costs` — cost trends (by day/agent/model, with totals and cache savings)
- `GET /api/dashboard/runs` — run stats (success rate, avg latency, recent runs)
- `GET /api/dashboard/usage` — token usage breakdown
- `GET /api/dashboard/agents/:id/analytics` — per-agent analytics

### Favorites
- `POST /api/favorites` — add favorite
- `DELETE /api/favorites/:catalog_item_id` — remove
- `GET /api/favorites` — list

### Admin (role = admin/curator)
- `POST /api/admin/sync/models` — trigger OpenRouter model sync
- `POST /api/admin/catalog` — create catalog item with subtype data
- `PATCH /api/admin/catalog/:id` — update
- `POST /api/admin/catalog/:id/publish` — publish item
- `GET /api/admin/catalog` — all items including drafts
- CRUD for categories, tags, use-cases
- `GET /api/admin/dashboard` — platform-wide analytics

---

## 5. Agent Runtime State Machine

```
IDLE -> PREPARING -> RUNNING -> COMPLETED
                       |
                       +-> WAITING_FOR_TOOL -> TOOL_EXECUTING -> CONTINUING -> RUNNING (loop)
                       |                                              |
                       +-> FAILED                              (max iterations) -> COMPLETED
```

**States:** `pending`, `preparing`, `running`, `waiting_for_tool`, `tool_executing`, `continuing`, `completed`, `failed`, `cancelled`

**Key flows:**
- PREPARING: validate agent config + model capabilities, build messages array
- RUNNING: send to OpenRouter, stream response to client via SSE
- WAITING_FOR_TOOL: parse tool calls, validate against allowlist + input schema
- TOOL_EXECUTING: dispatch to executor with sandbox (timeout 10s, 50KB response limit, domain allowlist, no internal network)
- CONTINUING: append tool result, check iteration count (default max 6), loop back to RUNNING

**SSE events emitted to client:** `status`, `content_delta`, `tool_call_start`, `tool_call_args`, `tool_result`, `usage`, `cost`, `done`, `error` + heartbeat every 15s

**Safety:** Per-user concurrency limit (2 active runs). Redis tracking with TTL (5min max). AbortController on client disconnect.

---

## 6. OpenRouter Integration

### Model Sync (nightly + manual trigger)
1. BullMQ job calls `GET https://openrouter.ai/api/v1/models`
2. Mapper transforms to internal schema (context_length, pricing, modalities, capabilities)
3. Upsert `ai_models` + `catalog_items` (type=model)
4. Create `model_price_snapshots` if pricing changed

### Inference Proxy
- Two methods: `chatCompletion()` (non-streaming) and `chatCompletionStream()` (streaming)
- Backend-only: API key never exposed to browser
- Sets `HTTP-Referer`, `X-Title` headers
- Privacy mode: `provider.data_collection: "deny"`
- Handles 429 (backoff retry) and 402 (credit error) gracefully
- Extracts usage from response (or final SSE chunk for streaming)

---

## 7. Cost Accounting

### Pre-run estimate
- Resolve model pricing from `ai_models`
- Estimate prompt tokens: `ceil(total_chars / 3.5)` (mixed RU/EN heuristic)
- Estimate completion: low/mid/high bands from max_tokens
- Check against cost thresholds before starting

### Post-run actual
- Extract `prompt_tokens`, `completion_tokens`, `reasoning_tokens`, `cached_tokens` from OpenRouter response
- Calculate: `actual_cost = (prompt * pricing_prompt) + (completion * pricing_completion) - cache_discount`
- Cross-reference with OpenRouter generation cost if available
- Store in `usage_ledger`

### Daily aggregation
- BullMQ cron at 02:00 UTC
- Rolls up `usage_ledger` into `cost_daily_aggregates` at 3 granularity levels:
  1. `(user_id, agent_id, model_id, day)` — most granular
  2. `(user_id, agent_id, NULL, day)` — per-agent
  3. `(user_id, NULL, NULL, day)` — per-user
- Idempotent upsert (safe to re-run)

---

## 8. Frontend Route Map

| Path | Page Component | Auth |
|------|---------------|------|
| `/` | HomePage | public |
| `/tools`, `/models`, `/packs`, `/agents`, `/local`, `/assets` | CatalogListPage | public |
| `/tools/:slug`, `/models/:slug`, etc. | CatalogDetailPage | public |
| `/stacks`, `/stacks/:slug` | StackListPage / StackDetailPage | public |
| `/compare`, `/compare/models`, `/compare/tools` | ComparePage | public |
| `/russian-market` | RussianMarketPage | public |
| `/guides`, `/guides/:slug` | GuidesListPage / GuideDetailPage | public |
| `/builder/stack` | StackBuilderPage | auth |
| `/builder/agent`, `/builder/agent/:id` | AgentBuilderPage | auth |
| `/playground/agent/:id` | PlaygroundPage | auth |
| `/dashboard` | DashboardOverviewPage | auth |
| `/dashboard/saved` | SavedItemsPage | auth |
| `/dashboard/agents` | MyAgentsPage | auth |
| `/dashboard/runs` | RunHistoryPage | auth |
| `/dashboard/costs` | CostDashboardPage | auth |
| `/admin`, `/admin/catalog`, `/admin/models`, `/admin/sync` | Admin pages | admin |
| `/login`, `/register` | LoginPage / RegisterPage | public |

---

## 9. Implementation Plan (Milestones)

### Milestone A (this milestone) - Architecture & Setup
- [x] System architecture document
- [ ] Initialize monorepo (root package.json, workspaces, tsconfig.base)
- [ ] docker-compose.yml (Postgres 16 + Redis 7)
- [ ] packages/shared skeleton (schemas, types, constants)
- [ ] packages/backend skeleton (Express app, config, middleware, Drizzle setup)
- [ ] packages/frontend skeleton (Vite + React + Tailwind + shadcn/ui + React Router)
- [ ] Full Drizzle schema (all tables, enums, indexes)
- [ ] Database migrations + seed (categories, tags, use-cases, built-in tools)
- [ ] .env.example, .gitignore

### Milestone B - Catalog Foundation
- Auth module (register, login, OAuth, sessions)
- Public site shell (layout, navbar, footer)
- Catalog CRUD + subtype service
- Categories/tags/use-cases management
- Published item detail pages
- Admin CMS basics (create/edit/publish catalog items)
- Search/filter module

### Milestone C - Models, Packs, Local, Assets
- OpenRouter model sync job
- Model detail pages (pricing, capabilities)
- Pack pages (prompt packs, workflow packs)
- Local builds pages
- Developer assets pages
- Comparison pages
- Russian Market filtered landing
- Related content links

### Milestone D - Stack Builder
- Wizard questionnaire UI
- Scoring/recommendation engine
- Result page with explanations
- Save/export stack results

### Milestone E - Agent Builder
- Agent CRUD + versioning
- Tool definitions + built-in tools
- Agent builder tabbed UI (identity, model, prompts, tools, output, scenarios, cost limits)
- Test scenario management

### Milestone F - Playground & Analytics
- Agent runtime state machine
- OpenRouter inference proxy (streaming + non-streaming)
- Tool execution loop with sandbox
- SSE streaming to frontend
- Chat interface + tool call display
- Usage/cost capture (pre-run estimate + post-run actual)
- Cost dashboards
- Run detail pages
- Model comparison runs

---

## 10. Verification

After Milestone A implementation (setup + schema):

1. `docker compose up -d` — Postgres + Redis start successfully
2. `npm run dev` from root — both backend and frontend start
3. `npm run db:push` — Drizzle pushes all tables to Postgres without errors
4. `npm run db:seed` — seed data inserts (categories, tags, use-cases, built-in tools)
5. Connect to Postgres via `drizzle-kit studio` — verify all tables exist with correct columns and indexes
6. Frontend loads at `http://localhost:5173` with basic layout
7. Backend responds to `GET http://localhost:3001/api/health` with 200
8. `npm run typecheck` — no TypeScript errors across all packages
9. `npm run lint` — no lint errors

---

## Critical Files

| File | Purpose |
|------|---------|
| `package.json` (root) | npm workspaces config, dev/build scripts |
| `docker-compose.yml` | PostgreSQL 16 + Redis 7 dev environment |
| `packages/shared/src/constants/*.ts` | All enum definitions (source of truth) |
| `packages/shared/src/schemas/*.ts` | Zod validation schemas shared by frontend + backend |
| `packages/shared/src/types/*.ts` | API request/response TypeScript types |
| `packages/backend/src/config/env.ts` | Zod-validated environment variables |
| `packages/backend/src/db/schema/*.ts` | All Drizzle table definitions (~12 files by domain) |
| `packages/backend/src/db/seed/*.ts` | Seed data for categories, tags, use-cases, built-in tools |
| `packages/backend/src/app.ts` | Express app setup (middleware, route registration) |
| `packages/backend/src/middleware/*.ts` | Auth guard, role guard, rate limiter, error handler, validation |
| `packages/frontend/src/router.tsx` | All route definitions |
| `packages/frontend/src/App.tsx` | Root component with providers |
| `packages/frontend/src/lib/api-client.ts` | Axios/fetch wrapper with credentials |
