# LLMStore.pro — Software Design Document (SDD)

## 1. Document Overview

**Project Name:** LLMStore.pro  
**Project Type:** curated marketplace + catalog + builder platform for LLM tools, prompts, agents, assets, local builds, and deployable AI stacks  
**Primary Domain:** `llmstore.pro`  
**Target Users:** developers, indie hackers, founders, technical PMs, SMB owners, AI enthusiasts, Russian-speaking users looking for curated LLM solutions  
**Primary Goal:** build a unified platform where users can discover, compare, configure, test, and save LLM-based tools, packs, agents, assets, and local AI stacks.

---

## 2. Product Positioning

**Core concept:**

**LLMStore.pro — curated marketplace of LLM tools, prompts, agents, assets, and deployable AI stacks.**

The platform should combine these directions into one coherent product:

1. App Store for LLM tools and models
2. Marketplace of prompt packs and AI workflow packs
3. Store of local LLM builds
4. LLM Stack Builder
5. Store / showcase of business AI agents
6. Developer asset store for AI builders
7. Russian-focused LLM market and RU-specific comparisons
8. Agent Builder + live Playground using OpenRouter

The product must not feel like 8 unrelated micro-sites. It must feel like one platform centered around:

**“Discover, compare, configure, and test the right LLM solution for a specific task.”**

---

## 3. Product Goals

### 3.1 Business goals

- create a strong public product on `llmstore.pro`
- generate SEO traffic around models, AI tools, local builds, RU-focused comparisons, and stack recommendations
- later monetize through paid packs, paid assets, lead generation for business agents, sponsorships, and affiliate placements
- build a reusable AI platform foundation that can later expand into a real marketplace

### 3.2 User goals

Users should be able to:

- browse and filter LLM tools and models
- discover prompt packs and workflow packs
- browse local AI builds for specific hardware or tasks
- build a recommended AI stack from a wizard
- compare models, tools, and builds
- browse RU-friendly and Russian-language-capable solutions
- build a configurable agent on the site
- test that agent directly on the site using OpenRouter
- see estimated and actual token usage / cost by selected model
- save and share their created agent or stack

---

## 4. Scope

### 4.1 In Scope for V1

1. Public marketing site + product catalog
2. Unified catalog for:
   - tools
   - models
   - packs
   - agents
   - assets
   - local builds
   - stacks
3. Filtering, search, categories, tags
4. Comparison pages
5. Russian market section
6. Stack Builder
7. Agent Builder (config-driven, not drag-and-drop graph yet)
8. Agent Playground (chat / test run)
9. OpenRouter integration
10. Usage and cost analytics per run
11. Saved agents and saved stacks
12. Admin CMS for curated content
13. Model sync from OpenRouter
14. Basic auth / account system
15. Favorites / bookmarks
16. Shareable public pages for curated entities

### 4.2 Out of Scope for V1

1. Full public multi-vendor marketplace with seller payouts
2. Full billing / Stripe marketplace logic
3. Arbitrary code execution by users
4. Full drag-and-drop node-based workflow editor
5. User-created external tool marketplace
6. Arbitrary remote connector execution
7. Full enterprise organization/teams features

---

## 5. Product Principles

1. **Curated first, open marketplace later**  
   Do not let the platform become a junkyard of low-quality entries.

2. **One unified metadata model**  
   Every entity must be discoverable through shared categories, tags, use cases, deployment types, pricing, language support, privacy, hardware requirements, and supported capabilities.

3. **Builder over directory**  
   The directory is not enough. The builders (stack builder + agent builder) are the differentiation.

4. **Safe prototyping first**  
   For V1, “agent builder” means configurable prompt/tool agent execution, not arbitrary code runner.

5. **Backend-proxied AI execution only**  
   Never expose OpenRouter API keys to the browser.

6. **Phase-based delivery**  
   Ship a strong V1 in milestones. Do not attempt a giant everything-at-once implementation.

---

## 6. User Types and Core Use Cases

### 6.1 User types

- Guest visitor
- Registered user
- Power user / builder
- Content curator / admin
- Later: author / seller

### 6.2 Core use cases

