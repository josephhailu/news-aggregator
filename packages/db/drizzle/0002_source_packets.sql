CREATE TABLE "source_packet_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"member_kind" text NOT NULL,
	"mime_type" text,
	"priority" integer DEFAULT 100 NOT NULL,
	"trusted_host" boolean DEFAULT false NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"discovered_from_url" text,
	"text" text,
	"extraction_status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"fetched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_packet_members_article_url_unique" UNIQUE("article_id","url")
);
--> statement-breakpoint
CREATE TABLE "packet_digests" (
	"article_id" uuid PRIMARY KEY NOT NULL,
	"digest_version" text NOT NULL,
	"read_basis" text NOT NULL,
	"digest" jsonb NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "source_packet_members" ADD CONSTRAINT "source_packet_members_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packet_digests" ADD CONSTRAINT "packet_digests_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "source_packet_members_article_priority_idx" ON "source_packet_members" USING btree ("article_id","priority");
