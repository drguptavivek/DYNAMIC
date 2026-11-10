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
- Assigned baseline BHQ tasks appear under Today throughout their open assignment window, under Draft when started, and Overdue after their deadline. Their card labels the stored assignment target as Complete by; this grouping never changes task dates, follow-up schedules or completion rules.
- The global locality switcher scopes household/member/task lists.
- On narrow field-app layouts, the locality switcher lives in the main DYNAMIC drawer rather than occupying the fixed top bar.
- Field users must not see a global unscoped study dataset.
- Add Household opens HHQ; it does not call a direct admin create-household endpoint.
- HHQ constructs its Survey Core model after local draft recovery resolves. Household and member browsing queries pause while the HHQ interview is displayed.
- Duplicate household ID checks must run before final HHQ submission and again in the save path.
- Household details should load after selecting a household/member, not by rendering all records at once.
- HDSS list uses the assigned Ballabhgarh village cache and the selected locality. Search trims surrounding spaces and ignores case. Comma-separated names must all match members of the same household; search covers the full scoped cache before pagination. The footer shows the current page and total matching pages, with 50 households per page. Household identity includes village, house number, and family number. Member details hide internal HDSS UIDs; Android Back returns to the previous household list and preserves its search and page. This reference list does not enroll members or create forms/tasks.

## Form Language Management

- The admin form selector uses the mobile display aliases BHQ and BWQ while requests, translation keys, permissions, and stored submissions retain internal codes HHQ and WQ.
- The editor derives its English inventory from the same prepared questionnaire used by Android. It includes form and section headings, nested questions and choices, help text, HTML instructions, repeated-field labels, and the native form labels used by custom controls and tables.
- Form popup titles, bodies, buttons, and section-drawer labels use the same inventory. Translate only their displayed text after the original form decisions; preserve confirmation callbacks, cancellation behavior, required acknowledgements, and dynamic values. Unknown server errors retain their original text.
- Existing named-question translation keys remain valid. Additional entries use stable `@form`, `@page:`, `@text:`, and `@native:` keys within the existing translation JSON and CSV columns; they are text, never answers or workflow fields.
- Loading the editor does not write translations. Saving active entries preserves previously stored translations for inactive fields and choices; permissions still control all edits.
- CSV export includes the entire current inventory in questionnaire order, retains its original nine columns and exact internal variable/option codes, and appends display form code, version, and definition checksum. Export filenames use BHQ/BWQ display aliases. Import checks supplied form/language/checksum metadata before preview, preserves canonical keys including whitespace, and requires preview plus confirmation before saving. Legacy CSV files without the new metadata remain supported.
- Delayed definition loads or file reads must not replace the currently selected form/language or enable an export/import/save for stale data.
- Protocol downloads retain the raw questionnaire definition and carry translation overlays for application after Android's presentation transforms. Preparing or translating text must not change expressions, required rules, answer keys, task scheduling, or interview language locking.

## Form Data Export

- Exports remain Excel-compatible UTF-8 CSV downloads, using coded answers by default. An uncoded option resolves known option values to their English choice text; free text, identifiers, dates, coordinates and unknown codes retain their stored values.
- BHQ site/locality labels use current masters, with locality lookup keyed by site and locality code; missing master labels retain their codes instead of using another site's village name.
- All forms support filtering by recorded submitter, with the available staff list derived only from form responses inside the caller's server-enforced area scope. The same filter applies to the BHQ member file.
- PIS is the normal identifiable export. Non-PIS masks direct identifiers, including names, contact/address information, precise GPS, birth dates and identifying free text, including nested roster/repeated values. Household IDs remain unchanged for analysis linkage. This is a masked export, not a guarantee of anonymity. Privacy masking takes precedence over coded/uncoded display.
- BHQ offers separate household and member downloads. The household file shows member names in the roster column; complete roster details appear only in the member file, with one row per stored member and the household ID and response provenance alongside it.
- Member exports read the submitted BHQ roster, not the current member registry. Both downloads enforce the same raw-CRF permission and server-side area scope. Exporting never changes stored answers, projections or tasks.
- PIS additionally requires PII access, and Non-PIS additionally requires the de-identified-export capability; neither mode grants raw-CRF access to a role that does not already have it.

