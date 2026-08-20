import { fileURLToPath } from "node:url";
import { db, schema } from "../db";
import { hashPassword } from "../lib/password";

export const smokeUser = {
  user_id: "dev-field-worker",
  username: "dev-field-worker",
  password: "dev-password",
};

export const adminUser = {
  user_id: "dev-central-admin",
  username: "dev-central-admin",
  password: "dev-admin-password",
};

export const siteDataManagerUser = {
  user_id: "dev-site-data-manager",
  username: "dev-site-data-manager",
  password: "dev-site-data-manager-password",
};

export const centralDataManagerUser = {
  user_id: "dev-central-data-manager",
  username: "dev-central-data-manager",
  password: "dev-central-data-manager-password",
};

export const usCollaboratorUser = {
  user_id: "dev-us-collaborator",
  username: "dev-us-collaborator",
  password: "dev-us-collaborator-password",
};

export async function upsertDevSeed() {
  const now = new Date();
  const passwordHash = await hashPassword(smokeUser.password);
  const adminPasswordHash = await hashPassword(adminUser.password);
  const siteDataManagerPasswordHash = await hashPassword(siteDataManagerUser.password);
  const centralDataManagerPasswordHash = await hashPassword(centralDataManagerUser.password);
  const usCollaboratorPasswordHash = await hashPassword(usCollaboratorUser.password);

  await db
    .insert(schema.studySites)
    .values({
      site_id: 1,
      site_code: "Bar",
      site_name: "Bareilly",
    })
    .onConflictDoUpdate({
      target: schema.studySites.site_id,
      set: {
        site_code: "Bar",
        site_name: "Bareilly",
      },
    });

  await db
    .insert(schema.studyLocalities)
    .values({
      site_id: 1,
      locality_code: "01",
      locality_name: "Sunped",
      locality_type: "urban",
    })
    .onConflictDoUpdate({
      target: [schema.studyLocalities.site_id, schema.studyLocalities.locality_code],
      set: {
        locality_name: "Sunped",
        locality_type: "urban",
      },
    });

  await db
    .insert(schema.mappingFrame)
    .values({
      household_id: "1-01-0001-01",
      site_id: 1,
      locality_code: "01",
      structure_map_id: "0001",
      household_number: "01",
      structure_id: "1-01-0001",
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
    .insert(schema.institutions)
    .values({
      institution_id: "dev-institution-india",
      institution_name: "Development Study Institution",
      country: "India",
      institution_type: "study_site",
      active: true,
      created_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: schema.institutions.institution_id,
      set: {
        institution_name: "Development Study Institution",
        country: "India",
        institution_type: "study_site",
        active: true,
        updated_at: now,
      },
    });

  await db
    .insert(schema.institutions)
    .values({
      institution_id: "dev-institution-us",
      institution_name: "Development US Collaborator Institution",
      country: "USA",
      institution_type: "collaborator",
      active: true,
      created_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: schema.institutions.institution_id,
      set: {
        institution_name: "Development US Collaborator Institution",
        country: "USA",
        institution_type: "collaborator",
        active: true,
        updated_at: now,
      },
    });

  await db
    .insert(schema.studyStaffMembers)
    .values({
      staff_id: "dev-staff-field-worker",
      institution_id: "dev-institution-india",
      full_name: "Dev Field Worker",
      designation: "Field Worker",
      country: "India",
      active: true,
      created_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: schema.studyStaffMembers.staff_id,
      set: {
        institution_id: "dev-institution-india",
        full_name: "Dev Field Worker",
        designation: "Field Worker",
        country: "India",
        active: true,
        updated_at: now,
      },
    });

  await db
    .insert(schema.studyStaffMembers)
    .values({
      staff_id: "dev-staff-central-admin",
      institution_id: "dev-institution-india",
      full_name: "Dev Central Admin",
      designation: "Central Admin",
      country: "India",
      active: true,
      created_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: schema.studyStaffMembers.staff_id,
      set: {
        institution_id: "dev-institution-india",
        full_name: "Dev Central Admin",
        designation: "Central Admin",
        country: "India",
        active: true,
        updated_at: now,
      },
    });

  await db
    .insert(schema.studyStaffMembers)
    .values({
      staff_id: "dev-staff-site-data-manager",
      institution_id: "dev-institution-india",
      full_name: "Dev Site Data Manager",
      designation: "Site Data Manager",
      country: "India",
      active: true,
      created_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: schema.studyStaffMembers.staff_id,
      set: {
        institution_id: "dev-institution-india",
        full_name: "Dev Site Data Manager",
        designation: "Site Data Manager",
        country: "India",
        active: true,
        updated_at: now,
      },
    });

  await db
    .insert(schema.studyStaffMembers)
    .values({
      staff_id: "dev-staff-central-data-manager",
      institution_id: "dev-institution-india",
      full_name: "Dev Central Data Manager",
      designation: "Central Data Manager",
      country: "India",
      active: true,
      created_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: schema.studyStaffMembers.staff_id,
      set: {
        institution_id: "dev-institution-india",
        full_name: "Dev Central Data Manager",
        designation: "Central Data Manager",
        country: "India",
        active: true,
        updated_at: now,
      },
    });

  await db
    .insert(schema.studyStaffMembers)
    .values({
      staff_id: "dev-staff-us-collaborator",
      institution_id: "dev-institution-us",
      full_name: "Dev US Collaborator",
      designation: "US Collaborator",
      country: "USA",
      active: true,
      created_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: schema.studyStaffMembers.staff_id,
      set: {
        institution_id: "dev-institution-us",
        full_name: "Dev US Collaborator",
        designation: "US Collaborator",
        country: "USA",
        active: true,
        updated_at: now,
      },
    });

  await db
    .insert(schema.households)
    .values({
      household_id: "1-01-0001-01",
      site_id: 1,
      locality_code: "01",
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
    .insert(schema.dataAccessProfiles)
    .values({
      profile_id: "dev-profile-field-worker",
      staff_id: "dev-staff-field-worker",
      can_access_pii: true,
      can_access_raw_crfs: true,
      can_access_deidentified_exports: false,
      can_access_aggregate_dashboards: false,
      can_access_admin_audit: false,
      created_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: schema.dataAccessProfiles.profile_id,
      set: {
        can_access_pii: true,
        can_access_raw_crfs: true,
        can_access_deidentified_exports: false,
        can_access_aggregate_dashboards: false,
        can_access_admin_audit: false,
        updated_at: now,
      },
    });

  await db
    .insert(schema.dataAccessProfiles)
    .values({
      profile_id: "dev-profile-central-admin",
      staff_id: "dev-staff-central-admin",
      can_access_pii: true,
      can_access_raw_crfs: true,
      can_access_deidentified_exports: true,
      can_access_aggregate_dashboards: true,
      can_access_admin_audit: true,
      created_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: schema.dataAccessProfiles.profile_id,
      set: {
        can_access_pii: true,
        can_access_raw_crfs: true,
        can_access_deidentified_exports: true,
        can_access_aggregate_dashboards: true,
        can_access_admin_audit: true,
        updated_at: now,
      },
    });

  await db
    .insert(schema.dataAccessProfiles)
    .values({
      profile_id: "dev-profile-site-data-manager",
      staff_id: "dev-staff-site-data-manager",
      can_access_pii: true,
      can_access_raw_crfs: true,
      can_access_deidentified_exports: true,
      can_access_aggregate_dashboards: true,
      can_access_admin_audit: false,
      created_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: schema.dataAccessProfiles.profile_id,
      set: {
        can_access_pii: true,
        can_access_raw_crfs: true,
        can_access_deidentified_exports: true,
        can_access_aggregate_dashboards: true,
        can_access_admin_audit: false,
        updated_at: now,
      },
    });

  await db
    .insert(schema.dataAccessProfiles)
    .values({
      profile_id: "dev-profile-central-data-manager",
      staff_id: "dev-staff-central-data-manager",
      can_access_pii: true,
      can_access_raw_crfs: true,
      can_access_deidentified_exports: true,
      can_access_aggregate_dashboards: true,
      can_access_admin_audit: false,
      created_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: schema.dataAccessProfiles.profile_id,
      set: {
        can_access_pii: true,
        can_access_raw_crfs: true,
        can_access_deidentified_exports: true,
        can_access_aggregate_dashboards: true,
        can_access_admin_audit: false,
        updated_at: now,
      },
    });

  await db
    .insert(schema.dataAccessProfiles)
    .values({
      profile_id: "dev-profile-us-collaborator",
      staff_id: "dev-staff-us-collaborator",
      can_access_pii: false,
      can_access_raw_crfs: false,
      can_access_deidentified_exports: true,
      can_access_aggregate_dashboards: true,
      can_access_admin_audit: false,
      created_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: schema.dataAccessProfiles.profile_id,
      set: {
        can_access_pii: false,
        can_access_raw_crfs: false,
        can_access_deidentified_exports: true,
        can_access_aggregate_dashboards: true,
        can_access_admin_audit: false,
        updated_at: now,
      },
    });

  await db
    .insert(schema.users)
    .values({
      user_id: smokeUser.user_id,
      staff_id: "dev-staff-field-worker",
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
        staff_id: "dev-staff-field-worker",
        display_name: "Dev Field Worker",
        role: "field_worker",
        site_id: 1,
        password_hash: passwordHash,
        active: true,
        updated_at: now,
      },
    });

  await db
    .insert(schema.users)
    .values({
      user_id: adminUser.user_id,
      staff_id: "dev-staff-central-admin",
      username: adminUser.username,
      display_name: "Dev Central Admin",
      role: "central_admin",
      site_id: null,
      password_hash: adminPasswordHash,
      active: true,
      created_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: schema.users.user_id,
      set: {
        staff_id: "dev-staff-central-admin",
        display_name: "Dev Central Admin",
        role: "central_admin",
        site_id: null,
        password_hash: adminPasswordHash,
        active: true,
        updated_at: now,
      },
    });

  await db
    .insert(schema.users)
    .values({
      user_id: siteDataManagerUser.user_id,
      staff_id: "dev-staff-site-data-manager",
      username: siteDataManagerUser.username,
      display_name: "Dev Site Data Manager",
      role: "site_data_manager",
      site_id: 1,
      password_hash: siteDataManagerPasswordHash,
      active: true,
      created_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: schema.users.user_id,
      set: {
        staff_id: "dev-staff-site-data-manager",
        display_name: "Dev Site Data Manager",
        role: "site_data_manager",
        site_id: 1,
        password_hash: siteDataManagerPasswordHash,
        active: true,
        updated_at: now,
      },
    });

  await db
    .insert(schema.users)
    .values({
      user_id: centralDataManagerUser.user_id,
      staff_id: "dev-staff-central-data-manager",
      username: centralDataManagerUser.username,
      display_name: "Dev Central Data Manager",
      role: "central_data_manager",
      site_id: null,
      password_hash: centralDataManagerPasswordHash,
      active: true,
      created_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: schema.users.user_id,
      set: {
        staff_id: "dev-staff-central-data-manager",
        display_name: "Dev Central Data Manager",
        role: "central_data_manager",
        site_id: null,
        password_hash: centralDataManagerPasswordHash,
        active: true,
        updated_at: now,
      },
    });

  await db
    .insert(schema.users)
    .values({
      user_id: usCollaboratorUser.user_id,
      staff_id: "dev-staff-us-collaborator",
      username: usCollaboratorUser.username,
      display_name: "Dev US Collaborator",
      role: "us_collaborator",
      site_id: null,
      password_hash: usCollaboratorPasswordHash,
      active: true,
      created_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: schema.users.user_id,
      set: {
        staff_id: "dev-staff-us-collaborator",
        display_name: "Dev US Collaborator",
        role: "us_collaborator",
        site_id: null,
        password_hash: usCollaboratorPasswordHash,
        active: true,
        updated_at: now,
      },
    });

  await db
    .insert(schema.userAreaAssignments)
    .values({
      assignment_id: "dev-field-worker-1-01",
      user_id: smokeUser.user_id,
      site_id: 1,
      locality_code: "01",
      role: "field_worker",
      active_from: "2026-06-04",
      active_to: null,
      created_at: now,
    })
    .onConflictDoUpdate({
      target: schema.userAreaAssignments.assignment_id,
      set: {
        user_id: smokeUser.user_id,
        site_id: 1,
        locality_code: "01",
        role: "field_worker",
        active_from: "2026-06-04",
        active_to: null,
      },
    });
  await db
    .insert(schema.fieldWorkerHouseholdAssignments)
    .values({
      assignment_id: "dev-field-worker-hh-1-01-0001-01",
      household_id: "1-01-0001-01",
      user_id: smokeUser.user_id,
      assigned_by_user_id: adminUser.user_id,
      assigned_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: [
        schema.fieldWorkerHouseholdAssignments.household_id,
        schema.fieldWorkerHouseholdAssignments.user_id,
      ],
      set: {
        assigned_by_user_id: adminUser.user_id,
        updated_at: now,
      },
    });


  await db
    .insert(schema.followUpTasks)
    .values({
      task_id: "dev-task-hhq-1",
      task_key: "1-01-0001-01:household:1-01-0001-01:HHQ:baseline:2026-09-01:v1",
      site_id: 1,
      locality_code: "01",
      household_id: "1-01-0001-01",
      subject_type: "household",
      subject_id: "1-01-0001-01",
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
        task_key: "1-01-0001-01:household:1-01-0001-01:HHQ:baseline:2026-09-01:v1",
        site_id: 1,
        locality_code: "01",
        household_id: "1-01-0001-01",
        subject_type: "household",
        subject_id: "1-01-0001-01",
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
        updated_at: now,
      },
    });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  upsertDevSeed()
    .then(() => {
      console.log("Development seed upserted");
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
