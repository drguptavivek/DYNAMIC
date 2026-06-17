# DYNAMIC Code Audit — Issues & Gotchas

**Date:** 2026-06-17
**Reviewer:** glm (read-only review, no code edits)
**Scope:** `apps/api`, `apps/admin`, `packages/shared-*`, `expo-prototype`, schema/migrations, secrets/repo hygiene.
**Method:** Five parallel deep-dive passes (sync/task-writer, workflow scheduling, security/auth, domain rules/schema/ids, Expo app). Findings below are deduplicated and prioritized.

Each item cites `file:line`, the violated rule (where one exists — most come from `AGENTS.md` or `docs/superpowers/specs/2026-06-03-dynamic-fullstack-offline-architecture-design.md`), impact, and a fix direction. Severity is reviewer judgement.

> **Bottom line:** The headline offline-correctness guarantees the spec builds around — duplicate-completion handling, area-scoped sync, per-task-type failed-attempt limits, VA-task disabled-lock, and prefill read-only enforcement — are **largely unimplemented** across both the API and the Expo app. On top of that there is a critical auth-secret default and a cross-site data-exposure path. Several are quick fixes; a few are architectural.

---

## CRITICAL

### CR-1 · Duplicate task completions are silently dropped / double-applied (violates the core duplicate rule)
**Files:** `apps/api/src/routes/sync.ts:441-451, 485-491`
**Rule:** AGENTS.md — "Offline duplicate task completions must be accepted as immutable evidence. First synced valid completion closes the task operationally; later completions are marked duplicate and create admin data-quality flags."

