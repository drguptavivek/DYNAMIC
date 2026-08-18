# Auth, Device, And Role-Scope Policy

This policy defines authentication, device registration, token behavior, and role/scope boundaries. It is canonical even where code still lags.

## Staff Identity Model

Study staff identity is separate from app login identity.

Rules:

- Institutions represent real-world organizations participating in or supporting the study.
- Study Staff Members represent real-world people and their institutional affiliations.
- Each Study Staff Member has one Institution affiliation in DYNAMIC.
- Designations are free-text real-world titles or appointments; they do not grant app permissions by themselves.
- Study Roles describe study responsibilities such as Field Worker, Site Data Manager, Central Data Manager, or US Collaborator.
- Study Roles are also app roles where the person needs login access.
- Every User Account must map to exactly one Study Staff Member.
- Data Access Profiles define whether a Staff Member or User Account can access PII, raw CRFs, de-identified exports, aggregate dashboards, or admin/audit surfaces.
- Do not use the `users` table alone as the authoritative roster of research staff, institutions, designations, and collaborator access.
- Do not model ethics committee, funder, or coordinating-center people unless they need DYNAMIC access as Study Staff Members.

## Authentication

Rules:

- Login requires username/password over HTTPS in deployed environments.
- Login failures must not reveal whether username or password was wrong.
- Disabled users cannot login or refresh tokens.
- Authentication secrets must be required in non-dev environments.
- JWT verification must lock the expected algorithm and token type.
- Login and refresh endpoints need rate limiting before field deployment.
- The Expo field app must require local app unlock after login using device biometrics when available, with PIN fallback.
- App lock protects local cached PII, drafts, finalized local outbox records, and worklists.
- App lock must not delete or block sync of already finalized local Form Submissions.

## Tokens

Token policy:

- Access tokens are short-lived.
- Refresh tokens are longer-lived and must be distinguishable from access tokens.
- Access tokens must carry the server refresh-session id they were issued under.
- Protected API routes must check access-token session validity against Redis or an in-memory cache, with database fallback on cache miss.
- Refresh token use rotates the refresh session and revokes the previous session.
- Logout revokes the active refresh session when a refresh token is supplied, or all active sessions for the user when no refresh token is supplied.
- Revoked sessions must invalidate both refresh capability and cache-backed access-token authorization.
- Token payload includes only stable identity/scope fields needed by the API:
  - user id
  - username
  - role
  - site id
  - token type
  - refresh-session id

## Devices

Field devices must be registered.

Rules:

- Field workers can register their own device.
- A user may have at most two authorized registered devices. A third distinct device must be rejected until an administrator deauthorizes one of the existing devices.
- Central admins can bulk-register devices.
- Device records associate `device_id` with the currently authenticated user, name, and registration time.
- Central admins can authorize or deauthorize individual registered devices; Site Research Scientists can do so only for users in their own site.
- A deauthorized device registration cannot self-register, pull, push, or back up drafts until explicitly reauthorized. An authorized administrator may permanently delete only a deauthorized registration; historical form, event, and sync records retain their recorded device ID for audit.
- Device association is not permanent ownership: a user may log out of one device and another user may log in and register the same device.
- Authenticated sync push requires a registered or otherwise accepted `device_id` associated with the current authenticated user/session.
- Finalized Form Submissions already saved to the local outbox must still sync after logout.
- Tokenless sync push requires a valid registered `device_id` and a valid `user_id` on each submitted record; the server uses that submitted user for raw-CRF access and area-scope checks.
- Device ID is part of audit, sync, and local draft context.
- Administrative bulk device assignment is allowed within role scope, but normal field use should not require hard user-device binding.

## Roles

Canonical roles:

```text
field_worker
field_supervisor
site_data_manager
site_research_scientist
central_data_manager
central_admin
us_collaborator
```

Role rules:

- Field workers operate only within assigned site/locality scope.
- Supervisors operate only within their assigned operational scope.
- Site data managers operate within assigned site/locality scope for Issue review and Resolution Proposal work.
- Site research scientists are the current site-admin role: they can manage users and device assignments only within their own site, and cannot create central or collaborator users.
- Central data managers review and approve Site Data Manager resolution work within permitted central scope.
- Central admins can manage cross-site users, masters, and device assignments.
- User creation and editing must save the selected site and active locality assignments atomically; every locality must belong to the selected site.
- Account status is changed only by an authorized manager. A user cannot change their own status or the status of a higher-precedence role. Status precedence is `field_worker` < `field_supervisor` < `site_data_manager` < `site_research_scientist` < (`central_data_manager`, `us_collaborator`) < `central_admin`.
- Deactivating a user revokes all of that user's active refresh sessions so existing access tokens stop authorizing requests.
- US collaborators can log in to approved dashboards and data views, but can access only non-PII aggregate, de-identified, or analysis-ready study data.
- US collaborators must not access participant names, direct identifiers, contact details, free-text notes that may contain identifiers, device/user audit trails that identify participants, or raw CRF answers unless explicitly de-identified for their view.
- Admin correction and data-quality permissions must follow role and site/locality scope.

## PII Boundary

Participant-identifying data must stay inside India-hosted operational access unless an approved de-identified export explicitly removes direct and reasonably identifying fields.

Rules:

- PII-restricted fields include names, contact details, exact addresses, household location details that identify a participant, free-text notes that may contain identifiers, raw CRF answers with identifying content, and linkage fields that expose identity outside the approved analysis context.
- US Collaborator access is read-only and non-PII by default.
- US Collaborators must use de-identified exports, aggregate dashboards, or analysis views designed for non-PII access.
- Existing API routes may serve US Collaborators only when role-based filtering removes PII and restricts output to approved non-PII fields.
- Admin, sync, device, and audit views that expose field worker activity tied to identifiable participants are not US Collaborator surfaces.
- When in doubt, deny US Collaborator access until a Site Research Scientist or Central Admin confirms the view is non-PII.

Current API enforcement:

- `us_collaborator` and `central_data_manager` have central read scope; `site_data_manager` remains site-scoped.
- Users without `can_access_pii` receive `null` or empty values for participant names, household head name, household address, mother/member names, date of birth, and derived eligible-woman name arrays.
- Users without `can_access_raw_crfs` cannot call raw sync or raw CRF detail endpoints.
- Users without `can_access_admin_audit` cannot read correction history because old/new correction values may contain PII.
- Raw CRF access is not inferred from dashboard access; it must be explicitly enabled in the user's Data Access Profile.

## Area Scope

Area scope is enforced server-side.

Rules:

- Pull scope is the intersection of request filters and active server-side assignments.
- Push scope is resolved from server-known tasks/subjects when possible.
- Client-provided `site_id`, `locality_code`, and `answers_json` are validation inputs, not the only source of truth.
- Household/member/task routes must enforce role and assignment scope, not only authentication.

## Development Mode

Dev seed credentials may exist only for local development. They must not be accepted as production defaults.

Any code path that relies on default secrets, published seed passwords, or unrestricted dev scope must be guarded by explicit dev environment checks.
