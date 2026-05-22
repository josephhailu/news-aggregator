CREATE TABLE "article_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"insight_type" text NOT NULL,
	"model_id" text NOT NULL,
	"prompt_version" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "article_insights_cache_key_unique" UNIQUE("article_id","insight_type","model_id","prompt_version")
);
--> statement-breakpoint
CREATE TABLE "article_texts" (
	"article_id" uuid PRIMARY KEY NOT NULL,
	"source_url" text,
	"title" text NOT NULL,
	"text" text NOT NULL,
	"extraction_status" text DEFAULT 'ok' NOT NULL,
	"error_message" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "article_insights" ADD CONSTRAINT "article_insights_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_texts" ADD CONSTRAINT "article_texts_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "article_insights_article_id_idx" ON "article_insights" USING btree ("article_id");