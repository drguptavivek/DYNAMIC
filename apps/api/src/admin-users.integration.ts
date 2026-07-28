import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { eq } from "drizzle-orm";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://dynamic:dynamic_dev_password@localhost:55432/dynamic_test";

test("central admin can create, update, assign, and deactivate a user", async () => {
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.JWT_SECRET = "test_jwt_secret";
  process.env.JWT_REFRESH_SECRET = "test_refresh_secret";

  const { createApp } = await import("./app");
  const { db, schema } = await import("./db");
  const { adminUser, centralDataManagerUser, siteDataManagerUser, upsertDevSeed, usCollaboratorUser } =
    await import("./dev/dev-seed");

  await upsertDevSeed();

  const server = createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, resolve));
  let createdUserId: string | null = null;
  let createdStaffId: string | null = null;
  let createdInstitutionId: string | null = null;
  let createdCollaboratorUserId: string | null = null;
  let createdCollaboratorStaffId: string | null = null;
  let createdCollaboratorInstitutionId: string | null = null;

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${address.port}/api/v1`;

    const login = await fetchData(`${baseUrl}/auth/login`, {
      method: "POST",
      body: JSON.stringify({ username: adminUser.username, password: adminUser.password }),
    });
    const authorization = `Bearer ${login.access_token}`;

    const seededSiteDataManager = await fetchData(`${baseUrl}/users/${siteDataManagerUser.user_id}`, {
      headers: { Authorization: authorization },
    });
    assert.equal(seededSiteDataManager.role, "site_data_manager");
    assert.equal(seededSiteDataManager.staff.designation, "Site Data Manager");
    assert.equal(seededSiteDataManager.staff.data_access_profile.can_access_pii, true);
    assert.equal(seededSiteDataManager.staff.data_access_profile.can_access_raw_crfs, true);

    const seededCentralDataManager = await fetchData(`${baseUrl}/users/${centralDataManagerUser.user_id}`, {
      headers: { Authorization: authorization },
    });
    assert.equal(seededCentralDataManager.role, "central_data_manager");
    assert.equal(seededCentralDataManager.staff.designation, "Central Data Manager");
    assert.equal(seededCentralDataManager.staff.data_access_profile.can_access_pii, true);
    assert.equal(seededCentralDataManager.staff.data_access_profile.can_access_raw_crfs, true);

    const seededUsCollaborator = await fetchData(`${baseUrl}/users/${usCollaboratorUser.user_id}`, {
      headers: { Authorization: authorization },
    });
    assert.equal(seededUsCollaborator.role, "us_collaborator");
    assert.equal(seededUsCollaborator.staff.designation, "US Collaborator");
    assert.equal(seededUsCollaborator.staff.institution.country, "USA");
    assert.equal(seededUsCollaborator.staff.data_access_profile.can_access_pii, false);
    assert.equal(seededUsCollaborator.staff.data_access_profile.can_access_raw_crfs, false);
    assert.equal(seededUsCollaborator.staff.data_access_profile.can_access_deidentified_exports, true);
    assert.equal(seededUsCollaborator.staff.data_access_profile.can_access_aggregate_dashboards, true);

    const username = `field-worker-${Date.now()}`;

    const createdUser = await fetchData(`${baseUrl}/users`, {
      method: "POST",
      headers: { Authorization: authorization },
      body: JSON.stringify({
        username,
        display_name: "Field Worker API Test",
        email: `${username}@example.test`,
        role: "field_worker",
        site_id: 1,
        locality_codes: ["DEV001"],
        staff: {
          full_name: "Field Worker API Test",
          designation: "Field Worker",
          institution: {
            institution_name: "API Test Institution",
            country: "India",
            institution_type: "study_site",
          },
        },
        password: "field-password",
      }),
    });
    assert.equal(createdUser.username, username);
    assert.equal(createdUser.active, true);
    assert.equal(createdUser.password_hash, undefined);
    assert.equal(createdUser.staff.full_name, "Field Worker API Test");
    assert.equal(createdUser.staff.designation, "Field Worker");
    assert.equal(createdUser.staff.institution.institution_name, "API Test Institution");
    assert.equal(createdUser.staff.data_access_profile.can_access_pii, true);
    assert.equal(createdUser.staff.data_access_profile.can_access_raw_crfs, true);
    createdUserId = createdUser.user_id;
    createdStaffId = createdUser.staff.staff_id;
    createdInstitutionId = createdUser.staff.institution.institution_id;

    const initialAssignments = await fetchData(
      `${baseUrl}/users/${createdUser.user_id}/area-assignments`,
      { headers: { Authorization: authorization } },
    );
    assert.deepEqual(
      initialAssignments.map((item: { locality_code: string }) => item.locality_code).sort(),
      ["DEV001"],
    );

    const collaboratorUsername = `us-collaborator-${Date.now()}`;
    const createdCollaborator = await fetchData(`${baseUrl}/users`, {
      method: "POST",
      headers: { Authorization: authorization },
      body: JSON.stringify({
        username: collaboratorUsername,
        display_name: "US Collaborator API Test",
        email: `${collaboratorUsername}@example.test`,
        role: "us_collaborator",
        password: "collaborator-password",
        staff: {
          full_name: "US Collaborator API Test",
          designation: "Co-investigator",
          country: "USA",
          institution: {
            institution_name: "US Collaborator Institution",
            country: "USA",
            institution_type: "collaborator",
          },
        },
      }),
    });
    assert.equal(createdCollaborator.role, "us_collaborator");
    assert.equal(createdCollaborator.staff.designation, "Co-investigator");
    assert.equal(createdCollaborator.staff.data_access_profile.can_access_pii, false);
    assert.equal(createdCollaborator.staff.data_access_profile.can_access_raw_crfs, false);
    assert.equal(createdCollaborator.staff.data_access_profile.can_access_deidentified_exports, true);
    assert.equal(createdCollaborator.staff.data_access_profile.can_access_aggregate_dashboards, true);
    assert.equal(createdCollaborator.staff.data_access_profile.can_access_admin_audit, false);
    createdCollaboratorUserId = createdCollaborator.user_id;
    createdCollaboratorStaffId = createdCollaborator.staff.staff_id;
    createdCollaboratorInstitutionId = createdCollaborator.staff.institution.institution_id;

    const patchedUser = await fetchData(`${baseUrl}/users/${createdUser.user_id}`, {
      method: "PATCH",
      headers: { Authorization: authorization },
      body: JSON.stringify({
        display_name: "Updated Field Worker",
        active: true,
        site_id: 1,
        locality_codes: [],
      }),
    });
    assert.equal(patchedUser.display_name, "Updated Field Worker");
    assert.equal(patchedUser.staff.full_name, "Field Worker API Test");

    await fetchData(`${baseUrl}/auth/login`, {
      method: "POST",
      body: JSON.stringify({ username, password: "field-password" }),
    });

    const replacedAssignments = await fetchData(
      `${baseUrl}/users/${createdUser.user_id}/area-assignments`,
      { headers: { Authorization: authorization } },
    );
    assert.deepEqual(replacedAssignments, []);

    const assignment = await fetchData(`${baseUrl}/users/${createdUser.user_id}/area-assignments`, {
      method: "POST",
      headers: { Authorization: authorization },
      body: JSON.stringify({
        site_id: 1,
        locality_code: "DEV001",
        role: "field_worker",
        active_from: "2026-06-04T00:00:00.000Z",
      }),
    });
    assert.equal(assignment.user_id, createdUser.user_id);
    assert.equal(assignment.locality_code, "DEV001");

    const assignments = await fetchData(`${baseUrl}/users/${createdUser.user_id}/area-assignments`, {
      headers: { Authorization: authorization },
    });
    assert.equal(assignments.length, 1);

    const deletedAssignment = await fetchData(
      `${baseUrl}/users/${createdUser.user_id}/area-assignments/${assignment.assignment_id}`,
      { method: "DELETE", headers: { Authorization: authorization } },
    );
    assert.equal(deletedAssignment.message, "Assignment removed");

    const deletedUser = await fetchData(`${baseUrl}/users/${createdUser.user_id}`, {
      method: "DELETE",
      headers: { Authorization: authorization },
    });
    assert.equal(deletedUser.message, "User deactivated");

    const revokedSessions = await db
      .select({ revoked_at: schema.refreshTokenSessions.revoked_at })
      .from(schema.refreshTokenSessions)
      .where(eq(schema.refreshTokenSessions.user_id, createdUser.user_id));
    assert.ok(revokedSessions.length > 0);
    assert.ok(revokedSessions.every((session) => session.revoked_at instanceof Date));

    const selfDeactivateResponse = await fetch(`${baseUrl}/users/${adminUser.user_id}`, {
      method: "PATCH",
      headers: { Authorization: authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ active: false }),
    });
    const selfDeactivateBody = await selfDeactivateResponse.json();
    assert.equal(selfDeactivateResponse.status, 400);
    assert.equal(selfDeactivateBody.error.code, "CANNOT_CHANGE_OWN_STATUS");
  } finally {
    if (createdUserId) {
      await db
        .delete(schema.userAreaAssignments)
        .where(eq(schema.userAreaAssignments.user_id, createdUserId));
      await db
        .delete(schema.refreshTokenSessions)
        .where(eq(schema.refreshTokenSessions.user_id, createdUserId));
      await db.delete(schema.users).where(eq(schema.users.user_id, createdUserId));
    }
    if (createdCollaboratorUserId) {
      await db.delete(schema.users).where(eq(schema.users.user_id, createdCollaboratorUserId));
    }
    if (createdCollaboratorStaffId) {
      await db
        .delete(schema.dataAccessProfiles)
        .where(eq(schema.dataAccessProfiles.staff_id, createdCollaboratorStaffId));
      await db
        .delete(schema.studyStaffMembers)
        .where(eq(schema.studyStaffMembers.staff_id, createdCollaboratorStaffId));
    }
    if (createdCollaboratorInstitutionId) {
      await db
        .delete(schema.institutions)
        .where(eq(schema.institutions.institution_id, createdCollaboratorInstitutionId));
    }
    if (createdStaffId) {
      await db
        .delete(schema.dataAccessProfiles)
        .where(eq(schema.dataAccessProfiles.staff_id, createdStaffId));
      await db.delete(schema.studyStaffMembers).where(eq(schema.studyStaffMembers.staff_id, createdStaffId));
    }
    if (createdInstitutionId) {
      await db.delete(schema.institutions).where(eq(schema.institutions.institution_id, createdInstitutionId));
    }
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("site admin creates users only within their own site", async () => {
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.JWT_SECRET = "test_jwt_secret";
  process.env.JWT_REFRESH_SECRET = "test_refresh_secret";

  const { createApp } = await import("./app");
  const { db, schema } = await import("./db");
  const { createSessionBackedAccessToken } = await import("./test-helpers/session-token");
  const { upsertDevSeed } = await import("./dev/dev-seed");

  await upsertDevSeed();

  const server = createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const siteAdminId = `site-admin-${Date.now()}`;
  const higherRoleUserId = `higher-role-${Date.now()}`;
  let createdUserId: string | null = null;
  let createdStaffId: string | null = null;
  let createdInstitutionId: string | null = null;

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${address.port}/api/v1`;

    await db.insert(schema.users).values({
      user_id: siteAdminId,
      username: siteAdminId,
      display_name: "Site Admin API Test",
      role: "site_research_scientist",
      site_id: 1,
      password_hash: "unused",
      active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });

    await db.insert(schema.users).values({
      user_id: higherRoleUserId,
      username: higherRoleUserId,
      display_name: "Higher Role API Test",
      role: "central_data_manager",
      site_id: 1,
      password_hash: "unused",
      active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const authorization = `Bearer ${await createSessionBackedAccessToken({
      sub: siteAdminId,
      username: siteAdminId,
      role: "site_research_scientist",
      site_id: 1,
    })}`;
    const username = `site-created-user-${Date.now()}`;

    const createdUser = await fetchData(`${baseUrl}/users`, {
      method: "POST",
      headers: { Authorization: authorization },
      body: JSON.stringify({
        username,
        display_name: "Site Created User",
        email: `${username}@example.test`,
        role: "site_data_manager",
        locality_codes: ["DEV001"],
        password: "site-created-password",
        staff: {
          full_name: "Site Created User",
          designation: "Site Data Manager",
          institution: {
            institution_name: "Site Admin Test Institution",
            country: "India",
            institution_type: "study_site",
          },
        },
      }),
    });
    assert.equal(createdUser.site_id, 1);
    assert.equal(createdUser.role, "site_data_manager");
    createdUserId = createdUser.user_id;
    createdStaffId = createdUser.staff.staff_id;
    createdInstitutionId = createdUser.staff.institution.institution_id;

    const createdAssignments = await fetchData(
      `${baseUrl}/users/${createdUser.user_id}/area-assignments`,
      { headers: { Authorization: authorization } },
    );
    assert.equal(createdAssignments.length, 1);
    assert.equal(createdAssignments[0].locality_code, "DEV001");

    const higherRoleResponse = await fetch(`${baseUrl}/users/${higherRoleUserId}`, {
      method: "PATCH",
      headers: { Authorization: authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ active: false }),
    });
    const higherRoleBody = await higherRoleResponse.json();
    assert.equal(higherRoleResponse.status, 403);
    assert.equal(higherRoleBody.error.code, "CANNOT_CHANGE_HIGHER_ROLE_STATUS");

    const crossSiteResponse = await fetch(`${baseUrl}/users`, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: `cross-site-user-${Date.now()}`,
        role: "field_worker",
        site_id: 2,
        password: "cross-site-password",
        staff: {
          full_name: "Cross Site User",
          designation: "Field Worker",
          institution: {
            institution_name: "Cross Site Institution",
            country: "India",
            institution_type: "study_site",
          },
        },
      }),
    });
    const crossSiteBody = await crossSiteResponse.json();
    assert.equal(crossSiteResponse.status, 403);
    assert.equal(crossSiteBody.error.code, "INSUFFICIENT_PERMISSIONS");
  } finally {
    if (createdUserId) {
      await db
        .delete(schema.userAreaAssignments)
        .where(eq(schema.userAreaAssignments.user_id, createdUserId));
      await db.delete(schema.users).where(eq(schema.users.user_id, createdUserId));
    }
    if (createdStaffId) {
      await db
        .delete(schema.dataAccessProfiles)
        .where(eq(schema.dataAccessProfiles.staff_id, createdStaffId));
      await db.delete(schema.studyStaffMembers).where(eq(schema.studyStaffMembers.staff_id, createdStaffId));
    }
    if (createdInstitutionId) {
      await db.delete(schema.institutions).where(eq(schema.institutions.institution_id, createdInstitutionId));
    }
    await db
      .delete(schema.refreshTokenSessions)
      .where(eq(schema.refreshTokenSessions.user_id, siteAdminId));
    await db.delete(schema.users).where(eq(schema.users.user_id, higherRoleUserId));
    await db.delete(schema.users).where(eq(schema.users.user_id, siteAdminId));
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

async function fetchData(url: string, options: RequestInit = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const json = await response.json();

  if (!response.ok) {
    throw new Error(`${url} failed with ${response.status}: ${JSON.stringify(json)}`);
  }

  return json.data;
}
