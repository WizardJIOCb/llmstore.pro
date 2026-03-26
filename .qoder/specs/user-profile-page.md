# User Profile Page - Implementation Plan

## Context

The header currently shows the user's name as plain text (not clickable). There is no profile page. The user wants a full profile page at `/profile` with: usage stats, token balance (admin-managed, shown in USD + RUB), role-based limits display, and OAuth account linking (Google, Yandex, Mail.ru). This plan covers all layers: schema, shared types, backend module, OAuth flows, admin balance endpoints, and the frontend profile page.

---

## Step 1: Schema & Enum Changes

### `packages/backend/src/db/schema/enums.ts`
- Extend `authProviderEnum` to include `'yandex'` and `'mailru'`

### `packages/backend/src/db/schema/auth.ts`
- Add `balance_usd` column to `users` table: `numeric('balance_usd', { precision: 12, scale: 4 }).notNull().default('0')`

### `packages/backend/src/db/schema/analytics.ts`
- Add new `balanceTransactions` table:
  - `id` (uuid PK), `user_id` (FK users), `amount` (numeric 12,4), `balance_after` (numeric 12,4)
  - `type` (varchar: 'admin_credit'|'admin_debit'|'usage_charge')
  - `description` (text), `performed_by` (uuid FK users, nullable)
  - `created_at` (timestamp), index on `user_id`

### `packages/backend/src/types/express.d.ts`
- Add `oauthState?: string` and `oauthMode?: 'login' | 'link'` to `SessionData`

---

## Step 2: Shared Package Updates

### `packages/shared/src/constants/roles.ts`
- Add `YANDEX: 'yandex'` and `MAILRU: 'mailru'` to `AuthProvider` const
- Update `authProviderValues`

### `packages/shared/src/constants/limits.ts` (new)
- Export `USD_TO_RUB_RATE = 90`
- Export `ROLE_LIMITS` map: `Record<UserRole, { max_agents: number; max_runs_per_day: number; max_tokens_per_run: number }>`
  - `user`: 3 agents, 50 runs/day, 8192 tokens/run
  - `power_user`: 10, 200, 16384
  - `curator`: 50, 500, 32768
  - `admin`: -1 (unlimited) for all

### `packages/shared/src/constants/index.ts`
- Re-export from `limits.ts`

### `packages/shared/src/types/auth.ts`
- Add `LinkedAccount` interface: `{ provider: string; provider_account_id: string; created_at: string }`
- Add `UserLimits` interface: `{ max_agents: number; max_runs_per_day: number; max_tokens_per_run: number }`
- Add `UserUsageSummary`: `{ total_runs: number; total_tokens: number; total_cost_usd: string; per_agent: AgentUsageSummary[] }`
- Add `AgentUsageSummary`: `{ agent_id: string; agent_name: string; total_runs: number; total_tokens: number; total_cost: string }`
- Add `UserProfile` extending `UserPublic` with `balance_usd`, `balance_rub`, `linked_accounts`, `usage`, `limits`

---

## Step 3: Backend - Profile Module (new)

Create `packages/backend/src/modules/profile/` with:

### `profile.service.ts`
- `getProfile(userId)`: queries user (with balance_usd), authAccounts, aggregated usage stats (via SQL join on agent_runs + usage_ledger, grouped by agent_id with agent name), computes balance_rub (balance * 90), builds role limits from `ROLE_LIMITS`
- `updateProfile(userId, { name?, username? })`: updates users table, validates username uniqueness
- `unlinkAccount(userId, provider)`: verifies user has another auth method (password_hash or other OAuth), then deletes authAccount entry

### `profile.controller.ts`
- `getProfile`, `updateProfile`, `unlinkAccount` handlers following existing try/catch/next pattern

### `profile.routes.ts`
- `GET /` -> getProfile (requireAuth)
- `PUT /` -> updateProfile (requireAuth)
- `DELETE /linked-accounts/:provider` -> unlinkAccount (requireAuth)

### `index.ts` - export profileRoutes

