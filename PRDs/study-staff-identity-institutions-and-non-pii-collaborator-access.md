# Study Staff Identity, Institutions, And Non-PII Collaborator Access

Source issue: [#8](https://github.com/drguptavivek/DYNAMIC/issues/8)

## Problem Statement

DYNAMIC currently treats app users, roles, area assignments, and devices as the main representation of study personnel. That is sufficient for login, sync, and site/locality-scoped field operations, but it does not represent the real study organization clearly.

The study needs to know which institutions are participating, which real people are study staff, what their free-text designations are, which study responsibilities they hold, which app accounts they use, and what data they may access. This is especially important for US Collaborators, who are real study collaborators outside India and may need dashboard/data access, but must not access participant-identifying data.

Without a separate staff identity model, DYNAMIC risks mixing real-world governance, app authentication, operational scope, device assignment, and PII access into the same `users` concept. That makes policy harder to explain, harder to test, and easier to get wrong.

## Solution

Introduce a study staff identity model that separates real-world study governance from app login identity.

DYNAMIC will model Institutions, Study Staff Members, free-text Designations, Study Roles, User Accounts, Study Staff Assignments, and Data Access Profiles as distinct concepts. Every User Account maps to exactly one Study Staff Member. Each Study Staff Member has exactly one Institution affiliation. Designation is free text and does not grant permissions by itself. Study Roles such as Field Worker, Site Data Manager, Central Data Manager, and US Collaborator are also app roles when the person needs login access.

US Collaborators can log in to approved dashboards and data views, but route/view output must be role-filtered to non-PII aggregate, de-identified, or analysis-ready data. The first implementation should use filtering on existing approved routes and views where possible, instead of creating a separate parallel US Collaborator API.

This PRD follows the agreed sequence: docs and policy first, then PRD, then implementation through small commits.

## User Stories

1. As a Central Admin, I want to register Institutions, so that the study can distinguish study sites, collaborator institutions, and coordinating organizations.
2. As a Central Admin, I want to record each Study Staff Member's Institution, so that staff identity is tied to real-world study governance.
3. As a Central Admin, I want each Study Staff Member to have exactly one Institution affiliation in DYNAMIC, so that affiliation rules stay simple.
4. As a Central Admin, I want to store a free-text Designation for each Study Staff Member, so that real-world titles can be represented without forcing an artificial role list.
5. As a Central Admin, I want to create a User Account linked to a Study Staff Member, so that login credentials are separate from staff identity.
6. As a Central Admin, I want every User Account to map to exactly one Study Staff Member, so that app access is always traceable to a real person.
7. As a Central Admin, I want to assign Study Roles to Study Staff Members, so that responsibilities such as Field Worker, Site Data Manager, Central Data Manager, and US Collaborator are explicit.
8. As a Central Admin, I want Study Roles to act as app roles when login access is needed, so that access-control behavior matches study responsibilities.
9. As a Site Research Scientist, I want to see staff associated with my site where permitted, so that site operations can be managed without cross-site overreach.
10. As a Site Data Manager, I want my role represented distinctly from Field Worker and Central Data Manager, so that issue review responsibilities are clear.
11. As a Central Data Manager, I want site-level resolution proposals to come from Site Data Managers, so that central review remains distinct from site review.
12. As a Field Worker, I want my User Account to remain tied to my device and area assignments, so that field sync and task routing continue to work.
13. As a US Collaborator, I want to log in to approved dashboards, so that I can review study progress without receiving participant-identifying data.
14. As a US Collaborator, I want access to de-identified or aggregate data views, so that I can contribute to study analysis safely.
15. As a US Collaborator, I should not see participant names, contact details, exact addresses, identifying notes, or raw identifying CRF answers, so that participant confidentiality is protected.
16. As a US Collaborator, I should not see device, sync, or audit views that expose field worker activity tied to identifiable participants, so that operational PII is not leaked.
17. As a Site Research Scientist, I want to confirm whether a route/view is non-PII before US Collaborator access is allowed, so that uncertain data exposure is denied by default.
18. As a Central Admin, I want Data Access Profiles to describe PII, raw CRF, de-identified export, aggregate dashboard, and admin/audit access, so that permissions are understandable.
19. As a developer, I want staff identity and app authentication to be separate models, so that future role and access changes do not corrupt the study roster.
20. As a developer, I want existing Expo login and sync profile behavior to keep working, so that this refactor does not disrupt field operations.
21. As a developer, I want current users to be backfilled or seeded with Study Staff Members, so that tests and development credentials remain valid.
22. As a developer, I want shared role vocabulary to include US Collaborator, so that backend, admin, Expo, and shared packages use the same role names.
23. As a developer, I want route filtering to enforce US Collaborator non-PII access, so that sensitive fields are removed before responses leave the backend.
24. As a developer, I want tests for permission outcomes rather than table internals, so that behavior stays stable during implementation.
25. As an agent, I want glossary terms and policy docs to match code concepts, so that future implementation tasks do not reintroduce terminology drift.

## Implementation Decisions

- Staff identity and app login identity are separate.
- Every User Account maps to exactly one Study Staff Member.
- Each Study Staff Member has exactly one Institution affiliation in DYNAMIC.
- Designation is free text.
- Study Roles describe responsibilities such as Field Worker, Site Data Manager, Central Data Manager, and US Collaborator.
- Study Roles are also app roles when login access exists.
- US Collaborators can log in to approved dashboards and data views.
- US Collaborators can access only non-PII aggregate, de-identified, or analysis-ready data.
- US Collaborator access should be enforced through role-based filtering on existing approved routes/views where possible.
- Data Access Profiles should represent PII, raw CRF, de-identified export, aggregate dashboard, and admin/audit access boundaries.
- Ethics committee, funder, and coordinating-center people are out of scope unless they need DYNAMIC access as Study Staff Members.
- Institutions and staff identity do not replace area scope.
- Devices remain bound to User Accounts, not directly to Study Staff Members.
- Existing area assignment behavior should remain valid while staff assignment concepts are introduced.
- User profile responses should expose enough staff identity, institution, designation, study role, area assignment, and data access information for clients without exposing unnecessary PII.
- Existing route outputs must be reviewed before US Collaborator access is granted.
- When a route/view cannot clearly remove PII, deny US Collaborator access until the non-PII contract is explicit.

## Testing Decisions

Tests should verify externally visible behavior and access-control outcomes. They should avoid asserting incidental table structure.

Test coverage should include:

- User Account creation requires or creates a linked Study Staff Member.
- Existing seeded/development users have Study Staff Member links after migration/backfill.
- A Study Staff Member cannot be linked to multiple Institutions.
- Free-text Designation is preserved and does not grant permissions.
- Study Role controls app permission where login access exists.
- US Collaborator can access approved non-PII dashboard/data responses.
- US Collaborator cannot access participant names, direct identifiers, contact details, exact addresses, identifying notes, raw identifying CRF answers, participant-linked device/sync/audit trails, or operational admin surfaces with PII.
- Field Worker, Site Data Manager, Central Data Manager, Site Research Scientist, Central Admin, and US Collaborator permissions remain distinct.
- Existing `/users/me` style profile behavior remains backward compatible for Expo login and sync.
- Existing area-scope behavior remains intact.

Prior art exists in current auth/user integration tests, area-scope tests, admin-user tests, and sync/profile tests. New tests should extend those patterns.

## Out of Scope

- Full admin UI redesign for staff management.
- Modeling people who do not need DYNAMIC access, such as ethics committee, funder, or coordinating-center contacts.
- Replacing area assignment or device assignment with staff assignment in the first implementation.
- Creating a separate US Collaborator-only API surface by default.
- Advanced de-identification pipelines beyond route/view filtering required for approved non-PII access.
- Participant/cohort identity changes.
- Task scheduling, Workflow Decisions, CRF finalization, or sync semantics unrelated to staff identity.

## Further Notes

This PRD depends on the current glossary and policy direction in `CONTEXT.md`, the auth/device/role-scope policy, and the ADR that separates Study Staff identity from User Accounts.

The first implementation should keep current login and field sync working while adding explicit Institutions, Study Staff Members, Designations, Study Roles, User Account linkage, and Data Access Profiles around the current auth model.
