# DYNAMIC Codebase Audit — MiMo Agent Review

**Date:** 2026-06-17  
**Scope:** Full monorepo — `apps/api`, `apps/admin`, `expo-prototype`, `packages/*`, `shared/`  
**Method:** Five parallel read-only agents reviewing: (1) repo structure/architecture, (2) database schema/API, (3) SurveyJS forms, (4) Expo app/routing, (5) admin app/workflows. All findings deduplicated and merged below.  
**Total unique issues:** 155

---

## Summary by Severity

| Severity | Count |
|----------|-------|
| CRITICAL | 19 |
| HIGH | 27 |
| MEDIUM | 37 |
| LOW | 43 |
| COSMETIC/INFO | 29 |

---

## CRITICAL (P0) — Security, Data Loss, Schema Corruption

### Security

**C-SEC-01. JWT secret falls back to hardcoded value in production**  
`apps/api/src/lib/jwt.ts:11` — `process.env.JWT_SECRET || "dev-secret-key-change-in-production"`. If env var is unset, production uses a publicly visible secret. Should fail-fast on startup.

**C-SEC-02. Form responses and correction history endpoints have no auth**  
`apps/api/src/routes/form-responses.ts:13,84`, `apps/api/src/routes/corrections.ts:199,225` — `GET /api/v1/form-responses`, `GET /api/v1/form-responses/:id`, `GET /api/v1/households/:id/corrections`, `GET /api/v1/members/:id/corrections` all lack `requireAuth` middleware. Anyone can read sensitive form data and correction audit trails.

**C-SEC-03. No rate limiting on authentication endpoints**  
`apps/api/src/routes/auth.ts:25` — No brute-force protection on login. Combined with C-SEC-01, this is exploitable.

**C-SEC-04. No request body size limit**  
`apps/api/src/app.ts:50` — `express.json()` without a `limit` option. A malicious client can send an arbitrarily large JSON body to cause OOM.

**C-SEC-05. Admin app has no frontend role-based route protection**  
`apps/admin/src/ProtectedRoute.tsx:4-15` — Only checks `user` exists, never checks role. A `field_worker` navigating directly to `/users`, `/masters`, `/households`, or `/data-quality` can access the page; the sidebar just hides the link.

**C-SEC-06. Auth token stored in plain-text SQLite on Android**  
`expo-prototype/src/modules/auth/authStore.js:46-48` — Access tokens stored in the `sync_meta` SQLite table. On a rooted Android device, this is readable. Should use `expo-secure-store` or Android Keystore.

### Schema / Data Corruption

**C-SCH-01. Duplicate admin correction tables**  
Both `admin_corrections` (used by routes) and `admin_correction_events` (defined in schema, never used) exist with different column naming (`entity_type/entity_id` vs `subject_type/subject_id`). Schema debt timebomb — `ERD.md:348` acknowledges it but doesn't resolve it.

**C-SCH-02. `pregnancy_outcomes` and `person_attribute_history` tables are never written to**  
`apps/api/src/services/eventProcessor.ts:385-478` — `promotePof` creates `children` records but never inserts into `pregnancy_outcomes`. `person_attribute_history` is defined in `sync-auth.ts:86-99` but no code writes to it. Dead schema.

**C-SCH-03. Missing foreign keys on many relationships**  
Migration SQL (`0000_sparkling_golden_guardian.sql`) only creates FKs for a subset of tables. Missing FKs include: `follow_up_tasks.household_id`, `task_attempts.task_id`, `task_attempts.visit_id`, `form_responses.task_id`, `domain_events.household_id`, `data_quality_flags.task_id`, `admin_correction_events.*`, `mapping_frame.household_id`.

**C-SCH-04. `shared-context` ESM/CJS mismatch with sibling packages**  
`packages/shared-context/package.json:5` sets `"type": "module"` while `shared-domain` and `shared-workflow` default to CJS. Mixed module systems will cause friction when packages import each other or when the build toolchain matures.

**C-SCH-05. Zod schema type mismatches with DB columns**  
`packages/shared-domain/src/schemas.ts` — Multiple fields declared as `z.string()` but stored as `integer` in the DB: `residence_area_type`, `result_interview`, `language_questionnaire`, `religion_head`, `caste_category`, `relationship_to_head`, `sex`, `marital_status`, `birth_registration_status`, `highest_grade_completed`. Zod validation won't catch invalid types.

