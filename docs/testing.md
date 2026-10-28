# DYNAMIC Testing

Use the smallest relevant verification set for the files changed. This document records the detailed command order; `AGENTS.md` only points here.

## Runtime Prerequisites

- Use root Make targets for local services. Do not hand-roll Docker or port-kill commands when a Make target exists.
- The dev DB workflow uses full schema push/reset, not migration churn.
- `make db-migrate` is legacy only.

## Dev Database Order

Use this after DB/schema/runtime changes:

```bash
make db-reset-full
make db-status
make db-smoke
```

Expected smoke result includes `ok: true`, `dev-field-worker`, one assignment, bundled forms, and pulled seed task.

## Common Test Sets

Site-transfer scope and offline workflow (isolated mocks/in-memory SQLite; no live database):

```bash
npm --workspace @dynamic/api exec -- tsx --test src/lib/areaScope.test.ts src/lib/hdssRegistryScope.test.ts src/routes/users.site-transfer.test.ts
npm --workspace @dynamic/expo exec -- tsx src/tests/validateHouseholdAssignmentScope.mjs
npm --workspace @dynamic/expo exec -- tsx src/tests/validateReassignedWorkerWorkflow.mjs
node expo/src/tests/validateReassignedCacheAccess.mjs
```

Cover the same worker moving from Bareilly `1/01` to Ballabhgarh `2/39`: old allocation links must not grant access with fresh or stale JWTs, sync snapshots contain only valid current-site household IDs, and profile updates roll back completely if allocation/area writes fail. Preserve other workers' allocations and shared task/form/household records. On device, retain old unsynced evidence and drafts while hiding old-site work. Verify selected BHQ site/locality radio values for the current household, an Upcoming BHQ creating three distinct women's BWQs offline, and one pregnant BWQ creating its PEF while the other women's BWQs stay open. Questionnaire skip logic, eligibility and task-generation code remain unchanged by the scope repair.

API unit and type checks:

```bash
npm --workspace @dynamic/api test
npm --workspace @dynamic/api run typecheck
```

Event-core tests:

```bash
npm --workspace @dynamic/event-core test
npm --workspace @dynamic/event-core run typecheck
```

Expo tests:

```bash
npm --workspace expo test
```

Form language editor and shared text inventory (no database required, run from the repository root):

```bash
node apps/admin/src/tests/validateFormLanguageManagement.mjs
node --test shared/formTranslation.test.cjs
npm --workspace @dynamic/api exec -- tsx --test src/lib/formLanguage.effective.test.ts src/lib/formLanguage.test.ts
node expo/src/tests/validateCanonicalFormTranslations.mjs
```

English checks cover portal edit/save and CSV export/import, effective sync definitions/checksums, and default/en native rendering across all forms. These use isolated fixtures and do not write production translations.

BHQ translation checks include roster-summary headings/counts/columns, checklist A/B and buttons in questionnaire order, and roster notices in the separate app-messages box. The admin codebook check exports/imports/saves these rows across all forms while excluding BHQ-only text from other forms. `validateFormStartupLifecycle.mjs` exercises the actual host with translated summary/checklist/notices; `validateHhqHighestGradeEntry.mjs` checks translated grade choices, member-name interpolation and preserved numeric answers; `validateNativeValidationFocus.mjs` also checks translated section/question counters and the summary navigator label.

Final-submit checks must exercise each questionnaire's preview confirmation, cancellation without submission, one successful write, acknowledgement before navigation, and failure without a success message. Confirm popup titles, messages and buttons use the selected questionnaire language and remain editable through the form-specific admin inventory and CSV round-trip.

Run `node expo/src/tests/validateFinalSubmissionAlerts.mjs` for the shared host and all twelve form inventories across six languages. Run `node expo/src/tests/validateAppLockPolicy.mjs` for the actual ANC handler and provider lifecycle: camera capture beyond one minute, the ten-minute bound, cancellation/errors/denied permission, picker completion before and after the foreground event, the two-second settling bound, and immediate ordinary background locking. GPS permission must retain its 60-second limit. Physical Android checks must capture and cancel ANC/ultrasound images, retain the current form and answers after return, and confirm ordinary Home/return still requires PIN.

