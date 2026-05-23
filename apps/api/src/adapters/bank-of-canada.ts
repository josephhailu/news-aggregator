import { XMLParser } from "fast-xml-parser";
import type { SourceAdapter, SourceArticleInput } from "./types";

type RssItem = {
  title?: string;
  link?: string;
  guid?: string | { "#text"?: string };
  pubDate?: string;
  "dc:date"?: string;
  description?: string;
  category?: string | string[];
  "@_rdf:about"?: string;
};

type RssFeed = {
  rss?: {
    channel?: {
      item?: RssItem | RssItem[];
    };
  };
  "rdf:RDF"?: {
    item?: RssItem | RssItem[];
  };
};

const BANK_OF_CANADA_FEEDS = [
  {
    url: "https://www.bankofcanada.ca/content_type/press-releases/feed/",
    sourceLabel: "press-releases",
    filterPolicyItems: true
  },
  {
    url: "https://www.bankofcanada.ca/content_type/mpr/feed/",
    sourceLabel: "monetary-policy-report",
    filterPolicyItems: false
  },
  {
    url: "https://www.bankofcanada.ca/content_type/summary-of-deliberations/feed/",
    sourceLabel: "summary-of-deliberations",
    filterPolicyItems: false
  }
] as const;

const POLICY_TERMS = [
  "bank rate",
  "governing council",
  "inflation",
  "interest rate",
  "monetary policy",
  "overnight rate",
  "policy rate",
  "summary of deliberations"
];

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

  return (
    item.guid?.["#text"] ?? item["@_rdf:about"] ?? item.link ?? item.title ?? crypto.randomUUID()
  );
}

function readPublishedAt(item: RssItem) {
  return new Date(item.pubDate ?? item["dc:date"] ?? Date.now());
}

function stripHtml(value: string | undefined) {
  return value?.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() ?? null;
}

function isPolicyItem(item: RssItem) {
  const haystack = [
    item.title,
    item.description,
    item.link,
    ...asArray(item.category)
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return POLICY_TERMS.some((term) => haystack.includes(term));
}

async function fetchFeed(feed: (typeof BANK_OF_CANADA_FEEDS)[number]) {
  const response = await fetch(feed.url, {
    headers: {
      Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
      "User-Agent": "NewsAggregator/0.1 (+http://localhost:5173)"
    }
  });

  if (!response.ok) {
    throw new Error(`Bank of Canada request failed: ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();
  const parser = new XMLParser({
    ignoreAttributes: false,
    trimValues: true
  });
  const parsed = parser.parse(xml) as RssFeed;

  return [...asArray(parsed.rss?.channel?.item), ...asArray(parsed["rdf:RDF"]?.item)]
    .filter((item) => !feed.filterPolicyItems || isPolicyItem(item))
    .map((item) => ({
      ...item,
      feedLabel: feed.sourceLabel
    }));
}

export const bankOfCanadaAdapter: SourceAdapter = {
  key: "bank-of-canada-monetary-policy",
  name: "Bank of Canada Monetary Policy",
  slug: "bank-of-canada-monetary-policy",
  homepageUrl: "https://www.bankofcanada.ca/core-functions/monetary-policy/",
  sourceKind: "official_policy",
  availableReads: ["policy_macro"],
  sourcePacketConfig: {
    allowedHosts: ["bankofcanada.ca", "www.bankofcanada.ca"],
    linkRules: [
      {
        pattern: /\b(statement|interest rate announcement|press release)\b/i,
        memberKind: "statement",
        priority: 10
      },
      {
        pattern: /\b(summary of deliberations|minutes)\b/i,
        memberKind: "minutes",
        priority: 20
      },
      {
        pattern: /\b(monetary policy report|mpr|projection|outlook)\b/i,
        memberKind: "projection",
        priority: 30
      },
      {
        pattern: /\b(pdf|report|backgrounder)\b/i,
        memberKind: "report",
        priority: 40
      },
      {
        pattern: /\b(appendix|supplement|technical note)\b/i,
        memberKind: "appendix",
        priority: 50
      }
    ]
  },
  async fetchTopArticles(): Promise<SourceArticleInput[]> {
    const feedItems = (await Promise.all(BANK_OF_CANADA_FEEDS.map(fetchFeed))).flat();
    const seen = new Set<string>();

    return feedItems
      .map((item, index) => {
        const externalId = readGuid(item);
        const publishedAt = readPublishedAt(item);

        return {
          externalId,
          title: item.title ?? "Untitled Bank of Canada release",
          url: item.link ?? null,
          discussionUrl: null,
          author: "Bank of Canada",
          summary: stripHtml(item.description),
          publishedAt,
          raw: item as Record<string, unknown>,
          signals: {
            sourceRank: index + 1,
            rawSignals: {
              sourceRank: index + 1,
              signalModel: "official-rss-recency",
              feedLabel: item.feedLabel
            }
          }
        };
      })
      .filter((article) => {
        if (seen.has(article.externalId)) {
          return false;
        }

        seen.add(article.externalId);
        return true;
      });
  }
};