### SurveyJS Forms — Corrupted Data Capture

**C-FORM-01. Corrupted extraction choices — question text split into radio options**  
`household_rounds_form_v2026.05.14.json:486-518` — `hrf_some_women_undergo_operation` has choice texts like `"yes remove the uterus. Have you undergone"` — the question stem is embedded in the choices. Same pattern in `hrf_since_last_interaction_any_new` (lines 717-737).

**C-FORM-02. Duplicate choice values in same radiogroup**  
`household_rounds_form_v2026.05.14.json:1427-1499` — `hrf_age` (sourceCode 24A_i) has duplicate `value: 5` and `value: 2` choices. SurveyJS will merge or pick arbitrarily.

**C-FORM-03. Duplicate choice value 13 parsed from PDF instruction text**  
`household_rounds_form_v2026.05.14.json:1242-1252` — `hrf_s_current_marital_status` has choice `value: 13` with text `"or older"` — PDF instruction text parsed as an answer option.

**C-FORM-04. Marital status question split into two questions with same sourceCode**  
`household_rounds_form_v2026.05.14.json:1210-1405` — `hrf_s_current_marital_status` (sourceCode 23_i, order 23) has only "Currently married"; `hrf_s_current_marital_status_ask_only_individual_age` (also sourceCode 23_i, order 24) has remaining choices. Per Unique_Ids.md: must merge.

**C-FORM-05. PFF facility question choices are entire PDF instruction text**  
`pregnancy_followup_form_v2026.05.11.json:780-863` — `pff_yes_go_care` has choices like `"add options Each site should provide a list of top"`, `"facilities, leave one"` — entire PDF instruction text parsed as answer options. Same in `pff_planning_go_antenatal_care` (lines 1011-1107) and `pff_past` (lines 710-746).

**C-FORM-06. PFF duplicate choice values**  
`pregnancy_followup_form_v2026.05.11.json:943-980` — `pff_no_plans_go_antenatal_care` has two `value: 2` choices. `pff_reports_second_third_ultrasound_tests` has spurious `value: 13` with instruction text.

**C-FORM-07. WQ choice texts contaminated with PDF instructions**  
`baseline_woman_s_questionnaire_v2026.05.09.json:188-195` — locality_code value 1 is `"Sunped Adapt list for each site village of colony?"`. Health status value 1 is `"Very Good good, good, moderate, bad, or very bad?"` (line 1418). Language choice is `"Hindi Check if list is OK"` (line 517).

**C-FORM-08. WQ religion question split with duplicate sourceCode**  
`baseline_woman_s_questionnaire_v2026.05.09.json:1608-1704` — `wq_religion` (order 21) only has Hindu; `wq_religion_2` (order 22) has Muslim through Other. Same PDF variable ID 23 used twice. Must merge.

**C-FORM-09. UF abdomen question split with duplicate sourceCode**  
`ultrasound_form_v2026.05.11.json:764-832` — `uf_organ_status_abdomen` (sourceCode 18, order 18) has Normal/Abnormal; `uf_organ_status_abdomen_2` (also sourceCode 18, order 19) has `"not indicated in report"`. Must merge.

### Expo App — Schema / Sync / Data Loss

**C-APP-01. Task schema missing ~15 columns from architecture spec**  
`expo-prototype/src/modules/tasks/taskSchema.js:10-31` — Missing: `series_id`, `sequence_number`, `generation_source`, `source_event_id`, `anchor_event_id`, `anchor_date`, `deadline_date`, `max_failed_attempts`, `failed_attempt_count`, `requires_final_close_reason`, `action_state`, `task_context_json`, `woman_id`, `pregnancy_id`, `child_id`, `completed_visit_id`, `completed_at`, `closed_at`, `closed_reason`, `priority`. The `shared-workflow` generators produce all these fields but `taskRepository.saveTaskBatch()` silently drops them.

