import { and, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, schema } from "../db";
import { smokeUser, upsertDevSeed } from "./dev-seed";

const SITES = [
  { site_id: 1, site_code: "BRL", site_name: "Bareilly" },
  { site_id: 2, site_code: "BLB", site_name: "Ballabgarh" },
  { site_id: 3, site_code: "BGM", site_name: "Belgavi" },
  { site_id: 4, site_code: "CHN", site_name: "Chennai" },
];

const LOCALITIES = [
  { code: "01", name: "Sunped" },
  { code: "02", name: "Sagarpur" },
  { code: "03", name: "Pehladpur" },
  { code: "04", name: "Deegh" },
];

const LARGE_FIELD_SEED = 20260610;
const TOTAL_HOUSEHOLDS = 1000;
const HHQ_TASK_HOUSEHOLDS = 1000;
const MIN_MEMBERS_PER_HOUSEHOLD = 3;
const MAX_MEMBERS_PER_HOUSEHOLD = 8;
const MAX_ELIGIBLE_WOMEN_PER_HOUSEHOLD = 3;
const BATCH_SIZE = 1000;
const SEEDED_SITE_IDS = SITES.map((site) => site.site_id);
const SEEDED_LOCALITY_CODES = LOCALITIES.map((locality) => locality.code);

function buildHhqTaskKey(householdId: string, targetDate: string): string {
  return `${householdId}:household:${householdId}:HHQ:baseline:${targetDate}:v1`;
}

const MALE_GIVEN_NAMES = [
  "Mohan",
  "Ramesh",
  "Deepak",
  "Imran",
  "Arun",
  "Sanjay",
  "Vijay",
  "Naveen",
];
const FEMALE_GIVEN_NAMES = [
  "Kavita",
  "Sunita",
  "Farida",
  "Asha",
  "Pooja",
  "Neha",
  "Sita",
  "Rekha",
];
const FAMILY_NAMES = ["Kumar", "Sharma", "Khan", "Yadav", "Singh", "Verma", "Das", "Patel"];

type RandomSource = () => number;

function createSeededRandom(seed: number): RandomSource {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(rng: RandomSource, min: number, max: number) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function chunks<T>(rows: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    result.push(rows.slice(index, index + size));
  }
  return result;
}

async function insertBatches<T>(
  label: string,
  rows: T[],
  insert: (batch: T[]) => Promise<unknown>,
) {
  let inserted = 0;
  for (const batch of chunks(rows, BATCH_SIZE)) {
    await insert(batch);
    inserted += batch.length;
    if (inserted % 25000 === 0 || inserted === rows.length) {
      console.log(`${label}: ${inserted}/${rows.length}`);
    }
  }
}

function makePersonName(sex: number, householdOrdinal: number, memberNumber: number) {
  const givenNames = sex === 2 ? FEMALE_GIVEN_NAMES : MALE_GIVEN_NAMES;
  const given = givenNames[(householdOrdinal + memberNumber) % givenNames.length];
  const family = FAMILY_NAMES[householdOrdinal % FAMILY_NAMES.length];
  return `${given} ${family}`;
}

async function clearPriorLargeFieldSeed() {
  const seededArea = (table: { site_id: any; locality_code: any }) =>
    and(
      inArray(table.site_id, SEEDED_SITE_IDS),
      inArray(table.locality_code, SEEDED_LOCALITY_CODES),
    );

  await db.delete(schema.eligibleWomen).where(seededArea(schema.eligibleWomen));
  await db.delete(schema.householdMembers).where(seededArea(schema.householdMembers));
  // Household assignments reference households, so clear them first or the
  // subsequent household delete fails with a foreign-key violation.
  await db
    .delete(schema.fieldWorkerHouseholdAssignments)
    .where(
      sql`household_id in (
        select household_id
        from households
        where site_id in (${sql.join(SEEDED_SITE_IDS.map((id) => sql`${id}`), sql`, `)})
          and locality_code in (${sql.join(SEEDED_LOCALITY_CODES.map((code) => sql`${code}`), sql`, `)})
      )`,
    );
  await db.delete(schema.followUpTasks).where(
    sql`household_id in (
      select household_id from households
      where site_id in (${sql.join(SEEDED_SITE_IDS.map((id) => sql`${id}`), sql`, `)})
        and locality_code in (${sql.join(SEEDED_LOCALITY_CODES.map((code) => sql`${code}`), sql`, `)})
    )`,
  );
  await db.delete(schema.households).where(seededArea(schema.households));
  await db.delete(schema.mappingFrame).where(seededArea(schema.mappingFrame));
  await db.delete(schema.userAreaAssignments).where(seededArea(schema.userAreaAssignments));
  await db.delete(schema.studyLocalities).where(seededArea(schema.studyLocalities));
}

