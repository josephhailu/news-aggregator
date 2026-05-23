import { db } from "@news-aggregator/db";
import {
  articles,
  modelCandidates,
  modelQualityReviews,
  modelRunMetrics,
  policyReadModelRuns,
  sources
} from "@news-aggregator/db/schema";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { ModelCandidateRuntime } from "./model-client";

const RAW_RESPONSE_CAP = 20_000;

export type ModelRunStatus = "success" | "failure";
export type ModelRunFailureReason =
  | "timeout"
  | "runtime_unavailable"
  | "invalid_json"
  | "schema_validation"
  | "unknown";

export type StartPolicyReadModelRunInput = {
  articleId: string;
  readType: string;
  promptVersion: string;
  candidateRuntime: ModelCandidateRuntime;
};

export type CompletePolicyReadModelRunInput = {
  runId: string;
  status: ModelRunStatus;
  totalDurationMs: number;
  modelLatencyMs?: number | null;
  articleInsightId?: string | null;
  failureReason?: ModelRunFailureReason | null;
  readBasis?: string | null;
  rawResponse?: string | null;
};

export const modelQualityReviewInputSchema = z.object({
  useful: z.boolean(),
  grounded: z.boolean(),
  clear: z.boolean(),
  notes: z.string().trim().max(2000).optional().nullable()
});

export async function startPolicyReadModelRun(input: StartPolicyReadModelRunInput) {
  const candidate = await upsertModelCandidate(input);
  const [run] = await db
    .insert(policyReadModelRuns)
    .values({
      articleId: input.articleId,
      modelCandidateId: candidate.id,
      status: "running",
      createdAt: new Date()
    })
    .returning({ id: policyReadModelRuns.id });
  if (!run) {
    throw new Error("Policy read model run was not created");
  }

  return { runId: run.id, modelCandidateId: candidate.id };
}

export async function completePolicyReadModelRun(input: CompletePolicyReadModelRunInput) {
  await db
    .update(policyReadModelRuns)
    .set({
      status: input.status,
      failureReason: input.failureReason ?? null,
      readBasis: input.readBasis ?? null,
      rawResponse:
        input.status === "failure" && input.rawResponse ? capRawResponse(input.rawResponse) : null,
      articleInsightId: input.articleInsightId ?? null,
      completedAt: new Date()
    })
    .where(eq(policyReadModelRuns.id, input.runId));

  await db
    .insert(modelRunMetrics)
    .values({
      runId: input.runId,
      totalDurationMs: Math.max(0, Math.round(input.totalDurationMs)),
      modelLatencyMs:
        typeof input.modelLatencyMs === "number" ? Math.max(0, Math.round(input.modelLatencyMs)) : null
    })
    .onConflictDoUpdate({
      target: modelRunMetrics.runId,
      set: {
        totalDurationMs: Math.max(0, Math.round(input.totalDurationMs)),
        modelLatencyMs:
          typeof input.modelLatencyMs === "number"
            ? Math.max(0, Math.round(input.modelLatencyMs))
            : null
      }
    });
}

export function classifyModelRunFailure(error: unknown): ModelRunFailureReason {
  if (error instanceof z.ZodError) {
    return "schema_validation";
  }

  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("timed out") || message.includes("timeout")) {
    return "timeout";
  }

  if (
    message.includes("runtime is unavailable") ||
    message.includes("failed to fetch") ||
    message.includes("connection refused") ||
    message.includes("ollama")
  ) {
    return "runtime_unavailable";
  }

  if (message.includes("json")) {
    return "invalid_json";
  }

  return "unknown";
}

