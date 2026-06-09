CREATE TABLE "blocks" (
	"id" text PRIMARY KEY NOT NULL,
	"fine_theme_id" text NOT NULL,
	"type" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"content" text,
	"ai_prompt" jsonb,
	"root_label" text,
	"view_mode" text,
	"nodes" jsonb,
	"columns" jsonb,
	"rows" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entries" (
	"id" text PRIMARY KEY NOT NULL,
	"sub_theme_id" text NOT NULL,
	"type" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"memo" text DEFAULT '' NOT NULL,
	"costs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"decided" boolean,
	"date_start" text,
	"date_end" text,
	"done" boolean,
	"due_date" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fine_themes" (
	"id" text PRIMARY KEY NOT NULL,
	"sub_theme_id" text NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "global_stakeholders" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" text PRIMARY KEY NOT NULL,
	"sub_theme_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"kind" text NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"base64_data" text,
	"comment" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stakeholders" (
	"id" text PRIMARY KEY NOT NULL,
	"sub_theme_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sub_themes" (
	"id" text PRIMARY KEY NOT NULL,
	"theme_id" text NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "themes" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_fine_theme_id_fine_themes_id_fk" FOREIGN KEY ("fine_theme_id") REFERENCES "public"."fine_themes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_sub_theme_id_sub_themes_id_fk" FOREIGN KEY ("sub_theme_id") REFERENCES "public"."sub_themes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fine_themes" ADD CONSTRAINT "fine_themes_sub_theme_id_sub_themes_id_fk" FOREIGN KEY ("sub_theme_id") REFERENCES "public"."sub_themes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_sub_theme_id_sub_themes_id_fk" FOREIGN KEY ("sub_theme_id") REFERENCES "public"."sub_themes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stakeholders" ADD CONSTRAINT "stakeholders_sub_theme_id_sub_themes_id_fk" FOREIGN KEY ("sub_theme_id") REFERENCES "public"."sub_themes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_themes" ADD CONSTRAINT "sub_themes_theme_id_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."themes"("id") ON DELETE cascade ON UPDATE no action;