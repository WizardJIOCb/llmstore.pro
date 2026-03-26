# Persistent Chat History + Sharing

## Context

Currently the agent playground chat state lives only in a Zustand in-memory store (`playground-store.ts`). Messages are lost on page refresh. The user wants:
1. Chat history persists per user per agent (survives page refresh)
2. A "Share" button that copies a public link
3. Shared link shows the full read-only chat history to anyone (no auth)

## Design Approach

**No new database table needed.** The existing `agent_runs` table already has a `session_key` field (indexed, unused). We use it to group runs into a logical "chat session" per user+agent pair.

The approach:
- Generate a `session_key` = deterministic key `chat:{userId}:{agentId}` for authenticated chat
- Store a `share_token` (random UUID) on the first run in the session for sharing
- On page load, query all runs with this session_key to reconstruct chat history
- For sharing, query by share_token (public, no auth)

### Why no new table?

A separate `chat_sessions` table adds a migration, schema, CRUD endpoints, and foreign key management for minimal benefit. The `session_key` field already exists and is indexed. We just need:
- A new column `share_token` on `agent_runs` (one migration)
- Actually we don't even need that -- we can store the share_token as the `session_key` itself

**Simplified approach:** Use a two-part session key:
- Private key: `chat:{userId}:{agentId}` -- for the owner to load their history
- Add a new `share_token` VARCHAR column to `agent_runs` -- nullable, unique, set once per session when user clicks Share. All runs in the session get the same share_token.

Actually, even simpler: we store a single `share_token` per session. Since we don't have a sessions table, we store it on the FIRST run of the session and query it from there.

**Final simplest approach:** Add a new `chat_sessions` table. It's clean, minimal, and avoids hacks.

## Plan

### 1. Database: New `chat_sessions` table

**File:** `packages/backend/src/db/schema/runtime.ts`

Add table definition:
```sql
chat_sessions (
  id          UUID PK DEFAULT gen_random_uuid(),
  agent_id    UUID NOT NULL FK agents(id) CASCADE,
  user_id     UUID NOT NULL FK users(id) CASCADE,
  share_token VARCHAR(64) UNIQUE,    -- null until user shares
  title       VARCHAR(500),          -- auto-set from first message
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_id, user_id)          -- one session per user per agent
)
```

The `UNIQUE(agent_id, user_id)` constraint ensures one chat session per user per agent. `share_token` is null until user clicks Share.

**File:** `packages/backend/src/db/schema/index.ts` -- already re-exports runtime.ts, no change needed.

**Migration:** Run `npm run db:push` on production (drizzle-kit push syncs schema).

### 2. Backend: Link runs to sessions

**File:** `packages/backend/src/modules/agent-runtime/runtime.service.ts`

Modify `startRun()`:
- After creating the run record, find or create a `chat_session` for this user+agent pair
- Set `agent_runs.session_key` = chat_session.id (the UUID)
- If session has no title yet, set title from the first user message (first 100 chars)

Changes to `startRun()`:
```typescript
// After creating run record (step 4), add:
const [session] = await db
  .select().from(chatSessions)
  .where(and(eq(chatSessions.agent_id, agentId), eq(chatSessions.user_id, userId)))
  .limit(1);

let sessionId: string;
if (session) {
  sessionId = session.id;
} else {
  const [newSession] = await db.insert(chatSessions).values({
    agent_id: agentId,
    user_id: userId,
    title: input.messages[input.messages.length - 1]?.content?.slice(0, 100) ?? null,
  }).returning();
  sessionId = newSession.id;
}

// Update run with session_key
await db.update(agentRuns).set({ session_key: sessionId }).where(eq(agentRuns.id, run.id));
```

### 3. Backend: Chat history endpoints

**File:** `packages/backend/src/modules/agent-runtime/runtime.routes.ts`

Add 3 new routes:
```
GET  /agents/:agentId/chat       -- get chat history for current user + agent (auth)
POST /agents/:agentId/chat/share -- toggle sharing, returns share_token (auth)
GET  /shared/chat/:token         -- public chat view (NO auth)
POST /agents/:agentId/chat/clear -- clear chat history (auth)
```

**File:** `packages/backend/src/modules/agent-runtime/runtime.controller.ts`