The duplicate check matches only on `response_id` (the client's own upload id). A *second device* completing the same `task_id` has a different `response_id`, sails past the check, is inserted as `response_status: "primary"`, and then `processFormResponse` re-promotes the entire domain state (household/women/pregnancy/children upserts + new tasks) **a second time**. No `duplicate_task_completion` status is ever set. The `data_quality_flags` table exists (`db/schema/sync-auth.ts:69`) but is **never written** anywhere in the push flow. The task is unconditionally re-set to `completed` at `:486-491` with no terminal-state check.

**Impact:** Two field workers offline completing the same PEF/POF/BAF produce double-counted children, double-scheduled follow-ups, and lost evidence — directly undermining study validity.
**Fix:** Before insert, look up the task by `task_id`; if already terminal, insert the response as `duplicate_task_completion`, skip promotion, and insert a `data_quality_flags` row. Make the task-completion update conditional. Dedup key for task-bound completions should be `(task_id, form_code)`, not `response_id`.

---

### CR-2 · No transaction boundary around push processing / promotion chains
**Files:** `apps/api/src/routes/sync.ts:421-601`; `apps/api/src/services/eventProcessor.ts` (e.g. `promoteHhq` ~`:92-209`); `apps/api/src/services/taskWriter.ts:13-54`

Each form response triggers a multi-statement sequence (insert `form_responses` → `processFormResponse` → many unbatched upserts → update `followUpTasks` status), **none** wrapped in `db.transaction(...)`. Zero `transaction` references in `sync.ts`/`eventProcessor.ts`/`taskWriter.ts`.

The route's recovery on promotion error deletes the form response (`:479-483`) but does **not** roll back side effects already committed by `processFormResponse` before the throw (household/member/pregnancy/child upserts, generated tasks persist). `writeTasksFromDescriptors` inserts descriptors one-by-one with `onConflictDoNothing`; a mid-loop failure leaves a partial task set.

**Impact:** Any failure mid-promotion leaves permanently inconsistent backend state that the duplicate-detection can't recover.
**Fix:** Wrap each record (and ideally each promotion chain) in a single `db.transaction`. Use `INSERT ... ON CONFLICT DO NOTHING` + `returning()` / rowCount to decide primary-vs-duplicate, eliminating the read-then-write race (also CR-3/CR-5).

---

### CR-3 · Area-scope enforcement is missing on sync pull, pull/members, and push (cross-site exposure)
**Files:** `apps/api/src/middleware/auth.ts:19-41`; `apps/api/src/routes/sync.ts:125-176` (pull), `:374-402` (pull/members), `:408-494` (push), `:57-73` (`resolveRecordScope`)
**Rule:** AGENTS.md — "The Android app must support area-scoped offline search/sync by assigned village/colony/locality, not per-household assignment."

`/sync/pull` only requires `requireAuth` and trusts **client-supplied** `site_id` / `locality_codes` query params, never consulting the caller's `userAreaAssignments`. A `field_worker` can request any site/locality and download every household, member, woman, pregnancy, child, and task in the study. `/sync/pull/members` takes client-supplied `household_ids` with zero scope filtering. `/sync/push` never validates that the record's `site_id`/`locality_code`/`household_id` belongs to the caller. `resolveRecordScope` derives scope from the record body / `answers_json` (fully client-controlled), so a worker can embed a different scope in `answers_json` to file a record under a locality they don't own. `userAreaAssignments` is read only by `/users/me`.

**Impact:** Cross-site PII/PHI exfiltration via pull; arbitrary data injection across the whole study via push. The single largest issue.
**Fix:** In `requireAuth` (or a new `requireAreaScope` middleware), load the caller's active `userAreaAssignments` and intersect requested/record scope against them. Resolve scope from the household's **server-stored** `locality_code`, never from client answers.

---

### CR-4 · JWT secret falls back to a hard-coded public default; no algorithm lock-down
**Files:** `apps/api/src/lib/jwt.ts:11, 26`
```ts
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-key-change-in-production";
// verifyToken: jwt.verify(token, JWT_SECRET)  // no algorithms option
```

If `JWT_SECRET` is unset, the API silently signs/verifies with a public constant — anyone with the source can forge any token (any `sub`, `role: central_admin`). No boot-time guard. `jwt.verify` is called without an `algorithms` allowlist, leaving it open to `alg: none` / key-confusion depending on version.

**Impact:** Full auth bypass / privilege escalation on any env where the var is defaulted.
**Fix:** Refuse to boot when `NODE_ENV !== "development"` and `JWT_SECRET` is unset/<32 bytes; pass `{ algorithms: ["HS256"] }` to `jwt.verify`; rotate any key deployed under the default.

---

### CR-5 · Read-then-write idempotency is racy (TOCTOU) under concurrent push
**Files:** `apps/api/src/routes/sync.ts:442-451` (form_response), `:504-513` (task_attempt), `:537-546` (domain_event)

Every duplicate check is `SELECT … WHERE id = ?` then `INSERT`. Two concurrent pushes (retry storm, two devices, flaky-upload retry) can both read "not existing" and both proceed. Unique PKs exist so the second insert throws, but the throw is caught by the per-record catch (`:595-600`) and turned into a generic per-record **error** rather than recognized as a duplicate — so retried uploads get `error` instead of `duplicate`, the client retries forever, and `conflicts_detected` in the sync log is wrong.

**Fix:** Use `INSERT … ON CONFLICT (pk) DO NOTHING` and branch on returned rowCount. Drop the pre-check SELECT.

---

### CR-6 · `task_key`-based task update is a write-anything, scope-less status flip
**Files:** `apps/api/src/routes/sync.ts:571-588`

```ts
await db.update(schema.followUpTasks).set({ status, updated_at: … })
  .where(eq(schema.followUpTasks.task_key, task_key));
```

No auth scope check (compounds CR-3), no validation that `status` is a legal value or transition, no "already terminal ⇒ duplicate" handling. Any authenticated worker can flip any task's status by `task_key`, and two devices pushing `status:"completed"` both succeed with no first-wins / duplicate record.

**Fix:** Validate caller scope over the task's locality; only allow legal transitions; detect terminal state and return duplicate rather than overwriting.

---

### CR-7 · No session/token revocation; logout is a no-op; refresh token never rotates
**Files:** `apps/api/src/routes/auth.ts:149-155` (logout), `:86-147` (refresh); `apps/api/src/lib/jwt.ts:14,20`

`/auth/logout` returns success but does nothing ("blacklist out of scope"). Access tokens live 2 days, refresh 30 days, with no server-side blacklist or `jti` check. Disabling a user (`active=false`) does not revoke an outstanding access token until expiry. Refresh does not rotate the refresh token — one is reusable forever.

**Impact:** Stolen tokens remain valid for weeks after password reset / account disable.
**Fix:** Add a token-version / `jti` blacklist checked in `requireAuth`; rotate refresh tokens on `/refresh`; shorten access-token lifetime.

---

### CR-8 · Corrections route does NOT trigger eligibility rule recalculation
**Files:** `apps/api/src/routes/corrections.ts:64-78` (household), `:155-173` (member)
**Rule:** AGENTS.md — "Site Research Scientists make allowed core corrections in the Vite admin app with audit history **and immediate rule recalculation**."

When an admin corrects a core field (`sex`, `date_of_birth`, `marital_status`, `relationship_to_head`, `household_number`, `locality_code`), the row is updated and an audit row written, but nothing recomputes `household_members.woman_questionnaire_eligible`, the `eligible_women` table, or `eligibility_assessments`. Correcting a DOB/sex that flips WQ eligibility leaves stale (or missing) `eligible_women` rows, silently corrupting downstream pregnancy tracking and tasks.

**Fix:** After the member update, re-run eligibility for that `household_member_id` and upsert/delete `eligible_women`; re-derive `household_member_id`/`household_id` when `locality_code`/`household_number`/`member_number` change.

---

### CR-9 · `member_number` is client-supplied, not server auto-increment
**Files:** `apps/api/src/services/hhqPromotion.ts:128, 134`
**Rule:** AGENTS.md — "Household member number is read-only auto-increment within the household listing."

`memberNumber = Number(member.member_line_number || index + 1)` is taken straight from the form, then used to build `household_member_id`. No server-side counter, no `max(member_number)+1`, no DB lock. Two concurrent HHQ pushes (or a re-push with a reordered roster) collide on `household_members_household_id_member_number_unique` or silently renumber members — breaking identity linkage and re-derivation.

**Fix:** Server computes `member_number` from the current max in the household under a transaction/lock; ignore `member_line_number` for ID construction.

---

### CR-10 · Non-deterministic ID/date generation on device and server breaks offline determinism
**Files:**
- `apps/api/src/services/eventProcessor.ts:280` (`pregnancy_id = randomUUID()`), `:423-459` (`child_id = randomUUID()`, separate random `birth_id`) — contradicts deterministic `buildChildId({ pregnancy_id, birth_rank })` in `packages/shared-domain/src/ids.ts:38-40`.
- `packages/shared-workflow/src/task-generators.ts:225, 237-240` — `onWqCompleted` uses `new Date()` (today) for PEF anchor/window/target/deadline and embeds it in `task_key`; re-running on device vs server on different days yields **different task_keys** so `onConflictDoNothing` won't dedupe → duplicate PEF tasks.
- `apps/api/src/services/eventProcessor.ts:290, 337, 565, 577` — server promotion uses `new Date()` for anchors that should be fixed/stored: `promoteWq` sets `detected_date = today` (not the WQ interview date); `promotePef` sets `enrollment_date = today` and feeds it into PFF scheduling (PFF must anchor to PEF completion date); `promoteNff`/`promoteCdf` default `death_date = today`.
- Expo side: `expo-prototype/src/modules/events/eventOutbox.js:14` builds event IDs as `${eventType}-${new Date().toISOString()}` (ms resolution → same-ms collisions) and `expo-prototype/src/modules/questionnaires/questionnaireSubmissionRepository.js:54-65` falls back to a **broken** `Math.random`-based UUID when `crypto.randomUUID` is missing (only randomizes literal `0/1/8` chars; on Hermes the fallback is live).

**Rule:** AGENTS.md — "The Android app may generate deterministic scheduled tasks…" (and determinism is the basis for `task_key` dedup).
**Impact:** Re-processing a duplicate sync creates second child/pregnancy rows; offline- and server-generated tasks don't share keys → duplicate tasks on sync; VA/NFF/CDF anchored to wall-clock instead of event date.
**Fix:** Use `buildChildId`/deterministic IDs everywhere; thread the form-response date through every `on*` generator call (never `new Date()`); use a real UUID polyfill (`expo-crypto`/`uuid`) on device, never `Math.random`.

---

## HIGH

### HI-1 · Fractional-month NFF offsets (`4.5m, 7.5m, 10.5m`) produce wrong dates
**Files:** `packages/shared-workflow/src/schedule-rules.ts:6-33, 162-175`
**Rule:** AGENTS.md — NFF cadence explicitly lists `4.5m, 7.5m, 10.5m`.

`addCalendarMonths` does `month = d.getMonth() + 4.5`, then integer-normalizes via `while (month > 11) month -= 12`, then passes a **fractional** month index to `setFullYear`/`new Date(year, month+1, 0)`. Result: three of twelve NFF visit anchors get garbage dates, and the `task_key` (which embeds `target_date`) is wrong — breaking determinism. The fixed-label *sequence* matches the spec exactly (verified); only the arithmetic for the three half-month labels is broken.

**Fix:** Add `floor(months)` calendar months then `+15` days (or `months * 30.4375` days). Never feed fractional values to `Date` setters.

---

### HI-2 · No "current due task only" / no-backfill logic — whole series emitted up front
**Files:** `packages/shared-workflow/src/task-generators.ts:112-143` (HRF), `:331-366` (PFF), `:511-546` (NFF)
**Rule:** AGENTS.md — "Repeated scheduled series use the current due task only. Do not backfill missed HRF, PFF, or NFF rounds as if they happened on time."

Generators emit the **entire future series** in one shot. No gating to "current due," no missed-round suppression, no `missed`/`superseded` state anywhere. The worklist gets a wall of future-dated tasks with no notion of "only the current one is actionable."

**Fix:** At generation or worklist-fetch time, mark only the earliest round within `[window_start, deadline]` (or the next upcoming) actionable; flag prior uncompleted rounds `missed`/`superseded` rather than leaving them `planned`.

---

### HI-3 · VA tasks are not actually disabled (server) and the lock is UI-only (client)
**Files (server):** `packages/shared-workflow/src/task-generators.ts:637, 731` (VA descriptors hardcode `action_state: "pending"` while every other path derives it from availability); `apps/api/src/routes/tasks.ts` (no PATCH/close endpoint, no disabled check anywhere).
**Files (client):** `expo-prototype/src/modules/worklist/TaskDetailModal.js:86` and `WorklistScreen.js:130-139` (lock is UI-only); `expo-prototype/src/shell/QuestionnaireRouteScreen.js` (the `/questionnaires/VAF/new` route is directly addressable with no `form_availability` check).
**Rule:** AGENTS.md — "VA tasks must be visible but disabled in Android worklists until the JSON exists; field users must not close VA tasks while disabled."

`generateVaTask` returns `form_availability: "disabled"` / `disabled_reason: "va_json_pending"`, but the VA descriptors skip the `action_state` translation, and nothing server-side enforces "disabled" — `routes/tasks.ts` has no close/attempt endpoint to even attach a guard to. On the client the disabled check lives only in `handleTaskPress`/`canOpenForm`, both bypassable by navigating to the form route directly.
**Fix:** Set `action_state: "disabled"` on VA descriptors; add a server-side guard rejecting status transitions for `form_availability='disabled'`; re-check `form_availability` in `QuestionnaireRouteScreen`.

---

### HI-4 · Per-task-type failed-attempt limits and "no auto-close" are not enforced
**Files (server):** `apps/api/src/routes/tasks.ts` (only `GET /`, `GET /:id`, `GET /:id/attempts` — no attempt/close endpoint); `apps/api/src/services/taskWriter.ts`.
**Files (client):** `expo-prototype/src/modules/worklist/TaskDetailModal.js` (no close button, no max-attempts check, no final-reason picker); `expo-prototype/src/modules/tasks/taskRepository.js` (no `closeTask`/`setStatus`).
**Rule:** AGENTS.md — "Failed-attempt limits are task-type rules, not a global constant. After the configured number of failed attempts, ask the field user to close with a final reason; do not auto-close."

Schema stores `max_failed_attempts`, `failed_attempt_count`, `requires_final_close_reason`, `close_reason_options` (config), but nothing compares counts, nothing increments `failed_attempt_count` on attempt insert, nothing blocks auto-close, nothing enables the "ask for final reason" path. The rule is effectively dead data. Worse, the client **implicitly auto-closes**: `taskRepository.saveFormResponse` (`taskRepository.js:283-289`) sets `status='completed'` for any form response with a `task_id` — including drafts/duplicates — and `sync.ts:486-491` does the same server-side, hardcoding `"completed"` (outside the intended enum).
**Fix:** Add `POST /tasks/:id/attempts` and `POST /tasks/:id/close`; enforce `failed_attempt_count >= max_failed_attempts ⇒ requires_final_close_reason`, validate `closed_reason ∈ close_reason_options`, reject auto-close. Client: implement `closeTask` with attempt-limit + final-reason; only allow `open → completed`.

---

### HI-5 · Prefill "read-only" is never enforced in SurveyJS
**Files:** `packages/shared-context/src/prefill.ts` (every builder returns `readOnly: { fields: [...] }` but **zero consumers** exist outside `shared-context/src`); `expo-prototype/src/modules/questionnaires/QuestionnaireDashboard.js:140-155` (`applyReadOnlyFields`).
**Rule:** AGENTS.md — "Prefilled lineage/core fields must be read-only in SurveyJS forms."

`applyReadOnlyFields` only walks top-level `page.elements` (misses `paneldynamic.templateElements`, panels, matrices — so prefilled panel children like `member_*` stay editable) and mutates the JSON element's `readOnly` instead of the SurveyJS `Question.readOnly` (unreliable across re-renders/types). Lineage fields prefilled at runtime (not marked readOnly in JSON) rely entirely on this fragile step.
**Fix:** Walk `model.getAllQuestions()` recursively and set `question.readOnly = true` for each name in the set.

---

### HI-6 · Login has no rate limiting; user enumeration via divergent error codes
**Files:** `apps/api/src/routes/auth.ts:25-80` (login), `:86-147` (refresh); `apps/api/package.json` (no `helmet`, `express-rate-limit`, `cookie-parser`); `apps/api/src/app.ts` (none wired).

`/auth/login` and `/auth/refresh` are unthrottled — trivial brute force / credential stuffing of the `min 8` passwords. Responses distinguish `INVALID_CREDENTIALS` vs `ACCOUNT_DISABLED` (and "not found" vs "disabled" on refresh), confirming which usernames exist.
**Fix:** Add `express-rate-limit` (per-IP and per-username) on `/auth/*`; return a single generic `AUTH_FAILED` for wrong-password / unknown-user / disabled.

---

### HI-7 · Dev seed creates a `central_admin` with a published password; reachable if seed runs in non-dev
**Files:** `apps/api/src/dev/dev-seed.ts:6-16, 100-148, 208`; `apps/api/src/dev/large-field-seed.ts:222, 336`

`upsertDevSeed()` upserts `dev-central-admin`/`dev-admin-password` (role `central_admin`, `site_id null`) and `dev-field-worker`/`dev-password`, credentials committed in source. `large-field-seed.ts` calls `upsertDevSeed()` unconditionally; both files self-execute as scripts. Nothing gates them on `NODE_ENV` — if wired into a container entrypoint, release migration, or CI deploy step, the admin backdoor is live in production.
**Fix:** Hard-gate dev seeds behind `NODE_ENV === "development"` (fail loudly otherwise); never include dev-seed invocations in deploy/migrate steps.

---

### HI-8 · IDOR / missing scope on several admin & user routes
**Files:** `apps/api/src/routes/form-responses.ts:13, 84` (list/by-id: no role or site/locality scoping — any field worker can read full `answers_json` study-wide); `apps/api/src/routes/users.ts:233-278` (`GET /users/:id` only blocks `field_worker`; a `field_supervisor` or null-site user can read every user — `null !== null` bypass); `apps/api/src/routes/area-assignments.ts:15-29` (`GET /users/:userId/area-assignments` — no role/ownership check, leaks the study's geographic coverage); `apps/api/src/routes/users.ts:280-348` (`PATCH /users` — a `site_research_scientist` can set arbitrary `site_id` on same-site users, escaping site scoping, and `active:false` on peers).
**Fix:** Restrict `form-responses` to admin/site-scientist (site-scoped); add `requireRole` + strict same-site-or-self that rejects `null` site on `/users/:id`; add role/self check on area-assignments; on user PATCH, ignore `site_id` changes from site scientists and restrict role elevation to at-or-below own role.

---

### HI-9 · Schema drift: drizzle schema is missing ~10 tables the initial migration creates; dual correction tables
**Files:** `apps/api/drizzle/migrations/0000_*.sql` vs `apps/api/src/db/schema/index.ts`; `apps/api/src/routes/corrections.ts`.

Migration 0000 creates `admin_correction_events`, `person_attribute_history`, `data_quality_flags`, `users`, `devices`, `sync_logs`, `user_area_assignments`, `eligibility_assessments`, `ultrasound_records`, `pregnancy_outcomes`, `task_attempts`. The schema barrel exports only a subset, so `db.select().from(schema.syncLogs)` etc. reference properties absent from the typed barrel (latent type hole). Worse: migration 0000's `admin_correction_events` (rich design: `old_precision`/`new_precision`/`reason_code`/`site_id`) competes with migration 0001's `admin_corrections` (which the code actually writes to) — so the richer audit design and `person_attribute_history` (the audit trail the rules imply) are **dead, never written**.
**Fix:** Add the missing `pgTable` definitions; pick one correction concept; write `person_attribute_history` on member edits.

---

### HI-10 · `children`/`pregnancies` uniqueness & determinism gaps; missing indexes
**Files:** `apps/api/src/db/schema/children.ts`, migration `0000:156-176`; `apps/api/src/services/eventProcessor.ts:288` (`pregnancy_sequence` hardcoded `1`).

`child_id` is a random UUID (CR-10), and there's **no** `unique(pregnancy_id, birth_rank)` constraint, so re-processing a POF silently creates duplicate `(pregnancy_id, birth_rank)` rows. `pregnancy_sequence` is hardcoded to `1` with no `(woman_id, pregnancy_sequence)` unique constraint, so a second pregnancy for the same woman collides. No FK from `children` to `eligible_women`/`household_members`. No non-PK indexes on hot paths (`household_members.household_id`, `eligible_women.household_id`, `pregnancies.woman_id`, `children.household_id`, `follow_up_tasks.{household_id,woman_id,pregnancy_id,child_id}`, `form_responses.{household_id,visit_id}`) — every sync-pull and list route filters on these.
**Fix:** Add the unique constraints and btree indexes on FK/where columns.

---

### HI-11 · Expo: `domain_events_outbox` UPDATE references a non-existent column → outbox never marks events synced
**Files:** `expo-prototype/src/modules/tasks/taskSchema.js:88-96` (no `updated_at` column); `expo-prototype/src/modules/events/eventOutbox.js:70` (`UPDATE … SET updated_at = ?`).

On real SQLite this throws `no such column: updated_at`, propagating from `pushSync` → `markEventSynced` → rethrows → `syncAll` aborts on every push that has accepted events. Events stay `pending` forever, retried every sync, relying on server idempotency (which is itself broken — CR-1/CR-5).
**Fix:** Add the column or drop it from the UPDATE.

---

### HI-12 · Expo: two SQLite handles on one file; sync handle never creates household tables → prefill crashes on cold start
**Files:** `expo-prototype/src/modules/tasks/taskSchema.js:10-96` (creates only `follow_up_tasks`, `task_attempts`, `form_responses`, `eligible_women`, `sync_meta`, `domain_events_outbox`); `expo-prototype/src/modules/households/householdRepository.js:349-424` (async handle creates `households`, `household_members`, …); `expo-prototype/src/lib/householdSync.js:6` (`getDb` from `taskSchema` queries `households`/`household_members`); `expo-prototype/src/shell/FieldAppProvider.js:37-45`.

`initTaskDb()` runs sync and sets `taskDbReady=true` before the async household repo is ready. `householdSync` queries `households` via the sync handle, which never created them → `no such table`. The catch in `FieldAppProvider.js:104` swallows it and continues with no prefill, silently dropping read-only enforcement (HI-5).
**Fix:** Route household lookups through the async repo, or create the household tables inside `initTaskDb`.

---

### HI-13 · Expo: pull sync overwrites locally-captured immutable evidence
**Files:** `expo-prototype/src/modules/households/householdRepository.js:718-808` (`saveSyncedHouseholdsAndMembers`)
**Rule:** AGENTS.md — "client should not silently dedupe/overwrite" offline evidence.

Uses `ON CONFLICT(household_id) DO UPDATE SET …` with no freshness guard. A server pull clobbers a locally-enrolled household (consent, mobile, head name) even when the local row is newer and `sync_status='pending'`.
**Fix:** Only upsert when `excluded.updated_at > households.updated_at OR households.sync_status IN ('synced','local')`.

---

## MEDIUM

| ID | File:line | Issue |
|---|---|---|
| MD-1 | `packages/shared-workflow/src/schedule-rules.ts:47-51` vs `:57-59` | `toISODate` uses **local** getters while `parseISODate` builds a **UTC** midnight Date → round-trip loses a day on any non-UTC-aligned server TZ, and disagrees with an offline device in its local TZ (breaks determinism). Use UTC getters. |
| MD-2 | `apps/api/src/routes/children.ts:38-40` | `locality_code` filter compared against `household_id` (`eq(children.household_id, locality_code)`) — always returns nothing. Join to households or add `locality_code`. |
| MD-3 | `apps/api/src/routes/sync.ts:245-293` | When `localityCodes` empty but `siteId` set, children filtered only by `site_id` → leaks across localities within a site (compounds CR-3). Two branches also return different shapes. |
| MD-4 | `apps/api/src/routes/sync.ts:184-345` | Pull shares one `offset`/`pageSize` across all entity types; `hasMore` is OR'd; task-attempts sub-query double-applies `.offset(offset)` on top of `task_id IN (...)` → silently drops attempts on later pages. Paginate per-entity; remove the offset on attempts. |
| MD-5 | `apps/api/src/routes/sync.ts:18-28,150-159` | `pageToken` is unsigned base64 JSON (`since`/`sync_cursor`/`offset`) — client can craft `sync_cursor` into the future (breaks snapshot isolation) or replay `since`. No HMAC. Sign server-side or use opaque cursor id. |
| MD-6 | `apps/api/src/lib/syncClock.ts`; `sync.ts:470,561-564` | Clock-skew `warning` is computed but never acted on — `created_offline_at`/`event_datetime` stored unvalidated; bad device clock back/future-dates evidence; "first synced" uses server insert order, not offline order. Accept-but-flag on warning. |
| MD-7 | `apps/api/src/services/eventProcessor.ts:418-419` | `promotePof` counts stillbirths from `pof_number_miscarriages_stillbirths_*` and creates `stillbirth` child rows from that count — bundles miscarriages with stillbirths → over-creation / cohort corruption. Confirm field semantics. |
| MD-8 | `apps/api/src/services/eventProcessor.ts:130-157`; `hhqPromotion.ts:109-111` | HHQ member upsert conflict target `(household_id, member_number)` with identity derived from line position → a reordered/renumbered roster silently overwrites member N with a *different person's* data, no history, no flag. |
| MD-9 | `packages/shared-context/src/prefill.ts:116,129,142,…`; `eligible-women.ts:21` | `woman_permanent_id` is never populated (always null) yet prefill exposes it as a "permanent id" that's actually the mutable `household_member_id` — renumbering (CR-9) changes it. |
| MD-10 | `apps/api/src/services/hhqPromotion.ts:159,151-154` | `usual_resident` hardcoded `true`; `woman_questionnaire_eligible` taken straight from the form. **Temporary-visitor rule not enforced server-side** — a visitor can be rostered and enrolled as eligible. |
| MD-11 | `apps/api/src/db/schema/events.ts` / `types.ts:50-55` | In-migration / married-in / new-eligible-woman event types are defined but **never handled**. "Recalc eligibility after valid additions" rule not implemented → in-migrated eligible women silently lost. |
| MD-12 | `apps/api/src/routes/corrections.ts:65-78` | Allows editing `household_number`/`locality_code` but does **not** rebuild `household_id` (the PK) or cascade FKs → orphans the entire household subtree. Forbid these or do a transactional ID rewrite. |
| MD-13 | `apps/api/src/services/hhqPromotion.ts:8-11` | ID-part normalization inconsistent (only some parts `padStart`, no case fold) → `Lc01` vs `lc01` produce two `household_id`s / two household rows. Canonicalize in `buildHouseholdId`. |
| MD-14 | `packages/shared-domain/src/dob.ts:25,36` vs `hhqPromotion.inferDateOfBirth:113-119` | Two DOB-inference paths disagree (rule version `v1` vs `1.0`); API rolls its own instead of importing `inferDob` → deterministic guarantees from `dob.test.ts` don't cover production. Also `getFullYear()` (local) on a UTC-parsed date shifts a day in TZs behind UTC. |
| MD-15 | `apps/api/src/routes/sync.ts:596-600,617-622` | Push echoes internal exception messages (`recordError.message`, DB constraint/column names) into the client `errors[]`. Log server-side, return stable generic codes. |
| MD-16 | `apps/api/src/services/eventProcessor.ts:66-68, 526-530` | `promoteNff` passes `subject_id` (child id) as `protocolVisitLabel` (comment admits it). Currently harmless because the label is unused downstream, but latent — fix to read `task.protocol_visit_label`. |
| MD-17 | `apps/api/src/services/taskWriter.ts:5-11` | `parseHouseholdId` derives `site_id` by `parseInt(parts[0]) \|\| 0` — a non-numeric site code silently becomes `0`, poisoning worklist filters. Should throw. Also assumes locality codes contain no `-`. |
| MD-18 | Expo `syncService.js:460`, `SyncScreen.js:52` | No backoff / no sync mutex → overlapping `syncAll` runs on pull-to-refresh across screens on flaky network. Serialize with a module-level in-flight promise + backoff. |
| MD-19 | Expo `surveyNavigation.js:69` | Inserts summary section with fractional `index` (`insertAfterIndex + 0.5`) — consumers expecting integer indexes may break. |
| MD-20 | Expo `eventOutbox.js:51-54` | `JSON.parse(row.payload)` unconditional in `.map` → one corrupt row aborts the entire pending list, blocking all syncs. try/catch per row. |
| MD-21 | Expo `taskRepository.js:118,169,171` | Manual `BEGIN`/`COMMIT`/`ROLLBACK` strings instead of `db.withTransactionSync` — re-entrant calls unsafe, masked ROLLBACK errors. |
| MD-22 | Expo `taskSchema.js:98-110` | `ALTER TABLE ADD COLUMN` swallows all errors in try/catch — masks disk-full/locked as "column exists". Check `PRAGMA table_info`. |

---

## LOW

| ID | File:line | Issue |
|---|---|---|
| LO-1 | `apps/api/src/db/schema/tasks.ts:51-65` | No unique constraint on `(task_id, attempt_number)` → duplicate attempt numbers per task allowed. |
| LO-2 | `apps/api/src/routes/sync.ts:604-622` | `syncLogs` write failure folded into per-record `errors[]` as `id:"sync_log"` → inflates error count, flips `status` to `partial_success`, triggers unnecessary client retries. |
| LO-3 | `packages/shared-workflow/src/schedule-rules.ts:57-59` | `parseISODate` returns Invalid Date for malformed input → cascades `NaN` into `target_date` strings, accepted silently by `onConflictDoNothing`. No validation. |
| LO-4 | `packages/shared-workflow/src/schedule-rules.ts:82,123,187,208` | HRF/PFF/NFF loops use `>` not `>=` against `study_end` — a target exactly on study end is included (likely intended; confirm boundary with protocol owner). |
| LO-5 | `packages/shared-workflow/src/schedule-rules.ts:177,206`; `taskWriter.ts` | NFF `sequence` field computed but never persisted (`tasks.sequence_number` never populated). |
| LO-6 | `apps/api/src/app.ts:24-48` | CORS reflects matched origin with credentials but no `Vary: Origin` → CDN can cache a permissive response. Tokens are Bearer (no cookies), so low risk. |
| LO-7 | `apps/api/package.json` | No `helmet` / security headers (admin SPA served by nginx in `edge` profile). |
| LO-8 | `apps/api/src/lib/password.ts` | bcrypt cost 12, timing-safe compare — **adequate** (positive finding). |
| LO-9 | API `sql` tagged templates | All parameterized correctly; only dev `create database ${quoteIdentifier(...)}` builds a string and it's dev-only. **No SQL injection** (positive finding). |
| LO-10 | `apps/api/src/services/eventProcessor.ts:748-759` | `onChildDeath` reuses `onBirthAssessmentCompleted` with `birth_date = death_date` — works today only due to other guards; fragile. |
| LO-11 | Expo `WorklistScreen.js:22` | `BADGE_COLORS.VA` defined but code emits `VAF` → VA tasks fall through to grey default (rule says they must *stand out*). |
| LO-12 | Expo `QuestionnaireSubmissionRepository.js`; web shim | On web, submissions go to `localStorage` (`dynamic_web_sqlite_v2`) while events go to the SQLite/shim outbox → split-brain; `getPendingResponses` won't see web form_responses. |
| LO-13 | Expo `apiConfig.js:1`; `FieldAppShell.js:139-140` | Defaults to `http://localhost:3310` (cleartext, wrong host on device); login screen ships hard-coded `dev-field-worker`/`dev-password` prefilled. |
| LO-14 | Expo `TaskDetailModal.js:58` | Attempt id `${task.id}-attempt-${Date.now()}` → same-ms double-tap collides. Use a submitting ref. |
| LO-15 | Expo `components/FormSelector.js` | Generic "pick any form" component exists, unused; `validateNavigationPolicy.mjs` correctly asserts global menu disabled. Delete or guard against reintroduction. |
| LO-16 | Expo `src/tests/*.mjs` | No test covers: event-outbox idempotency, `updated_at` column presence, pull-overwrite of pending households, read-only on nested elements, VA disabled enforcement, or that prefilled field names in `prefillMapper.js` exist in the form JSON. Add regressions. |

---

## Secrets / repo hygiene (mostly positive)

- `git ls-files` shows **no** committed `.env`, key, or credential files. `.env*` is gitignored (`.gitignore:26-27`).
- Root JSON files (`cv_texts.json`, `matrix_data.json`, `llm_cache.json`) are **untracked** and gitignored (`.gitignore:14-17`) under "CV / candidate-recruiting data (PII)". The working-tree `.gitignore` modification adds `CVs/`, the three JSONs, and `*.xlsx` — a correct hardening; keep it.
- `docker-compose.yml` hard-codes `POSTGRES_PASSWORD: dynamic_dev_password` (committed). Fine as a **dev** default; ensure prod overrides it and this compose file is never used as-is in prod.
- **Caveat:** `.gitignore:27` pattern `.env.*` would also ignore `.env.example`. Add `!.env.example` exception so future example files aren't silently untracked.
- Positive: bcrypt cost 12; no SQL injection; parameterized queries throughout.

---

## Suggested fix order (impact-weighted)

1. **CR-4** (JWT default secret + alg pin) — boot-time guard + `algorithms:["HS256"]`. Quick.
2. **CR-3** (sync area-scope) — gate pull/push/members by `userAreaAssignments`. Largest data-exposure path.
3. **CR-1 + CR-2 + CR-5** (duplicate handling + transactions + idempotent inserts) — the core offline-correctness guarantee; do together.
4. **CR-9 + CR-10** (member_number auto-increment + deterministic IDs/dates) — identity integrity & offline determinism.
5. **CR-8 + HI-3 + HI-4 + HI-5** (eligibility recalc, VA disabled lock, failed-attempt/no-auto-close, prefill read-only) — the four sacred workflow rules currently unenforced.
6. **CR-7 + HI-6 + HI-7** (revocation, rate-limit, dev-seed gating).
7. **HI-1 + HI-2** (NFF fractional months + current-due/backfill).
8. **HI-8 + HI-9 + HI-10 + HI-11 + HI-12 + HI-13** (IDOR, schema drift, constraints/indexes, Expo outbox/table/sync-overwrite).
9. Mediums and lows.

---

*Generated read-only; no code was modified.*
