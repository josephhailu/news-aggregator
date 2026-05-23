import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uuid
} from "drizzle-orm/pg-core";

export const sourceType = pgEnum("source_type", ["external", "user"]);
export const feedWindow = pgEnum("feed_window", ["top_now", "today", "week", "latest"]);

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" })
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const sources = pgTable("sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  sourceType: sourceType("source_type").notNull().default("external"),
  adapterKey: text("adapter_key").notNull().unique(),
  homepageUrl: text("homepage_url").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const articles = pgTable(
  "articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    url: text("url"),
    discussionUrl: text("discussion_url"),
    author: text("author"),
    summary: text("summary"),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull().default({})
  },
  (table) => ({
    sourceExternalUnique: unique("articles_source_external_unique").on(
      table.sourceId,
      table.externalId
    ),
    publishedIdx: index("articles_published_at_idx").on(table.publishedAt)
  })
);

export const articleSignals = pgTable("article_signals", {
  id: uuid("id").primaryKey().defaultRandom(),
  articleId: uuid("article_id")
    .notNull()
    .references(() => articles.id, { onDelete: "cascade" })
    .unique(),
  points: integer("points"),
  comments: integer("comments"),
  views: integer("views"),
  stars: integer("stars"),
  sourceRank: integer("source_rank"),
  rawSignals: jsonb("raw_signals").$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow()
});

export const articleScores = pgTable(
  "article_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    feedWindow: feedWindow("feed_window").notNull(),
    score: real("score").notNull(),
    breakdown: jsonb("breakdown").$type<Record<string, unknown>>().notNull().default({}),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    scoreUnique: unique("article_scores_article_window_unique").on(
      table.articleId,
      table.feedWindow
    ),
    scoreIdx: index("article_scores_score_idx").on(table.score)
  })
);

export const rankedFeedItems = pgTable(
  "ranked_feed_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    feedKey: text("feed_key").notNull(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    score: real("score").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    feedPositionUnique: unique("ranked_feed_items_feed_position_unique").on(
      table.feedKey,
      table.position
    ),
    feedIdx: index("ranked_feed_items_feed_key_idx").on(table.feedKey)
  })
);

export const articleTexts = pgTable("article_texts", {
  articleId: uuid("article_id")
    .primaryKey()
    .references(() => articles.id, { onDelete: "cascade" }),
  sourceUrl: text("source_url"),
  title: text("title").notNull(),
  text: text("text").notNull(),
  extractionStatus: text("extraction_status").notNull().default("ok"),
  errorMessage: text("error_message"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const sourcePacketMembers = pgTable(
  "source_packet_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    title: text("title"),
    memberKind: text("member_kind").notNull(),
    mimeType: text("mime_type"),
    priority: integer("priority").notNull().default(100),
    trustedHost: boolean("trusted_host").notNull().default(false),
    isPrimary: boolean("is_primary").notNull().default(false),
    discoveredFromUrl: text("discovered_from_url"),
    text: text("text"),
    extractionStatus: text("extraction_status").notNull().default("pending"),
    errorMessage: text("error_message"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    articleUrlUnique: unique("source_packet_members_article_url_unique").on(
      table.articleId,
      table.url
    ),
    articlePriorityIdx: index("source_packet_members_article_priority_idx").on(
      table.articleId,
      table.priority
    )
  })
);

export const packetDigests = pgTable(
  "packet_digests",
  {
    articleId: uuid("article_id")
      .primaryKey()
      .references(() => articles.id, { onDelete: "cascade" }),
    digestVersion: text("digest_version").notNull(),
    readBasis: text("read_basis").notNull(),
    digest: jsonb("digest").$type<Record<string, unknown>>().notNull(),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  }
);

export const articleInsights = pgTable(
  "article_insights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    insightType: text("insight_type").notNull(),
    modelId: text("model_id").notNull(),
    promptVersion: text("prompt_version").notNull(),
    result: jsonb("result").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    insightUnique: unique("article_insights_cache_key_unique").on(
      table.articleId,
      table.insightType,
      table.modelId,
      table.promptVersion
    ),
    insightArticleIdx: index("article_insights_article_id_idx").on(table.articleId)
  })
);

export const modelCandidates = pgTable(
  "model_candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    candidateKey: text("candidate_key").notNull().unique(),
    readType: text("read_type").notNull(),
    provider: text("provider").notNull(),
    runtime: text("runtime").notNull(),
    modelId: text("model_id").notNull(),
    promptVersion: text("prompt_version").notNull(),
    generationSettings: jsonb("generation_settings")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    modelCandidateReadIdx: index("model_candidates_read_type_idx").on(table.readType)
  })
);