1. Browse best coding models
2. Find RU-friendly speech-to-text tools
3. Compare 3 models for support agent use case
4. Find best local stack for RTX 4070 Ti or similar hardware
5. Build a Telegram content agent
6. Create a support agent with chosen model and tools
7. Run sample prompts against multiple models
8. Estimate cost before running
9. See real token usage and actual cost after run
10. Save a reusable agent configuration
11. Share a stack or agent page with others

---

## 7. Information Architecture

### 7.1 Main navigation

- Home
- Tools
- Models
- Packs
- Agents
- Local
- Builder
- Assets
- Russian Market
- Compare
- Guides
- Submit
- Dashboard

### 7.2 Main routes

- `/`
- `/tools`
- `/tools/:slug`
- `/models`
- `/models/:slug`
- `/packs`
- `/packs/:slug`
- `/agents`
- `/agents/:slug`
- `/local`
- `/local/:slug`
- `/assets`
- `/assets/:slug`
- `/stacks`
- `/stacks/:slug`
- `/builder/stack`
- `/builder/agent`
- `/builder/agent/:id`
- `/playground/agent/:id`
- `/compare`
- `/compare/models`
- `/compare/tools`
- `/compare/stacks`
- `/russian-market`
- `/guides`
- `/dashboard`
- `/dashboard/saved`
- `/dashboard/agents`
- `/dashboard/runs`
- `/dashboard/costs`
- `/admin`
- `/admin/catalog`
- `/admin/models`
- `/admin/packs`
- `/admin/agents`
- `/admin/assets`
- `/admin/local`
- `/admin/russian-market`
- `/admin/sync`

---

## 8. Main Product Modules

### 8.1 Unified Catalog

The platform must support a unified catalog abstraction.

#### Catalog content types

- tool
- model
- prompt_pack
- workflow_pack
- business_agent
- developer_asset
- local_build
- stack_preset
- guide

#### Shared fields

Each item has:

- title
- slug
- summary
- body / rich description
- content type
- status
- visibility
- hero image
- tags
- categories
- use cases
- pricing type
- deployment type
- language support
- privacy type
- difficulty
- readiness level
- source links
- SEO metadata

---

### 8.2 Tools / Models Section

Purpose:
- function as the “App Store” layer

Features:
- cards grid
- table/list view
- filters
- search
- sort by popularity / newest / curated / best for RU / best for local / cheapest / highest context
- detailed product pages
- supported capabilities
- pricing metadata
- privacy metadata
- use-case recommendations
- compare checkbox

---

### 8.3 Packs Section

Contains:
- prompt packs
- workflow packs
- structured templates
- role packs
- content automation packs
- support packs
- coding packs
- product / PM packs
- Telegram packs
- RAG packs

Each pack page should include:
- what it solves
- inputs
- outputs
- model recommendations
- best use cases
- variables schema
- included prompts / templates
- optional JSON schema for output
- “test in playground”
- “use in agent builder”

---

### 8.4 Local Builds Section

Contains:
- local model presets
- Ollama bundles
- LM Studio bundles
- llama.cpp builds
- Open WebUI stacks
- vLLM / self-hosted deployment presets
- hardware-focused recommendations

Each local build should include:
- required RAM / VRAM
- OS compatibility
- intended use cases
- model list
- install commands
- runtime notes
- privacy profile
- rough speed / latency notes
- RU language suitability
- self-hosting complexity

---

### 8.5 Stack Builder

Wizard-based builder.

User answers:
- use case
- local or cloud
- budget sensitivity
- privacy requirements
- RU language importance
- required capabilities (tools, structured outputs, reasoning, vision, etc.)
- hardware availability
- deployment preference
- business or personal usage

Output:
- recommended models
- recommended tools
- recommended local builds or hosted stacks
- suggested prompt/workflow packs
- suggested agents
- estimated cost tier
- suggested deployment approach

User can:
- save result
- export result
- turn result into a “stack page”
- continue to agent builder

---

### 8.6 Russian Market Section

Specialized content hub for Russian-speaking users.

Must support:
- best models for Russian
- best speech-to-text for Russian
- best TTS for Russian
- best OCR for Cyrillic
- best local RU models
- best RU-friendly toolchain
- curated comparisons for RU use cases