Add handlers:
- `getChatHistory` -- finds session by user+agent, loads all runs with messages
- `shareChat` -- generates share_token (nanoid/uuid) if not set, returns it
- `getSharedChat` -- loads session by share_token, loads all runs with messages (no auth check)
- `clearChat` -- deletes the chat_session (cascade deletes runs? No -- runs should stay for analytics. Instead: delete the session row and create a fresh one. Or better: just clear the session_key on all runs and delete the session.)

### 4. Backend: Chat history service functions

**File:** `packages/backend/src/modules/agent-runtime/runtime.service.ts`

Add functions:

**`getChatHistory(agentId, userId)`:**
```
1. Find chat_session where agent_id = agentId AND user_id = userId
2. If not found, return { messages: [], session_id: null }
3. Query agent_runs WHERE session_key = session.id AND status = 'completed' ORDER BY started_at ASC
4. For each run: get the last user message (input_summary) and final_output
5. Build ordered array: [{role:'user', content: inputSummary}, {role:'assistant', content: finalOutput, usage, latencyMs, toolTraces}]
6. Return { session_id, share_token, messages, agent_name }
```

Optimization: Instead of loading individual run messages, use `input_summary` + `final_output` from `agent_runs` directly. This avoids N+1 queries and is sufficient for chat display.

For tool traces: query `agent_run_tool_calls` for all runs in the session in one query.

**`shareChat(agentId, userId)`:**
```
1. Find or create chat_session
2. If share_token is null, generate UUID and update
3. Return share_token
```

**`getSharedChat(token)`:**
```
1. Find chat_session by share_token
2. If not found, throw NotFound
3. Load runs + messages same as getChatHistory
4. Load agent name for display
5. Return { messages, agent_name }
```

**`clearChatHistory(agentId, userId)`:**
```
1. Find chat_session
2. Set session_key = null on all linked agent_runs
3. Delete the chat_session row
```

### 5. Frontend: API + Hooks

**File:** `packages/frontend/src/lib/api/agents.ts`

Add types and methods:
```typescript
interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  runId?: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number; estimated_cost: string; model: string } | null;
  latencyMs?: number;
  toolTraces?: ToolTrace[];
}

interface ChatHistoryResponse {
  session_id: string | null;
  share_token: string | null;
  messages: ChatHistoryMessage[];
}

// In agentApi:
getChatHistory: (agentId: string) => 
  apiClient.get<{data: ChatHistoryResponse}>(`/agents/${agentId}/chat`).then(r => r.data.data),

shareChat: (agentId: string) =>
  apiClient.post<{data: {share_token: string}}>(`/agents/${agentId}/chat/share`).then(r => r.data.data),

clearChat: (agentId: string) =>
  apiClient.post(`/agents/${agentId}/chat/clear`),

getSharedChat: (token: string) =>
  apiClient.get<{data: {messages: ChatHistoryMessage[], agent_name: string}}>(`/shared/chat/${token}`).then(r => r.data.data),
```

**File:** `packages/frontend/src/hooks/useAgents.ts`

Add hooks:
- `useChatHistory(agentId)` -- React Query, loads on mount
- `useShareChat()` -- mutation
- `useClearChat()` -- mutation, invalidates chat history query
- `useSharedChat(token)` -- React Query for public view

### 6. Frontend: Update AgentPlaygroundPage

**File:** `packages/frontend/src/pages/playground/AgentPlaygroundPage.tsx`

Changes:
1. On mount: call `useChatHistory(id)` to load existing messages
2. Populate Zustand store from loaded history (or replace Zustand with React Query data)
3. After each `startRun` completes, invalidate the chat history query (or just keep appending locally)
4. Add "Share" button in header next to "Settings" and "Clear"
5. "Clear" button now calls `clearChat` API and then clears local state

**Approach for state management:**
- Keep Zustand for real-time UI state (isRunning, error)
- Use React Query for message persistence (source of truth)
- On mount: load messages from API -> set in store
- On send: optimistically add to store, then invalidate query on success
- Actually simplest: load history into store on mount, continue using store as before, just seed it

```typescript
// In AgentPlaygroundPage:
const { data: chatHistory, isLoading: historyLoading } = useChatHistory(id);
const { clearMessages } = usePlaygroundStore();
const clearChatMutation = useClearChat();

// Seed store from history on first load
useEffect(() => {
  if (chatHistory?.messages && messages.length === 0) {
    // Use a new store action: setMessages(chatHistory.messages)
    setMessages(chatHistory.messages);
  }
}, [chatHistory]);
```

