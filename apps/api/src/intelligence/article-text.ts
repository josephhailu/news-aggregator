import { db } from "@news-aggregator/db";
import { articleTexts, articles } from "@news-aggregator/db/schema";
import { eq } from "drizzle-orm";

const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const MAX_TEXT_CHARS = 16_000;

export type ExtractedArticleText = {
  articleId: string;
  title: string;
  sourceUrl: string | null;
  text: string;
  extractionStatus: "ok" | "summary_only";
};

export async function getArticleText(articleId: string): Promise<ExtractedArticleText> {
  const cached = await db.query.articleTexts.findFirst({
    where: (text, { eq }) => eq(text.articleId, articleId)
  });

  if (cached && Date.now() - cached.updatedAt.getTime() < CACHE_TTL_MS) {
    return {
      articleId,
      title: cached.title,
      sourceUrl: cached.sourceUrl,
      text: cached.text,
      extractionStatus: cached.extractionStatus === "ok" ? "ok" : "summary_only"
    };
  }

  const article = await db.query.articles.findFirst({
    where: (row, { eq }) => eq(row.id, articleId)
  });

  if (!article) {
    throw new Error("Article not found");
  }

  const extracted = await extractArticleText({
    articleId,
    title: article.title,
    url: article.url,
    summary: article.summary
  });

  await db
    .insert(articleTexts)
    .values({
      articleId,
      title: extracted.title,
      sourceUrl: extracted.sourceUrl,
      text: extracted.text,
      extractionStatus: extracted.extractionStatus,
      errorMessage: null,
      fetchedAt: new Date(),
      updatedAt: new Date()
    })
    .onConflictDoUpdate({
      target: articleTexts.articleId,
      set: {
        title: extracted.title,
        sourceUrl: extracted.sourceUrl,
        text: extracted.text,
        extractionStatus: extracted.extractionStatus,
        errorMessage: null,
        fetchedAt: new Date(),
        updatedAt: new Date()
      }
    });

  return extracted;
}

async function extractArticleText(input: {
  articleId: string;
  title: string;
  url: string | null;
  summary: string | null;
}): Promise<ExtractedArticleText> {
  if (!input.url) {
    return fromSummary(input);
  }

  try {
    // Current article URLs come from trusted source adapters. Before enabling user submissions,
    // add URL allowlisting plus private-network and redirect safeguards here.
    const response = await fetch(input.url, {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent": "NewsAggregator/0.1 (+http://localhost:5173)"
      },
      signal: AbortSignal.timeout(12_000)
    });

    if (!response.ok) {
      return fromSummary(input);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("xml")) {
      return fromSummary(input);
    }

    const html = await response.text();
    const text = cleanHtml(html);

    if (text.length < 400) {
      return fromSummary(input);
    }

    return {
      articleId: input.articleId,
      title: input.title,
      sourceUrl: input.url,
      text: text.slice(0, MAX_TEXT_CHARS),
      extractionStatus: "ok"
    };
  } catch {
    return fromSummary(input);
  }
}

function fromSummary(input: {
  articleId: string;
  title: string;
  url: string | null;
  summary: string | null;
}): ExtractedArticleText {
  return {
    articleId: input.articleId,
    title: input.title,
    sourceUrl: input.url,
    text: [input.title, input.summary].filter(Boolean).join("\n\n").slice(0, MAX_TEXT_CHARS),
    extractionStatus: "summary_only"
  };
}

function cleanHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