This section is mostly content + filtered catalog views + curated landing pages.

---

### 8.7 Business Agents Section

Curated showcase of agent solutions for business.

Examples:
- support agent
- sales follow-up agent
- document extraction agent
- meeting summarizer
- Telegram publisher
- knowledge-base agent
- recruiting screener
- internal AI assistant

Each page must show:
- what it does
- target audience
- deployment type
- recommended models
- estimated operating cost
- example workflow
- tool requirements
- privacy notes
- “test prototype”
- “clone to my builder”

---

### 8.8 Developer Assets Section

Contains reusable building blocks:
- system prompts
- JSON schemas
- output schemas
- eval datasets
- synthetic datasets
- tool definitions
- RAG presets
- chunking strategies
- guardrail rules
- connector / MCP templates
- starter agent templates

Each asset page should support:
- metadata
- schema preview
- copy / download
- related packs
- related agents
- recommended models

---

### 8.9 Agent Builder

This is a key feature.

#### Important product decision

For **V1**, do **not** build a full visual node-based workflow editor.

Instead, build a **config-driven agent builder UI** with the following sections:

1. **Agent identity**
   - name
   - description
   - goal
   - visibility
   - tags

2. **Runtime config**
   - selected model
   - temperature
   - max tokens
   - top_p
   - tool calling enabled
   - structured output enabled
   - streaming enabled
   - privacy mode / ZDR
   - allow fallback providers
   - max tool iterations
   - timeout

3. **Prompt config**
   - system prompt
   - developer instructions
   - starter user prompt template
   - variables schema

4. **Tools config**
   - built-in tools library
   - HTTP tools
   - mock tools for testing
   - tool schemas
   - tool descriptions
   - required vs optional tools

5. **Output config**
   - free text
   - JSON mode
   - JSON schema mode
   - validation rules

6. **Test data config**
   - scenario presets
   - input variables
   - sample messages

7. **Run config**
   - session grouping
   - observability labels
   - cost limits / soft warning thresholds

#### Built-in tool categories for V1

- http_request
- calculator
- json_transform
- template_renderer
- knowledge_lookup (internal only if data source exists)
- mock_tool
- webhook_call

Do not implement arbitrary shell execution or arbitrary JS/Python execution in V1.

---

### 8.10 Agent Playground

Users can test the built agent directly on the site.

Features:
- chat-style interface
- scenario runner
- streaming output
- tool call visibility
- token usage summary
- per-message cost
- full run summary
- latency
- model/provider used
- export run
- rerun with another model
- compare two models on same input
- duplicate run

#### Playground modes

1. Chat test
2. Structured output test
3. Scenario test
4. Compare models
5. Cost estimation preflight

---

### 8.11 Cost and Usage Analytics

A core feature.

Must support:
- per-run actual prompt / completion / reasoning / cached tokens
- estimated cost before execution
- actual cost after execution
- cost grouped by:
  - user
  - agent
  - model
  - provider
  - day / week / month
- aggregate dashboards
- cost trend charts
- top expensive agents
- cost per successful scenario
- average latency
- prompt cache visibility if available

---

## 9. OpenRouter Integration Requirements

Use OpenRouter as the primary inference provider for V1.

### 9.1 Main goals of integration

- unified access to multiple models
- one provider abstraction for runtime
- backend-side control of requests
- cost / token accounting
- support for streaming
- support for tool calling
- support for structured outputs where model allows it

### 9.2 API strategy

For V1:
- use **Chat Completions style runtime** as the default execution path
- keep internal abstraction flexible so another API mode can be added later
- support model capability checks before execution
- all requests go through backend proxy layer

### 9.3 Model sync

Create a backend sync job:
- fetch model list from OpenRouter
- store:
  - model id
  - name
  - context length
  - pricing
  - architecture
  - supported parameters
  - provider metadata if available
- update nightly and via admin manual trigger

### 9.4 Runtime accounting

On each run:
- send request through backend
- store request metadata
- capture usage from response
- capture final usage after streaming if streaming mode used
- store actual token usage and cost
- support later audit / backfill logic if needed

### 9.5 Tool calling