BWQ Q22b pregnancy-history confirmation is required when visible, including previously downloaded definitions without the required flag. Check blank Next/final validation, explicit agreement, correction through No, and the hidden question when no prior pregnancy history is present with `validateWomanQuestionnaireSkipLogic.mjs`.

GPS capture: run `node expo/src/tests/validateHouseholdGpsCapture.mjs`. Verify Location off fails before requesting permission, switching it off during capture stops the watch, approximate-only Android permission requests precise access, and permission/success/error/cancel/timeout/unmount paths clear timers and the permission-only app-lock exception. The actual renderer must show a busy spinner while pending and a localized settings warning when needed, preserve previous coordinates on failure and save only fresh acceptable coordinates. Physical Android checks still require Location off/on, precise permission and airplane mode outdoors; satellite acquisition time depends on the device and sky visibility.

Use the actual BHQ definition and behavior handlers for GPS regressions: Location off, retry after enabling, capture success and a late fix after consent withdrawal. Coordinate writes must emit normal answer-change events for draft tracking without a whole-survey data reload. `validateFormStartupLifecycle.mjs` must preserve the same active model, consent, GPS/mobile answers and page when equivalent user, locality, form or task-context objects refresh; a genuinely different interview must still initialize independently.

BHQ response exports must include the stored `hhq_gps_latitude` and `hhq_gps_longitude` even though the app adds these fields at runtime. Test exact saved values, valid zero coordinates, blank older responses and deduplication if the definition already includes GPS. Other questionnaires must not acquire BHQ GPS columns or borrowed coordinates. Coordinates remain in the submitted response's `answers_json`; exports do not rewrite responses or infer a location.

Form-data export controls (no database required):

```bash
node apps/admin/src/tests/validateFormDataExportPage.mjs
npm --workspace @dynamic/api exec -- tsx --test src/routes/form-responses.export.test.ts src/lib/formExportPrivacy.test.ts
```

Cover separate BHQ household/member files, one stored member per row with household/response IDs, names-only household rosters, coded and English-label modes for all forms, unknown codes and free-entry numeric values, user filtering within server area scope, and independent PIS/Non-PIS capabilities. Mask identifying data before decoding/serializing, including nested repeats, DOB/GPS, contact details, notes and staff metadata; retain household IDs and clinical values. Check current questionnaire PII keys and clinical exceptions across all twelve forms, unknown stored member fields, unchanged source answers, staff-list async races, busy/error states and legacy GPS/mobile export behavior.

For BHQ member-summary scrolling, run `node expo/src/tests/validateFormStartupLifecycle.mjs`. Check a 20-member roster on a narrow viewport: scroll to checklist A/B, continue to Section 3, and return to edit/add members. Keep the table's horizontal scrolling available.

Validation navigation: run `validateRepeatValidationFocus.mjs`, `validateNativeValidationFocus.mjs` and `validateValidationHostNavigation.mjs` through the Expo test runner. Use four repeated children/members with errors in different rows: blocked Next and invalid child Save must open the exact entry and scroll to its highlighted question, including compound fields. Correcting one error must reveal the next one without changing other answers. Check mobile, desktop and compact-pager layouts, grouped reproduction-section navigation, and failed final confirmation after preview remounts the renderer. Invalid final submissions must not create evidence or complete tasks; hidden questions and internal bookkeeping fields must not become focus targets. Empty locked fields ignored by Survey Core must not block navigation or steal focus from an editable error. An unsaved but otherwise complete child must reopen its own editor without recursively navigating into later required pages.

Baseline dwelling exclusions:

```bash
node --test shared/householdDwellingOutcome.test.cjs
npm --workspace expo exec -- tsx src/tests/validateHhqDwellingExclusion.mjs
npm --workspace @dynamic/api exec -- tsx --test src/services/hhqDwellingExclusion.test.ts src/services/hhqPromotion.test.ts src/lib/syncDependencies.test.ts
```

Check BHQ Q9 values 7/8/9/11/12, the matching Outcome and translated notices, changing the answer and restoring drafts, no tasks from stale roster answers, and exclusion after offline submission, sync and replay. Other must remain editable at Q9 while typing, reject blank/whitespace/over-120-character reasons, and copy the exact reason read-only to Outcome. Verify the supervisor notice is last, new text round-trips through BHQ translation export/import/save, and reasons persist in submitted data exports and replay. Invalid API evidence must not change household/tasks or block a later corrected response. Preserve normal enrollment, legacy Outcome 10, Q9 2/3 revisit behavior, and the pending member-summary scrolling fix.

BWQ pregnancy defaults:

```bash
node expo/src/tests/validateWqPregnancyDefaults.mjs
node expo/src/tests/validateWqAlcoholLimits.mjs
```

Check Q32 Yes automatically sets the coded No answers for Q36/Q37, including draft restoration, while normal No/unsure responses keep the existing behavior. Check Q33a's minimum of 28 days at the 27/28-day boundary for both date and relative entries, including equivalent weeks/months and translated validation text.
For pregnant, non-pregnant and unsure women, exercise actual Next navigation through health, husband background and biomarkers before Outcome even when Q38=2, plus Domestic Violence only at site 4. Cover ages 30 and 46, sterilization/menopause, fresh/restored drafts and pregnancy toggles. Q38 must show its read-only choice label without changing the eligibility code; consent stops, existing site restrictions, biomarker locks and task-generation rules must remain unchanged.
Check husband/partner Q13 at 30/31 days and Q14 at 5/6 drinks, including valid special responses, draft restoration, and translatable validator messages in the codebook.
Check respondent Q17 shows Days first, accepts 30 and rejects 31, while retaining None and Every day/almost every day and their existing skip behavior. Check Q18 shows Drinks first, accepts 5 and rejects 6, and retains its special response.

Household assignment range, page-selection and assignment refresh checks (no database required):

```bash
node --test shared/householdAssignmentRange.test.cjs
node apps/admin/src/tests/validateHouseholdAssignmentPage.mjs
npm --workspace @dynamic/api exec -- tsx --test src/routes/field-worker-household-assignments.scope.test.ts
```

Assignment checks cover refreshed worker chips, clearing completed selections, preserving the selected site/locality/search and page, and retrying failed writes or refreshes. Worker-picker checks cover duplicate names, usernames, active localities, metadata failures, and preserving selections while searching. Verify table scroll, visibility of the last assigned household, and worker-picker sizing in a browser.

Site Data Manager allocation checks must cover the navigation link, a pinned site, active permitted localities and own-site field workers, including a newly added site ID. Test empty/expired locality permissions and forged cross-site/locality requests on list, assign and clear; mixed invalid batches must fail before any write. Preserve existing Central Admin and Site Research Scientist behavior, allocation refresh/filter state and task-generation logic. User-account and study-master administration are separate permissions.

The assignment worker filter must count persisted assignments across the entire selected site/locality, including households beyond page one and outside the current range/search. Include locality workers with zero households and any existing household owners. Verify filtering before pagination, empty results for zero assignments, refreshed counts after assignment/removal, and worker-scoped bulk selection without selecting hidden workers' households. Changing the worker clears selection; changing site/locality resets the worker filter.

Check assignment-table density inside the real admin layout and global CSS, including the sidebar, top bar and content padding. At the 1920×880 desktop viewport, at least ten complete ordinary household rows must be visible without scrolling the table. Larger screens must expand the table and show more rows; ten is not a cap. Keep readable text, usable controls, sticky headers and responsive small-screen scrolling.

