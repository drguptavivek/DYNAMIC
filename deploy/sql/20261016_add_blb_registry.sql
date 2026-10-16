BEGIN;

SET LOCAL lock_timeout = '10s';
LOCK TABLE public.household_members IN ACCESS EXCLUSIVE MODE;

-- Compare every pre-existing member value while the schema lock prevents writes.
CREATE TEMP TABLE blb_registry_member_snapshot ON COMMIT DROP AS
SELECT household_member_id,
       to_jsonb(m) - ARRAY['registry_individual_id', 'registry_uid', 'registry_status'] AS row_data
FROM public.household_members AS m;

ALTER TABLE public.household_members
    ADD COLUMN IF NOT EXISTS registry_individual_id text,
    ADD COLUMN IF NOT EXISTS registry_uid text,
    ADD COLUMN IF NOT EXISTS registry_status text;

CREATE TABLE IF NOT EXISTS public.blb_registry_households (
    hh_list_no text NOT NULL,
    family_no text NOT NULL,
    head_name text,
    address text,
    updated_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (hh_list_no, family_no)
);

CREATE TABLE IF NOT EXISTS public.blb_registry_individuals (
    uid text PRIMARY KEY,
    village_code text,
    village_name text,
    phc_code text,
    phc_name text,
    hh_list_no text,
    family_no text,
    ind_no text,
    name text,
    age_years integer,
    sex text,
    status text NOT NULL DEFAULT 'alive',
    domicile text,
    curr_status text,
    death_date text,
    migrated_out_date text,
    migration_reason text,
    source_age_as_of text,
    updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS blb_registry_individuals_village_hh_family_ind_idx
    ON public.blb_registry_individuals (village_code, hh_list_no, family_no, ind_no);

CREATE TABLE IF NOT EXISTS public.blb_registry_snapshot (
    snapshot_key text PRIMARY KEY,
    generation text NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

DO $$
BEGIN
    IF (SELECT count(*) FROM public.household_members)
       <> (SELECT count(*) FROM pg_temp.blb_registry_member_snapshot)
       OR EXISTS (
           SELECT 1
           FROM public.household_members AS m
           FULL JOIN pg_temp.blb_registry_member_snapshot AS s
               USING (household_member_id)
           WHERE s.row_data IS DISTINCT FROM
               (to_jsonb(m) - ARRAY['registry_individual_id', 'registry_uid', 'registry_status'])
       ) THEN
        RAISE EXCEPTION 'Household member preservation check failed; schema update rolled back';
    END IF;
END
$$;

COMMIT;