export const policyReadModelRuns = pgTable(
  "policy_read_model_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    modelCandidateId: uuid("model_candidate_id")
      .notNull()
      .references(() => modelCandidates.id, { onDelete: "restrict" }),
    articleInsightId: uuid("article_insight_id").references(() => articleInsights.id, {
      onDelete: "set null"
    }),
    status: text("status").notNull(),
    failureReason: text("failure_reason"),
    readBasis: text("read_basis"),
    rawResponse: text("raw_response"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true })
  },
  (table) => ({
    policyRunCreatedIdx: index("policy_read_model_runs_created_at_idx").on(table.createdAt),
    policyRunArticleIdx: index("policy_read_model_runs_article_id_idx").on(table.articleId),
    policyRunCandidateIdx: index("policy_read_model_runs_model_candidate_id_idx").on(
      table.modelCandidateId
    )
  })
);

export const modelRunMetrics = pgTable("model_run_metrics", {
  runId: uuid("run_id")
    .primaryKey()
    .references(() => policyReadModelRuns.id, { onDelete: "cascade" }),
  totalDurationMs: integer("total_duration_ms").notNull(),
  modelLatencyMs: integer("model_latency_ms"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const modelQualityReviews = pgTable(
  "model_quality_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => policyReadModelRuns.id, { onDelete: "cascade" }),
    reviewerUserId: text("reviewer_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    useful: boolean("useful").notNull(),
    grounded: boolean("grounded").notNull(),
    clear: boolean("clear").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    modelQualityRunIdx: index("model_quality_reviews_run_id_idx").on(table.runId),
    modelQualityReviewerIdx: index("model_quality_reviews_reviewer_user_id_idx").on(
      table.reviewerUserId
    )
  })
);

export const bookmarks = pgTable(
  "bookmarks",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.articleId] })
  })
);

export const sourcesRelations = relations(sources, ({ many }) => ({
  articles: many(articles)
}));

export const articlesRelations = relations(articles, ({ one, many }) => ({
  source: one(sources, {
    fields: [articles.sourceId],
    references: [sources.id]
  }),
  signals: one(articleSignals),
  scores: many(articleScores),
  text: one(articleTexts),
  packetMembers: many(sourcePacketMembers),
  packetDigest: one(packetDigests),
  insights: many(articleInsights),
  policyReadModelRuns: many(policyReadModelRuns),
  bookmarks: many(bookmarks)
}));

export const articleTextsRelations = relations(articleTexts, ({ one }) => ({
  article: one(articles, {
    fields: [articleTexts.articleId],
    references: [articles.id]
  })
}));

export const sourcePacketMembersRelations = relations(sourcePacketMembers, ({ one }) => ({
  article: one(articles, {
    fields: [sourcePacketMembers.articleId],
    references: [articles.id]
  })
}));

export const packetDigestsRelations = relations(packetDigests, ({ one }) => ({
  article: one(articles, {
    fields: [packetDigests.articleId],
    references: [articles.id]
  })
}));

export const articleInsightsRelations = relations(articleInsights, ({ one, many }) => ({
  article: one(articles, {
    fields: [articleInsights.articleId],
    references: [articles.id]
  }),
  policyReadModelRuns: many(policyReadModelRuns)
}));

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  bookmarks: many(bookmarks),
  modelQualityReviews: many(modelQualityReviews)
}));

export const modelCandidatesRelations = relations(modelCandidates, ({ many }) => ({
  policyReadModelRuns: many(policyReadModelRuns)
}));

export const policyReadModelRunsRelations = relations(policyReadModelRuns, ({ one, many }) => ({
  article: one(articles, {
    fields: [policyReadModelRuns.articleId],
    references: [articles.id]
  }),
  modelCandidate: one(modelCandidates, {
    fields: [policyReadModelRuns.modelCandidateId],
    references: [modelCandidates.id]
  }),
  articleInsight: one(articleInsights, {
    fields: [policyReadModelRuns.articleInsightId],
    references: [articleInsights.id]
  }),
  metrics: one(modelRunMetrics),
  qualityReviews: many(modelQualityReviews)
}));

export const modelRunMetricsRelations = relations(modelRunMetrics, ({ one }) => ({
  run: one(policyReadModelRuns, {
    fields: [modelRunMetrics.runId],
    references: [policyReadModelRuns.id]
  })
}));

export const modelQualityReviewsRelations = relations(modelQualityReviews, ({ one }) => ({
  run: one(policyReadModelRuns, {
    fields: [modelQualityReviews.runId],
    references: [policyReadModelRuns.id]
  }),
  reviewer: one(user, {
    fields: [modelQualityReviews.reviewerUserId],
    references: [user.id]
  })
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id]
  })
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id]
  })
}));

export const bookmarksRelations = relations(bookmarks, ({ one }) => ({
  user: one(user, {
    fields: [bookmarks.userId],
    references: [user.id]
  }),
  article: one(articles, {
    fields: [bookmarks.articleId],
    references: [articles.id]
  })
}));

export const now = sql`now()`;
