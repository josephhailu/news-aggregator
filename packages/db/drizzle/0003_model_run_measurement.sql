CREATE TABLE "model_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_key" text NOT NULL,
	"read_type" text NOT NULL,
	"provider" text NOT NULL,
	"runtime" text NOT NULL,
	"model_id" text NOT NULL,
	"prompt_version" text NOT NULL,
	"generation_settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "model_candidates_candidate_key_unique" UNIQUE("candidate_key")
);
--> statement-breakpoint
CREATE TABLE "policy_read_model_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"model_candidate_id" uuid NOT NULL,
	"article_insight_id" uuid,
	"status" text NOT NULL,
	"failure_reason" text,
	"read_basis" text,
	"raw_response" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "model_run_metrics" (
	"run_id" uuid PRIMARY KEY NOT NULL,
	"total_duration_ms" integer NOT NULL,
	"model_latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_quality_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"reviewer_user_id" text NOT NULL,
	"useful" boolean NOT NULL,
	"grounded" boolean NOT NULL,
	"clear" boolean NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "policy_read_model_runs" ADD CONSTRAINT "policy_read_model_runs_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_read_model_runs" ADD CONSTRAINT "policy_read_model_runs_model_candidate_id_model_candidates_id_fk" FOREIGN KEY ("model_candidate_id") REFERENCES "public"."model_candidates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_read_model_runs" ADD CONSTRAINT "policy_read_model_runs_article_insight_id_article_insights_id_fk" FOREIGN KEY ("article_insight_id") REFERENCES "public"."article_insights"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_run_metrics" ADD CONSTRAINT "model_run_metrics_run_id_policy_read_model_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."policy_read_model_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_quality_reviews" ADD CONSTRAINT "model_quality_reviews_run_id_policy_read_model_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."policy_read_model_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_quality_reviews" ADD CONSTRAINT "model_quality_reviews_reviewer_user_id_user_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "model_candidates_read_type_idx" ON "model_candidates" USING btree ("read_type");--> statement-breakpoint
CREATE INDEX "policy_read_model_runs_created_at_idx" ON "policy_read_model_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "policy_read_model_runs_article_id_idx" ON "policy_read_model_runs" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX "policy_read_model_runs_model_candidate_id_idx" ON "policy_read_model_runs" USING btree ("model_candidate_id");--> statement-breakpoint
CREATE INDEX "model_quality_reviews_run_id_idx" ON "model_quality_reviews" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "model_quality_reviews_reviewer_user_id_idx" ON "model_quality_reviews" USING btree ("reviewer_user_id");