## Runtime Site And Locality Choices

HHQ site/locality choices come from authenticated user context:

1. login
2. `GET /api/v1/users/me`
3. active site/locality assignments
4. synced locality cache fallback
5. maintained questionnaire choices only as render fallback

If a field user has one site, preselect it. Locality choices must be limited to active assigned localities for that site.

## Admin App

The operational dashboard gives central admins/data managers cross-site staff comparisons and pins site data managers/research scientists/investigators to their own site on the server. The staff dashboard defaults to All time through the current India-time day, with Date wise selection for a single day. An independent Today column keeps daily activity visible alongside the period total. Exact staff, literal username/display-name search, form-type, site and locality filters apply on the server to operational totals and all views; staff choices remain scoped to the selected area. Form filtering applies to submissions, drafts and tasks; household assignments and sync issues remain form-independent. Shared household and task assignments count once in area totals and once for each assigned user's row. Current study totals remain area-wide and available separately from filtered staff activity.

Sync Logs applies every filter on the server before pagination: partial case-insensitive device ID and username/display-name search, direction, stored status, and inclusive India-time calendar dates. Searches treat wildcard characters literally. Count and rows share the same filters and existing role/site scope; older matches are reachable through pagination. Invalid date ranges return a visible error, and superseded requests cannot replace current results. Filtering never changes sync records.

Completed-form counts use primary submissions and their recorded client submission date, with server receipt as a fallback; receipt counts remain separate. Staff attribution comes only from the recorded submitter, never inferred from the device's current owner. Unattributed historical forms are disclosed separately. Draft counts mean active server backups, excluding backups for tasks with a primary submission; phone-only drafts and unsynced completed forms are unknown. Latest server contact may be a recorded sync, draft backup or received response. Recorded push issues cannot reveal every device/network/download failure. Assigned and worked localities are operational labels, not live staff positions. Date selection does not reconstruct historical task or assignment ownership.

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
| `/children` | Children registered from study pregnancy outcomes; BHQ minors remain in Household Members. Lists child ID, sex, birth date, age, status, locality and mother with scoped access; distinguishes no records from loading errors. |
| `/masters` | Sites, localities, mapping frame, and study masters. |
| `/users` | User management and active locality assignment summary. |
| `/field-worker-household-assignment` | Scoped household selection and staff assignment. |

Rules:

- Admin lists are backend-driven.
- Admin navigation pages use the available content width. Titles, tabs, filters, and actions remain outside the scrolling record/list area; table headings stay visible inside that area. Filter, action, and pagination controls wrap to the available width.
- Admin household/member displays use field-meaning labels, not sync internals.
- The member directory offers authorized managers Correct details for their permitted site. Display server-defined current values and editable fields, require a reason, preview before/after values and task impact, and require verification plus final confirmation. Any edit invalidates the preview; stale saves require a fresh preview. Block conflicting completed histories with a clear review message. Preserve original submissions and allocations, and instruct the assigned worker to sync after success.
- Admin correction/data-quality actions must follow active correction policy.
- Masters and users are controlled admin surfaces, not field-app workflows.
- Household assignment filters and selection controls remain visible while the table scrolls. The table-header checkbox selects/deselects only the current page; the separate site/locality checkbox selects every household in that scope, ignoring range and search. Changing filters clears selection.
- Household assignment rows show rose with an Excluded label when the synced household cohort is excluded or baseline enrollment is excluded/not_enrolled; this takes priority over old completion or draft evidence. Other rows show green with a Completed label for a server-received primary BHQ with completed interview outcome, or ordinary Other (outcome 10) backed by an enrolled, nonclosed household and its matching completed BHQ task in the same site/household. Other alone, incomplete/refused/postponed outcomes, and unmatched task evidence do not establish completion. Active server-backed BHQ drafts show yellow with a Draft label; completion takes priority over a stale draft. Pending, incomplete and phone-only work retain the default appearance. Status refresh preserves assignment selections, filters and table position; these colors do not alter tasks, households or allocations.
- Assignment ranges accept inclusive household numbers or full household IDs with the same site/locality/structure prefix. Full IDs must match selected scope; malformed, mixed, conflicting, or reversed bounds are rejected instead of silently disabling filtering.

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
- In the BHQ member editor, Lookup appears immediately after `2_i Name of the individual` once a name is entered. It opens a right-side drawer prefilled from the current form's village (`hhq_locality_code`), mapped house/structure (`hhq_structure_map_id`), and current member's name (`member_name`), not the household-within-structure number, household ID, or logged-in user's locality. Reopening reads the form's latest values, including for multi-locality accounts. The name/HDSS original-ID field remains editable and supports comma-separated names. Results filter immediately, with Select against each HDSS person. Selection links directly without warnings or confirmation dialogs.
- The BHQ lookup always requires an exact village code, plus either a house number or a name/original-ID search. Any entered house number matches exactly after trimming whitespace, preserving leading zeros. A single name/ID searches people; comma-separated names require all names within the same village/house/family and show all members of matching households. Users may edit the fields or explicitly clear the house with Search by name instead; there is no automatic fallback to another house or village. The first 10 results and subsequent pages apply all filters across the complete permitted cache before paging. Village `02` is literal in this drawer and must not expand to other source villages; absent matches show no results. This does not change the approved multi-village cache or HDSS list access.
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
- Native registry browsing uses expression indexes on trimmed source address keys and pages household keys before aggregating member details. BHQ lookup queries use the exact village and house filters. Import normalization stays within each insert batch. Name substring and comma-name searches still cover the complete permitted cache before paging; they may scan SQLite rows, but must not transfer the full registry into JavaScript for browsing.
- After import, field users run **Sync Now** to refresh their assigned-village reference cache. The selected study locality is expanded through the same mapping before filtering HDSS list results. Sync refreshes the current user's assignment state and reports the number of HDSS people available offline, including an explicit zero-match message. Users assigned only to other sites receive no Ballabgarh records. Original ID, exact UID and linked source details travel with the BHQ submission; the original ID/UID/status also persist in the member projection and subsequent mobile pulls.
- Logout and account changes clear the native and web registry caches along with other participant data. Local source exports stay ignored and must not be committed or sent to external services.

Route contracts should be documented here before UI code depends on them.

Central Admin and Site Data Manager `/dashboard` shows the operational study overview: all-time accepted field-worker form totals, prominent progress cards for every questionnaire, household coverage, actionable task delivery and per-site comparisons. Each form card separates accepted forms received from completed/draft/pending task counts and their composition; upcoming/inactive tasks stay outside its completion percentage. Forms without actionable tasks show no percentage instead of implying completion. Central Admin sees every study site, including new/empty sites, and can focus the overview on one returned site. Site Data Managers see only their account's site, enforced by the API regardless of requested filters; missing site assignments are denied. There is no reporting date filter. The existing staff dashboard remains at `/staff-dashboard`; other admin roles keep their existing `/dashboard` experience. The read-only `/api/v1/dashboard/site-form-totals` endpoint requires Central Admin or Site Data Manager and aggregate-dashboard capability.

Household coverage partitions registered households into completed BHQ, closed/excluded, active backed-up BHQ draft, or pending, in that order. Completion and drafts share the assignment-table evidence rules. Completion percentage uses all registered households, including closed households; assignment coverage counts each household once with an active same-site field-worker allocation. Deassignment never erases completed work. Actionable task completion uses completed / (completed + draft + pending), shows upcoming work separately outside the percentage, excludes closed/cancelled/disabled or unknown task states, and counts each task once regardless of shared assignments. Active unsubmitted backups mark open tasks as draft. Nonbaseline tasks with a future window are upcoming; BHQ/BWQ stay actionable under the existing worklist rule. Overdue is a subset of actionable pending/draft tasks whose deadline or target is before the current IST date. Task completion, household coverage and accepted submission counts intentionally use different denominators; the UI labels them separately. Cohort figures show active field workers, registered BWQ-eligible women and active/enrolled pregnancies.

Accepted form totals retain their existing primary-submission/current-field-worker attribution rules. Drafts, duplicates and unsynced phone work do not count as accepted forms. Draft metrics describe server backups only. CSV exports retain all response statuses and submitter roles within export scope, so their row counts can exceed accepted field-worker totals; BHQ member exports count roster members rather than forms. This dashboard never changes evidence, task scheduling, assignments or study projections.
