# App Surfaces And Routes Policy

This policy defines the user-facing route and surface contracts. It is canonical even where code still lags.

## Expo Field App

Required field routes:

| Route | Purpose |
| --- | --- |
| `#/households` | Offline household list, search, member search, sync entry point, and household detail surface. |
| `#/hdss-list` | Read-only offline HDSS households, 50 per page, with member-name search and full household member details. |
| `#/households/new` | HHQ baseline household enrollment from the mapped frame. |
| `#/household-members` | Offline member directory across selected/assigned localities. |
| `#/household-members/:householdId` | Member directory filtered to one household. |
| `#/profile` | Field worker identity, site, active locality assignments, and device/session context. |

Rules:

- Field app surfaces are locality-aware.
- The global locality switcher scopes household/member/task lists.
- On narrow field-app layouts, the locality switcher lives in the main DYNAMIC drawer rather than occupying the fixed top bar.
- Field users must not see a global unscoped study dataset.
- Add Household opens HHQ; it does not call a direct admin create-household endpoint.
- Duplicate household ID checks must run before final HHQ submission and again in the save path.
- Household details should load after selecting a household/member, not by rendering all records at once.
- HDSS list uses the assigned Ballabhgarh village cache and the selected locality. Search trims surrounding spaces and ignores case. Comma-separated names must all match members of the same household; search covers the full scoped cache before pagination. Household identity includes village, house number, and family number. This reference list does not enroll members or create forms/tasks.

## Runtime Site And Locality Choices

HHQ site/locality choices come from authenticated user context:

1. login
2. `GET /api/v1/users/me`
3. active site/locality assignments
4. synced locality cache fallback
5. maintained questionnaire choices only as render fallback

If a field user has one site, preselect it. Locality choices must be limited to active assigned localities for that site.

## Admin App

Required admin surfaces:

| Route | Purpose |
| --- | --- |
| `/` | Operational dashboard. |
| `/tasks` | Task list and task status review. |
| `/data-quality` | Data-quality flags and duplicate evidence review. |
| `/sync-logs` | Sync audit logs. |
| `/households` | Backend household list and detail. |
| `/household-members` | Backend member directory. |
| `/eligible-women` | WQ-eligible woman registry. |
| `/eligible-pregnancy-tracking` | Women promoted into pregnancy tracking. |
| `/pregnant-women` | Active pregnancy registry. |
| `/children` | Child registry. |
| `/masters` | Sites, localities, mapping frame, and study masters. |
| `/users` | User management and active locality assignment summary. |

Rules:

- Admin lists are backend-driven.
- Admin household/member displays use field-meaning labels, not sync internals.
- Admin correction/data-quality actions must follow active correction policy.
- Masters and users are controlled admin surfaces, not field-app workflows.

## API Surface

All protected routes require authentication and role/scope checks.

Core route groups:

- `/api/v1/auth`
- `/api/v1/users`
- `/api/v1/area-assignments`
- `/api/v1/devices`
- `/api/v1/masters`
- `/api/v1/households`
- `/api/v1/household-members`
- `/api/v1/tasks`
- `/api/v1/sync`
- `/api/v1/data-quality`
- `/api/v1/corrections`

Sync pulls are paged. Large household sync should pull households first and members by household batch.

### Ballabgarh HDSS Reference Lookup

