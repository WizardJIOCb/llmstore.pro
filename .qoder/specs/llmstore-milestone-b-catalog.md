# LLMStore.pro — Milestone B: Catalog Foundation

## Context

The project skeleton was created in Milestone A: monorepo with packages/shared (constants, schemas, types), packages/backend (Express + Drizzle schema for 25 tables), packages/frontend (Vite+React+Tailwind with placeholder pages). Currently every catalog page shows "Каталог будет загружен из API после реализации Milestone B." This milestone makes the platform functional — users can browse items, register/login, and admins can manage content.

---

## Implementation Steps

### Step 1 — Backend Auth Module

Create `packages/backend/src/modules/auth/`:

| File | Purpose |
|------|---------|
| `auth.service.ts` | `register()` — check email uniqueness, argon2 hash, insert user. `login()` — verify password. `getById()` — fetch user without password_hash |
| `auth.controller.ts` | HTTP handlers: set `req.session.userId`/`userRole` on login/register, `req.session.destroy()` on logout, return `{ data: UserPublic }` |
| `auth.validators.ts` | Wrap shared `registerSchema`/`loginSchema` with `validate()` middleware |
| `auth.routes.ts` | `POST /register`, `POST /login`, `POST /logout` (requireAuth), `GET /me` (requireAuth) |
| `index.ts` | Barrel export |

Mount in `app.ts`: `app.use('/api/auth', authRoutes)`

**Verify**: `curl -X POST localhost:3001/api/auth/register -d '{"email":"test@test.com","password":"12345678"}' -H 'Content-Type: application/json'`

### Step 2 — Backend Catalog Module (Public Read-Only)

Create `packages/backend/src/modules/catalog/`:

| File | Purpose |
|------|---------|
| `catalog.service.ts` | `list(query)` — dynamic query builder. `getByTypeAndSlug(type, slug)` — full detail. `listCategories/Tags/UseCases()` |
| `catalog.controller.ts` | HTTP handlers returning `ApiResponse<T>` |
| `catalog.validators.ts` | Wrap shared `catalogQuerySchema` with validate middleware |
| `catalog.routes.ts` | `GET /`, `GET /categories`, `GET /tags`, `GET /use-cases`, `GET /:type/:slug` |
| `index.ts` | Barrel export |

**`catalog.service.ts` query builder logic:**
- Base: `WHERE status='published' AND visibility='public'`
- Filter chaining: each param adds to a `conditions[]` array passed to `and(...conditions)`
- `type` → `eq(catalogItems.type, type)`
- `category/tags/use_case` (slugs) → subquery `IN (SELECT item_id FROM junction JOIN taxonomy WHERE slug = ?)`
- `pricing/deployment/privacy/language/difficulty` → `eq(catalogItemMeta.field, value)` via left join
- `search` → `or(ilike(title, '%term%'), ilike(short_description, '%term%'))` (ILIKE for MVP)
- `featured` → `eq(catalogItems.featured, true)`
- Sort: `curated` → `desc(curated_score), desc(published_at)` | `newest` → `desc(published_at)` | `alphabetical` → `asc(title)`
- Cursor pagination: fetch cursor row's sort-key values, add keyset condition, fetch `limit+1` rows, last id = next cursor
- Eager load tags/categories per item via batch queries on returned IDs

Mount in `app.ts`: `app.use('/api/catalog', catalogRoutes)`

**Verify**: `curl localhost:3001/api/catalog/categories` returns seeded categories.

### Step 3 — Backend Admin Module

Create `packages/backend/src/modules/admin/`:

| File | Purpose |
|------|---------|
| `admin.service.ts` | `createItem()` — transactional insert into catalog_items + meta + junctions. `updateItem()` — transactional update with junction replace. `publishItem()`, `archiveItem()`. `listAll()` with offset pagination. Taxonomy CRUD for categories/tags/use-cases |
| `admin.controller.ts` | HTTP handlers |
| `admin.validators.ts` | Wrap shared `createCatalogItemSchema`/`updateCatalogItemSchema`, admin list query schema, taxonomy schema |
| `admin.routes.ts` | All routes guarded by `requireRole('admin', 'curator')`. Catalog CRUD + publish. Taxonomy CRUD |
| `index.ts` | Barrel export |

**Endpoints:**
- `GET /catalog` (offset pagination, include drafts)
- `POST /catalog`, `PATCH /catalog/:id`, `POST /catalog/:id/publish`, `DELETE /catalog/:id` (archive)
- `POST /categories`, `PATCH /categories/:id`, `DELETE /categories/:id`
- Same for `/tags` and `/use-cases`

Mount in `app.ts`: `app.use('/api/admin', adminRoutes)`

### Step 4 — Seed Data (Admin User + Sample Catalog Items)

Create seed files:

| File | Purpose |
|------|---------|
| `db/seed/admin-user.ts` | Create admin user `admin@llmstore.pro` / `admin123` (argon2 hashed), role='admin' |
| `db/seed/catalog-items.ts` | 8 sample items across types: GPT-4o (model), Claude 3.5 (model), Ollama (tool), LangChain (tool), SEO prompt pack, Telegram bot agent, Ollama+WebUI local build, Startup AI stack. All published with tags/categories/meta |

Update `db/seed/index.ts` to call these after taxonomy seeds.

**Verify**: `npm run db:seed && curl localhost:3001/api/catalog` returns 8 items.

