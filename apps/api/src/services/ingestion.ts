import { db } from "@news-aggregator/db";
import { articleSignals, articles, sources } from "@news-aggregator/db/schema";
import { count, eq } from "drizzle-orm";
import type { SourceAdapter } from "../adapters/types";

export async function ingestFromAdapter(adapter: SourceAdapter) {
  const sourceRows = await db
    .insert(sources)
    .values({
      adapterKey: adapter.key,
      name: adapter.name,
      slug: adapter.slug,
      homepageUrl: adapter.homepageUrl
    })
    .onConflictDoUpdate({
      target: sources.adapterKey,
      set: {
        name: adapter.name,
        slug: adapter.slug,
        homepageUrl: adapter.homepageUrl,
        updatedAt: new Date()
      }
    })
    .returning({ id: sources.id });

  const sourceId = sourceRows[0]?.id;
  if (!sourceId) {
    throw new Error(`Unable to create source for ${adapter.key}`);
  }

  const fetchedArticles = await adapter.fetchTopArticles();

  for (const fetched of fetchedArticles) {
    const articleRows = await db
      .insert(articles)
      .values({
        sourceId,
        externalId: fetched.externalId,
        title: fetched.title,
        url: fetched.url,
        discussionUrl: fetched.discussionUrl,
        author: fetched.author,
        summary: fetched.summary,
        publishedAt: fetched.publishedAt,
        raw: fetched.raw
      })
      .onConflictDoUpdate({
        target: [articles.sourceId, articles.externalId],
        set: {
          title: fetched.title,
          url: fetched.url,
          discussionUrl: fetched.discussionUrl,
          author: fetched.author,
          summary: fetched.summary,
          publishedAt: fetched.publishedAt,
          raw: fetched.raw,
          importedAt: new Date()
        }
      })
      .returning({ id: articles.id });

    const articleId = articleRows[0]?.id;
    if (!articleId) {
      continue;
    }

    await db
      .insert(articleSignals)
      .values({
        articleId,
        points: fetched.signals.points,
        comments: fetched.signals.comments,
        views: fetched.signals.views,
        stars: fetched.signals.stars,
        sourceRank: fetched.signals.sourceRank,
        rawSignals: fetched.signals.rawSignals
      })
      .onConflictDoUpdate({
        target: articleSignals.articleId,
        set: {
          points: fetched.signals.points,
          comments: fetched.signals.comments,
          views: fetched.signals.views,
          stars: fetched.signals.stars,
          sourceRank: fetched.signals.sourceRank,
          rawSignals: fetched.signals.rawSignals,
          capturedAt: new Date()
        }
      });
  }

  const [{ value: available } = { value: 0 }] = await db
    .select({ value: count() })
    .from(articles)
    .where(eq(articles.sourceId, sourceId));

  return {
    sourceId,
    fetched: fetchedArticles.length,
    available
  };
}
