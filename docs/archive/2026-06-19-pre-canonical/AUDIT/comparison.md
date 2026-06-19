# Audit Comparison — glm vs MiMo

**Date:** 2026-06-17
**Documents compared:**
- `docs/AUDIT/glm-issues.md` — glm (this audit)
- `docs/AUDIT/MiMo-issues.md` — MiMo (155 issues)

**tl;dr** The two reviews agree strongly on the security and offline-sync core (the genuinely dangerous stuff). They diverge in coverage: MiMo went **broad** — cataloguing SurveyJS form-extraction corruption, admin-app stub pages, and repo hygiene (155 items). glm went **deep** — tracing date/ID determinism, anchoring math, duplicate-pipeline semantics, and per-rule compliance, with more file:line depth on the logic bugs. The highest-value findings are the ones **both** flagged. glm found several determinism/anchoring bugs MiMo missed; MiMo caught a large body of form-JSON corruption and admin-app gaps glm never looked at.

---

## 1. Severity & count

| | Critical | High | Medium+ | Total logged |
|---|---|---|---|---|
| **glm** | 10 | 13 | 22 (med) + 16 (low) | ~60 |
| **MiMo** | 19 | 27 | 80 (med) + 43 (low) + 29 cosmetic | 155 |

MiMo's higher counts come mostly from (a) SurveyJS form-choice corruption (a class of issue glm did not review), (b) admin-app stub pages, and (c) cosmetic/repo items. On the shared surface (API security + sync + scheduling + schema) the substantive counts are comparable.

---

## 2. Findings BOTH flagged (high confidence — fix these first)

These are the highest-confidence issues because two independent reviewers hit them:

| Topic | glm | MiMo | Notes |
|---|---|---|---|
| JWT secret falls back to hard-coded default; no alg pin / fail-fast | CR-4 | C-SEC-01 | Identical root cause (`jwt.ts:11`). |
| No transactions around sync push / promotion chains → partial failure, orphans | CR-2 | C-API-01, C-API-02 | Both call out `eventProcessor` + `sync.ts` push. |
| Duplicate task completions not handled (no `duplicate_task_completion`, immutable evidence dropped) | CR-1 | C-APP-03, C-APP-05 | glm flags server side + dead `data_quality_flags`; MiMo flags client (`taskRepository.js:282-289`) + missing `response_status` column. **Both halves need fixing.** |
| Corrections don't trigger eligibility/rule recalculation | CR-8 | C-ADM-03 | Same root cause. |
| `member_number` is client-supplied, no auto-increment / concurrency guard | CR-9 | H-API-07 | Same line (`hhqPromotion.ts:128`). |
| Sync push unconditionally hard-sets task `status="completed"` (bypasses attempt lifecycle, no auto-close rule) | HI-4 (client+server) | H-API-08, C-APP-03 | Both flag `sync.ts:486-491`. |
| Prefilled lineage/core fields not read-only in SurveyJS | HI-5 | H-FORM-03, H-FORM-05, M-FORM-03 | glm: `readOnly` contract has zero consumers; MiMo: editable `pef_woman_*`, `baf_*`, `wq_*` fields in JSON. |
| Dead/never-written tables: `person_attribute_history`, `pregnancy_outcomes`, `data_quality_flags` | HI-9 | C-SCH-02 | Both flag the same dead schema. |
| Dual correction tables (`admin_corrections` vs `admin_correction_events`) | HI-9 | C-SCH-01 | Both; MiMo cites `ERD.md:348` acknowledging it. |
| NFF fractional-month offset (4.5m/7.5m/10.5m) broken | HI-1 | M-API-12 | glm rates Critical (breaks determinism + wrong `task_key`); MiMo rates Medium. **glm's severity is better justified** — it corrupts the dedup key. |
| `children` locality filter compares `household_id` to `locality_code` | MD-2 | H-API-01 | Same lines (`children.ts:38-39`). Clear bug. |
| `pregnancy_sequence` hardcoded to `1` | LO- (glm under "pregnancies") | H-API-03 | Same line (`eventProcessor.ts:288`). |
| Weak/fallback UUID on device (`Math.random`) | CR-10 | H-APP-06 | Same lines; glm additionally explains *why* the fallback string is broken. |
| Sync pull shares one offset across all entity types (loses records, double-offsets attempts) | MD-4 | M-API-01 | Same mechanism. |
| Page token is unsigned base64 JSON (tamper risk) | MD-5 | L-API-01 | glm rates Medium, MiMo Low — both agree it's unsigned. |
| Refresh tokens not rotated | CR-7 | M-API-07 | glm bundles under revocation (CRITICAL); MiMo Medium. |
| No rate limiting on auth | HI-6 | C-SEC-03 | Both flag `auth.ts:25`. |
| Missing indexes on sync/lookup hot paths | HI-10 | M-API-03 | Both. |
| `window_end` vs `deadline_date` naming drift between SQLite and shared descriptor | (glm noted under MD-19/LO area implicitly) | M-APP-02 | MiMo explicit. |

