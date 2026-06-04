import { and, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { hashPassword } from "../lib/password";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:3310/api/v1";
const smokeUser = {
  user_id: "dev-field-worker",
  username: "dev-field-worker",
  password: "dev-password",
};

async function upsertDevSeed() {
  const now = new Date();
  const passwordHash = await hashPassword(smokeUser.password);

  await db
    .insert(schema.studySites)
    .values({
      site_id: 1,
      site_code: "DEV",
      site_name: "Development Site",
    })
    .onConflictDoUpdate({
      target: schema.studySites.site_id,
      set: {
        site_code: "DEV",
        site_name: "Development Site",
      },
    });

  await db
    .insert(schema.studyLocalities)
    .values({
      site_id: 1,
      locality_code: "DEV001",
      locality_name: "Development Locality",
      locality_type: "urban",
    })
    .onConflictDoUpdate({
      target: [schema.studyLocalities.site_id, schema.studyLocalities.locality_code],
      set: {
        locality_name: "Development Locality",
        locality_type: "urban",
      },
    });

  await db
    .insert(schema.mappingFrame)
    .values({
      household_id: "1-DEV001-0001-01",
      site_id: 1,
      locality_code: "DEV001",
      structure_map_id: "0001",
      household_number: "01",
      structure_id: "1-DEV001-0001",
      mapping_status: "enrolled",
      baseline_enrollment_status: "completed",
    })
    .onConflictDoUpdate({
      target: schema.mappingFrame.household_id,
      set: {
        mapping_status: "enrolled",
        baseline_enrollment_status: "completed",
      },
    });

  await db
    .insert(schema.households)
    .values({
      household_id: "1-DEV001-0001-01",
      site_id: 1,
      locality_code: "DEV001",
      structure_map_id: "0001",
      household_number: "01",
      household_head_name: "Dev Household",
      baseline_enrollment_status: "completed",
      baseline_completed_date: "2026-09-01",
      cohort_status: "enrolled",
      sync_status: "synced",
      created_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: schema.households.household_id,
      set: {
        household_head_name: "Dev Household",
        baseline_enrollment_status: "completed",
        cohort_status: "enrolled",
        updated_at: now,
      },
    });

  await db
    .insert(schema.users)
    .values({
      user_id: smokeUser.user_id,
      username: smokeUser.username,
      display_name: "Dev Field Worker",
      role: "field_worker",
      site_id: 1,
      password_hash: passwordHash,
      active: true,
      created_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: schema.users.user_id,
      set: {
        display_name: "Dev Field Worker",
        role: "field_worker",
        site_id: 1,
        password_hash: passwordHash,
        active: true,
        updated_at: now,
      },
    });

  const existingAssignment = await db
    .select()
    .from(schema.userAreaAssignments)
    .where(
      and(
        eq(schema.userAreaAssignments.user_id, smokeUser.user_id),
        eq(schema.userAreaAssignments.site_id, 1),
        eq(schema.userAreaAssignments.locality_code, "DEV001"),
      ),
    )
    .limit(1);

  if (existingAssignment.length === 0) {
    await db.insert(schema.userAreaAssignments).values({
      assignment_id: "dev-field-worker-DEV001",
      user_id: smokeUser.user_id,
      site_id: 1,
      locality_code: "DEV001",
      role: "field_worker",
      active_from: "2026-06-04",
      active_to: null,
      created_at: now,
    });
  }

  await db
    .insert(schema.followUpTasks)
    .values({
      task_id: "dev-task-hhq-1",
      task_key: "1-DEV001-0001-01:household:1-DEV001-0001-01:HHQ:baseline:2026-09-01:v1",
      site_id: 1,
      locality_code: "DEV001",
      household_id: "1-DEV001-0001-01",
      subject_type: "household",
      subject_id: "1-DEV001-0001-01",
      task_type: "HHQ",
      form_code: "HHQ",
      expected_forms: ["HHQ"],
      protocol_visit_label: "baseline",
      generation_source: "dev_seed",
      target_date: "2026-09-01",
      deadline_date: "2026-09-30",
      status: "planned",
      rules_version: "1.0.0",
      form_availability: "available",
      action_state: "enabled",
      created_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: schema.followUpTasks.task_id,
      set: {
        status: "planned",
        updated_at: now,
      },
    });
}

async function fetchJson(path: string, options: RequestInit = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}: ${JSON.stringify(json)}`);
  }
  return json.data;
}

async function runSmoke() {
  await upsertDevSeed();

  const login = await fetchJson("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      username: smokeUser.username,
      password: smokeUser.password,
    }),
  });
  const authorization = `Bearer ${login.access_token}`;

  const me = await fetchJson("/users/me", { headers: { Authorization: authorization } });
  if (!Array.isArray(me.area_assignments) || me.area_assignments.length === 0) {
    throw new Error("/users/me did not return area assignments");
  }

  const forms = await fetchJson("/protocol/forms", { headers: { Authorization: authorization } });
  if (!Array.isArray(forms.forms) || forms.forms.length !== 11) {
    throw new Error("/protocol/forms did not return 11 bundled forms");
  }

  const formBatch = await fetchJson("/protocol/forms/batch?codes=HHQ,PEF,VA", {
    headers: { Authorization: authorization },
  });
  if (!Array.isArray(formBatch.forms) || formBatch.forms.length !== 2) {
    throw new Error("/protocol/forms/batch did not return the two available requested forms");
  }

  const pull = await fetchJson("/sync/pull?locality_codes=DEV001", {
    headers: { Authorization: authorization },
  });
  if (!Array.isArray(pull.tasks) || pull.tasks.length === 0) {
    throw new Error("/sync/pull did not return seeded task");
  }
  if (!Array.isArray(pull.form_versions) || !pull.form_versions[0]?.checksum) {
    throw new Error("/sync/pull did not return checksum-bearing form_versions");
  }

  const push = await fetchJson("/sync/push", {
    method: "POST",
    headers: { Authorization: authorization },
    body: JSON.stringify({ device_id: "dev-smoke-device", records: [] }),
  });
  if (push.accepted !== 0) {
    throw new Error("/sync/push empty-record smoke expected accepted=0");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        api_base_url: API_BASE_URL,
        user: me.username,
        assignments: me.area_assignments.length,
        forms: forms.forms.length,
        pulled_tasks: pull.tasks.length,
      },
      null,
      2,
    ),
  );
}

runSmoke()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
