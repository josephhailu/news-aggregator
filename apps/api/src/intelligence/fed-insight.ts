import { db } from "@news-aggregator/db";
import { articleInsights, articleTexts, articles, sources } from "@news-aggregator/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getSourceMetadata } from "../adapters/registry";
import { getArticleText } from "./article-text";
import { getConfiguredModelId, runLocalChat } from "./model-client";

export const POLICY_MACRO_READ_TYPE = "policy_macro";
export const POLICY_MACRO_PROMPT_VERSION = "policy-macro-v1";
export const FED_INSIGHT_TYPE = POLICY_MACRO_READ_TYPE;
export const FED_PROMPT_VERSION = POLICY_MACRO_PROMPT_VERSION;

const policyMacroReadSchema = z.object({
  plainEnglishSummary: z.string().min(1),
  policySignal: z
    .enum(["dovish", "mildly_dovish", "neutral", "mildly_hawkish", "hawkish", "mixed"])
    .nullable(),
  whyItMatters: z.array(z.string()).max(6),
  secondOrderEffects: z.array(z.string()).max(8),
  watchNext: z.array(z.string()).max(8),
  confidence: z.enum(["low", "medium", "high"]),
  caveats: z.array(z.string()).min(1).max(5)
});

export type PolicyMacroRead = z.infer<typeof policyMacroReadSchema> & {
  modelId: string;
  promptVersion: string;
  cached: boolean;
  extractionStatus: "ok" | "summary_only";
};

export type FedInsight = PolicyMacroRead;

const inFlightInsights = new Map<string, Promise<PolicyMacroRead>>();

export async function getCachedPolicyMacroRead(articleId: string): Promise<PolicyMacroRead | null> {
  const modelId = getConfiguredModelId();
  await assertPolicyMacroArticle(articleId);

  const cached = await db.query.articleInsights.findFirst({
    where: (insight, { and, eq }) =>
      and(
        eq(insight.articleId, articleId),
        eq(insight.insightType, POLICY_MACRO_READ_TYPE),
        eq(insight.modelId, modelId),
        eq(insight.promptVersion, POLICY_MACRO_PROMPT_VERSION)
      )
  });

  if (!cached) {
    return null;
  }

  const text = await db.query.articleTexts.findFirst({
    where: (row, { eq }) => eq(row.articleId, articleId)
  });

  return {
    ...policyMacroReadSchema.parse(cached.result),
    modelId,
    promptVersion: POLICY_MACRO_PROMPT_VERSION,
    cached: true,
    extractionStatus: text?.extractionStatus === "ok" ? "ok" : "summary_only"
  };
}

export async function getOrCreatePolicyMacroRead(
  articleId: string,
  force = false
): Promise<PolicyMacroRead> {
  const modelId = getConfiguredModelId();
  await assertPolicyMacroArticle(articleId);

  if (!force) {
    const cached = await getCachedPolicyMacroRead(articleId);
    if (cached) {
      return cached;
    }
  }

  const cacheKey = `${articleId}:${POLICY_MACRO_READ_TYPE}:${modelId}:${POLICY_MACRO_PROMPT_VERSION}`;
  const inFlight = inFlightInsights.get(cacheKey);
  if (inFlight && !force) {
    return inFlight;
  }

  const generation = generatePolicyMacroRead(articleId, modelId);
  inFlightInsights.set(cacheKey, generation);

  try {
    return await generation;
  } finally {
    inFlightInsights.delete(cacheKey);
  }
}

export const getCachedFedInsight = getCachedPolicyMacroRead;
export const getOrCreateFedInsight = getOrCreatePolicyMacroRead;