- The person-level HMIS export is reference data for optional BHQ identity linkage. It does not enroll people in the DYNAMIC cohort or overwrite interview answers.
- The HDSS `hdss_unique_id` is the fixed registry `uid`. Village, house, family, and individual numbers remain text with leading zeroes. Their combination is a search key, not a unique identity; matching people are listed individually with an explicit Select action.
- The displayed HDSS original ID is `VillageCode-HouseNumber-FamilyNumber-IndividualNumber`, retaining leading zeroes in every part. The exported `hdss_unique_id` remains a separate fixed background key.
- In the BHQ member list, each person's Lookup opens a right-side drawer prefilled from the current village (`hhq_locality_code`) and mapped house/structure (`hhq_structure_map_id`), not the household-within-structure number. Results filter immediately, with Select against each HDSS person. Selection links directly without warnings or confirmation dialogs.
- The BHQ lookup initially shows 10 people and loads additional matches in pages of 10. Village/locality, exact house number, and case-insensitive trimmed name/original-ID filters apply to the complete permitted cache before paging. Study locality `02` uses the approved HDSS village mapping; a source village code narrows results to that village. All houses explicitly clears the optional prefilled house filter without rewriting source identifiers.
- Each BHQ person has one HDSS link. Its chip displays the original ID and source name, age, sex, and status; the top-right cross clears only that link. Selecting another person replaces the existing link. Source details persist with the draft and never overwrite interview answers.
- Source domicile and `curr_status` remain separate. HDSS current membership means Resident, Returned Resident, or Visitor; Dead and Emigrated are historical records. This source rule does not change DYNAMIC's exclusion of temporary visitors from the roster/cohort.
- Source age is a snapshot as of the export date, not age at death/migration or a continuously updated age. Lookup displays the source age and decoded sex labels.
- Central-admin CSV import validates the source before transactional, bounded-batch upserts by HDSS ID. Blank names or address keys are preserved; no household-head identity is inferred from this person export.
- Central admins upload from **Study Masters → Ballabgarh HDSS**. Choose the original UTF-8 CSV (maximum 25 MiB), then Upload CSV. The screen reports the imported count or validation line/column/code; it does not preview participant rows. Re-import updates matching `hdss_unique_id` values and does not remove absent people.
- Upload API: `POST /api/v1/masters/blb-registry/upload`, multipart field `file` (alias `/blb-registry/individuals/upload`). Required columns: `hdss_unique_id,village_code,village_name,phc_code,phc_name,name,age,sex,house_no,family_no,ind_no,domicile,curr_status,death_date,migrated_out_date,migration_reason`. Invalid input is rejected before any writes; successful import returns `{data:{imported:number}}`.
- `GET /api/v1/masters/blb-registry` requires PII access. Field workers receive only rows permitted by active Ballabgarh locality assignments. Study locality `02` at site `2` explicitly grants reference lookup across the 29 HDSS source villages in `shared/hdssVillageMapping.json`; the source codes remain unchanged. Other assignments match source village codes exactly. This approved reference mapping does not widen study household, task, or form access.
- Registry pulls use bounded pages and an opaque continuation cursor. Native Expo persists each downloaded page into a staging cache before requesting the next page, retaining only the current page in JavaScript. The previous complete cache remains visible until the entire new cache is activated atomically. A failed refresh retains the previous complete cache and discards staging data; stale staging after interruption is cleared before a new pull and on logout. Web storage quota errors must not be reported as success.
- HDSS responses include an opaque registry version bound to the import generation and the authenticated area scope. A first-page `known_registry_version` match returns `not_modified` without person rows. The app may send it only after validating its successfully saved cache marker, user, scope, and row counts; an incomplete/failed cache import must never create a reusable version marker.
- Native registry downloads use parameterized bulk writes to staging, with session/scope checks between batches and atomic activation of the complete cache. Sync displays one download counter after persistence. Unchanged-reference checks must not skip normal form, attachment, draft, or task synchronization.
- The first full registry page includes `total_individuals`, counted on the server within the same scope and snapshot as that page. Progress shows only "X downloaded out of Y" and advances after each native page is saved. The final count appears only after the complete cache is activated; there is no second saving counter. Continuation and unchanged responses skip the count. Older servers without a total remain supported.
- Native registry browsing uses expression indexes on trimmed source address keys, pages household keys before aggregating member details, and merges bounded village lookup results. Import normalization stays within each insert batch. Name substring and comma-name searches still cover the complete permitted cache before paging; they may scan SQLite rows, but must not transfer the full registry into JavaScript for browsing.
- After import, field users run **Sync Now** to refresh their assigned-village reference cache. The selected study locality is expanded through the same mapping before filtering HDSS list results. Sync refreshes the current user's assignment state and reports the number of HDSS people available offline, including an explicit zero-match message. Users assigned only to other sites receive no Ballabgarh records. Original ID, exact UID and linked source details travel with the BHQ submission; the original ID/UID/status also persist in the member projection and subsequent mobile pulls.
- Logout and account changes clear the native and web registry caches along with other participant data. Local source exports stay ignored and must not be committed or sent to external services.

Route contracts should be documented here before UI code depends on them.