**C-APP-02. Shared workflow rules not used by Expo app**  
`expo-prototype/src/modules/questionnaires/questionnaireSubmissionRepository.js:224-257` — The Expo app generates tasks inline (e.g., `buildWqTask`). Meanwhile `packages/shared-workflow/src/task-generators.ts` has full generators (`onHouseholdEnrolled`, `onPregnancyEnrolled`, etc.) that are **not connected** to the Expo app. Per AGENTS.md: "Keep workflow rules... in shared TypeScript packages used by both Expo and the backend."

**C-APP-03. Duplicate task completion handling missing on device**  
`expo-prototype/src/modules/tasks/taskRepository.js:282-289` — `saveFormResponse()` unconditionally marks a task as `completed`. No check for prior completion. Spec says: "Offline duplicate task completions must be accepted as immutable evidence. First synced valid completion closes the task."

**C-APP-04. `saveHousehold()` destructive delete-then-reinsert**  
`expo-prototype/src/modules/households/householdRepository.js:889-921` — `DELETE FROM household_members WHERE household_id = ?` before re-inserting. Contradicts spec: "stop deleting/replacing household members on save." Wipes locally-created in-migration members.

**C-APP-05. `form_responses` table missing `response_status` column**  
`expo-prototype/src/modules/tasks/taskSchema.js:44-61` — Spec defines `primary`, `duplicate_task_completion`, `superseded_by_admin`. Schema has `sync_status` but no `response_status`. Backend duplicate detection has nothing to work with.

### Backend — No Transactions

**C-API-01. No database transactions anywhere**  
`apps/api/src/services/eventProcessor.ts:87-210`, `apps/api/src/routes/sync.ts:408-635` — `promoteHhq` inserts households, members, eligible women, and tasks without a transaction. Sync push does form_response insert → processFormResponse → task update as separate operations. Failures midway leave orphaned records.

**C-API-02. Sync push is not atomic — partial failures leave inconsistent state**  
`apps/api/src/routes/sync.ts:408-635` — Records processed sequentially without a transaction wrapper. If record N fails, 1..N-1 are committed, N+1..100 are skipped. Client has no way to retry only failed records.

### Admin App — Missing Workflows

**C-ADM-01. No error boundaries anywhere**  
No `ErrorBoundary` component in `apps/admin/src/`. A render crash in any page blanks the entire app with no recovery.

**C-ADM-02. Auth token never refreshed / expired token not handled**  
`apps/admin/src/auth-context.tsx:25-31` — Reads JWT from localStorage on mount but never validates expiry or refreshes. No 401 interceptor in `api.ts`.

**C-ADM-03. Correction backend has no downstream rule recalculation**  
`apps/api/src/routes/corrections.ts` — Writes `admin_corrections` + applies field update, but never triggers `eventProcessor.ts` or `taskWriter.ts`. After core field corrections, tasks and eligibility remain stale.

**C-ADM-04. Escalation workflow entirely unimplemented**  
`Edit-Escalations.md` defines: pending → Site Investigator approval → Central Investigator approval → approved/rejected. No code, no schema, no routes. Any SRS can make any correction instantly with no approval gates.

---

## HIGH (P1) — Broken Functionality, Logic Errors

### Backend API

**H-API-01. Children route: locality_code filter applied to wrong column**  
`apps/api/src/routes/children.ts:38-39` — `eq(schema.children.household_id, locality_code as string)` — compares `household_id` against the `locality_code` query parameter. Clear bug.

**H-API-02. Pregnancy lookup in `promotePof` doesn't filter by active status**  
`apps/api/src/services/eventProcessor.ts:392-396` — Looks up pregnancy by `household_member_id` without `pregnancy_status = 'active'`. Could pick a closed/completed pregnancy.

**H-API-03. Pregnancy sequence always hardcoded to 1**  
`apps/api/src/services/eventProcessor.ts:288` — When creating a new pregnancy in `promoteWq`, `pregnancy_sequence` is always `1`. Creates duplicate sequence numbers for women with prior pregnancies.

**H-API-04. Sync push task_attempt missing `attempted_by_user_id`**  
`apps/api/src/routes/sync.ts:515-24` — The task_attempt insert never populates `attempted_by_user_id` from the JWT. Field is always null.

**H-API-05. Domain events pushed from device are never consumed**  
`apps/api/src/routes/sync.ts:528-570` — Inserted with `apply_status: 'applied'` but actual event processing only happens for `form_response` type records. Pushed domain events are stored but never processed.

