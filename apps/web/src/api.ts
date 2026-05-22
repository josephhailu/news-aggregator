export type FeedKey = "top-now" | "today" | "week" | "latest";

export type FeedItem = {
  position: number;
  score: number;
  computedAt: string;
  articleId: string;
  title: string;
  summary: string | null;
  url: string | null;
  discussionUrl: string | null;
  author: string | null;
  publishedAt: string;
  sourceName: string;
  sourceSlug: string;
  points: number | null;
  comments: number | null;
  sourceRank: number | null;
  availableReads: ArticleReadType[];
  bookmarked: boolean;
};

export type ArticleReadType = "policy_macro";

export type PolicyMacroRead = {
  plainEnglishSummary: string;
  policySignal:
    | "dovish"
    | "mildly_dovish"
    | "neutral"
    | "mildly_hawkish"
    | "hawkish"
    | "mixed"
    | null;
  whyItMatters: string[];
  secondOrderEffects: string[];
  watchNext: string[];
  confidence: "low" | "medium" | "high";
  caveats: string[];
  modelId: string;
  promptVersion: string;
  cached: boolean;
  extractionStatus: "ok" | "summary_only";
};

export type FedInsight = PolicyMacroRead;

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    },
    ...init
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function getFeed(feedKey: FeedKey) {
  return apiFetch<{ feedKey: FeedKey; items: FeedItem[] }>(`/api/feeds/${feedKey}`);
}

export function ingestHackerNews() {
  return apiFetch<{ ingestion: unknown; ranking: unknown }>("/api/ingest/hacker-news", {
    method: "POST"
  });
}

export function ingestFederalReserve() {
  return apiFetch<{ ingestion: unknown; ranking: unknown }>("/api/ingest/federal-reserve", {
    method: "POST"
  });
}

export function ingestBankOfCanada() {
  return apiFetch<{ ingestion: unknown; ranking: unknown }>("/api/ingest/bank-of-canada", {
    method: "POST"
  });
}

export function ingestAllSources() {
  return apiFetch<{ ingestions: unknown[]; ranking: unknown }>("/api/ingest/all", {
    method: "POST"
  });
}

export function setBookmark(articleId: string, bookmarked: boolean) {
  return apiFetch<{ bookmarked: boolean }>(`/api/bookmarks/${articleId}`, {
    method: bookmarked ? "POST" : "DELETE"
  });
}

export function generateFedInsight(articleId: string, force = false) {
  return generatePolicyMacroRead(articleId, force);
}

export function getCachedFedInsight(articleId: string) {
  return getCachedPolicyMacroRead(articleId);
}

export function generatePolicyMacroRead(articleId: string, force = false) {
  return apiFetch<{ insight: PolicyMacroRead }>(`/api/articles/${articleId}/reads/policy-macro`, {
    method: "POST",
    body: JSON.stringify({ force })
  });
}

export function getCachedPolicyMacroRead(articleId: string) {
  return apiFetch<{ status: "ready"; insight: PolicyMacroRead } | { status: "missing" }>(
    `/api/articles/${articleId}/reads/policy-macro`
  );
}