function makeHousehold(siteId: number, localityCode: string, ordinal: number, now: Date) {
  const structureOrdinal = Math.ceil(ordinal / 5);
  const structureMapId = String(structureOrdinal).padStart(4, "0").slice(-6);
  const householdNumber = String(((ordinal - 1) % 5) + 1).padStart(2, "0");
  const householdId = `${siteId}-${localityCode}-${structureMapId}-${householdNumber}`;
  const householdHeadName = makePersonName(1, ordinal, 1);
  return {
    mapping: {
      household_id: householdId,
      site_id: siteId,
      locality_code: localityCode,
      structure_map_id: structureMapId,
      household_number: householdNumber,
      structure_id: `${siteId}-${localityCode}-${structureMapId}`,
      mapping_status: "enrolled",
      baseline_enrollment_status: "pending",
    },
    household: {
      household_id: householdId,
      site_id: siteId,
      locality_code: localityCode,
      structure_map_id: structureMapId,
      household_number: householdNumber,
      address: `Structure ${structureMapId}, ${localityCode}`,
      household_head_name: householdHeadName,
      consent_status: "Yes",
      result_interview: 1,
      language_questionnaire: 1,
      baseline_enrollment_status: "pending",
      baseline_completed_date: null,
      cohort_status: "enrolled",
      sync_status: "synced",
      created_at: now,
      updated_at: now,
    },
  };
}

function makeMembers(
  siteId: number,
  localityCode: string,
  householdId: string,
  householdOrdinal: number,
  now: Date,
  rng: RandomSource,
) {
  const memberCount = randomInt(rng, MIN_MEMBERS_PER_HOUSEHOLD, MAX_MEMBERS_PER_HOUSEHOLD);
  const eligibleWomenCount = randomInt(rng, 0, MAX_ELIGIBLE_WOMEN_PER_HOUSEHOLD);
  const eligibleMemberNumbers = new Set<number>();
  while (eligibleMemberNumbers.size < eligibleWomenCount) {
    eligibleMemberNumbers.add(randomInt(rng, 1, memberCount));
  }

  return Array.from({ length: memberCount }, (_, index) => {
    const memberNumber = index + 1;
    const isEligibleWoman = eligibleMemberNumbers.has(memberNumber);
    const nonEligibleFemale = !isEligibleWoman && randomInt(rng, 0, 3) === 0;
    const sex = isEligibleWoman || nonEligibleFemale ? 2 : 1;
    const age = isEligibleWoman
      ? randomInt(rng, 15, 49)
      : nonEligibleFemale
        ? [8, 12, 52, 60][randomInt(rng, 0, 3)]
        : randomInt(rng, 1, 74);
    const maritalStatus = isEligibleWoman ? randomInt(rng, 1, 2) : randomInt(rng, 1, 4);
    const name = makePersonName(sex, householdOrdinal, memberNumber);
    return {
      household_member_id: `${householdId}-${String(memberNumber).padStart(2, "0")}`,
      household_id: householdId,
      member_number: memberNumber,
      site_id: siteId,
      locality_code: localityCode,
      name,
      relationship_to_head: memberNumber === 1 ? 1 : memberNumber === 2 ? 2 : 4,
      sex,
      reported_age_years: age,
      reported_age_as_of_date: "2026-09-01",
      marital_status: maritalStatus,
      woman_questionnaire_eligible: isEligibleWoman,
      member_status: "active",
      usual_resident: true,
      member_source: "baseline",
      sync_status: "synced",
      created_at: now,
      updated_at: now,
    };
  });
}

function makeEligibleWomen(members: ReturnType<typeof makeMembers>, now: Date) {
  return members
    .filter((member) => member.woman_questionnaire_eligible)
    .map((member) => ({
      woman_id: `EW-${member.household_member_id}`,
      household_member_id: member.household_member_id,
      household_id: member.household_id,
      site_id: member.site_id,
      locality_code: member.locality_code,
      eligibility_start_date: "2026-09-01",
      wq_status: "pending",
      tracking_status: "not_tracked",
      current_eligibility_status: "eligible",
      eligibility_basis: "baseline_roster",
      sync_status: "synced",
      created_at: now,
      updated_at: now,
    }));
}