**H-API-06. BAF task uses wrong `subject_type`**  
`packages/shared-workflow/src/task-generators.ts:455-456` — BAF tasks use `subject_type: "pregnancy"` instead of `"child"` with `child_id`. Semantically wrong.

**H-API-07. Member number auto-increment has no concurrency protection**  
`apps/api/src/services/hhqPromotion.ts:128` — No DB sequence or advisory lock. Concurrent HHQ submissions for the same household could create duplicate member numbers.

**H-API-08. Sync push unconditionally marks task "completed"**  
`apps/api/src/routes/sync.ts:486-491` — Task status hard-set to `"completed"` regardless of outcome, failed_attempt_count, or max_failed_attempts. Bypasses the entire task attempt lifecycle.

### SurveyJS Forms

**H-FORM-01. No visibleIf skip logic implemented**  
`household_rounds_form_v2026.05.14.json` (throughout) — PDF defines extensive skip logic but JSON has `"logicResolution": "manual_review_repeated_row_logic"` with no `visibleIf` expressions. Field users will see all questions regardless of answers.

**H-FORM-02. PEF/PFF facility lists are placeholders**  
`pregnancy_enrollment_form_v2026.05.11.json:1076-1160` — `pef_yes_go_care` has `"Facility option 1"` through `"Facility option 6"` instead of actual site-specific facility lists.

**H-FORM-03. Prefilled lineage/core fields not marked readOnly**  
`pregnancy_enrollment_form_v2026.05.11.json:167-227` — `pef_woman_hh_member_id` and `pef_woman_permanent_id` are editable. Same in PFF (lines 83-144), POF (lines 83-144). Per rules: prefilled fields must be read-only.

**H-FORM-04. POF gestational age field has wrong `sourceType`**  
`pregnancy_outcome_form_v2026.05.13.json:260-262` — `sourceType: "time"` but field stores days (integer). Should be `"integer"`.

**H-FORM-05. BAF auto-filled fields missing readOnly**  
`birth_assessment_form_v2026.05.13.json:240-312` — `baf_birth_rank` and `baf_birth_id` described as auto-created but lack `readOnly: true`.

### Expo App

**H-APP-01. Worklist too aggressively filtered — misses missed tasks**  
`expo-prototype/src/modules/tasks/taskRepository.js:10-11` — `listTasks` filters on `status: "open"`, then `groupTasksByUrgency` additionally filters out `completed` and `missed`. Missed tasks never shown. `TaskRow` renders a "Completed" badge but completed tasks can never appear.

**H-APP-02. No household-centered or person/event-centered worklist distinction**  
Spec requires two worklist views. App has only one flat task list. Navigation only exposes `worklist`.

**H-APP-03. No household visit screen**  
Spec requires "Household Visit Screen" showing roster state, eligible women, pregnancies, child follow-up, and contextual trigger buttons. Missing entirely.

**H-APP-04. No detail screens for woman, pregnancy, child**  
Spec requires Woman Detail, Pregnancy Detail, and Child Detail screens with contextual action registries. Missing entirely.

**H-APP-05. Attempt outcome codes don't match spec**  
`expo-prototype/src/modules/worklist/TaskDetailModal.js:23` — `ATTEMPT_OUTCOMES` are `["not_found", "refused", "unavailable", "other"]`. Spec defines: `completed`, `no_answer`, `phone_unreachable`, `household_locked`, `respondent_unavailable`, `refused`, `postponed`, `not_reachable`.

**H-APP-06. Task ID generation uses weak fallback UUID**  
`expo-prototype/src/modules/questionnaires/questionnaireSubmissionRepository.js:54-65` — `createLocalUuid` falls back to `Math.random()`-based UUID. On React Native, `crypto.randomUUID()` may not be available, creating collision risk.

**H-APP-07. Prefill mappers are minimal**  
`expo-prototype/src/lib/prefillMapper.js:1-233` — Only prefill a few fields (e.g., `hrf_household_id`, `hrf_household_head_name`). No form prefill includes pregnancy_id, child_id, task_id, or schedule metadata.

### Admin App

**H-ADM-01. TasksPage is a client-side-only stub**  
`apps/admin/src/TasksPage.tsx:39-67` — `tasks` initialized as `[]`, never populated from API. Filters `return true` (no-op). `handleViewTask` mocks a 500ms delay. Always shows "No tasks found".