Agent builder must only allow tool-enabled execution when the chosen model supports tools.

The runtime loop must:
1. send prompt
2. inspect tool call request
3. execute allowed tool
4. append tool result
5. continue until finish or iteration limit

### 9.6 Structured outputs

If structured output mode is enabled:
- validate selected model capabilities
- store JSON schema per agent version
- validate returned data server-side
- return validation result to UI

### 9.7 Routing and privacy

Expose advanced runtime options:
- allow fallbacks
- provider preferences
- required parameters
- privacy mode / ZDR-like option
- data retention preference flags if supported

### 9.8 Observability

For each agent run:
- send session/group identifiers where useful
- store internal correlation IDs
- log model, latency, token usage, cost, tool calls, and errors

---

## 10. Recommended Tech Stack

### Frontend
- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- TanStack Query
- React Router
- Zod for forms / validation
- charting library for analytics

### Backend
- Node.js
- TypeScript
- Express
- PostgreSQL
- Drizzle ORM
- Redis (recommended)
- BullMQ or similar for jobs
- SSE for streaming inference
- Zod validation
- OpenRouter integration wrapper
- structured logging

### Deployment
- Ubuntu server
- Nginx reverse proxy
- PM2
- PostgreSQL local or managed
- Redis local or managed
- Cloudflare / DNS as needed

### Storage
- PostgreSQL for structured data
- local storage or S3-compatible storage for files / assets / exports

---

## 11. System Architecture

### 11.1 High-level architecture

1. Frontend web app
2. Backend API
3. PostgreSQL database
4. Job worker
5. OpenRouter service adapter
6. Optional Redis cache / queue
7. Admin dashboard

### 11.2 Core backend modules

- auth module
- catalog module
- search/filter module
- stack builder module
- agent builder module
- agent runtime module
- tool execution module
- OpenRouter adapter
- usage accounting module
- analytics module
- admin CMS module
- model sync job
- SEO / static content module

---

## 12. Shared Metadata Model

All catalog entities should support a unified metadata/filter model.

### Shared filters / tags

- type  
  `tool | model | prompt_pack | workflow_pack | business_agent | developer_asset | local_build | stack_preset | guide`

- use case  
  `coding | chat | rag | support | voice | ocr | content | automation | analytics | agentic workflows`

- deployment  
  `cloud | local | self-hosted | hybrid`

- pricing  
  `free | paid | open-source | api-based | enterprise`

- language support  
  `ru | en | multilingual`

- privacy  
  `public_api | private | offline | zero-retention-compatible`

- hardware requirement  
  `cpu | low_gpu | mid_gpu | high_gpu | custom`

- business size  
  `solo | startup | smb | enterprise`

- difficulty  
  `beginner | intermediate | advanced`

- readiness  
  `template | deployable | production-ready`

This shared metadata system must power:
- catalog filtering
- compare pages
- builder recommendations
- related items
- SEO landing pages

---

## 13. Data Model

Use a **hybrid unified catalog + subtype tables** approach.

### 13.1 Core tables

#### users
- id
- email
- username
- name
- avatar_url
- role
- status
- created_at
- updated_at

#### sessions / auth_accounts
Standard auth tables.

#### catalog_items
- id
- type
- title
- slug
- short_description
- full_description
- status (`draft`, `published`, `archived`)
- visibility (`public`, `private`, `unlisted`)
- hero_image_url
- author_user_id nullable
- curated_score
- featured
- seo_title
- seo_description
- created_at
- updated_at
- published_at

#### categories
- id
- name
- slug
- parent_id nullable

#### tags
- id
- name
- slug

#### catalog_item_categories
- item_id
- category_id

#### catalog_item_tags
- item_id
- tag_id

#### use_cases
- id
- name
- slug

#### catalog_item_use_cases
- item_id
- use_case_id

#### catalog_item_meta
- item_id
- pricing_type
- deployment_type
- privacy_type
- language_support
- difficulty
- readiness
- vendor_name
- source_url
- docs_url
- github_url
- website_url
- metadata_json

---

### 13.2 Model tables

