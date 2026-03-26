# Milestone D: Stack Builder — Implementation Plan

## Context

LLMStore.pro Milestones A+B are complete (catalog, auth, admin, seed data, deployed to production). The next step per `llmstore-agent.md` is Milestone D — the Stack Builder recommendation layer. This lets users answer a wizard questionnaire and receive scored, ranked recommendations from the existing catalog, then save/export/convert results into agents.

**No DB migrations needed** — `saved_stack_results`, `agents`, `agent_versions` tables already exist with correct schemas.

---

## Implementation Steps

### Step 1: Shared Package — Constants & Schemas

**New file: `packages/shared/src/constants/stack-wizard.ts`**
- Wizard option enums: `WizardUseCase` (11 options), `HardwareTier` (5), `UsageScale` (5), `CapabilityOption` (8), `BudgetSensitivity` (extended to 6), `DeploymentPreference` (extended to 5), `PrivacyRequirement` (extended to 5), `LanguageRequirement` (4)
- Each as `as const` objects with values matching the spec's wizard groups A–I

**Modify: `packages/shared/src/schemas/stack-builder.ts`**
- Extend `stackBuilderInputSchema`: replace free-text `use_case` with constrained enum, add `usage_scale`, add `hardware_tier` enum alongside existing `hardware_available`
- Add `saveStackResultSchema` (name + answers + result)
- Add `exportStackSchema` (format: json|markdown, result or saved_result_id)
- Add `createAgentFromStackSchema` (name?, saved_result_id or result)

**New file: `packages/shared/src/types/stack-builder.ts`**
- `ScoredItem` — catalog item + score + breakdown + penalties + confidence
- `StackRecommendation` — best_overall, cheapest, best_privacy, best_russian, best_self_hosted, all_scored[], rationale[], tradeoffs[], next_steps[], cost_band, generated_at
- `SavedStackResult` — id, user_id, name, builder_answers, recommended_result, created_at

**Modify: `packages/shared/src/constants/index.ts`** — add stack-wizard export
**Modify: `packages/shared/src/types/index.ts`** — add stack-builder export

### Step 2: Backend — Recommendation Engine (pure functions)

**New file: `packages/backend/src/modules/stack-builder/engine.ts`**

Deterministic weighted scoring algorithm:

| Dimension | Max Points | Logic |
|-----------|-----------|-------|
| Base curated_score | 100 | Direct from DB |
| Use-case match | +25 | Item's use_cases slugs match wizard selection (static mapping table) |
| Capability match | +15 each (max 120) | Check model's supported_parameters, input_modalities, context_length, pricing |
| Deployment match | +20 | deployment_type compatibility |
| Language match | +20 | language_support compatibility |
| Privacy match | +20 | privacy_type compatibility |
| Hardware fit | +15 | hardware_tier vs item requirements |
| Cost fit | +15 | budget_sensitivity vs pricing_type |
| Complexity penalty | -10 | skill_level vs difficulty mismatch |

Hard exclusions (item skipped entirely):
- User=local only, item=cloud only
- User needs structured_outputs, model lacks json_mode/json_schema
- User needs tool_calling, model lacks tools support
- User=Russian critical, item=English only
- User=offline, item=cloud+public_api

Functions:
- `scoreAndRank(items, input)` → ScoredItem[] sorted by score desc
- `selectWinners(scored)` → { best_overall, cheapest, best_privacy, best_russian, best_self_hosted }
- `generateRationale(input, winners, allScored)` → { rationale[], tradeoffs[], next_steps[] }

**New file: `packages/backend/src/modules/stack-builder/formatters.ts`**
- `toJson(result)` → clean serializable object
- `toMarkdown(result)` → Markdown document with headers, bullet lists, badges

### Step 3: Backend — Stack Builder Module

**New files in `packages/backend/src/modules/stack-builder/`:**

`validators.ts` — Zod validation middleware (same pattern as catalog.validators.ts)

`service.ts` — 6 functions:
- `generateRecommendation(input)` — fetch published catalog items + meta + models + tags + use_cases, pass to engine, compose result
- `saveResult(userId, body)` — insert into saved_stack_results
- `listSavedResults(userId)` — select by user_id, order by created_at desc
- `getSavedResult(userId, id)` — select by id, verify ownership
- `exportResult(body)` — resolve result source, call formatters
- `createAgentFromStack(userId, body)` — resolve result, insert into agents + agent_versions with prefilled config from recommendation