**Takeaway:** ~18 independent confirmations. These are the real bugs — fix them first.

---

## 3. Unique to glm (MiMo missed)

These are the findings where glm went deeper on logic/determinism. Worth treating as real:

1. **CR-3 — Area-scope enforcement entirely missing on sync pull / pull/members / push, and `resolveRecordScope` trusts client `answers_json`.** This is the single largest data-exposure path and the most important glm-unique finding. MiMo did not flag the cross-site read/write via client-supplied `locality_codes`.
2. **CR-5 — Read-then-write idempotency (TOCTOU) under concurrent push** turns duplicates into errors → infinite client retry. MiMo noted no transactions but not the specific race-on-id.
3. **CR-6 — `task_key` task update is scope-less + write-anything** (compounds CR-3).
4. **CR-7 — Token revocation is a no-op; logout does nothing; disabling a user doesn't kill live tokens.** MiMo only caught refresh-not-rotated, not the missing revocation entirely.
5. **CR-10 (depth) — Determinism analysis: `pregnancy_id`/`child_id` use `randomUUID()` instead of `buildChildId`; `onWqCompleted` embeds `new Date()` into `task_key`; server promotion anchors PFF/CDF/NFF to wall-clock `new Date()` instead of stored dates.** MiMo caught the device UUID fallback but **not** the server-side `new Date()` anchoring or the `buildChildId` drift — these are the ones that actually break offline determinism.
6. **HI-2 — No "current due task only" / no-backfill logic anywhere** (entire future series emitted up front). MiMo did not flag this sacred-rule violation.
7. **HI-3 — VA tasks are not actually disabled: server sets `action_state:"pending"` skipping the availability translation, and `routes/tasks.ts` has no close endpoint or disabled guard at all; client lock is UI-only and bypassable via the `/questionnaires/VAF/new` route.** MiMo only noted the `"VAF"` vs `"VA"` event-name typo (M-APP-01), missing the enforcement gap.
8. **HI-8 — IDOR on `form-responses`, `GET /users/:id` (null-site bypass), `area-assignments` (no ownership), and `PATCH /users` site-id reassignment.** MiMo flagged missing `requireAuth` on form-responses/corrections (C-SEC-02) but **not** the role/scope gaps on authenticated routes.
9. **MD-1 — `toISODate` uses local getters while `parseISODate` builds UTC midnight → day-shift on non-UTC servers and device/server disagreement (breaks determinism).** MiMo flagged a related "UTC date in worklist urgency" (M-APP-08) but not the core date-roundtrip bug.
10. **MD-7 — `promotePof` counts stillbirths from a field bundling miscarriages+stillbirths** → cohort corruption.
11. **MD-10/MD-11/MD-12 — Temporary-visitor rule not enforced server-side (`usual_resident` hardcoded true); in-migration/married-in event types defined but never handled; correcting `household_number`/`locality_code` doesn't rebuild `household_id` (orphans subtree).**
12. **MD-8 — HHQ member upsert overwrites a different person's data on roster reorder** (identity from line position). MiMo noted auto-increment but not the overwrite-on-reorder consequence.
13. **HI-11/HI-12/HI-13 — Expo: `domain_events_outbox` UPDATE references missing `updated_at` column (throws every push); two SQLite handles where the sync handle never creates household tables (prefill crashes); pull overwrites locally-pending immutable households.** MiMo did not catch these runtime crashes.

