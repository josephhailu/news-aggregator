import { db } from "@news-aggregator/db";
import {
  articleScores,
  articleSignals,
  articles,
  feedWindow,
  rankedFeedItems,
  sources
} from "@news-aggregator/db/schema";
import { eq, sql } from "drizzle-orm";
import { getSourceMetadata } from "../adapters/registry";
import type { SourceKind } from "../adapters/types";

type FeedKey = "top-now" | "today" | "week" | "latest";
type FeedWindow = (typeof feedWindow.enumValues)[number];

type Candidate = {
  articleId: string;
  publishedAt: Date;
  points: number | null;
  comments: number | null;
  sourceRank: number | null;
  adapterKey: string;
  sourceKind: SourceKind;
};

const feedToWindow: Record<FeedKey, FeedWindow> = {
  "top-now": "top_now",
  today: "today",
  week: "week",
  latest: "latest"
};

function scoreCandidate(candidate: Candidate, now = new Date()) {
  if (candidate.sourceKind === "engagement") {
    const ageHours = Math.max(
      1,
      (now.getTime() - candidate.publishedAt.getTime()) / (1000 * 60 * 60)
    );
    const points = candidate.points ?? 0;
    const comments = candidate.comments ?? 0;
    const rankBoost = candidate.sourceRank ? Math.max(0, 101 - candidate.sourceRank) * 0.35 : 0;
    const engagement = points + comments * 1.8 + rankBoost;
    const score = engagement / Math.pow(ageHours + 2, 0.55);

    return {
      score,
      breakdown: {
        algorithm: "engagement-v1",
        points,
        comments,
        sourceRank: candidate.sourceRank,
        ageHours: Number(ageHours.toFixed(2)),
        rankBoost: Number(rankBoost.toFixed(2))
      }
    };
  }

  return {
    score: 1 / Math.max(1, now.getTime() - candidate.publishedAt.getTime()),
    breakdown: {
      algorithm: "official-policy-recency-v1",
      sourceKind: candidate.sourceKind
    }
  };
}

async function loadCandidates() {
  const rows = await db
    .select({
      articleId: articles.id,
      publishedAt: articles.publishedAt,
      points: articleSignals.points,
      comments: articleSignals.comments,
      sourceRank: articleSignals.sourceRank,
      adapterKey: sources.adapterKey
    })
    .from(articles)
    .innerJoin(sources, eq(articles.sourceId, sources.id))
    .leftJoin(articleSignals, eq(articleSignals.articleId, articles.id));

  return rows.map((row) => ({
    ...row,
    sourceKind: getSourceMetadata(row.adapterKey).sourceKind
  }));
}

function candidatesForFeed(feedKey: FeedKey, candidates: Candidate[], now: Date) {
  if (feedKey === "top-now") {
    return newestPerSource(candidates, 10);
  }

  if (feedKey === "latest") {
    return [...candidates]
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      .slice(0, 30);
  }

  const windowHours = feedKey === "today" ? 24 : 24 * 7;
  const since = now.getTime() - windowHours * 60 * 60 * 1000;
  return candidates.filter((candidate) => candidate.publishedAt.getTime() >= since);
}

function newestPerSource(candidates: Candidate[], limit: number) {
  const grouped = new Map<string, Candidate[]>();

  for (const candidate of candidates) {
    const sourceCandidates = grouped.get(candidate.adapterKey) ?? [];
    sourceCandidates.push(candidate);
    grouped.set(candidate.adapterKey, sourceCandidates);
  }

  return [...grouped.values()]
    .flatMap((sourceCandidates) =>
      sourceCandidates
        .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
        .slice(0, limit)
    )
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
}

export async function refreshRankedFeeds() {
  const now = new Date();
  const candidates = await loadCandidates();
  const feedKeys: FeedKey[] = ["top-now", "today", "week", "latest"];

  await db.transaction(async (tx) => {
    for (const feedKey of feedKeys) {
      const window = feedToWindow[feedKey];
      const scopedCandidates = candidatesForFeed(feedKey, candidates, now);
      const ranked = scopedCandidates
        .map((candidate) => ({
          ...candidate,
          ...scoreCandidate(candidate, now)
        }))
        .sort((a, b) => {
          if (feedKey === "top-now" || feedKey === "latest") {
            return b.publishedAt.getTime() - a.publishedAt.getTime();
          }
          return b.score - a.score;
        })
        .slice(0, feedKey === "top-now" ? scopedCandidates.length : 30);

      if (ranked.length > 0) {
        await tx
          .insert(articleScores)
          .values(
            ranked.map((item) => ({
              articleId: item.articleId,
              feedWindow: window,
              score: item.score,
              breakdown: item.breakdown,
              computedAt: now
            }))
          )
          .onConflictDoUpdate({
            target: [articleScores.articleId, articleScores.feedWindow],
            set: {
              score: sqlExcluded("score"),
              breakdown: sqlExcluded("breakdown"),
              computedAt: now
            }
          });
      }

      await tx.delete(rankedFeedItems).where(eq(rankedFeedItems.feedKey, feedKey));

      if (ranked.length > 0) {
        await tx.insert(rankedFeedItems).values(
          ranked.map((item, index) => ({
            feedKey,
            articleId: item.articleId,
            position: index + 1,
            score: item.score,
            computedAt: now
          }))
        );
      }
    }
  });

  return { refreshedAt: now.toISOString(), candidates: candidates.length };
}

export async function getFeed(feedKey: FeedKey, userId?: string) {
  const rows = await db
    .select({
      position: rankedFeedItems.position,
      score: rankedFeedItems.score,
      computedAt: rankedFeedItems.computedAt,
      articleId: articles.id,
      title: articles.title,
      summary: articles.summary,
      url: articles.url,
      discussionUrl: articles.discussionUrl,
      author: articles.author,
      publishedAt: articles.publishedAt,
      sourceName: sources.name,
      sourceSlug: sources.slug,
      adapterKey: sources.adapterKey,
      points: articleSignals.points,
      comments: articleSignals.comments,
      sourceRank: articleSignals.sourceRank
    })
    .from(rankedFeedItems)
    .innerJoin(articles, eq(rankedFeedItems.articleId, articles.id))
    .innerJoin(sources, eq(articles.sourceId, sources.id))
    .leftJoin(articleSignals, eq(articleSignals.articleId, articles.id))
    .where(eq(rankedFeedItems.feedKey, feedKey))
    .orderBy(rankedFeedItems.position);

  let bookmarkedIds = new Set<string>();
  if (userId && rows.length > 0) {
    const articleIds = rows.map((row) => row.articleId);
    const bookmarkRows = await db.query.bookmarks.findMany({
      where: (bookmark, { and, eq, inArray }) =>
        and(eq(bookmark.userId, userId), inArray(bookmark.articleId, articleIds))
    });
    bookmarkedIds = new Set(bookmarkRows.map((bookmark) => bookmark.articleId));
  }

  return rows.map(({ adapterKey, ...row }) => {
    const { availableReads } = getSourceMetadata(adapterKey);

    return {
      ...row,
      availableReads,
      bookmarked: bookmarkedIds.has(row.articleId)
    };
  });
}

export function isFeedKey(value: string): value is FeedKey {
  return ["top-now", "today", "week", "latest"].includes(value);
}

function sqlExcluded(column: string) {
  return sql.raw(`excluded.${column}`);
}
