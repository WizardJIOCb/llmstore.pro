# Agents Hub UI Refactor

## Context

The user wants to consolidate agent management into a single "Agents" menu item. Currently, navigation has two separate items: "Agents" (a public catalog of business_agent type) and "Constructor" (the stack builder). The existing "My Agents" dashboard (`/dashboard/agents`) is buried and shows no usage statistics. The goal is to rename "Constructor" to "Agents", remove the old catalog "Agents" nav link, and create a new Agents Hub page that combines agent management with per-agent usage statistics (runs, tokens, cost, time).

## Plan

### 1. Backend: Agent Stats Endpoint

**File:** `packages/backend/src/modules/agent-builder/agent.service.ts`

Add `getAgentStats(userId: string)` function that runs a SQL aggregation query joining `agent_runs` + `usage_ledger`, grouped by `agent_id`:

```sql
SELECT
  ar.agent_id,
  COUNT(ar.id)                              AS total_runs,
  COALESCE(SUM(ul.prompt_tokens), 0)        AS total_prompt_tokens,
  COALESCE(SUM(ul.completion_tokens), 0)     AS total_completion_tokens,
  COALESCE(SUM(ul.estimated_cost::numeric), 0) AS total_cost,
  COALESCE(SUM(ar.latency_ms), 0)           AS total_latency_ms,
  MAX(ar.started_at)                        AS last_run_at
FROM agent_runs ar
LEFT JOIN usage_ledger ul ON ul.run_id = ar.id
WHERE ar.user_id = $1
GROUP BY ar.agent_id
```

Uses `sql` template tag from `drizzle-orm` with `db.execute()` for parameterized raw query. Returns `Record<string, AgentStatsRow>` keyed by agent_id.

New imports needed: `import { sql } from 'drizzle-orm';`

**File:** `packages/backend/src/modules/agent-builder/agent.controller.ts`

Add `getStats` handler calling `agentService.getAgentStats(req.session.userId!)`, responds with `{ data: statsMap }`.

**File:** `packages/backend/src/modules/agent-builder/agent.routes.ts`

Add `router.get('/stats', requireAuth, controller.getStats);` **after** `/tools/builtin` and **before** `/:id` (to avoid Express matching "stats" as an `:id` param).

Route order becomes:
1. `GET /tools/builtin` (existing)
2. `GET /stats` (new)
3. `POST /` (existing)
4. `GET /` (existing)
5. `GET /:id` (existing)
6. ...

No database migration needed - query runs against existing indexed tables.

### 2. Frontend: API + Hook

**File:** `packages/frontend/src/lib/api/agents.ts`

Add interface and API method:

```ts
export interface AgentStats {
  agent_id: string;
  total_runs: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_cost: string;
  total_latency_ms: number;
  last_run_at: string | null;
}

// In agentApi object:
getStats: () =>
  apiClient.get<{ data: Record<string, AgentStats> }>('/agents/stats').then(r => r.data.data),
```

**File:** `packages/frontend/src/hooks/useAgents.ts`

Add `useAgentStats()` hook using React Query with 30s staleTime.

**File:** `packages/frontend/src/hooks/index.ts`

Re-export `useAgentStats`.

### 3. Frontend: New AgentsHubPage

**New file:** `packages/frontend/src/pages/agents/AgentsHubPage.tsx`

Layout:
- **Header**: "Мои агенты" title + "Создать агента" button (links to `/builder/agent`)
- **Search bar**: `Input` component for client-side filtering by agent name/description
- **Status filter**: `Select` dropdown (Все / Активный / Черновик / Архив)
- **Agent cards**: Each card shows:
  - Name + status `Badge`
  - Description (truncated)
  - Stats row: total runs, total tokens (formatted), cost (USD), time (seconds)
  - Actions: "Площадка" (playground link), "Редактировать" (editor link), "Удалить"
- **Empty state**: "У вас ещё нет агентов" + create CTA
- **Loading state**: centered `Spinner`

Data: `useAgentList()` + `useAgentStats()` fire in parallel. Search/status filtering is client-side (agent count is always low). Stats missing for an agent default to zeros.

Uses existing components: `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `Badge`, `Button`, `Input`, `Select`, `Spinner`.

### 4. Frontend: Navigation + Routing

**File:** `packages/frontend/src/components/layout/AppLayout.tsx`

Update `navItems`:
- Remove `{ label: 'Агенты', href: '/agents' }`
- Change `{ label: 'Конструктор', href: '/builder/stack' }` to `{ label: 'Агенты', href: '/my/agents' }`

**File:** `packages/frontend/src/App.tsx`

Add route:
```tsx
<Route path="/my/agents" element={
  <ProtectedRoute>
    <AgentsHubPage />
  </ProtectedRoute>
} />
```

All existing routes remain unchanged (`/agents` catalog, `/dashboard/agents`, `/builder/*`, etc.).

## Files Summary

| Action | File |
|--------|------|
| Create | `packages/frontend/src/pages/agents/AgentsHubPage.tsx` |
| Modify | `packages/backend/src/modules/agent-builder/agent.service.ts` |
| Modify | `packages/backend/src/modules/agent-builder/agent.controller.ts` |
| Modify | `packages/backend/src/modules/agent-builder/agent.routes.ts` |
| Modify | `packages/frontend/src/lib/api/agents.ts` |
| Modify | `packages/frontend/src/hooks/useAgents.ts` |
| Modify | `packages/frontend/src/hooks/index.ts` |
| Modify | `packages/frontend/src/App.tsx` |
| Modify | `packages/frontend/src/components/layout/AppLayout.tsx` |

## Implementation Order

1. Backend: `agent.service.ts` (add `getAgentStats`)
2. Backend: `agent.controller.ts` (add `getStats` handler)
3. Backend: `agent.routes.ts` (wire `GET /stats`)
4. Frontend: `agents.ts` API client (add `AgentStats` type + `getStats`)
5. Frontend: `useAgents.ts` (add `useAgentStats` hook)
6. Frontend: `index.ts` hooks (re-export)
7. Frontend: Create `AgentsHubPage.tsx`
8. Frontend: `App.tsx` (add `/my/agents` route)
9. Frontend: `AppLayout.tsx` (update nav items)

## Verification

1. Run `npx tsc --noEmit` in backend package - no type errors
2. Run `npx tsc --noEmit` in frontend package - no type errors
3. Build frontend: `npm run build` in frontend package
4. Start backend, call `GET /api/agents/stats` with auth - verify returns stats map
5. Navigate to `/my/agents` - verify page loads with agent list and stats
6. Test search filtering by typing agent name
7. Test status filter dropdown
8. Verify "Создать агента" navigates to `/builder/agent`
9. Verify "Площадка" navigates to `/playground/agent/:id`
10. Verify nav shows "Агенты" pointing to `/my/agents`, old "Агенты" catalog link is gone
11. Verify `/agents` catalog route still works (just not in nav)
