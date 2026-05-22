import { XMLParser } from "fast-xml-parser";
import type { SourceAdapter, SourceArticleInput } from "./types";

type RssItem = {
  title?: string;
  link?: string;
  guid?: string | { "#text"?: string };
  pubDate?: string;
  description?: string;
};

type RssFeed = {
  rss?: {
    channel?: {
      item?: RssItem | RssItem[];
    };
  };
};

const FED_MONETARY_POLICY_FEED = "https://www.federalreserve.gov/feeds/press_monetary.xml";

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function readGuid(item: RssItem) {
  if (typeof item.guid === "string") {
    return item.guid;
  }

  return item.guid?.["#text"] ?? item.link ?? item.title ?? crypto.randomUUID();
}

function stripHtml(value: string | undefined) {
  return value?.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() ?? null;
}

export const federalReserveAdapter: SourceAdapter = {
  key: "federal-reserve-monetary-policy",
  name: "Federal Reserve Monetary Policy",
  slug: "federal-reserve-monetary-policy",
  homepageUrl: "https://www.federalreserve.gov/newsevents/pressreleases/monetary2026.htm",
  sourceKind: "official_policy",
  availableReads: ["policy_macro"],
  async fetchTopArticles(): Promise<SourceArticleInput[]> {
    const response = await fetch(FED_MONETARY_POLICY_FEED, {
      headers: {
        Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
        "User-Agent": "NewsAggregator/0.1 (+http://localhost:5173)"
      }
    });

    if (!response.ok) {
      throw new Error(
        `Federal Reserve request failed: ${response.status} ${response.statusText}`
      );
    }

    const xml = await response.text();
    const parser = new XMLParser({
      ignoreAttributes: false,
      trimValues: true
    });
    const parsed = parser.parse(xml) as RssFeed;

    return asArray(parsed.rss?.channel?.item).map((item, index) => {
      const publishedAt = item.pubDate ? new Date(item.pubDate) : new Date();

      return {
        externalId: readGuid(item),
        title: item.title ?? "Untitled Federal Reserve release",
        url: item.link ?? null,
        discussionUrl: null,
        author: "Federal Reserve",
        summary: stripHtml(item.description),
        publishedAt,
        raw: item as Record<string, unknown>,
        signals: {
          sourceRank: index + 1,
          rawSignals: {
            sourceRank: index + 1,
            signalModel: "official-rss-recency"
          }
        }
      };
    });
  }
};