#### ai_models
- id
- catalog_item_id
- provider_source (`openrouter`)
- external_model_id
- canonical_slug
- display_name
- context_length
- tokenizer
- modality
- input_modalities jsonb
- output_modalities jsonb
- supported_parameters jsonb
- pricing_prompt
- pricing_completion
- pricing_request
- pricing_image
- provider_meta_json
- raw_json
- last_synced_at

#### model_price_snapshots
- id
- ai_model_id
- pricing_prompt
- pricing_completion
- pricing_request
- pricing_image
- captured_at

---

### 13.3 Packs / assets / local / stack tables

#### prompt_packs
- id
- catalog_item_id
- variables_schema jsonb
- default_system_prompt text
- default_user_prompt text
- output_schema jsonb nullable
- recommended_model_ids jsonb
- import_format
- export_format

#### workflow_packs
- id
- catalog_item_id
- workflow_definition jsonb
- variables_schema jsonb
- output_schema jsonb
- recommended_model_ids jsonb

#### developer_assets
- id
- catalog_item_id
- asset_type
- schema_json jsonb
- content_text text nullable
- download_url nullable
- format
- license
- recommended_use_cases jsonb

#### local_builds
- id
- catalog_item_id
- runtime_type
- install_steps markdown/text
- hardware_requirements jsonb
- os_support jsonb
- model_refs jsonb
- privacy_notes text
- complexity_level
- benchmark_notes text

#### stack_presets
- id
- catalog_item_id
- stack_definition jsonb
- budget_tier
- privacy_tier
- deployment_mode
- recommended_for jsonb

---

### 13.4 Agent builder tables

#### agents
- id
- owner_user_id
- source_catalog_item_id nullable
- name
- slug nullable
- description
- visibility
- status
- current_version_id nullable
- created_at
- updated_at

#### agent_versions
- id
- agent_id
- version_number
- model_id nullable
- runtime_engine
- system_prompt
- developer_prompt nullable
- starter_prompt_template nullable
- variables_schema jsonb
- response_mode (`text`, `json_object`, `json_schema`)
- response_schema jsonb nullable
- runtime_config jsonb
- routing_config jsonb
- privacy_config jsonb
- tool_config jsonb
- evaluation_config jsonb
- published_at nullable
- created_at

#### tool_definitions
- id
- owner_user_id nullable
- name
- slug
- tool_type (`http_request`, `calculator`, `mock_tool`, `webhook_call`, `json_transform`, etc.)
- description
- input_schema jsonb
- output_schema jsonb
- config_json jsonb
- is_builtin
- is_active
- created_at
- updated_at

#### agent_version_tools
- agent_version_id
- tool_definition_id
- is_required
- order_index
- config_override_json

#### agent_test_scenarios
- id
- agent_id
- name
- description
- input_json
- expected_output_schema jsonb nullable
- rubric_json jsonb nullable
- created_at

---

### 13.5 Runtime / analytics tables

#### agent_runs
- id
- agent_id
- agent_version_id
- user_id
- status
- mode (`chat`, `scenario`, `comparison`)
- model_id nullable
- provider_name nullable
- external_generation_id nullable
- external_response_id nullable
- session_key
- trace_id
- started_at
- completed_at
- latency_ms
- error_message nullable
- input_summary text
- output_summary text
- final_output text nullable
- final_output_json jsonb nullable

#### agent_run_messages
- id
- run_id
- role
- content_text
- content_json jsonb nullable
- token_estimate nullable
- created_at

#### agent_run_tool_calls
- id
- run_id
- tool_definition_id
- tool_call_id
- tool_name
- tool_input jsonb
- tool_output jsonb
- status
- duration_ms
- error_message nullable
- created_at

#### usage_ledger
- id
- run_id
- provider
- model_external_id
- provider_name nullable
- prompt_tokens
- completion_tokens
- reasoning_tokens nullable
- cached_tokens nullable
- total_tokens nullable
- estimated_cost nullable
- actual_cost nullable
- cache_discount nullable
- currency
- raw_usage_json jsonb
- created_at

#### cost_daily_aggregates
- id
- user_id nullable
- agent_id nullable
- model_id nullable
- day
- total_runs
- prompt_tokens
- completion_tokens
- reasoning_tokens
- cached_tokens
- actual_cost

