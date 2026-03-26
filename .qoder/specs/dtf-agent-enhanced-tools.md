# DTF News Agent - Enhanced Tools

## Context

The DTF News Agent currently has only two tools: `dtf-latest-feed` (chronological feed) and `dtf-article-fetch` (fetch single article by URL). The user wants the agent to handle richer queries:

1. **Popular/discussed articles** - "Какие статьи с большим количеством комментариев за сегодня/неделю/месяц?"
2. **Article retelling** - "Перескажи статью X" (already partially works via dtf-article-fetch, but agent needs better system prompt guidance)
3. **Top articles by comments** - replaces "most liked comment" (comments API is unavailable; we use article comment counts instead)

## API Research Summary

DTF API (`https://api.dtf.ru/v2.1/timeline`) supports:
- `sorting=new` - chronological
- `sorting=hotness` - trending (wraps entries in `type: "news"` -> `data.news[]`)
- `sorting=popular` - popular

Each entry contains: `counters.comments`, `counters.favorites`, `likes.counterLikes`, `date` (unix timestamp).

Comments API (`/entry/{id}/comments/*`) is **closed** (returns 404/500). We can only get comment counts from the timeline/locate endpoints.

## Implementation Plan

### Step 1: New executor - `dtf-popular-feed.executor.ts`

Create `packages/backend/src/modules/tool-execution/executors/dtf-popular-feed.executor.ts`

**Input schema:**
```typescript
{
  sorting: 'hotness' | 'popular';  // hotness = trending now, popular = all-time popular
  period: 'day' | 'week' | 'month' | 'all';  // client-side date filter
  limit?: number;  // default 10, max 30
}
```

**Logic:**
- Fetch `GET /v2.1/timeline?allSite=true&sorting={sorting}&count=30`
- Parse entries from both formats:
  - `type: "news"` -> nested `data.news[].data`
  - `type: "entry"` -> direct `data`
- Apply client-side date filter based on `period` (compare `entry.date` against threshold)
- Sort results by `counters.comments` descending (for "most discussed" queries)
- Return top N entries with: title, url, author, comments_count, likes_count, snippet

**Cache:** key = `dtf_popular_{sorting}`, TTL = 300s (5 min, longer than feed since popular content changes slower)

**Output type:**
```typescript
interface DtfPopularResult {
  articles: DtfPopularArticle[];
  sorting: string;
  period: string;
  fetched_at: string;
}

interface DtfPopularArticle {
  title: string;
  url: string;
  author: string;
  snippet: string;
  comments_count: number;
  likes_count: number;
  favorites_count: number;
}
```

### Step 2: Update existing `dtf-feed.executor.ts`

Enhance the existing feed executor to also return `comments_count` and `likes_count` per article so the LLM has richer data even for the basic feed tool.

**Changes to `DtfFeedArticle` type:**
```typescript
interface DtfFeedArticle {
  title: string;
  url: string;
  author: string;
  snippet: string;
  comments_count: number;   // NEW
  likes_count: number;       // NEW
}
```

Extract from `entry.counters.comments` and `entry.likes.counterLikes`.

### Step 3: Update types

File: `packages/backend/src/modules/tool-execution/types.ts`

- Add `DtfPopularArticle` and `DtfPopularResult` interfaces
- Add `comments_count` and `likes_count` to `DtfFeedArticle`

### Step 4: Register new executor

File: `packages/backend/src/modules/tool-execution/executors/index.ts`

Add:
```typescript
import { executeDtfPopularFeed } from './dtf-popular-feed.executor.js';

executorRegistry.set('dtf-popular-feed', async (input) => {
  const result = await executeDtfPopularFeed(input as { sorting?: string; period?: string; limit?: number });
  return result as unknown as Record<string, unknown>;
});
```

### Step 5: Register tool definition in seed

File: `packages/backend/src/db/seed/builtin-tools.ts`

Add new tool definition:
- name: `DTF Popular Feed`
- slug: `dtf-popular-feed`
- tool_type: `http_request`
- input_schema: `{ sorting: enum['hotness','popular'], period: enum['day','week','month','all'], limit: number }`
- description: "Получить популярные/обсуждаемые статьи с DTF, отсортированные по количеству комментариев. Позволяет фильтровать по периоду: за день, неделю, месяц."

### Step 6: Link new tool to DTF News Agent

File: `packages/backend/src/db/seed/dtf-news-agent.ts`

Add `dtf-popular-feed` as third tool (order_index: 2) in the agent version.

### Step 7: Update system prompt

File: `packages/backend/src/db/seed/dtf-news-agent.ts`

Update the agent's system prompt to include guidance for the new capabilities:

```
Ты - новостной помощник DTF.ru. Твоя задача - помогать пользователю получать и анализировать новости с сайта DTF.ru.

Возможности:
- Получить список последних статей с DTF (используй инструмент dtf-latest-feed)
- Получить популярные/обсуждаемые статьи за период (используй инструмент dtf-popular-feed)
  - sorting=hotness для актуальных горячих тем
  - sorting=popular для популярных статей
  - period: day/week/month/all для фильтрации по времени
- Загрузить полный текст конкретной статьи по URL (используй инструмент dtf-article-fetch)
- Сделать краткий пересказ статьи

Правила:
- Всегда отвечай на русском языке
- При перечислении статей указывай заголовок, автора, ссылку и статистику (комментарии, лайки)
- При пересказе выделяй ключевые моменты
- Если пользователь просит "последние новости" - используй dtf-latest-feed
- Если пользователь просит "популярные", "обсуждаемые", "с большим количеством комментариев" - используй dtf-popular-feed
- Если пользователь просит пересказать статью по названию - сначала найди её URL через dtf-latest-feed или dtf-popular-feed, затем загрузи текст через dtf-article-fetch
- При пересказе статьи выдели: суть, ключевые факты, интересные детали
```

### Step 8: Run seed to update DB

After code changes, run `npm run db:seed` on production to update:
- New tool definition in `tool_definitions` table
- Updated agent version with new tool link and system prompt

## Files to modify

| File | Action |
|------|--------|
| `packages/backend/src/modules/tool-execution/types.ts` | Add new types, update DtfFeedArticle |
| `packages/backend/src/modules/tool-execution/executors/dtf-popular-feed.executor.ts` | **NEW** - popular feed executor |
| `packages/backend/src/modules/tool-execution/executors/dtf-feed.executor.ts` | Add comments_count/likes_count extraction |
| `packages/backend/src/modules/tool-execution/executors/index.ts` | Register new executor |
| `packages/backend/src/db/seed/builtin-tools.ts` | Add DTF Popular Feed tool definition |
| `packages/backend/src/db/seed/dtf-news-agent.ts` | Add tool link + update system prompt |

## Verification

1. **Local check:** `npx tsc --noEmit` in packages/backend to verify types
2. **Deploy:** git commit, push, pull on server, pm2 restart
3. **Re-seed DB:** `npm run db:seed` on production to create tool definition and update agent
4. **End-to-end test via curl:**
   - Login: `POST /api/auth/login`
   - Run agent with "Какие самые обсуждаемые статьи на DTF за сегодня?": `POST /api/agents/{id}/runs`
   - Verify tool_traces includes `dtf-popular-feed` with articles sorted by comments
   - Run agent with "Перескажи статью {title}": verify it uses dtf-latest-feed/dtf-popular-feed to find URL, then dtf-article-fetch to get content
5. **UI check:** Open https://llmstore.pro/playground/agent/4f20dda0-a03b-48d6-ac03-2ea2f25f6901 and test all three query types