export async function upsertLargeFieldSeed() {
  await upsertDevSeed();
  await clearPriorLargeFieldSeed();

  const now = new Date();
  const rng = createSeededRandom(LARGE_FIELD_SEED);

  await db
    .insert(schema.studySites)
    .values(SITES)
    .onConflictDoUpdate({
      target: schema.studySites.site_id,
      set: {
        site_code: sql`excluded.site_code`,
        site_name: sql`excluded.site_name`,
      },
    });

  const localityRows = SITES.flatMap((site) =>
    LOCALITIES.map((locality) => ({
      site_id: site.site_id,
      locality_code: locality.code,
      locality_name: `${locality.name} (${site.site_code})`,
      locality_type: site.site_id === 1 ? "rural" : "urban",
    })),
  );

  const householdsPerLocality = Math.floor(TOTAL_HOUSEHOLDS / localityRows.length);
  const remainder = TOTAL_HOUSEHOLDS % localityRows.length;
  const localityPlans = localityRows.map((locality, index) => ({
    ...locality,
    householdCount: householdsPerLocality + (index < remainder ? 1 : 0),
  }));

  await db
    .insert(schema.studyLocalities)
    .values(localityRows)
    .onConflictDoNothing();

  await db
    .delete(schema.userAreaAssignments)
    .where(eq(schema.userAreaAssignments.user_id, smokeUser.user_id));

  await db
    .insert(schema.userAreaAssignments)
    .values(
      localityRows
        .filter((locality) => locality.site_id === 1)
        .map((locality) => ({
          assignment_id: `${smokeUser.user_id}-${locality.site_id}-${locality.locality_code}`,
          user_id: smokeUser.user_id,
          site_id: locality.site_id,
          locality_code: locality.locality_code,
          role: "field_worker",
          active_from: "2026-06-04",
          active_to: null,
          created_at: now,
        })),
    )
    .onConflictDoNothing();

  for (const localityPlan of localityPlans) {
    const site = SITES.find((candidate) => candidate.site_id === localityPlan.site_id);
    const mappings = [];
    const households = [];
    const members = [];
    const eligibleWomen = [];

    for (let ordinal = 1; ordinal <= localityPlan.householdCount; ordinal += 1) {
      const householdSeed = makeHousehold(
        localityPlan.site_id,
        localityPlan.locality_code,
        ordinal,
        now,
      );
      mappings.push(householdSeed.mapping);
      const memberRows = makeMembers(
        localityPlan.site_id,
        localityPlan.locality_code,
        householdSeed.household.household_id,
        ordinal,
        now,
        rng,
      );
      householdSeed.household.household_head_name =
        memberRows[0]?.name || householdSeed.household.household_head_name;
      households.push(householdSeed.household);
      members.push(...memberRows);
      eligibleWomen.push(...makeEligibleWomen(memberRows, now));
    }

    console.log(
      `Seeding site ${site?.site_code ?? localityPlan.site_id} locality ${
        localityPlan.locality_code
      }: ${households.length} households, ${members.length} members, ${
        eligibleWomen.length
      } eligible women`,
    );
    await insertBatches("mapping_frame", mappings, (batch) =>
      db.insert(schema.mappingFrame).values(batch).onConflictDoNothing(),
    );
    await insertBatches("households", households, (batch) =>
      db.insert(schema.households).values(batch).onConflictDoNothing(),
    );
    await insertBatches("household_members", members, (batch) =>
      db.insert(schema.householdMembers).values(batch).onConflictDoNothing(),
    );
    await insertBatches("eligible_women", eligibleWomen, (batch) =>
      db.insert(schema.eligibleWomen).values(batch).onConflictDoNothing(),
    );
  }

  const taskDate = now.toISOString().slice(0, 10);
  const taskDeadline = new Date(now);
  taskDeadline.setUTCDate(taskDeadline.getUTCDate() + 30);
  const taskDeadlineDate = taskDeadline.toISOString().slice(0, 10);
  const taskHouseholds = await db
    .select({
      household_id: schema.households.household_id,
      site_id: schema.households.site_id,
      locality_code: schema.households.locality_code,
    })
    .from(schema.households)
    .where(
      sql`site_id in (${sql.join(SEEDED_SITE_IDS.map((id) => sql`${id}`), sql`, `)})
        and locality_code in (${sql.join(SEEDED_LOCALITY_CODES.map((code) => sql`${code}`), sql`, `)})`,
    )
    .orderBy(schema.households.household_id)
    .limit(HHQ_TASK_HOUSEHOLDS);
  const hhqTasks = taskHouseholds.map((household) => ({
      task_id: randomUUID(),
      task_key: buildHhqTaskKey(household.household_id, taskDate),
      site_id: household.site_id,
      locality_code: household.locality_code,
      household_id: household.household_id,
      subject_type: "household",
      subject_id: household.household_id,
      task_type: "HHQ",
      form_code: "HHQ",
      expected_forms: ["HHQ"],
      protocol_visit_label: "baseline",
      generation_source: "large_field_seed",
      anchor_date: taskDate,
      window_start: taskDate,
      target_date: taskDate,
      deadline_date: taskDeadlineDate,
      status: "planned",
      rules_version: "1.0.0",
      form_availability: "available",
      action_state: "enabled",
      created_at: now,
      updated_at: now,
    }));
  await db.insert(schema.followUpTasks).values(hhqTasks).onConflictDoNothing();
  console.log(`Created ${hhqTasks.length} pending HHQ tasks. WQ tasks are generated only after HHQ submission.`);
}

upsertLargeFieldSeed()
  .then(() => {
    console.log("Large field seed complete.");
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