**File:** `packages/frontend/src/stores/playground-store.ts`

Add `setMessages(msgs)` action to bulk-set messages from loaded history.

### 7. Frontend: Share button

In AgentPlaygroundPage header, add a "Share" button:
```tsx
<Button variant="outline" size="sm" onClick={async () => {
  const { share_token } = await shareChat(id);
  const url = `${window.location.origin}/shared/chat/${share_token}`;
  await navigator.clipboard.writeText(url);
  // Show brief "Copied!" feedback
}}>
  Поделиться
</Button>
```

### 8. Frontend: Shared chat page (public, read-only)

**New file:** `packages/frontend/src/pages/shared/SharedChatPage.tsx`

Simple read-only page:
- Takes `token` from URL params
- Calls `useSharedChat(token)` to load messages
- Renders agent name + message list using `ChatMessage` components
- No input, no actions, no tool trace sidebar
- Shows "Chat shared from LLMStore" header or similar

**File:** `packages/frontend/src/App.tsx`

Add route (outside ProtectedRoute since it's public):
```tsx
<Route path="/shared/chat/:token" element={<SharedChatPage />} />
```

### 9. Backend: Register new routes

**File:** `packages/backend/src/modules/agent-runtime/runtime.routes.ts`

Add before existing routes:
```typescript
// Chat history (authenticated)
router.get('/agents/:agentId/chat', requireAuth, controller.getChatHistory);
router.post('/agents/:agentId/chat/share', requireAuth, controller.shareChat);
router.post('/agents/:agentId/chat/clear', requireAuth, controller.clearChat);

// Shared chat (public - no auth)
router.get('/shared/chat/:token', controller.getSharedChat);
```

Note: runtime routes are mounted at `/api` in app.ts, so these become:
- `GET /api/agents/:agentId/chat`
- `POST /api/agents/:agentId/chat/share`
- `POST /api/agents/:agentId/chat/clear`
- `GET /api/shared/chat/:token`

**Important:** The `GET /api/agents/:agentId/chat` route must be registered in agentRuntimeRoutes (mounted at `/api`), NOT in agentBuilderRoutes (mounted at `/api/agents`). This is because runtime routes are at `/api` prefix. So the route pattern is `agents/:agentId/chat`.

## Files Summary

| Action | File |
|--------|------|
| Modify | `packages/backend/src/db/schema/runtime.ts` -- add chatSessions table |
| Modify | `packages/backend/src/modules/agent-runtime/runtime.service.ts` -- add chat functions, update startRun |
| Modify | `packages/backend/src/modules/agent-runtime/runtime.controller.ts` -- add 4 handlers |
| Modify | `packages/backend/src/modules/agent-runtime/runtime.routes.ts` -- add 4 routes |
| Modify | `packages/frontend/src/lib/api/agents.ts` -- add types + 4 API methods |
| Modify | `packages/frontend/src/hooks/useAgents.ts` -- add 4 hooks |
| Modify | `packages/frontend/src/stores/playground-store.ts` -- add setMessages action |
| Modify | `packages/frontend/src/pages/playground/AgentPlaygroundPage.tsx` -- load history, share button, clear API |
| Create | `packages/frontend/src/pages/shared/SharedChatPage.tsx` -- public read-only chat view |
| Modify | `packages/frontend/src/App.tsx` -- add /shared/chat/:token route |

## Implementation Order

1. Schema: Add `chatSessions` table to runtime.ts
2. Backend service: Add chat history functions + update startRun to link sessions
3. Backend controller: Add 4 handlers
4. Backend routes: Register 4 new routes
5. Run `db:push` to sync schema to database
6. Frontend API: Add types and methods
7. Frontend hooks: Add 4 hooks
8. Frontend store: Add setMessages action
9. Frontend: Update AgentPlaygroundPage (load history, share, clear)
10. Frontend: Create SharedChatPage
11. Frontend: Add route in App.tsx
12. Typecheck + build both packages
13. Deploy to production

## Verification

1. `npx tsc --noEmit` passes on both packages
2. `npm run build` succeeds for frontend
3. Open `/playground/agent/:id`, send a message, refresh page -- messages persist
4. Click "Share", paste URL in incognito -- chat displays read-only
5. Click "Clear", refresh -- chat is empty
6. Check `agent_runs.session_key` is populated for new runs
7. Existing agent stats on `/my/agents` still work
