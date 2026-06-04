CREATE TABLE IF NOT EXISTS "admin_corrections" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"field" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"reason" text,
	"corrected_by" text NOT NULL,
	"corrected_at" timestamp with time zone DEFAULT now()
);
