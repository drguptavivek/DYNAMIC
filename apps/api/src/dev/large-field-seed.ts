import { and, eq, inArray, sql } from "drizzle-orm";
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

const MEMBERS_PER_SITE = 100000;
const MEMBERS_PER_HOUSEHOLD = 4;
const HOUSEHOLDS_PER_SITE = MEMBERS_PER_SITE / MEMBERS_PER_HOUSEHOLD;
const HOUSEHOLDS_PER_LOCALITY = HOUSEHOLDS_PER_SITE / LOCALITIES.length;
const BATCH_SIZE = 1000;
const SEEDED_SITE_IDS = SITES.map((site) => site.site_id);
const SEEDED_LOCALITY_CODES = LOCALITIES.map((locality) => locality.code);

const MALE_GIVEN_NAMES = ["Mohan", "Ramesh", "Deepak", "Imran", "Arun", "Sanjay", "Vijay", "Naveen"];
const FEMALE_GIVEN_NAMES = ["Kavita", "Sunita", "Farida", "Asha", "Pooja", "Neha", "Sita", "Rekha"];
const FAMILY_NAMES = ["Kumar", "Sharma", "Khan", "Yadav", "Singh", "Verma", "Das", "Patel"];

function chunks<T>(rows: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    result.push(rows.slice(index, index + size));
  }
  return result;
}

async function insertBatches<T>(label: string, rows: T[], insert: (batch: T[]) => Promise<unknown>) {
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
  await db.delete(schema.households).where(seededArea(schema.households));
  await db.delete(schema.mappingFrame).where(seededArea(schema.mappingFrame));
  await db.delete(schema.userAreaAssignments).where(seededArea(schema.userAreaAssignments));
  await db.delete(schema.studyLocalities).where(seededArea(schema.studyLocalities));
}

function makeHousehold(siteId: number, localityCode: string, ordinal: number, now: Date) {
  const structureMapId = String(ordinal).padStart(4, "0");
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
      baseline_enrollment_status: "completed",
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
      baseline_enrollment_status: "completed",
      baseline_completed_date: "2026-09-01",
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
) {
  const adultWomanOneMarried = householdOrdinal % 5 !== 0;
  const adultWomanTwoMarried = householdOrdinal % 3 === 0 || householdOrdinal % 7 === 0;
  const templates = [
    { relationship_to_head: 1, sex: 1, age: 45, marital_status: 1 },
    { relationship_to_head: 2, sex: 2, age: 36, marital_status: adultWomanOneMarried ? 1 : 2 },
    { relationship_to_head: 4, sex: 2, age: 19, marital_status: adultWomanTwoMarried ? 1 : 2 },
    { relationship_to_head: 4, sex: 1, age: 22, marital_status: 2 },
  ];

  return templates.map((template, index) => {
    const memberNumber = index + 1;
    const name = makePersonName(template.sex, householdOrdinal, memberNumber);
    return {
      household_member_id: `${householdId}-${String(memberNumber).padStart(2, "0")}`,
      household_id: householdId,
      member_number: memberNumber,
      site_id: siteId,
      locality_code: localityCode,
      name,
      relationship_to_head: template.relationship_to_head,
      sex: template.sex,
      reported_age_years: template.age,
      reported_age_as_of_date: "2026-09-01",
      marital_status: template.marital_status,
      woman_questionnaire_eligible: template.sex === 2 && template.age >= 15 && template.age <= 49,
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

  await db
    .insert(schema.studyLocalities)
    .values(localityRows)
    .onConflictDoNothing();

  await db.delete(schema.userAreaAssignments).where(eq(schema.userAreaAssignments.user_id, smokeUser.user_id));

  await db
    .insert(schema.userAreaAssignments)
    .values(
      localityRows.filter((locality) => locality.site_id === 1).map((locality) => ({
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

  for (const site of SITES) {
    const mappings = [];
    const households = [];
    const members = [];
    const eligibleWomen = [];

    for (let localityIndex = 0; localityIndex < LOCALITIES.length; localityIndex += 1) {
      const localityCode = LOCALITIES[localityIndex].code;
      for (let ordinal = 1; ordinal <= HOUSEHOLDS_PER_LOCALITY; ordinal += 1) {
        const householdSeed = makeHousehold(site.site_id, localityCode, ordinal, now);
        mappings.push(householdSeed.mapping);
        households.push(householdSeed.household);
        const memberRows = makeMembers(
          site.site_id,
          localityCode,
          householdSeed.household.household_id,
          ordinal,
          now,
        );
        members.push(...memberRows);
        eligibleWomen.push(...makeEligibleWomen(memberRows, now));
      }
    }

    console.log(
      `Seeding site ${site.site_code}: ${households.length} households, ${members.length} members`,
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