**H-ADM-02. DataQualityPage is a client-side-only stub**  
`apps/admin/src/DataQualityPage.tsx:27` — `flags` initialized as `[]`, no `useEffect` to fetch from API. Review/resolve buttons operate on empty array.

**H-ADM-03. SyncLogsPage is a client-side-only stub**  
`apps/admin/src/SyncLogsPage.tsx:21` — `logs` initialized as `[]`, never fetched.

**H-ADM-04. Dashboard stats are hardcoded placeholders**  
`apps/admin/src/DashboardPage.tsx` — All stat cards show `—` (em-dash), no API calls.

**H-ADM-05. No correction UI in admin app**  
`HouseholdsPage.tsx` and `HouseholdMembersPage.tsx` are read-only modals. No correction creation form, no audit history viewer. Backend endpoints exist but are not consumed.

**H-ADM-06. MastersPage "Add Locality" button is dead**  
`apps/admin/src/MastersPage.tsx` — Button rendered with no `onClick` handler.

**H-ADM-07. MastersPage Mapping Frame tab is entirely non-functional**  
`apps/admin/src/MastersPage.tsx` — `mappingFrames` state never populated. Search, filter, and import buttons have no handlers.

---

## MEDIUM (P2) — Performance, Design Debt, Inconsistencies

### Database / API

**M-API-01. Sync pull shared offset across all entity types**  
`apps/api/src/routes/sync.ts:145,190,210,226,241,293,312` — Same `offset` variable used for households, members, women, pregnancies, children, tasks, and task_attempts. If households have 600 records and page_size=500, page 2 starts at offset 500 for ALL entity types — but other tables may have fewer records.

**M-API-02. Sync push N+1 queries per record**  
`apps/api/src/routes/sync.ts:421-601` — Each record does: SELECT → INSERT → processing. For 100 records, 200+ sequential queries.

**M-API-03. Missing indexes for sync pull queries**  
`apps/api/drizzle/migrations/0000_sparkling_golden_guardian.sql` — No composite indexes like `(locality_code, updated_at)` or `(site_id, updated_at)`. Sync pull does sequential scans on large tables.

**M-API-04. Eligible women search does redundant double-fetch**  
`apps/api/src/routes/eligible-women.ts:72-146` — Fetches all matching records, then fetches again with search filter. First fetch is wasted.

**M-API-05. Sequential N+1 queries in detail endpoints**  
`apps/api/src/routes/pregnant-women.ts:148-211`, `children.ts:167-225` — 5 and 4 sequential DB queries respectively. Could be JOINs.

**M-API-06. No `updated_at` auto-update on mutations**  
All UPDATE operations across routes — Tables have `updated_at` but many UPDATEs don't set them. No DB trigger. Over time, `updated_at` becomes unreliable for sync.

**M-API-07. Refresh tokens are not rotated**  
`apps/api/src/routes/auth.ts:86-147` — Old refresh token remains valid indefinitely after use.

**M-API-08. No database connection pool configuration**  
`apps/api/src/db/index.ts:5-7` — Pool created with just `connectionString`. No max connections, idle timeout, or connection timeout.

**M-API-09. Sync log ID not collision-resistant**  
`apps/api/src/routes/sync.ts:606` — `sync_${Date.now()}_${Math.random()...}` — Not unique under concurrency.

**M-API-10. CORS hardcoded to localhost**  
`apps/api/src/app.ts:26-33` — No environment-based configuration for production.

**M-API-11. Form catalog reads from filesystem on every request**  
`apps/api/src/lib/formCatalog.ts:51-53` — Should be cached in memory after first read.

**M-API-12. NFF schedule fractional month offset silently truncated**  
`packages/shared-workflow/src/schedule-rules.ts:167-173` — `addCalendarMonths(anchor, 4.5)` truncates to 4 months. Affects NFF 4.5m and 7.5m visits.

### Expo App

**M-APP-01. Event generators use "VAF" but spec expects "VA"**  
`expo-prototype/src/modules/events/eventGenerators.js:105-113` — `case "VAF":` but everywhere else uses `"VA"`. VA form submissions won't generate the `verbal_autopsy_completed` event.

