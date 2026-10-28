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
- QR login rate limits use the verified encrypted QR account ID, so different staff accounts behind the same network/proxy do not share one anonymous login budget. Reissued QR codes for the same account share its budget; invalid or expired QR codes remain in the anonymous IP bucket. Refresh limits distinguish full token hashes rather than shared JWT header prefixes. Extra request fields must not override the route's rate-limit identity.
- The Expo field app must require local app unlock after login using device biometrics when available, with PIN fallback.
- When the authenticated field app ordinarily leaves the foreground, it locks immediately.
- Only an explicitly active system operation delays background locking: camera/image-gallery capture has a ten-minute maximum from launch, while file-picker and location-permission requests retain the 60-second limit. Image pickers retain at most two seconds to settle Android lifecycle events after their promise completes; the foreground event cancels that return grace. Ordinary backgrounding after return locks immediately, and QR scanning inside the app does not use this exception. GPS releases the exception when permission resolves, rejects, is cancelled, or times out; waiting for satellites does not prevent ordinary background locking.
- A successful password or QR login must always route through local PIN creation when no PIN exists, or local PIN/biometric unlock when one is already configured.
- On restart, a rejected short-lived access token must be refreshed with the stored rotating refresh token before the app discards the saved session. Temporary network/server failures retain the PIN-protected offline session.
- Startup and sync must share an in-flight token refresh. A delayed rejection for an older access token must reuse the already refreshed session instead of rotating it again; an APK update must not itself discard login or PIN state. Explicit server session rejection remains enforced.
- A successful PIN or biometric unlock attempts background session renewal at most once per 24 hours after the last successful login/renewal. Network failures must not block local unlock; renewal requires connectivity and cannot revive an expired or administratively revoked refresh session.
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
- Site data managers may view, assign and clear household allocations only in their own site and active centrally assigned localities. New allocations target active field workers from that site. Missing or expired locality permissions deny allocation access. This permission does not grant user-account or study-master administration.
- Site research scientists are the current site-admin role: they can manage users and device assignments only within their own site, and cannot create central or collaborator users.
- Central data managers review and approve Site Data Manager resolution work within permitted central scope.
- Central admins can manage cross-site users, masters, and device assignments.
- User creation and editing must save the selected site and active locality assignments atomically; every locality must belong to the selected site.
- Account status is changed only by an authorized manager. A user cannot change their own status or the status of a higher-precedence role. Status precedence is `field_worker` < `field_supervisor` < `site_data_manager` < `site_research_scientist` < (`central_data_manager`, `us_collaborator`) < `central_admin`.
- Deactivating a user revokes all of that user's active refresh sessions so existing access tokens stop authorizing requests.
- Security reset clears lockout and authenticator enrollment, and revokes sessions. Central Admins may reset lower-role users, but not themselves or peer Central Admins. Central Data Managers may reset US Collaborators, Site Investigators, Site Research Scientists, and Site Data Managers. Site Data Managers and Site Research Scientists may reset Field Workers and Field Supervisors only at their own site. Self-reset requires the server CLI.
- US collaborators can log in to approved dashboards and data views, but can access only non-PII aggregate, de-identified, or analysis-ready study data.
- US collaborators must not access participant names, direct identifiers, contact details, free-text notes that may contain identifiers, device/user audit trails that identify participants, or raw CRF answers unless explicitly de-identified for their view.
- Admin correction and data-quality permissions must follow role and site/locality scope.

## Operational Dashboard Scope

The staff operations dashboard is available to Central Admins and Central Data Managers across sites, and to Site Data Managers, Site Research Scientists, and Site Investigators across their own account's site. The API pins site roles to `user.site_id` even if a different site is requested, and requires aggregate-dashboard capability. Field workers, field supervisors, and collaborators cannot access staff operations or sync audit rows through this endpoint.

Staff activity is attributed only using the submission's recorded user, never the current device owner. Completed counts include primary accepted submissions by client submission date in India time; receipt counts use server receipt date. Drafts are active server backups, excluding tasks already finalized, and cannot represent unsynced device-only drafts. Assigned villages describe assignments rather than staff GPS location. Shared household/task totals are distinct, so the sum of individual staff workloads can exceed the site total. Pending tasks are available, nonterminal work within the task's actionable window (baseline household/woman forms remain actionable); overdue tasks are the subset past their deadline, or target date when no deadline exists. Date filters select activity days, not historical assignment snapshots. Sync issues cover recorded push errors/conflicts; failures that never reach the server are not observable.

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
- Ballabhgarh HDSS lookup downloads use the exact village codes in active site 2 locality assignments. Locality 02 is not a wildcard for other villages; multiple assigned villages grant their union. Registry refreshes replace only the lookup cache, never submitted forms, drafts, or household assignments.
- Field-worker household reads require explicit household assignments: zero assignments means zero household work, even with a locality assignment. A completed pull refreshes device worklist visibility without deleting local submission evidence or drafts.
- Field-worker household allocations grant access only inside the account's current database site, including requests carrying an older site in their JWT. A field-worker site transfer removes only that user's obsolete household allocation links in the same transaction; shared households, tasks, forms and other users' allocations remain intact. Legacy wrong-site links are excluded from reads and pull assignment snapshots without rewriting historical evidence.
- Device field-worker worklists intersect the last complete assignment snapshot with the currently stored account site. Missing, malformed or another user's snapshot denies actionable cached work until a successful pull. Profile refreshes and site changes hide obsolete work without deleting cached households, drafts, completed forms or the upload outbox.
- Cached member-detail routes and contextual PEF actions recheck current household assignments, including async results after a scope change. A field worker outside Ballabhgarh cannot browse an old Ballabhgarh HDSS cache merely because a legacy village assignment remains cached.
- Push scope is resolved from server-known tasks/subjects when possible.
- Client-provided `site_id`, `locality_code`, and `answers_json` are validation inputs, not the only source of truth.
- Household/member/task routes must enforce role and assignment scope, not only authentication.

## Development Mode

Dev seed credentials may exist only for local development. They must not be accepted as production defaults.

Any code path that relies on default secrets, published seed passwords, or unrestricted dev scope must be guarded by explicit dev environment checks.