`controller.ts` — 6 handlers (try/catch → service → res.json pattern)

`routes.ts` — Express Router:
- `POST /recommend` — no auth required (anonymous wizard)
- `POST /save` — requireAuth
- `GET /saved` — requireAuth
- `GET /saved/:id` — requireAuth
- `POST /export` — no auth required
- `POST /create-agent` — requireAuth

`index.ts` — barrel export

**Modify: `packages/backend/src/app.ts`**
- Import and mount: `app.use('/api/builder/stack', stackBuilderRoutes)`

### Step 4: Frontend — API, Store, Hooks, Labels

**New file: `packages/frontend/src/lib/api/stack-builder.ts`**
- `recommend(answers)`, `save(body)`, `listSaved()`, `getSaved(id)`, `exportResult(body)`, `createAgent(body)`

**New file: `packages/frontend/src/stores/stack-builder-store.ts`** (Zustand)
- State: currentStep (0-8), answers (partial), recommendation (null | result), isLoading, error
- Actions: setAnswer, nextStep, prevStep, goToStep, reset, setRecommendation

**New file: `packages/frontend/src/hooks/useStackBuilder.ts`**
- `useStackRecommend()` — useMutation
- `useSaveStack()` — useMutation, invalidates ['stack-saved']
- `useSavedStacks()` — useQuery
- `useSavedStack(id)` — useQuery
- `useExportStack()` — useMutation (triggers download for markdown)
- `useCreateAgentFromStack()` — useMutation, navigates to redirect_url

**Modify: `packages/frontend/src/lib/label-maps.ts`**
- Add Russian labels for all 9 wizard question groups

**Modify: `packages/frontend/src/lib/api/index.ts`** — export stackBuilderApi
**Modify: `packages/frontend/src/hooks/index.ts`** — export stack builder hooks

### Step 5: Frontend — Shared Wizard Components

**New files in `packages/frontend/src/components/stack-builder/`:**

- `RadioCardGroup.tsx` — reusable grid of selectable cards (single-select)
- `CheckboxCardGroup.tsx` — reusable grid of selectable cards (multi-select)
- `WizardStepper.tsx` — horizontal progress bar with 9 steps, clickable completed steps
- `WizardStepLayout.tsx` — wrapper: title, description, content slot, back/next buttons

### Step 6: Frontend — Wizard Step Components

9 step components, each using RadioCardGroup or CheckboxCardGroup:
- `UseCaseStep.tsx` (A) — 11 radio options
- `DeploymentStep.tsx` (B) — 5 radio options
- `BudgetStep.tsx` (C) — 6 radio options
- `PrivacyStep.tsx` (D) — 5 radio options
- `LanguageStep.tsx` (E) — 4 radio options
- `CapabilitiesStep.tsx` (F) — 8 checkbox options
- `HardwareStep.tsx` (G) — 5 radio options
- `SkillLevelStep.tsx` (H) — 3 radio options
- `UsageScaleStep.tsx` (I) — 5 radio options

### Step 7: Frontend — Result Components

- `RecommendedCard.tsx` — extends CatalogCard pattern + score bar, category badge, confidence indicator
- `RationalePanel.tsx` — rationale paragraphs, tradeoffs bullets, next steps with action links
- `ActionBar.tsx` — save, export (JSON/Markdown dropdown), create agent buttons; login prompt if unauthenticated
- `ResultPanel.tsx` — orchestrates: winner cards row → all scored (collapsible) → rationale → actions

### Step 8: Frontend — Pages & Routing

- `packages/frontend/src/pages/builder/StackBuilderPage.tsx` — wizard phase (steps) → result phase (ResultPanel)
- `packages/frontend/src/pages/builder/SavedStacksPage.tsx` — card grid of saved results
- `packages/frontend/src/pages/builder/SavedStackDetailPage.tsx` — full result view for saved item

**Modify: `packages/frontend/src/App.tsx`**
- Replace placeholder `/builder/stack` → StackBuilderPage
- Add `/builder/stack/saved` → ProtectedRoute → SavedStacksPage
- Add `/builder/stack/saved/:id` → ProtectedRoute → SavedStackDetailPage

---

## File Manifest

### New Files (32)

