import type { SourceAdapter, SourceArticleInput } from "./types";

type HnItem = {
  id: number;
  deleted?: boolean;
  dead?: boolean;
  by?: string;
  time?: number;
  title?: string;
  url?: string;
  score?: number;
  descendants?: number;
  type?: string;
};

const HN_API = "https://hacker-news.firebaseio.com/v0";
const HN_ITEM_URL = "https://news.ycombinator.com/item?id=";

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Hacker News request failed: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export const hackerNewsAdapter: SourceAdapter = {
  key: "hacker-news",
  name: "Hacker News",
  slug: "hacker-news",
  homepageUrl: "https://news.ycombinator.com",
  sourceKind: "engagement",
  async fetchTopArticles(): Promise<SourceArticleInput[]> {
    const ids = await fetchJson<number[]>(`${HN_API}/topstories.json`);
    const topIds = ids.slice(0, 100);
    const results = await mapWithConcurrency(topIds, 12, (id) =>
      fetchJson<HnItem>(`${HN_API}/item/${id}.json`)
    );

    return results
      .flatMap((result, index) =>
        result.status === "fulfilled" ? [{ item: result.value, sourceRank: index + 1 }] : []
      )
      .filter(({ item }) => item.type === "story" && !item.deleted && !item.dead && item.title)
      .map(({ item, sourceRank }) => {
        const publishedAt = new Date((item.time ?? 0) * 1000);
        return {
          externalId: String(item.id),
          title: item.title ?? "Untitled",
          url: item.url ?? `${HN_ITEM_URL}${item.id}`,
          discussionUrl: `${HN_ITEM_URL}${item.id}`,
          author: item.by ?? null,
          publishedAt,
          raw: item,
          signals: {
            points: item.score ?? 0,
            comments: item.descendants ?? 0,
            sourceRank,
            rawSignals: {
              points: item.score ?? 0,
              comments: item.descendants ?? 0,
              sourceRank
            }
          }
        };
      });
  }
};

async function mapWithConcurrency<T, U>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<U>
): Promise<PromiseSettledResult<U>[]> {
  const results: PromiseSettledResult<U>[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;

      try {
        results[index] = {
          status: "fulfilled",
          value: await mapper(items[index]!)
        };
      } catch (reason) {
        results[index] = {
          status: "rejected",
          reason
        };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );

  return results;
}