export async function listRecentPolicyReadModelRuns(limit: number) {
  const boundedLimit = Math.min(Math.max(limit, 1), 100);

  const rows = await db
    .select({
      id: policyReadModelRuns.id,
      articleId: policyReadModelRuns.articleId,
      articleTitle: articles.title,
      sourceName: sources.name,
      status: policyReadModelRuns.status,
      failureReason: policyReadModelRuns.failureReason,
      readBasis: policyReadModelRuns.readBasis,
      rawResponse: policyReadModelRuns.rawResponse,
      createdAt: policyReadModelRuns.createdAt,
      completedAt: policyReadModelRuns.completedAt,
      candidateId: modelCandidates.id,
      provider: modelCandidates.provider,
      runtime: modelCandidates.runtime,
      modelId: modelCandidates.modelId,
      promptVersion: modelCandidates.promptVersion,
      generationSettings: modelCandidates.generationSettings,
      totalDurationMs: modelRunMetrics.totalDurationMs,
      modelLatencyMs: modelRunMetrics.modelLatencyMs
    })
    .from(policyReadModelRuns)
    .innerJoin(articles, eq(policyReadModelRuns.articleId, articles.id))
    .innerJoin(sources, eq(articles.sourceId, sources.id))
    .innerJoin(modelCandidates, eq(policyReadModelRuns.modelCandidateId, modelCandidates.id))
    .leftJoin(modelRunMetrics, eq(policyReadModelRuns.id, modelRunMetrics.runId))
    .orderBy(desc(policyReadModelRuns.createdAt))
    .limit(boundedLimit);

  return rows.map((row) => ({
    id: row.id,
    article: {
      id: row.articleId,
      title: row.articleTitle,
      sourceName: row.sourceName
    },
    status: row.status,
    failureReason: row.failureReason,
    readBasis: row.readBasis,
    rawResponse: row.rawResponse,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
    candidate: {
      id: row.candidateId,
      provider: row.provider,
      runtime: row.runtime,
      modelId: row.modelId,
      promptVersion: row.promptVersion,
      generationSettings: row.generationSettings
    },
    metrics: row.totalDurationMs !== null
      ? {
          totalDurationMs: row.totalDurationMs,
          modelLatencyMs: row.modelLatencyMs
        }
      : null
  }));
}

export async function listModelQualityReviews(runId: string) {
  return db
    .select({
      id: modelQualityReviews.id,
      runId: modelQualityReviews.runId,
      reviewerUserId: modelQualityReviews.reviewerUserId,
      useful: modelQualityReviews.useful,
      grounded: modelQualityReviews.grounded,
      clear: modelQualityReviews.clear,
      notes: modelQualityReviews.notes,
      createdAt: modelQualityReviews.createdAt,
      updatedAt: modelQualityReviews.updatedAt
    })
    .from(modelQualityReviews)
    .where(eq(modelQualityReviews.runId, runId))
    .orderBy(desc(modelQualityReviews.createdAt));
}

export async function createModelQualityReview(
  runId: string,
  reviewerUserId: string,
  input: z.infer<typeof modelQualityReviewInputSchema>
) {
  const [review] = await db
    .insert(modelQualityReviews)
    .values({
      runId,
      reviewerUserId,
      useful: input.useful,
      grounded: input.grounded,
      clear: input.clear,
      notes: input.notes?.trim() || null,
      createdAt: new Date(),
      updatedAt: new Date()
    })
    .returning();

  return review;
}

export async function policyReadModelRunExists(runId: string) {
  const [run] = await db
    .select({ id: policyReadModelRuns.id })
    .from(policyReadModelRuns)
    .where(eq(policyReadModelRuns.id, runId))
    .limit(1);

  return Boolean(run);
}

async function upsertModelCandidate(input: StartPolicyReadModelRunInput) {
  const candidateRuntime = input.candidateRuntime;
  const candidateKey = buildCandidateKey({
    readType: input.readType,
    provider: candidateRuntime.provider,
    runtime: candidateRuntime.runtime,
    modelId: candidateRuntime.modelId,
    promptVersion: input.promptVersion,
    generationSettings: candidateRuntime.generationSettings
  });

  const [candidate] = await db
    .insert(modelCandidates)
    .values({
      candidateKey,
      readType: input.readType,
      provider: candidateRuntime.provider,
      runtime: candidateRuntime.runtime,
      modelId: candidateRuntime.modelId,
      promptVersion: input.promptVersion,
      generationSettings: candidateRuntime.generationSettings,
      createdAt: new Date(),
      updatedAt: new Date()
    })
    .onConflictDoUpdate({
      target: modelCandidates.candidateKey,
      set: {
        generationSettings: candidateRuntime.generationSettings,
        updatedAt: new Date()
      }
    })
    .returning({ id: modelCandidates.id });
  if (!candidate) {
    throw new Error("Model candidate was not created");
  }

  return candidate;
}

function buildCandidateKey(value: Record<string, unknown>) {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortJson(nested)])
    );
  }

  return value;
}

function capRawResponse(rawResponse: string) {
  if (rawResponse.length <= RAW_RESPONSE_CAP) {
    return rawResponse;
  }

  return `${rawResponse.slice(0, RAW_RESPONSE_CAP)}\n[truncated at ${RAW_RESPONSE_CAP} chars]`;
}