---

## 4. Unique to MiMo (glm did not review)

MiMo's broad sweep found large classes glm never touched. All are legitimate and should be triaged:

### SurveyJS form-JSON corruption (glm did not review forms at all)
- **C-FORM-01…09 + H-FORM-01…05 + M-FORM-01…05 + L-FORM-01…06** — systematic PDF-to-JSON extraction bugs: question-stem text embedded in radio choices, duplicate choice values, PDF instruction text parsed as options, questions split across two JSON questions sharing one `sourceCode` (violates `Unique_Ids.md`), placeholder facility lists, missing `visibleIf` skip logic, missing VA form, empty translations, inconsistent date formats.
- This is a **whole subsystem glm didn't look at.** If forms are wrong, every captured answer is suspect — potentially the highest-impact class for a forms-driven study.

### Admin app (glm barely reviewed)
- **C-ADM-01…04** — no error boundaries; auth token never refreshed / no 401 interceptor; no downstream recalculation; **escalation workflow (SI → CI approval gates) entirely unimplemented** — any SRS makes any correction instantly.
- **H-ADM-01…07, M-ADM-01…06** — TasksPage / DataQualityPage / SyncLogsPage / Dashboard are **client-side stubs** (initialized `[]`, never fetched); no correction UI; MastersPage "Add Locality" dead button and non-functional Mapping Frame tab; hardcoded site/locality lists; no form-validation library; `strict: false` in tsconfig; no admin `.env`.