#### saved_stack_results
- id
- user_id
- builder_answers jsonb
- recommended_result jsonb
- created_at

#### favorites
- id
- user_id
- catalog_item_id
- created_at

---

## 14. Agent Definition Format

Use a JSON-backed config model for V1.

Example conceptual format:

```json
{
  "identity": {
    "name": "Telegram Publisher Agent",
    "description": "Creates and refines a Telegram post draft"
  },
  "runtime": {
    "model": "provider/model-id",
    "temperature": 0.4,
    "max_tokens": 1200,
    "stream": true,
    "toolCalling": true,
    "structuredOutput": false,
    "maxIterations": 6
  },
  "routing": {
    "allowFallbacks": true,
    "privacyMode": false
  },
  "prompts": {
    "system": "You are a concise Telegram editor...",
    "developer": "Prefer short paragraphs, avoid fluff...",
    "starterTemplate": "Draft a post about {{topic}} for {{audience}}"
  },
  "tools": [
    {
      "name": "http_request",
      "required": false
    },
    {
      "name": "calculator",
      "required": false
    }
  ],
  "output": {
    "mode": "text"
  }
}

This is enough for V1.
Do not overengineer this into a visual DAG immediately.

15. Backend API Design
15.1 Public catalog API
GET /api/catalog
GET /api/catalog/:type
GET /api/catalog/:type/:slug
GET /api/categories
GET /api/tags
GET /api/use-cases
GET /api/compare
15.2 Builder API
POST /api/builder/stack/recommend
POST /api/builder/stack/save
POST /api/builder/stack/export
15.3 Agent Builder API
POST /api/agents
GET /api/agents/:id
PATCH /api/agents/:id
POST /api/agents/:id/version
GET /api/agents/:id/versions
POST /api/agents/:id/test-scenarios
GET /api/tools
POST /api/tools
15.4 Runtime API
POST /api/agent-runs/start
GET /api/agent-runs/:id
GET /api/agent-runs/:id/stream
POST /api/agent-runs/:id/retry
POST /api/agent-runs/:id/compare
GET /api/agent-runs/:id/costs
15.5 Analytics API
GET /api/dashboard/costs
GET /api/dashboard/runs
GET /api/dashboard/usage
GET /api/dashboard/agents/:id/analytics
15.6 Admin API
POST /api/admin/sync/models
POST /api/admin/catalog
PATCH /api/admin/catalog/:id
POST /api/admin/publish/:id
16. Core Execution Flow for Agent Playground
User opens Agent Builder or existing agent page
User selects model
Backend validates model capabilities from stored model metadata
User enters test input / scenario
Backend constructs runtime request
Backend sends request through OpenRouter adapter
If tools are called:
model requests tool call
backend validates whether tool is allowed
backend executes allowed tool
backend appends tool result
backend continues loop until stop or max iterations
Backend stores messages, tool calls, timing, usage, and cost
Frontend streams response and updates run UI
Final summary page shows:
selected model
provider used if known
latency
prompt tokens
completion tokens
reasoning tokens if available
cached tokens if available
estimated vs actual cost
final output
tool execution trail
17. Cost Estimation Logic

Implement two levels of costing.

17.1 Pre-run estimate

Before execution:

estimate prompt tokens using rough tokenizer approximation or historical ratio
multiply by current stored model pricing snapshot
use selected max_tokens or expected output budget
show low / expected / high estimate
17.2 Post-run actual

After execution:

use response usage
persist actual cost
show delta between estimate and actual
17.3 Extra analytics
cost per tool-enabled run
cost per scenario
average cost by model
average cost by use case
cache savings if available
reasoning token breakdown if available
18. Recommendation Engine Logic
18.1 Stack Builder recommendation inputs

The stack builder should evaluate:

use case
local vs cloud preference
budget sensitivity
privacy requirement
Russian language importance
hardware availability
structured outputs need
tool calling need
vision need
business size
skill level
18.2 Recommendation output format

The builder should return:

top recommended models
top recommended tools
top recommended local builds or deployment setups
top relevant packs
top relevant agent templates
estimated cost band
confidence notes / tradeoffs
warnings or limitations
18.3 Recommendation style

The result should not just dump raw entries.
It should explain:

why these items match
main tradeoffs
cheaper alternative
privacy-first alternative
Russian-focused alternative
self-hosted alternative
19. Search, Discovery, and SEO
19.1 Search / filter behavior

Shared filters across all content types:

content type
use case
pricing type
local vs cloud
open-source vs proprietary
RU support
privacy type
tool calling support
structured outputs support
reasoning support
context length tier
hardware tier
business size
difficulty
19.2 SEO pages

Generate landing pages for:

best coding models
best models for Russian
best local models for low / mid / high VRAM
best support-agent stacks
best structured-output models
best tool-calling models
best local AI builds for privacy
best OCR for Cyrillic
compare X vs Y
build a Telegram agent
build a support AI agent
19.3 Internal linking

Each item page should link to:

related models
related tools
related packs
related assets
related local builds
related agent templates
relevant guides
20. Admin Panel Requirements

Admin must be able to:

create / edit / publish any catalog item
assign tags, categories, and use cases
manage featured content
manually sync models from provider
review future user submissions
review agent templates
see usage / cost dashboards
manage guides and landing pages
manage Russian-market featured selections
20.1 Admin UI sections
Content overview
Catalog items
Models
Packs
Assets
Local builds
Agents
Guides
Landing pages
Sync jobs
Usage analytics
Cost analytics
21. Security and Privacy
Mandatory rules
Never expose OpenRouter API key in browser
Route all model requests through backend
Store only necessary prompt / run data
Support privacy mode in agent config
Add usage quotas / run limits per user
Add rate limiting
Sanitize user HTML / markdown content
Validate tool schemas strictly
Restrict outbound tool execution
For V1, do not allow arbitrary code execution
Tool safety

For V1 tools:

allowlist outbound domains for HTTP tools where practical
request timeout
response size limit
method restrictions
no internal network access
no filesystem access
no shell access
Content safety
sanitize rich text content
prevent XSS in user-generated descriptions
validate URLs
validate JSON schemas
protect admin routes
22. Non-Functional Requirements
mobile-friendly browsing experience
desktop-first builder UX
page load optimization
SEO-friendly public pages
streaming response UX with quick initial feedback
resilient retries for model sync jobs
auditable runtime logs
structured logs for errors, cost, and latency
graceful fallback UI when provider/model fails
Reliability expectations
builder drafts should autosave where practical
run records should persist even when runtime errors occur
failed executions should still show partial metadata and error logs
23. UX Notes
23.1 Home page

Sections:

hero with search
Explore Tools
Build My Stack
Build My Agent
Featured local builds
Best for Russian
Featured business agents
Featured packs
Compare top models
Guides
23.2 Agent Builder UX

Tabs:

Basics
Model
Prompts
Tools
Output
Test Scenarios
Cost Limits
Playground
23.3 Run detail UX

Show:

run status
live output
tool execution steps
latency
token usage
actual cost
structured output validation result
provider/meta panel
23.4 Comparison UX

Users should be able to:

select multiple models
compare by:
price
context
capabilities
privacy
RU suitability
deployment fit
save comparison link
24. Content Strategy Requirements

The platform must feel curated, not empty and not spammy.

Initial content target for launch

Recommended minimum curated content for first public version:

30–60 tools / models combined
10–20 packs
10–15 local builds
10–20 assets
10–15 business agent pages / templates
10–20 guides / SEO pages
10–15 RU-market curated pages or filtered lists
Content quality rule

Better:

30 deep, useful entries

Than:

300 shallow placeholder cards
25. Implementation Phases
Phase 1 — Foundation

Implement:

auth
public site shell
catalog core
categories / tags / use cases
admin CMS basics
model sync
models / tools basic pages

Deliverable: working catalog foundation

Phase 2 — Packs / Local / Russian Market

Implement:

packs
local builds
developer assets
Russian Market landing pages
shared filtering and comparison
SEO pages

Deliverable: full curated discovery layer

Phase 3 — Stack Builder

Implement:

wizard questions
recommendation engine
save / export stack results
stack preset pages

Deliverable: interactive stack recommendation system

Phase 4 — Agent Builder

Implement:

agents
agent versions
tool definitions
runtime config UI
structured output config
scenario definitions

Deliverable: config-driven agent builder

Phase 5 — Agent Playground + Runtime

Implement:

backend runtime loop
tool execution loop
streaming UI
usage tracking
cost dashboards baseline
compare run mode
rerun with another model

Deliverable: live testable agents on site

Phase 6 — Analytics / Compare / Polish

Implement:

analytics dashboards
cost charts
favorite / save / share
public template cloning
comparison UX improvements
admin polish
SEO improvements

Deliverable: full V1 product

Phase 7 — Optional V2 Expansion

Later:

node-based visual builder
marketplace seller accounts
paid packs / assets
stronger sandbox workers
organization / team accounts
eval scoring and automated benchmarking
26. Acceptance Criteria for V1
Catalog
user can browse all supported content types
user can filter by shared metadata
user can open item details
admin can create and publish entries
Models
model metadata is synced from provider
model pages show capabilities and pricing fields
builder validates features based on model support
Stack Builder
user answers wizard
system returns recommended stack
user can save/export result
Agent Builder
user can create agent
user can configure prompt/model/tools/output mode
user can save versions
Playground
user can run agent
tool calls are visible
response streams
actual usage and cost are stored
run detail page is accessible later
Analytics
per-run cost is visible
per-agent aggregates are visible
user dashboard shows runs and costs
admin dashboard shows overall usage
27. Blunt Engineering Constraints

Qoder must follow these constraints:

Do not try to build a full visual workflow canvas in V1
Do not build arbitrary code execution in V1
Do not build third-party seller payouts in V1
Do not overfit to one model vendor
Do not hardcode model capabilities
Do not expose provider secrets client-side
Do not make catalog schemas fragmented beyond reason
Do not implement separate disconnected systems for tools / packs / agents / assets / local builds
Use one unified metadata/filtering approach
Ship a strong V1, not a fake “all-features” corpse
28. Specific Instruction to Qoder

Build this project as a production-oriented V1 with clean architecture and phased delivery.

Prioritize:

strong shared data model
admin-managed curated content
OpenRouter-backed agent runtime
accurate token / cost accounting
good UX for discovery + building + testing

Avoid:

overengineering
visual workflow editor in first iteration
arbitrary execution sandbox in first iteration
public marketplace complexity in first iteration

The project should feel like:

Product Hunt + Prompt marketplace + Local AI directory + Agent builder

But implemented as one coherent system, not several disconnected mini-apps.

29. Required First Deliverable from Qoder

Before coding everything, Qoder should first produce:

final system architecture diagram
normalized DB schema proposal
route map
API contract draft
phased implementation plan by milestone
list of reusable UI primitives
provider adapter design
agent runtime state machine
cost accounting logic spec
admin CMS content model

Only after that should implementation begin.

30. Suggested Initial Milestone Breakdown
Milestone A — Architecture and schema
system architecture
Drizzle schema proposal
route map
API contract draft
admin content model
phased plan
Milestone B — Catalog foundation
public shell
auth
catalog CRUD
categories/tags/use cases
published item pages
admin basics
Milestone C — Models, packs, local, assets
subtype pages
filters
comparisons
related content
Russian Market pages
Milestone D — Stack Builder
questionnaire
scoring / recommendation engine
result page
save/export
Milestone E — Agent Builder
agent CRUD
versioning
tools config
output schema config
scenario setup
Milestone F — Playground and analytics
runtime loop
streaming
tool execution
usage/cost capture
dashboards
run details
31. Future V2 Ideas

These are intentionally not part of V1, but architecture should not block them:

visual graph builder
seller submissions and moderation queue
paid downloads
affiliate link management
organization workspaces
automated benchmark pages
multi-model batch evaluation
prompt version diffing
agent marketplace with ratings
deployment recipes / one-click deploy targets
32. Final Summary

LLMStore.pro should become a unified curated platform for:

discovering models and tools
comparing AI solutions
browsing local AI stacks
finding RU-friendly solutions
using reusable packs and assets
building task-specific agents
testing agents directly on site
tracking token usage and cost

The platform must be implemented as a coherent, metadata-driven system with strong phased delivery.