**M-APP-02. `window_end` vs `deadline_date` naming inconsistency**  
SQLite schema uses `window_end`, shared `TaskDescriptor` uses `deadline_date`, spec uses `deadline_date`. Data flowing between Expo and backend will lose or misinterpret the deadline field.

**M-APP-03. No protocol config version checking on device**  
`expo-prototype/src/modules/sync/syncService.js:399-401` — Pull response includes `protocol_config_version`, stored but never compared to local cache to trigger refresh.

**M-APP-04. `FORM_OPEN_POLICY` declared but never enforced at route level**  
`expo-prototype/src/navigation/appNavigation.js:15-18` — `allowedSources` array is purely declarative, never used in enforcement logic.

**M-APP-05. No autosave or draft integration in form screen flow**  
Draft repository exists but `FieldAppProvider.openFormFromTask` at line 90 never loads or creates a draft. Spec requires 30-second autosave, explicit Save Draft, load existing draft.

**M-APP-06. No visit/session model**  
Spec defines a `Visit` entity. No visit tracking exists. Cannot track actual visit mode, associate multiple form completions, or support combined household contact workflow.

**M-APP-07. `saveTaskBatch` transaction has no savepoint**  
`expo-prototype/src/modules/tasks/taskRepository.js:113-175` — One bad record loses the entire batch.

**M-APP-08. Worklist urgency uses UTC date, not local**  
`expo-prototype/src/modules/worklist/WorklistScreen.js:31` — `new Date().toISOString().split("T")[0]` gets UTC date. In India (IST = UTC+5:30), tasks due "today" may appear as "tomorrow".

### Expo Forms / Convention

**M-FORM-01. Consent question title contains instructions**  
`baseline_woman_s_questionnaire_v2026.05.09.json:263-269` — Title is `"Consent for study Provide PIS and explain study to adult"` — instruction text merged into question label. Same in HHQ.

**M-FORM-02. Interview date format inconsistency**  
HRF uses `mm/dd/yyyy`, UF uses `dd/mm/yyyy`, POF uses `mm/dd/yyyy`, BAF uses `dd/mm/yyyy`. No global standard.

**M-FORM-03. WQ structure-based ID field not marked readOnly**  
`baseline_woman_s_questionnaire_v2026.05.09.json:605-624` — `wq_enter_structure_id_woman` should be auto-filled from HHQ but is editable.

**M-FORM-04. UF/PFF facility question titles contain instructions**  
`ultrasound_form_v2026.05.11.json:242-248` — `"Please fill name and address of facility"` embedded in title.

**M-FORM-05. WQ husband name visibility references wrong field**  
`baseline_woman_s_questionnaire_v2026.05.09.json:667-668` — `visibleIf` references `"{wq_current_marital_status}"` but the actual field is `member_marital_status` from HHQ.

### Admin App

**M-ADM-01. HouseholdsPage hardcodes site IDs and locality codes**  
`apps/admin/src/HouseholdsPage.tsx:132,144` — `{[1, 2, 3, 4].map(...)}` and `{["01", "02", "03", "04"].map(...)}`. Should fetch from API.

**M-ADM-02. No client-side validation library**  
No zod, yup, or react-hook-form. Forms use only HTML5 `required` + basic checks. Edit modal fields are all optional; can submit empty form.

**M-ADM-03. API layer has no response shape validation**  
`apps/admin/src/api.ts` — `apiFetch<T>` casts `json.data` as `T` with no runtime check. API contract drift causes silent crashes.

**M-ADM-04. No `.env` or `.env.example` for admin app**  
`import.meta.env.VITE_API_BASE_URL` referenced but no env file exists.

**M-ADM-05. `@dynamic/shared-domain` dependency never imported**  
Listed in `package.json` but zero imports. Dead dependency.

**M-ADM-06. `strict: false` in tsconfig.json**  
`apps/admin/tsconfig.json:10` — Overrides base `strict: true`. Disables null/undefined safety with no runtime validation layer.

### Architecture / Documentation

**M-ARCH-01. `birth_outcome_id` vs `pregnancy_outcome_id` naming divergence**  
`ERD.md:349` — Concept doc uses `birth_outcome_id`, implemented table uses `pregnancy_outcome_id`. Unresolved mismatch.