### Additional security glm missed
- **C-SEC-04** — `express.json()` with no body-size limit → OOM via huge payload.
- **C-SEC-05** — Admin SPA `ProtectedRoute` only checks `user` exists, never role → direct-URL access by `field_worker`.
- **C-SEC-06** — Auth token in plain-text SQLite on Android (should be `expo-secure-store`).
- **C-SCH-05** — Zod schemas declare `z.string()` for fields stored as DB integers (won't catch bad types).

### Other MiMo-unique
- **C-APP-01** — Expo `taskSchema` missing ~15 columns the generators produce → `saveTaskBatch` silently drops them.
- **C-APP-02 / cross-cutting** — **`shared-workflow` is completely disconnected from the Expo app** (Expo re-implements task generation inline). This is arguably the #1 architectural finding and glm under-weighted it.
- **C-APP-04** — `saveHousehold` destructive delete-then-reinsert of members (wipes in-migration members).
- **C-SCH-04 / M-ARCH-07** — `shared-context` ESM vs sibling CJS module-system mismatch; fragile `src/package.json` ESM hack.
- **M-APP-06** — No Visit/session model.
- **H-API-05** — Pushed domain events stored but never consumed.
- **H-API-06** — BAF task `subject_type: "pregnancy"` instead of `"child"`.
- **H-APP-05** — Attempt outcome codes don't match the spec enum.
- **M-API-09** — Sync-log id `Date.now()+Math.random()` not collision-safe.
- Many repo/maintenance items (Makefile typos `bacedn-*`, no root README, `Refs/pretesing` typo codified, Redis in compose unused, etc.).

---

## 5. Where they disagree

| Point | glm | MiMo | Read |
|---|---|---|---|
| NFF fractional-month severity | **Critical** (corrupts `task_key`/determinism) | Medium | glm's higher severity is justified — it breaks dedup keys, not just dates. |
| Refresh-not-rotated | Part of **CR-7** (Critical revocation gap) | Medium (M-API-07) | glm bundles it with the missing-revocation story; reasonable to call Critical as a set. |
| Token revocation entirely | **CR-7** flagged explicitly | Not flagged | glm is correct that logout is a no-op; MiMo missed it. |
| Page-token unsigned | **Medium** (MD-5) | Low (L-API-01) | Low in isolation; glm Medium because it defeats the "opaque server-issued token" contract. Either is defensible. |

No outright contradictions — the two reviews are consistent, just differently scoped/severity-weighted.

---

## 6. Recommended unified fix order (merged)

1. **Auth hardening (both):** JWT fail-fast + alg pin (CR-4/C-SEC-01); body-size limit (C-SEC-04); admin route role-guards (C-SEC-05); rate limiting (HI-6/C-SEC-03); token revocation + refresh rotation (CR-7/M-API-07); secure token storage on device (C-SEC-06).
2. **Area-scope enforcement (glm CR-3):** gate sync pull/push/members by `userAreaAssignments`; resolve scope from server-stored locality, not client answers. Largest data-exposure path and glm-unique.
3. **Offline-correctness core (both):** transactions around push/promotion (CR-2/C-API-01); idempotent `ON CONFLICT` inserts (CR-5); proper duplicate-completion pipeline + `duplicate_task_completion` + `data_quality_flags` writes + `response_status` column (CR-1/C-APP-03/05).
4. **Identity integrity (both):** server-side `member_number` auto-increment under lock (CR-9/H-API-07); deterministic IDs/dates — use `buildChildId`, drop server `new Date()` anchors, fix device UUID (CR-10/H-APP-06).
5. **Workflow rules (both + glm-deep):** corrections → eligibility recalc (CR-8/C-ADM-03) **plus escalation gates** (C-ADM-04); VA disabled-lock server-side + route guard (HI-3, glm-unique); failed-attempt/no-auto-close + close API + final-reason (HI-4); prefill read-only enforced via `model.getAllQuestions()` (HI-5/H-FORM-03); current-due/no-backfill (HI-2, glm-unique).
6. **Scheduling correctness (both):** NFF fractional months (HI-1/M-API-12); date-roundtrip UTC bug (MD-1, glm-unique).
7. **Wire `shared-workflow` into Expo (C-APP-02, MiMo cross-cutting):** stop duplicating task generation inline; this makes several glm findings moot by construction.
8. **Expo runtime crashes (glm):** outbox `updated_at` column (HI-11); household tables on sync handle (HI-12); pull freshness guard (HI-13); stop destructive member delete (C-APP-04).
9. **Form-JSON extraction cleanup (MiMo, whole class):** fix stem-in-choices, duplicate values, split questions, placeholder facility lists, missing `visibleIf`. Likely highest impact on data validity — needs its own pass.
10. **Admin app completion (MiMo):** wire stub pages to the API; build correction UI + audit viewer; implement escalation.
11. **Schema cleanup (both):** drop/merge dual correction tables; decide on `person_attribute_history` / `pregnancy_outcomes`; add unique constraints + indexes (HI-10/M-API-03); fix Zod-vs-DB type mismatches (C-SCH-05).

---

## 7. Coverage matrix

| Area | glm | MiMo | Better coverage |
|---|---|---|---|
| API auth/secrets | deep | moderate | **glm** (revocation, IDOR, scope, alg) |
| Offline sync / duplicate pipeline | deep | moderate | **glm** (transactions, TOCTOU, dedup keys) |
| Scheduling / date math / determinism | deep | shallow | **glm** (anchoring, UTC bug, current-due, NFF) |
| Domain rules (eligibility, visitors, splits, IDs) | deep | shallow | **glm** |
| Expo runtime crashes | moderate | shallow | **glm** |
| SurveyJS form JSON quality | not reviewed | deep | **MiMo** |
| Admin app completeness | not reviewed | deep | **MiMo** |
| Repo hygiene / docs / tooling | light | deep | **MiMo** |
| Expo↔shared-workflow integration | mentioned | explicit | **MiMo** (flagged as #1 arch gap) |

**Bottom line:** Use **glm** as the issue list for the *backend logic, security, and offline correctness*, and **MiMo** as the issue list for *forms, admin app, and repo health*. Treat the ~18 jointly-flagged items as the confirmed, fix-first set.
