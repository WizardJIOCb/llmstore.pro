export interface DtfFeedArticle {
  title: string;
  url: string;
  author: string;
  snippet: string;
}

export interface DtfFeedResult {
  articles: DtfFeedArticle[];
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