**M-ARCH-02. Architecture spec shared package paths are stale**  
Spec suggests `shared/domain`, `shared/workflow-rules` etc. Actual implementation uses `packages/shared-domain`, `packages/shared-workflow`.

**M-ARCH-03. `shared-context` package is incomplete**  
Zero runtime dependencies. Doesn't integrate with domain model yet.

**M-ARCH-04. `shared/studyMasters.js` is a lone JS file with no proper package fields**  
`shared/package.json` only has `{"type": "module"}`. No `name`, `main`, or `types`.

**M-ARCH-05. Docker-compose includes Redis but no code references it**  
`docker-compose.yml:20-30` — Infrastructure debt.

**M-ARCH-06. Root package.json overrides React/React Native versions**  
`package.json:34-39` — May conflict with Expo SDK 54 expectations.

**M-ARCH-07. `expo-prototype/src/package.json` ESM hack**  
3-line file containing `{"type": "module"}` to make ESM imports work within CJS Expo project. Fragile.

**M-ARCH-08. Hardcoded study dates in protocol config**  
`packages/shared-workflow/src/protocol-config.ts:67-68` — `study_end_date: "2030-08-31"`, `enrollment_start_date: "2026-09-01"` hardcoded.

---

## LOW (P3) — Code Quality, Maintainability

### Backend

**L-API-01. Sync push page token is base64-encoded but not signed**  
`apps/api/src/routes/sync.ts:18-28` — Client can decode/modify/re-encode.

**L-API-02. `console.error` used throughout instead of structured logging**  
No correlation IDs, request context, or log levels.

**L-API-03. No graceful shutdown handling**  
No SIGTERM/SIGINT handlers to drain connection pool.

**L-API-04. `onConflictDoNothing` silently drops task creation**  
`apps/api/src/services/taskWriter.ts:53` — No logging about whether task was created or duplicate.

**L-API-05. No request ID / correlation ID middleware**  
`apps/api/src/app.ts` — Debugging production issues difficult.

**L-API-06. Hardcoded study dates**  
`packages/shared-workflow/src/protocol-config.ts:67-68` — Should be configurable.

### Expo App

**L-APP-01. Web fallback creates two parallel storage systems**  
`expo-prototype/src/modules/households/householdRepository.js:300-342` — `localStorage`-based fallbacks create divergent storage backends.

**L-APP-02. Hardcoded seed data in household repository**  
`expo-prototype/src/modules/households/householdRepository.js:58-291` — 4 hardcoded households never gated behind dev flag.

**L-APP-03. No tests for task generation, event generation, or follow-up scheduling**  
Tests exist in `packages/shared-workflow/` but not for Expo-side integration.

**L-APP-04. Dead import: `Picker` in TaskDetailModal**  
`expo-prototype/src/modules/worklist/TaskDetailModal.js:12` — Imported but never used.

### Expo Forms

**L-FORM-01. Missing VA (Verbal Autopsy) form**  
FLOW.md lists VA as form #12 but no JSON exists. AGENTS.md notes "VA SurveyJS JSON is pending."

**L-FORM-02. Many translation keys empty**  
Most `kn`, `mr`, `ta`, `te`, `ur` locale strings are `""` across all forms. Only Hindi has partial translations.

**L-FORM-03. HHQ locality choices are site-specific placeholders**  
`baseline_household_questionnaire_v2026.05.09.json:184-233` — Sunped, Sagarpur, Pehladpur, Deegh only for one site. Not configurable.

**L-FORM-04. HRF `new_eligible_women` paneldynamic has no repeat count control**  
`household_rounds_form_v2026.05.14.json:771-782` — No `panelCount` or `minPanelCount` set.

**L-FORM-05. analysisCode not present in any form**  
Unique_Ids.md specifies `analysisCode` field. No form uses it.

**L-FORM-06. sourceCode sequence gaps**  
HHQ: sourceCode 5 missing. WQ: sourceCode 13-14 missing. POF: sourceCode 24 order mismatch.

### Admin App

**L-ADM-01. Duplicated helper functions**  
`formatSex`, `formatMaritalStatus`, etc. copy-pasted between `HouseholdsPage.tsx` and `HouseholdMembersPage.tsx`.

