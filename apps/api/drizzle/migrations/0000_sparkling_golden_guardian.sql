CREATE TABLE IF NOT EXISTS "mapping_frame" (
	"household_id" text PRIMARY KEY NOT NULL,
	"site_id" integer NOT NULL,
	"locality_code" text NOT NULL,
	"structure_map_id" text NOT NULL,
	"household_number" text NOT NULL,
	"structure_id" text NOT NULL,
	"mapping_status" text DEFAULT 'listed',
	"baseline_enrollment_status" text DEFAULT 'pending'
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "study_localities" (
	"site_id" integer NOT NULL,
	"locality_code" text NOT NULL,
	"locality_name" text NOT NULL,
	"locality_type" text,
	CONSTRAINT "study_localities_site_id_locality_code_pk" PRIMARY KEY("site_id","locality_code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "study_sites" (
	"site_id" integer PRIMARY KEY NOT NULL,
	"site_code" text NOT NULL,
	"site_name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "households" (
	"household_id" text PRIMARY KEY NOT NULL,
	"site_id" integer NOT NULL,
	"locality_code" text NOT NULL,
	"structure_map_id" text NOT NULL,
	"household_number" text NOT NULL,
	"residence_area_type" integer,
	"address" text,
	"household_head_name" text,
	"contact_mobile" text,
	"consent_status" text,
	"result_interview" integer,
	"language_questionnaire" integer,
	"baseline_enrollment_status" text DEFAULT 'pending',
	"baseline_completed_date" date,
	"cohort_status" text,
	"closed_reason" text,
	"religion_head" integer,
	"caste_category" integer,
	"household_characteristics" jsonb,
	"sync_status" text DEFAULT 'local',
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "household_members" (
	"household_member_id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"member_number" integer NOT NULL,
	"site_id" integer NOT NULL,
	"locality_code" text NOT NULL,
	"name" text,
	"relationship_to_head" integer,
	"sex" integer,
	"last_residence_place" integer,
	"residence_months" integer,
	"residence_years" integer,
	"date_of_birth" date,
	"date_of_birth_precision" text DEFAULT 'inferred_from_age',
	"reported_age_years" integer,
	"reported_age_as_of_date" date,
	"dob_inference_rule_version" text,
	"marital_status" integer,
	"woman_questionnaire_eligible" boolean DEFAULT false,
	"birth_registration_status" integer,
	"ever_attended_school" integer,
	"highest_grade_completed" integer,
	"member_status" text DEFAULT 'active',
	"usual_resident" boolean DEFAULT true,
	"member_source" text DEFAULT 'baseline',
	"sync_status" text DEFAULT 'local',
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	CONSTRAINT "household_members_household_id_member_number_unique" UNIQUE("household_id","member_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "eligibility_assessments" (
	"assessment_id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"household_id" text NOT NULL,
	"assessment_date" date NOT NULL,
	"age_years_used" integer,
	"age_source" text,
	"sex_used" integer,
	"marital_status_used" integer,
	"usual_resident_used" boolean,
	"eligible_wq" boolean,
	"eligible_pregnancy_tracking" boolean,
	"created_event_id" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "eligible_women" (
	"woman_id" text PRIMARY KEY NOT NULL,
	"household_member_id" text NOT NULL,
	"household_id" text NOT NULL,
	"site_id" integer NOT NULL,
	"locality_code" text NOT NULL,
	"eligibility_start_date" date,
	"eligibility_source_event_id" text,
	"wq_status" text DEFAULT 'pending',
	"tracking_status" text DEFAULT 'not_tracked',
	"current_eligibility_status" text DEFAULT 'eligible',
	"eligibility_basis" text,
	"woman_permanent_id" text,
	"analysis_eligibility_flag" text,
	"sync_status" text DEFAULT 'local',
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pregnancies" (
	"pregnancy_id" text PRIMARY KEY NOT NULL,
	"woman_id" text NOT NULL,
	"household_member_id" text NOT NULL,
	"household_id" text NOT NULL,
	"site_id" integer NOT NULL,
	"locality_code" text NOT NULL,
	"pregnancy_sequence" integer NOT NULL,
	"pregnancy_status" text DEFAULT 'active',
	"detected_date" date,
	"enrollment_date" date,
	"detection_source" text,
	"lmp_date" date,
	"lmp_precision" text,
	"edd_date" date,
	"outcome_recorded_date" date,
	"gestational_age_at_enrollment" integer,
	"current_conditions" jsonb,
	"current_symptoms" jsonb,
	"anthropometrics" jsonb,
	"source_event_id" text,
	"sync_status" text DEFAULT 'local',
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ultrasound_records" (
	"ultrasound_id" text PRIMARY KEY NOT NULL,
	"pregnancy_id" text NOT NULL,
	"woman_id" text NOT NULL,
	"household_id" text NOT NULL,
	"site_id" integer NOT NULL,
	"report_date" date,
	"report_sequence" integer NOT NULL,
	"gestational_age" integer,
	"attachment_reference" text,
	"source_form_response_id" text,
	"created_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "children" (
	"child_id" text PRIMARY KEY NOT NULL,
	"birth_id" text NOT NULL,
	"pregnancy_id" text NOT NULL,
	"woman_id" text NOT NULL,
	"household_id" text NOT NULL,
	"site_id" integer NOT NULL,
	"birth_rank" integer NOT NULL,
	"birth_date" date,
	"birth_status" text,
	"live_birth_status" boolean,
	"current_vital_status" text DEFAULT 'alive',
	"death_date" date,
	"gestational_age_at_birth" integer,
	"sex" integer,
	"birth_weight_grams" integer,
	"source_event_id" text,
	"sync_status" text DEFAULT 'local',
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pregnancy_outcomes" (
	"pregnancy_outcome_id" text PRIMARY KEY NOT NULL,
	"pregnancy_id" text NOT NULL,
	"outcome_date" date NOT NULL,
	"outcome_type" text NOT NULL,
	"gestational_age_at_outcome" integer,
	"live_birth_count" integer DEFAULT 0,
	"fetal_loss_count" integer DEFAULT 0,
	"source_form_response_id" text,
	"created_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "form_responses" (
	"form_response_id" text PRIMARY KEY NOT NULL,
	"response_id" text NOT NULL,
	"site_id" integer NOT NULL,
	"locality_code" text NOT NULL,
	"household_id" text,
	"visit_id" text,
	"task_id" text,
	"series_id" text,
	"sequence_number" integer,
	"form_code" text NOT NULL,
	"form_version" text NOT NULL,
	"subject_type" text,
	"subject_id" text,
	"lineage_ids_json" jsonb,
	"prefill_snapshot_json" jsonb,
	"prefill_mapper_version" text,
	"answers_json" jsonb NOT NULL,
	"created_offline_at" timestamp with time zone,
	"updated_offline_at" timestamp with time zone,
	"device_id" text,
	"synced_at" timestamp with time zone,
	"response_status" text DEFAULT 'primary',
	"created_at" timestamp with time zone,
	CONSTRAINT "form_responses_response_id_unique" UNIQUE("response_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "visits" (
	"visit_id" text PRIMARY KEY NOT NULL,
	"session_id" text,
	"site_id" integer NOT NULL,
	"locality_code" text NOT NULL,
	"household_id" text NOT NULL,
	"primary_subject_type" text,
	"primary_subject_id" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"interviewer_id" text,
	"device_id" text,
	"actual_mode" text,
	"gps_metadata" jsonb,
	"sync_status" text DEFAULT 'local',
	"created_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "domain_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"site_id" integer NOT NULL,
	"locality_code" text NOT NULL,
	"household_id" text,
	"subject_type" text,
	"subject_id" text,
	"visit_id" text,
	"task_id" text,
	"form_response_id" text,
	"event_datetime" timestamp with time zone NOT NULL,
	"created_offline_at" timestamp with time zone,
	"device_id" text,
	"sync_status" text DEFAULT 'local',
	"apply_status" text DEFAULT 'applied',
	"created_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "follow_up_tasks" (
	"task_id" text PRIMARY KEY NOT NULL,
	"task_key" text NOT NULL,
	"site_id" integer NOT NULL,
	"locality_code" text NOT NULL,
	"household_id" text,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"woman_id" text,
	"pregnancy_id" text,
	"child_id" text,
	"task_type" text NOT NULL,
	"form_code" text,
	"expected_forms" text[],
	"series_id" text,
	"sequence_number" integer,
	"protocol_visit_label" text,
	"generation_source" text NOT NULL,
	"source_event_id" text,
	"anchor_event_id" text,
	"anchor_date" date,
	"window_start" date,
	"target_date" date NOT NULL,
	"deadline_date" date,
	"status" text DEFAULT 'planned',
	"priority" integer DEFAULT 0,
	"default_expected_mode" text,
	"allowed_modes" text[],
	"mode_rule_strength" text,
	"max_failed_attempts" integer,
	"failed_attempt_count" integer DEFAULT 0,
	"requires_final_close_reason" boolean DEFAULT false,
	"task_context_json" jsonb,
	"context_builder_version" text,
	"prefill_mapper_version" text,
	"rules_version" text,
	"form_availability" text DEFAULT 'available',
	"action_state" text DEFAULT 'enabled',
	"disabled_reason" text,
	"completed_visit_id" text,
	"completed_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"closed_reason" text,
	"superseded_by_event_id" text,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	CONSTRAINT "follow_up_tasks_task_key_unique" UNIQUE("task_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_attempts" (
	"attempt_id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"attempt_number" integer NOT NULL,
	"visit_id" text,
	"attempted_at" timestamp with time zone NOT NULL,
	"attempted_by_user_id" text,
	"device_id" text,
	"attempted_mode" text,
	"outcome" text NOT NULL,
	"reason_code" text,
	"notes" text,
	"next_attempt_date" date,
	"created_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admin_correction_events" (
	"correction_event_id" text PRIMARY KEY NOT NULL,
	"site_id" integer NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"field_name" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"old_precision" text,
	"new_precision" text,
	"reason_code" text NOT NULL,
	"reason_text" text,
	"source_reference" text,
	"corrected_by_user_id" text NOT NULL,
	"corrected_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "data_quality_flags" (
	"flag_id" text PRIMARY KEY NOT NULL,
	"site_id" integer NOT NULL,
	"flag_type" text NOT NULL,
	"subject_type" text,
	"subject_id" text,
	"task_id" text,
	"primary_response_id" text,
	"duplicate_response_id" text,
	"severity" text DEFAULT 'warning',
	"status" text DEFAULT 'open',
	"created_at" timestamp with time zone,
	"reviewed_by_user_id" text,
	"reviewed_at" timestamp with time zone,
	"review_note" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "devices" (
	"device_id" text PRIMARY KEY NOT NULL,
	"device_name" text,
	"user_id" text,
	"last_sync_at" timestamp with time zone,
	"registered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "person_attribute_history" (
	"history_id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"field_name" text NOT NULL,
	"old_value" text,
	"old_precision" text,
	"new_value" text,
	"new_precision" text,
	"source_form_response_id" text,
	"source_event_id" text,
	"changed_at" timestamp with time zone NOT NULL,
	"changed_by_user_id" text,
	"device_id" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sync_logs" (
	"sync_log_id" text PRIMARY KEY NOT NULL,
	"device_id" text NOT NULL,
	"user_id" text NOT NULL,
	"direction" text NOT NULL,
	"records_sent" integer,
	"records_received" integer,
	"conflicts_detected" integer DEFAULT 0,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"status" text DEFAULT 'in_progress',
	"error_detail" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_area_assignments" (
	"assignment_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"site_id" integer NOT NULL,
	"locality_code" text NOT NULL,
	"role" text NOT NULL,
	"active_from" date,
	"active_to" date,
	"created_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"user_id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"display_name" text,
	"email" text,
	"role" text NOT NULL,
	"site_id" integer,
	"password_hash" text NOT NULL,
	"active" boolean DEFAULT true,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "household_members" ADD CONSTRAINT "household_members_household_id_households_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("household_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "eligible_women" ADD CONSTRAINT "eligible_women_household_member_id_household_members_household_member_id_fk" FOREIGN KEY ("household_member_id") REFERENCES "public"."household_members"("household_member_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "eligible_women" ADD CONSTRAINT "eligible_women_household_id_households_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("household_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pregnancies" ADD CONSTRAINT "pregnancies_woman_id_eligible_women_woman_id_fk" FOREIGN KEY ("woman_id") REFERENCES "public"."eligible_women"("woman_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ultrasound_records" ADD CONSTRAINT "ultrasound_records_pregnancy_id_pregnancies_pregnancy_id_fk" FOREIGN KEY ("pregnancy_id") REFERENCES "public"."pregnancies"("pregnancy_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "children" ADD CONSTRAINT "children_pregnancy_id_pregnancies_pregnancy_id_fk" FOREIGN KEY ("pregnancy_id") REFERENCES "public"."pregnancies"("pregnancy_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pregnancy_outcomes" ADD CONSTRAINT "pregnancy_outcomes_pregnancy_id_pregnancies_pregnancy_id_fk" FOREIGN KEY ("pregnancy_id") REFERENCES "public"."pregnancies"("pregnancy_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "form_responses" ADD CONSTRAINT "form_responses_visit_id_visits_visit_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("visit_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_area_assignments" ADD CONSTRAINT "user_area_assignments_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