### `packages/backend/src/app.ts`
- Add `app.use('/api/profile', profileRoutes)` after auth routes

---

## Step 4: Backend - OAuth Flows

### `packages/backend/src/modules/auth/oauth.service.ts` (new)

Custom OAuth2 flows using axios (no extra npm packages needed):

- `getOAuthUrl(provider, mode, state)`: builds authorization URL for each provider
  - Google: `accounts.google.com/o/oauth2/v2/auth`, scopes: `openid email profile`
  - Yandex: `oauth.yandex.ru/authorize`
  - Mail.ru: `oauth.mail.ru/login`, scope: `userinfo`
- `handleCallback(provider, code, sessionUserId?)`:
  - Exchange code for token at provider's token endpoint
  - Fetch user profile from provider's userinfo endpoint
  - **Link mode** (sessionUserId set): insert into authAccounts, error if already linked elsewhere
  - **Login mode**: find existing authAccount -> login; or find user by email -> link + login; or create new user + authAccount
- Private helpers: `exchangeToken(provider, code)`, `getUserProfile(provider, token)`

### `packages/backend/src/modules/auth/oauth.controller.ts` (new)
- `startOAuth(req, res)`: generates state -> stores in session -> redirects to provider URL
- `handleCallback(req, res)`: validates state, calls service, sets session, redirects to `FRONTEND_URL/profile?oauth=success` or `?oauth=error`

### `packages/backend/src/modules/auth/auth.routes.ts`
- Add: `GET /oauth/:provider` -> startOAuth
- Add: `GET /oauth/:provider/callback` -> handleCallback

### `packages/backend/src/config/env.ts`
- Add: `YANDEX_CLIENT_ID`, `YANDEX_CLIENT_SECRET`, `MAILRU_CLIENT_ID`, `MAILRU_CLIENT_SECRET` (all `.default('')`)
- Add: `BACKEND_URL: z.string().default('http://localhost:3001')`

---

## Step 5: Backend - Admin Balance Endpoints

### `packages/backend/src/modules/admin/admin.service.ts`
- Add `adjustUserBalance(adminUserId, { user_id, amount, description })`:
  - Read current balance, compute new balance, reject if negative result on debit
  - Update `users.balance_usd`, insert `balanceTransactions` record
  - Return updated balance

### `packages/backend/src/modules/admin/admin.controller.ts`
- Add `adjustUserBalance` handler

### `packages/backend/src/modules/admin/admin.routes.ts`
- Add `POST /users/:id/balance` -> adjustUserBalance

---

## Step 6: Frontend - API & Hooks

### `packages/frontend/src/lib/api/profile.ts` (new)
- `profileApi.getProfile()` -> `GET /profile`
- `profileApi.updateProfile(data)` -> `PUT /profile`
- `profileApi.unlinkAccount(provider)` -> `DELETE /profile/linked-accounts/:provider`
- `getOAuthLinkUrl(provider)` -> returns `/api/auth/oauth/${provider}?mode=link` (URL for redirect, not API call)

### `packages/frontend/src/lib/api/index.ts`
- Re-export profileApi

### `packages/frontend/src/hooks/useProfile.ts` (new)
- `useProfile()` - useQuery `['profile']`, staleTime 30s
- `useUpdateProfile()` - useMutation, invalidates `['profile']`
- `useUnlinkAccount()` - useMutation, invalidates `['profile']`

### `packages/frontend/src/hooks/index.ts`
- Re-export profile hooks

---

## Step 7: Frontend - Profile Page

### `packages/frontend/src/pages/profile/ProfilePage.tsx` (new)

Container with 4 sections. All labels in Russian.

**1. User Info Section**
- Avatar placeholder + name + email + role Badge + member since
- Inline edit for name/username via `useUpdateProfile()`

**2. Balance Section** (Card)
- Balance in USD: `$XX.XXXX`
- RUB equivalent: `~ XX XXX р` (at 90 RUB/USD)
- Note: "Для пополнения обратитесь к администратору"

