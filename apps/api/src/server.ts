import { serve } from "@hono/node-server";
import { db } from "@news-aggregator/db";
import { bookmarks, sources } from "@news-aggregator/db/schema";
import { and, eq } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { auth } from "./auth";
import { bankOfCanadaAdapter } from "./adapters/bank-of-canada";
import { federalReserveAdapter } from "./adapters/federal-reserve";
import { hackerNewsAdapter } from "./adapters/hacker-news";
import { sourceAdapters } from "./adapters/registry";
import {
  getCachedPolicyMacroRead,
  getOrCreatePolicyMacroRead,
  InsightError
} from "./intelligence/fed-insight";
import { getConfiguredKeepAlive, getConfiguredModelId, prewarmLocalModel } from "./intelligence/model-client";
import { ingestFromAdapter } from "./services/ingestion";
import { getFeed, isFeedKey, refreshRankedFeeds } from "./services/ranking";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

function requireUser(c: Context<{ Variables: Variables }>) {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Authentication required" }, 401);
  }

  return null;
}

function requireAdmin(c: Context<{ Variables: Variables }>) {
  const authError = requireUser(c);
  if (authError) return authError;

  if (c.get("user")?.role !== "admin") {
    return c.json({ error: "Admin role required" }, 403);
  }

  return null;
}

const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:5173";
const port = Number(process.env.API_PORT ?? 4000);

const app = new Hono<{ Variables: Variables }>();

app.use(logger());
app.use(
  "*",
  cors({
    origin: webOrigin,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: true
  })
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.use("*", async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  c.set("user", session?.user ?? null);
  c.set("session", session?.session ?? null);
  await next();
});

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "news-aggregator-api"
  })
);

app.get("/api/session", (c) =>
  c.json({
    user: c.get("user"),
    session: c.get("session")
  })
);

app.get("/api/sources", async (c) => {
  const rows = await db.select().from(sources).orderBy(sources.name);
  return c.json({ sources: rows });
});

app.post("/api/ingest/hacker-news", async (c) => {
  const authError = requireAdmin(c);
  if (authError) return authError;

  const ingestion = await ingestFromAdapter(hackerNewsAdapter);
  const ranking = await refreshRankedFeeds();
  return c.json({ ingestion, ranking });
});

app.post("/api/ingest/federal-reserve", async (c) => {
  const authError = requireAdmin(c);
  if (authError) return authError;

  const ingestion = await ingestFromAdapter(federalReserveAdapter);
  const ranking = await refreshRankedFeeds();
  return c.json({ ingestion, ranking });
});

app.post("/api/ingest/bank-of-canada", async (c) => {
  const authError = requireAdmin(c);
  if (authError) return authError;

  const ingestion = await ingestFromAdapter(bankOfCanadaAdapter);
  const ranking = await refreshRankedFeeds();
  return c.json({ ingestion, ranking });
});

app.post("/api/ingest/all", async (c) => {
  const authError = requireAdmin(c);
  if (authError) return authError;

  const ingestions = await Promise.all(sourceAdapters.map((adapter) => ingestFromAdapter(adapter)));
  const ranking = await refreshRankedFeeds();
  return c.json({ ingestions, ranking });
});

app.post("/api/feeds/refresh", async (c) => {
  const authError = requireAdmin(c);
  if (authError) return authError;

  const ranking = await refreshRankedFeeds();
  return c.json({ ranking });
});

app.get("/api/feeds/:feedKey", async (c) => {
  const feedKey = c.req.param("feedKey");
  if (!isFeedKey(feedKey)) {
    return c.json({ error: "Unknown feed" }, 404);
  }

  const user = c.get("user");
  const items = await getFeed(feedKey, user?.id);
  return c.json({ feedKey, items });
});

app.get("/api/articles/:articleId/insights/fed", async (c) => {
  return getPolicyMacroReadResponse(c);
});

app.get("/api/articles/:articleId/reads/policy-macro", async (c) => {
  return getPolicyMacroReadResponse(c);
});

async function getPolicyMacroReadResponse(c: Context<{ Variables: Variables }>) {
  const articleId = c.req.param("articleId");
  if (!articleId) {
    return c.json({ error: "Article id is required" }, 400);
  }

  try {
    const insight = await getCachedPolicyMacroRead(articleId);
    if (!insight) {
      return c.json({ status: "missing" as const });
    }

    return c.json({ status: "ready" as const, insight });
  } catch (error) {
    if (error instanceof InsightError) {
      return c.json({ error: error.message }, error.status as 400 | 404 | 503);
    }

    return c.json(
      {
        error: error instanceof Error ? error.message : "Unable to read cached insight"
      },
      500
    );
  }
}

app.post("/api/articles/:articleId/insights/fed", async (c) => {
  return createPolicyMacroReadResponse(c);
});

app.post("/api/articles/:articleId/reads/policy-macro", async (c) => {
  return createPolicyMacroReadResponse(c);
});

async function createPolicyMacroReadResponse(c: Context<{ Variables: Variables }>) {
  const authError = requireUser(c);
  if (authError) return authError;

  const articleId = c.req.param("articleId");
  if (!articleId) {
    return c.json({ error: "Article id is required" }, 400);
  }

  const body = await c.req.json<{ force?: boolean }>().catch((): { force?: boolean } => ({}));

  try {
    const insight = await getOrCreatePolicyMacroRead(articleId, Boolean(body.force));
    return c.json({ insight });
  } catch (error) {
    if (error instanceof InsightError) {
      return c.json({ error: error.message }, error.status as 400 | 404 | 503);
    }

    return c.json(
      {
        error: error instanceof Error ? error.message : "Unable to generate insight"
      },
      500
    );
  }
}

app.post("/api/bookmarks/:articleId", async (c) => {
  const authError = requireUser(c);
  if (authError) return authError;

  const articleId = c.req.param("articleId");
  await db
    .insert(bookmarks)
    .values({ userId: c.get("user")!.id, articleId })
    .onConflictDoNothing();

  return c.json({ bookmarked: true });
});

app.delete("/api/bookmarks/:articleId", async (c) => {
  const authError = requireUser(c);
  if (authError) return authError;

  const articleId = c.req.param("articleId");
  await db
    .delete(bookmarks)
    .where(and(eq(bookmarks.userId, c.get("user")!.id), eq(bookmarks.articleId, articleId)));

  return c.json({ bookmarked: false });
});

serve(
  {
    fetch: app.fetch,
    port,
    hostname: "0.0.0.0"
  },
  (info) => {
    console.log(`API listening on http://localhost:${info.port}`);

    if (process.env.OLLAMA_PREWARM !== "false") {
      queueMicrotask(() => {
        void prewarmLocalModel()
          .then(() => {
            console.log(
              `Prewarmed local AI model ${getConfiguredModelId()} with keep-alive ${getConfiguredKeepAlive()}`
            );
          })
          .catch((error) => {
            console.warn(
              `Local AI prewarm skipped: ${error instanceof Error ? error.message : "unknown error"}`
            );
          });
      });
    }
  }
);

export type AppType = typeof app;