async function generatePolicyMacroRead(
  articleId: string,
  modelId: string
): Promise<PolicyMacroRead> {
  const article = await getPolicyMacroArticle(articleId);
  const extraction = await getArticleText(articleId);
  const prompt = buildPolicyMacroPrompt(article.sourceName, extraction.title, extraction.text);
  let modelResponse: string;

  try {
    const result = await runLocalChat([
      {
        role: "system",
        content:
          "You are a careful macro markets explainer. You do not give financial advice. You return valid JSON only."
      },
      {
        role: "user",
        content: prompt
      }
    ]);
    modelResponse = result.content;
  } catch (error) {
    throw new InsightError(
      503,
      error instanceof Error
        ? error.message
        : "Local AI runtime is unavailable. Start Ollama and pull the configured model."
    );
  }

  const parsed = policyMacroReadSchema.parse(
    normalizePolicyMacroRead(parseJsonObject(modelResponse))
  );

  await db
    .insert(articleInsights)
    .values({
      articleId,
      insightType: POLICY_MACRO_READ_TYPE,
      modelId,
      promptVersion: POLICY_MACRO_PROMPT_VERSION,
      result: parsed,
      createdAt: new Date(),
      updatedAt: new Date()
    })
    .onConflictDoUpdate({
      target: [
        articleInsights.articleId,
        articleInsights.insightType,
        articleInsights.modelId,
        articleInsights.promptVersion
      ],
      set: {
        result: parsed,
        updatedAt: new Date()
      }
    });

  return {
    ...parsed,
    modelId,
    promptVersion: POLICY_MACRO_PROMPT_VERSION,
    cached: false,
    extractionStatus: extraction.extractionStatus
  };
}

async function assertPolicyMacroArticle(articleId: string) {
  await getPolicyMacroArticle(articleId);
}

async function getPolicyMacroArticle(articleId: string) {
  const article = await db
    .select({
      id: articles.id,
      sourceName: sources.name,
      adapterKey: sources.adapterKey
    })
    .from(articles)
    .innerJoin(sources, eq(articles.sourceId, sources.id))
    .where(eq(articles.id, articleId))
    .limit(1);

  const row = article[0];
  if (!row) {
    throw new InsightError(404, "Article not found");
  }

  if (!getSourceMetadata(row.adapterKey).availableReads.includes(POLICY_MACRO_READ_TYPE)) {
    throw new InsightError(400, "Policy macro read is not available for this article");
  }

  return row;
}

function buildPolicyMacroPrompt(sourceName: string, title: string, text: string) {
  return `
Analyze this ${sourceName} central bank policy release for an investor with a few years of investing experience who understands tax-advantaged accounts and is learning how macro policy can create second-order market effects.

Do not recommend buying or selling anything. Explain mechanisms and what to watch.
Your main job is to summarize the document clearly. If the release is procedural, sparse, or low-signal, it is okay to leave market interpretation fields empty instead of guessing.

Return JSON with exactly these keys:
{
  "plainEnglishSummary": "2-3 sentences in plain English",
  "policySignal": "dovish | mildly_dovish | neutral | mildly_hawkish | hawkish | mixed | null",
  "whyItMatters": ["short bullets about the macro interpretation, or [] if weak/no signal"],
  "secondOrderEffects": ["possible downstream market mechanisms, not predictions, or [] if uncertain"],
  "watchNext": ["market or macro indicators to watch next, or [] if not applicable"],
  "confidence": "low | medium | high",
  "caveats": ["limits of this inference"]
}

Title:
${title}

Release text:
${text}
`.trim();
}

function parseJsonObject(content: string) {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("Model did not return JSON");
    }
    return JSON.parse(content.slice(start, end + 1)) as unknown;
  }
}

function normalizePolicyMacroRead(raw: unknown) {
  const object = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  return {
    plainEnglishSummary: normalizeString(object.plainEnglishSummary),
    policySignal: normalizePolicySignal(object.policySignal),
    whyItMatters: normalizeStringArray(object.whyItMatters, 6),
    secondOrderEffects: normalizeStringArray(object.secondOrderEffects, 8),
    watchNext: normalizeStringArray(object.watchNext, 8),
    confidence: normalizeConfidence(object.confidence),
    caveats: normalizeCaveats(object.caveats)
  };
}

function normalizeString(value: unknown) {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  return "This release was summarized locally, but the model did not produce a fuller explanation.";
}

function normalizePolicySignal(value: unknown): PolicyMacroRead["policySignal"] {
  const allowed = new Set([
    "dovish",
    "mildly_dovish",
    "neutral",
    "mildly_hawkish",
    "hawkish",
    "mixed"
  ]);

  if (typeof value === "string" && allowed.has(value)) {
    return value as PolicyMacroRead["policySignal"];
  }

  return null;
}

function normalizeStringArray(value: unknown, limit: number) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function normalizeConfidence(value: unknown): PolicyMacroRead["confidence"] {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }

  return "low";
}

function normalizeCaveats(value: unknown) {
  const caveats = normalizeStringArray(value, 5);
  if (caveats.length > 0) {
    return caveats;
  }

  return ["This summary is based on the release text alone and may omit broader market context."];
}

export class InsightError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}