| Path | Purpose |
|------|---------|
| `packages/shared/src/constants/stack-wizard.ts` | Wizard option constants |
| `packages/shared/src/types/stack-builder.ts` | Result/recommendation types |
| `packages/backend/src/modules/stack-builder/index.ts` | Module barrel |
| `packages/backend/src/modules/stack-builder/routes.ts` | 6 endpoints |
| `packages/backend/src/modules/stack-builder/controller.ts` | Request handlers |
| `packages/backend/src/modules/stack-builder/service.ts` | Business logic + DB |
| `packages/backend/src/modules/stack-builder/engine.ts` | Pure scoring algorithm |
| `packages/backend/src/modules/stack-builder/formatters.ts` | JSON/Markdown export |
| `packages/backend/src/modules/stack-builder/validators.ts` | Zod validation |
| `packages/frontend/src/lib/api/stack-builder.ts` | API client |
| `packages/frontend/src/stores/stack-builder-store.ts` | Zustand wizard state |
| `packages/frontend/src/hooks/useStackBuilder.ts` | React Query hooks |
| `packages/frontend/src/components/stack-builder/RadioCardGroup.tsx` | Reusable radio selector |
| `packages/frontend/src/components/stack-builder/CheckboxCardGroup.tsx` | Multi-select cards |
| `packages/frontend/src/components/stack-builder/WizardStepper.tsx` | Progress bar |
| `packages/frontend/src/components/stack-builder/WizardStepLayout.tsx` | Step wrapper |
| `packages/frontend/src/components/stack-builder/UseCaseStep.tsx` | Step A |
| `packages/frontend/src/components/stack-builder/DeploymentStep.tsx` | Step B |
| `packages/frontend/src/components/stack-builder/BudgetStep.tsx` | Step C |
| `packages/frontend/src/components/stack-builder/PrivacyStep.tsx` | Step D |
| `packages/frontend/src/components/stack-builder/LanguageStep.tsx` | Step E |
| `packages/frontend/src/components/stack-builder/CapabilitiesStep.tsx` | Step F |
| `packages/frontend/src/components/stack-builder/HardwareStep.tsx` | Step G |
| `packages/frontend/src/components/stack-builder/SkillLevelStep.tsx` | Step H |
| `packages/frontend/src/components/stack-builder/UsageScaleStep.tsx` | Step I |
| `packages/frontend/src/components/stack-builder/ResultPanel.tsx` | Full results view |
| `packages/frontend/src/components/stack-builder/RecommendedCard.tsx` | Scored item card |
| `packages/frontend/src/components/stack-builder/RationalePanel.tsx` | Rationale display |
| `packages/frontend/src/components/stack-builder/ActionBar.tsx` | Save/export/create buttons |
| `packages/frontend/src/pages/builder/StackBuilderPage.tsx` | Main wizard page |
| `packages/frontend/src/pages/builder/SavedStacksPage.tsx` | Saved results list |
| `packages/frontend/src/pages/builder/SavedStackDetailPage.tsx` | Saved result detail |

### Modified Files (8)

| Path | Change |
|------|--------|
| `packages/shared/src/schemas/stack-builder.ts` | Extend input schema, add 3 new schemas |
| `packages/shared/src/constants/index.ts` | Add stack-wizard re-export |
| `packages/shared/src/types/index.ts` | Add stack-builder re-export |
| `packages/backend/src/app.ts` | Mount stack-builder routes |
| `packages/frontend/src/lib/api/index.ts` | Export stackBuilderApi |
| `packages/frontend/src/hooks/index.ts` | Export stack builder hooks |
| `packages/frontend/src/lib/label-maps.ts` | Add wizard label maps |
| `packages/frontend/src/App.tsx` | Replace placeholders with real pages |

---

## Verification

1. **Wizard works end-to-end**: Open `/builder/stack`, answer all 9 steps, click "Получить рекомендацию"
2. **Recommendations returned**: API returns scored items with breakdown; hard exclusions filter correctly
3. **Result sections populated**: Best overall, cheapest, privacy, Russian, self-hosted winners shown
4. **Save works**: Authenticated user saves result, appears in `/builder/stack/saved`
5. **Export works**: JSON download and Markdown download both produce correct output
6. **Create agent works**: Creates agent + version, redirects to `/builder/agent/:id`
7. **TypeScript**: `npx tsc --noEmit` passes with 0 errors for all 3 packages
8. **Production**: Push to server, rebuild, verify at https://llmstore.pro/builder/stack