**3. Usage Stats Section** (Card)
- Summary: total runs, total tokens, total cost (USD)
- Per-agent table: Agent name | Runs | Tokens | Cost

**4. Linked Accounts Section** (Card)
- Row per provider (Google, Yandex, Mail.ru):
  - If linked: provider name + "Привязан" badge + "Отвязать" button
  - If not linked: provider name + "Привязать" button (redirects to OAuth flow)
- Reads `?oauth=success` / `?oauth=error` from URL on mount -> shows feedback

**5. Limits Section** (Card)
- Shows role-based limits from profile data
- Max agents, max runs/day, max tokens/run
- Unlimited shown as "Без ограничений"

### `packages/frontend/src/App.tsx`
- Import ProfilePage, add `<Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />`

### `packages/frontend/src/components/layout/AppLayout.tsx`
- Replace plain `<span>` with user name to `<Link to="/profile">` with hover styling

---

## Step 8: Build & Deploy

1. Build shared package: `npm run build` in packages/shared
2. Typecheck backend: `npm run typecheck` in packages/backend
3. Typecheck + build frontend: `npm run build` in packages/frontend
4. Push schema to DB: `npm run db:push` in packages/backend (on production server)
5. Set OAuth env vars on production (.env): `YANDEX_CLIENT_ID`, `YANDEX_CLIENT_SECRET`, `MAILRU_CLIENT_ID`, `MAILRU_CLIENT_SECRET`, `BACKEND_URL`
6. Deploy frontend build + restart backend via PM2

---

## Verification

1. **Profile page loads**: Login -> click username in header -> `/profile` loads with all sections
2. **Usage stats accurate**: Compare totals with raw `usage_ledger` data
3. **Balance display**: Admin adjusts balance via API -> refresh profile -> balance updates in USD + RUB
4. **OAuth linking**: Click "Привязать" for Google -> completes OAuth -> redirected back to profile with success message -> provider shows as linked
5. **OAuth unlinking**: Click "Отвязать" -> provider removed -> cannot unlink if it's the last auth method
6. **Profile edit**: Edit name -> save -> header updates with new name
7. **Admin balance**: `POST /api/admin/users/:id/balance` with amount -> balance_transactions recorded, user balance updated

---

## Critical Files

| Area | File | Action |
|------|------|--------|
| Schema | `packages/backend/src/db/schema/enums.ts` | Modify - add yandex, mailru |
| Schema | `packages/backend/src/db/schema/auth.ts` | Modify - add balance_usd |
| Schema | `packages/backend/src/db/schema/analytics.ts` | Modify - add balanceTransactions table |
| Session | `packages/backend/src/types/express.d.ts` | Modify - add oauth fields |
| Shared | `packages/shared/src/constants/roles.ts` | Modify - add providers |
| Shared | `packages/shared/src/constants/limits.ts` | New - limits + rate |
| Shared | `packages/shared/src/types/auth.ts` | Modify - add profile types |
| Backend | `packages/backend/src/modules/profile/*` | New module (4 files) |
| Backend | `packages/backend/src/modules/auth/oauth.service.ts` | New - OAuth flows |
| Backend | `packages/backend/src/modules/auth/oauth.controller.ts` | New - OAuth handlers |
| Backend | `packages/backend/src/modules/auth/auth.routes.ts` | Modify - add OAuth routes |
| Backend | `packages/backend/src/config/env.ts` | Modify - add env vars |
| Backend | `packages/backend/src/app.ts` | Modify - register profile routes |
| Backend | `packages/backend/src/modules/admin/admin.*` | Modify - balance endpoints |
| Frontend | `packages/frontend/src/lib/api/profile.ts` | New - profile API |
| Frontend | `packages/frontend/src/hooks/useProfile.ts` | New - React Query hooks |
| Frontend | `packages/frontend/src/pages/profile/ProfilePage.tsx` | New - profile page |
| Frontend | `packages/frontend/src/App.tsx` | Modify - add route |
| Frontend | `packages/frontend/src/components/layout/AppLayout.tsx` | Modify - clickable name |
