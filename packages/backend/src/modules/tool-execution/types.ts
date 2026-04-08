export interface DtfFeedArticle {
  title: string;
  url: string;
  author: string;
  snippet: string;
  comments_count: number;
  reactions_count: number;
  reaction_breakdown: Array<{
    id: number;
    label: string;
    count: number;
  }>;
  reactions_summary: string;
}

export interface DtfFeedResult {
  articles: DtfFeedArticle[];
  fetched_at: string;
}

export interface DtfPopularArticle {
  title: string;
  url: string;
  author: string;
  snippet: string;
  comments_count: number;
  reactions_count: number;
  reaction_breakdown: Array<{
    id: number;
    label: string;
    count: number;
  }>;
  reactions_summary: string;
  favorites_count: number;
}

export interface DtfPopularResult {
  articles: DtfPopularArticle[];
  sorting: string;
  period: string;
  fetched_at: string;
}

export interface DtfArticleResult {
  title: string;
  author: string;
  text: string;
  published_at: string | null;
  url: string;
}

export interface ToolExecutionResult {
  result: Record<string, unknown>;
  duration_ms: number;
  cached?: boolean;
}