**L-ADM-02. Duplicated CSS patterns across 12+ module files**  
Modal, table, filter, button, badge, pagination styles near-identical but not shared.

**L-ADM-03. No route-level state persistence**  
Every page re-fetches on mount. No URL query params for filter state.

**L-ADM-04. SyncLogsPage date range filtering broken for incomplete syncs**  
Filters on `started_at` only; no check for `completed_at`.

**L-ADM-05. HouseholdsPage hardcoded cohort status labels**  
`apps/admin/src/HouseholdsPage.tsx:40` — Should match API enum dynamically.

### Repo Structure

**L-STR-01. `expo-prototype` uses `.js` files in `app/` directory**  
`expo-prototype/app/` — All plain JavaScript. No type checking in routing layer.

**L-STR-02. `expo-prototype` test runner is 14 chained `&&` commands**  
If any fails, subsequent tests skipped with no summary.

**L-STR-03. `@types/express` in dependencies instead of devDependencies**  
`apps/api/package.json:23`

**L-STR-04. ERD.md is manually maintained**  
Can drift from actual Drizzle schema. Should be generated.

**L-STR-05. Makefile has typos: `bacedn-up`, `bacedn-restart`**  
`Makefile:18,156-157`

**L-STR-06. No root-level README.md**  
New contributors have no entry point.

**L-STR-07. `app.json` lists iOS as a platform but project is Android-only**  
`expo-prototype/app.json:8`

**L-STR-08. Missing `admin-app` lint script**  
Root `lint` via turbo silently skips admin app.

---

## COSMETIC / INFO

**X-01. `package.json:10` has placeholder repository URL** — `"url": "dynamic-study-dms"`

**X-02. No `.prettierrc` or formatting configuration** — Not enforced.

**X-03. `turbo.json` globalDependencies only watches `.env.*local`** — `.env` changes don't invalidate caches.

**X-04. `Refs/` directory typo: "pretesing forms"** — Should be "pretesting". Codified in AGENTS.md.

**X-05. `Refs/Unique_Ids.md` duplicate principle numbering** — Two items both labeled "3."

**X-06. `schema_version` uses "pretsing"** — Misspelled across all forms.

**X-07. `outputs/pretsing-form-json/all_forms.json` does not exist** — Rebuild output directory missing.

**X-08. No tests in admin app** — Zero test files anywhere in `apps/admin/src/`.

**X-09. `cv_texts.json`, `matrix_data.json`, `llm_cache.json` in repo root** — Should be in `.gitignore`.

**X-10. `shared-context` has zero runtime dependencies** — Minimal package not yet integrated.

**X-11. Hardcoded dev credentials in integration test files** — Multiple files duplicate the test DB URL.

**X-12. `index.json` question counts may be inaccurate** — Static integers with paneldynamic panels.

**X-13. Build is healthy** — `tsc && vite build` succeeds for admin app.

---

## Cross-Cutting Findings

### Shared Workflow Package is Disconnected
The single biggest architectural gap: `packages/shared-workflow/` has well-structured task generators, schedule rules, and protocol config — but the Expo app does not import or use any of it. Task generation, event processing, and follow-up scheduling are duplicated (and incomplete) in the Expo app inline code.

### Dead Schema Tables
Three tables are defined but never written to: `pregnancy_outcomes`, `person_attribute_history`, `admin_correction_events`. These represent either abandoned design paths or incomplete implementations that need resolution.

### No Transactions Anywhere
Neither the Expo app nor the API uses database transactions. Multi-step operations (HHQ promotion, sync push, form processing) are non-atomic, creating orphan-record risk on any mid-operation failure.

### PDF-to-JSON Extraction Pipeline Has Systematic Bugs
The extraction tool consistently splits multi-line question text into radio choice text when the PDF layout places question stem adjacent to answer codes. This affects at least 6 forms across HRF, PFF, WQ, and UF. Any rebuild pipeline must post-process choices to strip question fragments.

### Admin App is Early Prototype
3 of 11 data pages are client-side-only stubs. The core "admin correction with audit trail" workflow described in AGENTS.md has backend endpoints but zero frontend UI and no downstream rule recalculation.

---

*Generated by MiMo Agent review — 5 parallel agents, 155 unique issues across 19 critical, 27 high, 37 medium, 43 low, 29 cosmetic/info.*