### Step 5 — Frontend API Layer + Stores + Hooks

| File | Purpose |
|------|---------|
| `lib/api/auth.ts` | `apiRegister`, `apiLogin`, `apiLogout`, `apiGetMe` |
| `lib/api/catalog.ts` | `apiListCatalog`, `apiGetCatalogDetail`, `apiListCategories/Tags/UseCases` |
| `lib/api/admin.ts` | Admin CRUD functions |
| `lib/api/index.ts` | Barrel |
| `stores/auth-store.ts` | Zustand: `user`, `isLoading`, `setUser`, `fetchMe`, `login`, `register`, `logout` |
| `hooks/useAuth.ts` | Convenience wrapper over auth store |
| `hooks/useCatalog.ts` | `useCatalogList` (useInfiniteQuery), `useCatalogDetail` (useQuery) |
| `hooks/useTaxonomy.ts` | `useCategories`, `useTags`, `useUseCases` |
| `hooks/useAdmin.ts` | Admin query/mutation hooks |

### Step 6 — Frontend UI Components

Create `packages/frontend/src/components/ui/`:

`Button.tsx` (variants: default/secondary/outline/ghost/destructive, sizes: sm/default/lg, isLoading),
`Input.tsx` (label, error display, forwardRef),
`Badge.tsx` (variants: default/secondary/outline/success/warning),
`Card.tsx` (Card/CardHeader/CardContent/CardFooter),
`Select.tsx` (native select wrapper with label),
`Skeleton.tsx` (animate-pulse placeholder),
`Spinner.tsx` (SVG spinner),
`Textarea.tsx` (styled, forwardRef),
`index.ts` (barrel)

All styled with existing Tailwind + CSS variable theme tokens. No shadcn/ui CLI needed.

### Step 7 — Frontend Auth Pages + App Wiring

| File | Purpose |
|------|---------|
| `pages/auth/LoginPage.tsx` | Form (react-hook-form + loginSchema), calls useAuth().login, redirects to `/` |
| `pages/auth/RegisterPage.tsx` | Form (registerSchema), calls useAuth().register |
| `components/shared/AuthInitializer.tsx` | On mount calls fetchMe(), shows spinner until loaded |
| `components/shared/ProtectedRoute.tsx` | Redirects to /login if not authenticated, checks roles |
| `lib/label-maps.ts` | Russian labels for all enum values (pricing, deployment, language, etc.) |

**Modify:**
- `App.tsx` — replace login/register placeholders with real pages
- `AppLayout.tsx` — show user info + logout when authenticated, admin link for admins
- `main.tsx` — wrap with AuthInitializer
- `lib/api-client.ts` — 401 interceptor clears auth store

### Step 8 — Frontend Catalog Pages

| File | Purpose |
|------|---------|
| `components/shared/CatalogCard.tsx` | Card rendering CatalogItemCard: image, title, description, badges, tags |
| `components/shared/CatalogFilters.tsx` | Filter sidebar: category, pricing, deployment, language, difficulty dropdowns |
| `components/shared/SearchBar.tsx` | Debounced search input (300ms) |
| `components/shared/SortSelect.tsx` | Sort dropdown: Рекомендуемые / Новые / По алфавиту |

**Rewrite:**
- `CatalogListPage.tsx` — fetch via useCatalogList, filter sidebar + search + sort + card grid + "Загрузить ещё" pagination
- `CatalogDetailPage.tsx` — fetch via useCatalogDetail, breadcrumbs, hero image, description, meta sidebar, tags, categories, related items

### Step 9 — Frontend Admin Pages

| File | Purpose |
|------|---------|
| `pages/admin/AdminLayout.tsx` | Secondary nav (Каталог, Категории, Теги). Checks admin role |
| `pages/admin/AdminCatalogListPage.tsx` | Table with all items, status badges, publish/archive actions, "Создать" button |
| `pages/admin/AdminCatalogFormPage.tsx` | Create/edit form: type, title, slug (auto-generated), descriptions, meta fields, taxonomy checkboxes |

**Modify** `App.tsx` — add admin nested routes under ProtectedRoute with admin role.

---

## Files Summary

**50 new files** + **5 modified files**

- Backend: 17 new (auth 5, catalog 5, admin 5, search 2) + seed 2 + app.ts mount
- Frontend: 31 new (API 4, stores 1, hooks 5, UI components 9, shared components 6, pages 5, label-maps 1) + 4 modified (App.tsx, AppLayout.tsx, main.tsx, api-client.ts)

---

## Verification

1. `npm run db:seed` — seeds admin user + 8 catalog items without errors
2. `curl POST /api/auth/register` — creates user, returns UserPublic, sets session cookie
3. `curl POST /api/auth/login` with admin@llmstore.pro — returns admin user
4. `curl GET /api/catalog` — returns 8 published items with tags/categories/meta
5. `curl GET /api/catalog?type=model` — returns 2 model items
6. `curl GET /api/catalog?search=Ollama` — returns matching items
7. `curl GET /api/catalog/model/chatgpt-gpt-4o` — returns full detail
8. `curl POST /api/admin/catalog` (as admin) — creates new item
9. Frontend: `/tools` shows card grid with real data, filters work, search works
10. Frontend: `/tools/ollama` shows full detail page
11. Frontend: `/login` → register → see user in header → logout
12. Frontend: `/admin` (as admin) → see item table → create/edit/publish items
13. `npm run typecheck` — 0 errors across all packages
