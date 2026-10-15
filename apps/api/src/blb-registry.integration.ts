/** Checks registry HTTP import and scoped pagination using synthetic test-database records. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";
import { eq, inArray } from "drizzle-orm";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://dynamic:dynamic_dev_password@localhost:55432/dynamic_test";

test("imports HDSS rows by opaque uid and scopes cursor pages to assigned village", async () => {
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.JWT_SECRET = "test_jwt_secret";
  process.env.JWT_REFRESH_SECRET = "test_refresh_secret";

  const { createApp } = await import("./app");
  const { db, schema } = await import("./db");
  const { createSessionBackedAccessToken } = await import("./test-helpers/session-token");

  const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
  const adminId = `hdss-admin-${suffix}`;
  const workerId = `hdss-worker-${suffix}`;
  const inactiveWorkerId = `hdss-inactive-worker-${suffix}`;
  const unassignedWorkerId = `hdss-unassigned-worker-${suffix}`;
  const restrictedWorkerId = `hdss-restricted-worker-${suffix}`;
  const deniedRoleId = `hdss-denied-role-${suffix}`;
  const assignmentId = `hdss-assignment-${suffix}`;
  const inactiveAssignmentId = `hdss-inactive-assignment-${suffix}`;
  const institutionId = `hdss-institution-${suffix}`;
  const staffId = `hdss-staff-${suffix}`;
  const profileId = `hdss-profile-${suffix}`;
  const villageCode = `T${suffix.slice(0, 7)}`;
  const outsiderVillageCode = `OUT${suffix.slice(0, 6)}`;
  const uids = [`HDSS${suffix}A001`, `HDSS${suffix}A002`, `HDSS${suffix}OUT1`];
  const atomicUid = `HDSS${suffix}BAD01`;
  const now = new Date();

  await db.insert(schema.institutions).values({
    institution_id: institutionId,
    institution_name: "HDSS integration institution",
    country: "India",
    institution_type: "research",
    active: true,
  });
  await db.insert(schema.studyStaffMembers).values({
    staff_id: staffId,
    institution_id: institutionId,
    full_name: "HDSS restricted staff",
    designation: "worker",
    country: "India",
    active: true,
  });
  await db.insert(schema.dataAccessProfiles).values({
    profile_id: profileId,
    staff_id: staffId,
    can_access_pii: false,
  });
  await db.insert(schema.users).values([
    {
      user_id: adminId,
      username: adminId,
      display_name: "HDSS test admin",
      role: "central_admin",
      site_id: 2,
      password_hash: "unused",
      active: true,
      created_at: now,
      updated_at: now,
    },
    {
      user_id: workerId,
      username: workerId,
      display_name: "HDSS test worker",
      role: "field_worker",
      site_id: 2,
      password_hash: "unused",
      active: true,
      created_at: now,
      updated_at: now,
    },
    {
      user_id: inactiveWorkerId,
      username: inactiveWorkerId,
      display_name: "HDSS inactive worker",
      role: "field_worker",
      site_id: 2,
      password_hash: "unused",
      active: true,
      created_at: now,
      updated_at: now,
    },
    {
      user_id: unassignedWorkerId,
      username: unassignedWorkerId,
      display_name: "HDSS unassigned worker",
      role: "field_worker",
      site_id: 2,
      password_hash: "unused",
      active: true,
      created_at: now,
      updated_at: now,
    },
    {
      user_id: restrictedWorkerId,
      username: restrictedWorkerId,
      display_name: "HDSS restricted worker",
      role: "field_worker",
      site_id: 2,
      staff_id: staffId,
      password_hash: "unused",
      active: true,
      created_at: now,
      updated_at: now,
    },
    {
      user_id: deniedRoleId,
      username: deniedRoleId,
      display_name: "HDSS denied role",
      role: "site_data_manager",
      site_id: 2,
      password_hash: "unused",
      active: true,
      created_at: now,
      updated_at: now,
    },
  ]);
  await db.insert(schema.userAreaAssignments).values({
    assignment_id: assignmentId,
    user_id: workerId,
    site_id: 2,
    locality_code: villageCode,
    role: "field_worker",
    created_at: now,
  });
  await db.insert(schema.userAreaAssignments).values({
    assignment_id: inactiveAssignmentId,
    user_id: inactiveWorkerId,
    site_id: 2,
    locality_code: villageCode,
    role: "field_worker",
    active_to: "2020-01-01",
    created_at: now,
  });

  const server = createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
    const adminToken = await createSessionBackedAccessToken({
      sub: adminId,
      username: adminId,
      role: "central_admin",
      site_id: 2,
    });
    const workerToken = await createSessionBackedAccessToken({
      sub: workerId,
      username: workerId,
      role: "field_worker",
      site_id: 2,
    });
    const inactiveWorkerToken = await createSessionBackedAccessToken({
      sub: inactiveWorkerId,
      username: inactiveWorkerId,
      role: "field_worker",
      site_id: 2,
    });
    const unassignedWorkerToken = await createSessionBackedAccessToken({
      sub: unassignedWorkerId,
      username: unassignedWorkerId,
      role: "field_worker",
      site_id: 2,
    });
    const restrictedWorkerToken = await createSessionBackedAccessToken({
      sub: restrictedWorkerId,
      username: restrictedWorkerId,
      role: "field_worker",
      site_id: 2,
    });
    const deniedRoleToken = await createSessionBackedAccessToken({
      sub: deniedRoleId,
      username: deniedRoleId,
      role: "site_data_manager",
      site_id: 2,
    });
    const csv = [
      "hdss_unique_id,village_code,village_name,phc_code,phc_name,name,age,sex,house_no,family_no,ind_no,domicile,curr_status,death_date,migrated_out_date,migration_reason",
      `${uids[0]},${villageCode},Test Village,02,Test PHC,Alpha,7,1,0004,03,01,Resident,L,,,`,
      `${uids[1]},${villageCode},Test Village,02,Test PHC,,8,2,0004,03,01,Dead,L,,2020-01-02,`,
      `${uids[2]},${outsiderVillageCode},Outsider Village,02,Test PHC,Outsider,9,1,9999,01,01,Resident,L,,,`,
    ].join("\n");
    const form = new FormData();
    form.append("file", new Blob([csv], { type: "text/csv" }), "hdss.csv");
    const wrongSnapshotForm = new FormData();
    wrongSnapshotForm.append("source_age_as_of", "2026-10-13");
    wrongSnapshotForm.append("file", new Blob([csv], { type: "text/csv" }), "wrong-snapshot.csv");
    const wrongSnapshot = await fetchJson(`${baseUrl}/masters/blb-registry/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: wrongSnapshotForm,
    });
    assert.equal(wrongSnapshot.status, 400);
    const imported = await fetchJson(`${baseUrl}/masters/blb-registry/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: form,
    });
    assert.equal(imported.status, 201);
    assert.equal(imported.body.data.imported, 3);

    const scoped = await fetchJson(`${baseUrl}/masters/blb-registry?limit=10`, {
      headers: { Authorization: `Bearer ${workerToken}` },
    });
    assert.equal(scoped.status, 200);
    assert.equal(scoped.body.data.individuals.length, 2);
    assert.ok(scoped.body.data.individuals.every((row: any) => row.village_code === villageCode));
    assert.equal(scoped.body.data.individuals.some((row: any) => row.uid === uids[2]), false);

    const inactive = await fetchJson(`${baseUrl}/masters/blb-registry?limit=10`, {
      headers: { Authorization: `Bearer ${inactiveWorkerToken}` },
    });
    assert.equal(inactive.status, 200);
    assert.deepEqual(inactive.body.data.individuals, []);
    const unassigned = await fetchJson(`${baseUrl}/masters/blb-registry?limit=10`, {
      headers: { Authorization: `Bearer ${unassignedWorkerToken}` },
    });
    assert.equal(unassigned.status, 200);
    assert.deepEqual(unassigned.body.data.individuals, []);

    const fieldUpload = await fetchJson(`${baseUrl}/masters/blb-registry/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${workerToken}` },
      body: JSON.stringify({}),
    });
    assert.equal(fieldUpload.status, 403);
    const deniedPii = await fetchJson(`${baseUrl}/masters/blb-registry?limit=1`, {
      headers: { Authorization: `Bearer ${restrictedWorkerToken}` },
    });
    assert.equal(deniedPii.status, 403);
    const deniedRole = await fetchJson(`${baseUrl}/masters/blb-registry?limit=1`, {
      headers: { Authorization: `Bearer ${deniedRoleToken}` },
    });
    assert.equal(deniedRole.status, 403);

    const duplicateUidCsv = [
      csv,
      `${atomicUid},${villageCode},Test Village,02,Test PHC,Atomic,10,1,0005,03,01,Resident,L,,,`,
      `${atomicUid},${villageCode},Test Village,02,Test PHC,Atomic duplicate,10,1,0005,03,01,Resident,L,,,`,
    ].join("\n");
    const duplicateUidForm = new FormData();
    duplicateUidForm.append("file", new Blob([duplicateUidCsv], { type: "text/csv" }), "duplicate.csv");
    const duplicateUidResponse = await fetchJson(`${baseUrl}/masters/blb-registry/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: duplicateUidForm,
    });
    assert.equal(duplicateUidResponse.status, 400);
    const atomicRows = await db
      .select({ uid: schema.blbRegistryIndividuals.uid })
      .from(schema.blbRegistryIndividuals)
      .where(eq(schema.blbRegistryIndividuals.uid, atomicUid));
    assert.deepEqual(atomicRows, []);

    const first = await fetchJson(`${baseUrl}/masters/blb-registry?limit=1`, {
      headers: { Authorization: `Bearer ${workerToken}` },
    });
    assert.equal(first.status, 200);
    assert.equal(first.body.data.individuals.length, 1);
    assert.equal(first.body.data.individuals[0].village_code, villageCode);
    assert.ok(first.body.data.next_cursor);

    // A scope change must invalidate a cursor even if the registry generation
    // and scoped row count happen to remain unchanged.
    await db
      .update(schema.userAreaAssignments)
      .set({ locality_code: outsiderVillageCode })
      .where(eq(schema.userAreaAssignments.assignment_id, assignmentId));
    const scopeChanged = await fetchJson(
      `${baseUrl}/masters/blb-registry?limit=1&cursor=${encodeURIComponent(first.body.data.next_cursor)}`,
      { headers: { Authorization: `Bearer ${workerToken}` } },
    );
    assert.equal(scopeChanged.status, 409);
    assert.equal(scopeChanged.body.error.code, "REGISTRY_CHANGED");
    await db
      .update(schema.userAreaAssignments)
      .set({ locality_code: villageCode })
      .where(eq(schema.userAreaAssignments.assignment_id, assignmentId));

    const beforeReimport = await db
      .select({ uid: schema.blbRegistryIndividuals.uid })
      .from(schema.blbRegistryIndividuals)
      .where(inArray(schema.blbRegistryIndividuals.uid, uids));
    assert.equal(beforeReimport.length, 3);

    // A re-import changes the revision even when the UID set is unchanged.
    // The next request must restart rather than mixing old and new pages.
    const reimportForm = new FormData();
    reimportForm.append("file", new Blob([csv], { type: "text/csv" }), "hdss-reimport.csv");
    const reimported = await fetchJson(`${baseUrl}/masters/blb-registry/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: reimportForm,
    });
    assert.equal(reimported.status, 201);
    const afterReimport = await db
      .select({ uid: schema.blbRegistryIndividuals.uid })
      .from(schema.blbRegistryIndividuals)
      .where(inArray(schema.blbRegistryIndividuals.uid, uids));
    assert.deepEqual(
      afterReimport.map((row) => row.uid).sort(),
      beforeReimport.map((row) => row.uid).sort(),
    );
    assert.equal(afterReimport.length, beforeReimport.length);

    const second = await fetchJson(
      `${baseUrl}/masters/blb-registry?limit=1&cursor=${encodeURIComponent(first.body.data.next_cursor)}`,
      { headers: { Authorization: `Bearer ${workerToken}` } },
    );
    assert.equal(second.status, 409);
    assert.equal(second.body.error.code, "REGISTRY_CHANGED");
  } finally {
    const testUserIds = [adminId, workerId, inactiveWorkerId, unassignedWorkerId, restrictedWorkerId, deniedRoleId];
    await db.delete(schema.refreshTokenSessions).where(inArray(schema.refreshTokenSessions.user_id, testUserIds));
    await db.delete(schema.userAreaAssignments).where(inArray(schema.userAreaAssignments.assignment_id, [assignmentId, inactiveAssignmentId]));
    await db.delete(schema.blbRegistryIndividuals).where(inArray(schema.blbRegistryIndividuals.uid, uids));
    await db.delete(schema.users).where(inArray(schema.users.user_id, testUserIds));
    await db.delete(schema.dataAccessProfiles).where(eq(schema.dataAccessProfiles.profile_id, profileId));
    await db.delete(schema.studyStaffMembers).where(eq(schema.studyStaffMembers.staff_id, staffId));
    await db.delete(schema.institutions).where(eq(schema.institutions.institution_id, institutionId));
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

async function fetchJson(url: string, options: RequestInit): Promise<{ status: number; body: any }> {
  const response = await fetch(url, options);
  return { status: response.status, body: await response.json() };
}