Operational dashboard checks (no database required):

```bash
npm --workspace @dynamic/api exec -- tsx --test src/lib/operationsDashboard.test.ts src/routes/dashboard.test.ts
node apps/admin/src/tests/validateOperationsDashboard.mjs
```

Users page filters (no database required):

```bash
node apps/admin/src/tests/validateUsersPage.mjs
```

`operationsDashboard.postgres.test.ts` additionally executes the actual grouped SQL against temporary fixture tables on a single connection. It runs only when `DASHBOARD_TEST_DATABASE_URL` points to a local PostgreSQL instance, rolls its temporary fixtures back, and must have one assigned test owner. Never point it at AWS. No reset, schema push or application seed is needed.

HHQ backend integration on full-push test DB:

```bash
npm --workspace @dynamic/api run db:test:push
TEST_DATABASE_URL=postgresql://dynamic:dynamic_dev_password@localhost:55432/dynamic_test JWT_SECRET=test_jwt_secret JWT_REFRESH_SECRET=test_refresh_secret npx tsx --test apps/api/src/hhq-offline-sync.e2e.integration.ts
```

## When To Run What

- API-only service/lib changes: API unit tests and API typecheck.
- `packages/event-core` changes: event-core tests/typecheck plus affected API/Expo tests.
- Form-submission trigger changes: event-core tests/typecheck, API tests/typecheck, and Expo tests. These changes must preserve backend/Expo parity and offline submit with zero network calls.
- Expo local workflow or questionnaire behavior changes: `npm --workspace expo test`.
- Sync, HHQ ingest/replay, or DB shape changes: dev DB order plus HHQ backend integration.
- UI-affecting changes: run the relevant tests and verify in the browser/app path.

For participant draft isolation, run `validateQuestionnaireDraftWorkflow.mjs`, `validateQuestionnaireDraftRepositoryNative.mjs`, `validateQuestionnaireSubmissionWorkflow.mjs` and `validateFormResponseTaskProvenance.mjs` through the Expo test runner. Use several eligible women in the same household: distinct IDs/tasks/drafts, correct preferred-draft ownership, independent save/resume and sync, and submission of only one woman leaving the others open. Preserve a legacy draft with conflicting participant IDs without restoring its answers into another woman's form.
Run `node expo/src/tests/validateWorklistPersonIds.mjs` for the actual worklist card. Show separately labelled individual and household IDs for woman tasks; never present a pregnancy ID or a child's mother's ID as the task's individual ID. On narrow screens, retain the full distinguishing member suffix instead of truncating it.

## Known DB Push Constraint

`drizzle-kit push` using the config barrel can report success while creating no tables in this repo. Use explicit schema files and URL.

Working shape:

```bash
drizzle-kit push --dialect postgresql --schema './src/db/schema/*.ts' --url "<DATABASE_URL>"
```

Do not use:

```bash
DATABASE_URL=... command --url "$DATABASE_URL"
```

The shell expands `$DATABASE_URL` before the one-command assignment is available. Use a literal Makefile URL or `sh -c` after setting `DATABASE_URL`.

## Embedded Android APK Packaging

For a JS-only APK update, use `python expo/scripts/repackageAndroidApk.py <intact-source.apk> <index.android.bundle> <unsigned-output.apk>`, then align and sign the output with the existing release certificate. The script removes only old signature entries and preserves native resources, including `META-INF/services` and Kotlin module metadata. Never remove the entire `META-INF` directory: Kotlin image-picker initialization needs its `BuiltInsLoader` service entry. A source missing that entry is rejected before the output is changed.

Run `python expo/scripts/test_repackageAndroidApk.py` for the packaging regression check. Before publishing, verify the signed APK still contains `META-INF/services/kotlin.reflect.jvm.internal.impl.builtins.BuiltInsLoader`, then verify Camera and Gallery on Android; HTTP upload tests do not exercise native image capture.
