CREATE TABLE IF NOT EXISTS "field_worker_household_assignments" (
	"assignment_id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"user_id" text NOT NULL,
	"assigned_by_user_id" text NOT NULL,
	"assigned_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "field_worker_household_assignments_household_user_unique" UNIQUE("household_id","user_id")
);

DO $$ BEGIN
 ALTER TABLE "field_worker_household_assignments" ADD CONSTRAINT "field_worker_household_assignments_household_id_households_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("household_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "field_worker_household_assignments" ADD CONSTRAINT "field_worker_household_assignments_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "field_worker_household_assignments" ADD CONSTRAINT "field_worker_household_assignments_assigned_by_user_id_users_user_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
