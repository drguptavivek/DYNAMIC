# Audit Comparison: MiMo vs GLM

**Date:** 2026-06-17  
**Purpose:** Cross-reference two independent read-only reviews of the DYNAMIC codebase to identify agreement, gaps, and priority discrepancies.

---

## Executive Summary

| Dimension | MiMo | GLM |
|-----------|------|-----|
| Total issues | 155 | ~40 (numbered) |
| Critical | 19 | 10 |
| High | 27 | 13 (HI-1–HI-13) |
| Medium | 37 | 22 (MD-1–MD-22) |
| Low | 43 | 16 (LO-1–LO-16) |
| Cosmetic/Info | 29 | — (not tracked) |
| Depth of fix guidance | Surface-level direction | Specific code paths + concrete fix strategies |

GLM is **deeper and more actionable** on the core offline-correctness and security issues. MiMo is **broader**, catching more surface-level, structural, and UI-layer problems. They are complementary rather than redundant.

---

## Issues Found by BOTH (Agreement / High Confidence)

These are the issues both agents independently identified — highest confidence they are real and important.

| Issue | MiMo ID | GLM ID | Notes |
|-------|---------|--------|-------|
| JWT secret hardcoded fallback | C-SEC-01 | CR-4 | Both agree. GLM adds `algorithms` lock-down and boot-time guard. |
| No database transactions | C-API-01, C-API-02 | CR-2 | Both agree. GLM gives specific file:line chains. |
| Corrections don't trigger rule recalculation | C-ADM-03 | CR-8 | Both agree. |
| Sync push unconditionally marks completed | H-API-08 | CR-1 (partial) | GLM goes deeper: describes the duplicate-completion double-application problem MiMo missed. |
| Children route locality_code filter bug | H-API-01 | MD-2 | Both agree on the exact bug. |
| Prefilled fields not marked readOnly | H-FORM-03, H-FORM-05 | HI-5 | Both agree. GLM adds that `applyReadOnlyFields` doesn't walk nested elements. |
| NFF fractional month truncation | M-API-12 | HI-1 | Both agree. GLM gives the exact arithmetic fix. |
| Duplicate correction tables (dead schema) | C-SCH-01, C-SCH-02 | HI-9 | Both agree. GLM adds the drizzle schema drift detail. |
| Member number not auto-increment | H-API-07 | CR-9 | Both agree. GLM frames it as a critical identity-integrity issue. |
| No rate limiting on auth | C-SEC-03 | HI-6 | Both agree. GLM adds user-enumeration concern. |
| Form responses endpoints unauthenticated | C-SEC-02 | HI-8 (partial) | Both agree. GLM frames as IDOR. |
| Pregnancy sequence hardcoded to 1 | H-API-03 | HI-10 (partial) | Both agree. |
| Sync pull shared offset | M-API-01 | MD-4 | Both agree. GLM adds the task-attempts double-offset bug. |
| Refresh tokens not rotated | M-API-07 | CR-7 (partial) | Both agree. |
| CORS hardcoded | M-API-10 | LO-6 | Both agree. |
| `strict: false` in admin tsconfig | C-ADM-06 (MiMo) / M-ADM-06 | — | MiMo found this; GLM didn't flag it explicitly. |
| Dev seed credentials | — | HI-7 | GLM found; MiMo missed this entirely. |
| VA disabled enforcement gap | — | HI-3 | Both partially found. GLM is more precise about the server+client gap. |
| Per-task-type failed-attempt limits unenforced | H-APP-05 (partial) | HI-4 | GLM found the full picture; MiMo only noted wrong outcome codes. |
| No current-due-only / no-backfill | — | HI-2 | GLM found; MiMo missed this core protocol rule. |
| `domain_events_outbox` missing `updated_at` column | — | HI-11 | GLM found; MiMo missed. |
| Two SQLite handles / prefill crash | — | HI-12 | GLM found; MiMo missed. |
| Pull sync overwrites locally-captured evidence | C-APP-04 (partial) | HI-13 | Both found the destructive saveHousehold pattern. GLM adds the ON CONFLICT overwrite detail. |

---

## Issues UNIQUE to MiMo (Not in GLM)

MiMo caught these categories that GLM did not:

### SurveyJS Form Corruption (14 issues)
GLM did **not** review the form JSONs at all. MiMo found critical extraction bugs:
- C-FORM-01 through C-FORM-09: Corrupted choice texts, duplicate values, split questions
- H-FORM-01: No visibleIf skip logic
- H-FORM-02: Placeholder facility lists
- H-FORM-04, H-FORM-05: Wrong sourceType, missing readOnly
- M-FORM-01 through M-FORM-05: Label contamination, date format inconsistency

**These are real and field-breaking.** GLM's review was code-only; the form JSONs are the data-capture layer and need separate attention.

### Admin App UI Layer (10 issues)
- C-ADM-01: No error boundaries
- C-ADM-02: Auth token never refreshed on frontend
- H-ADM-01 through H-ADM-07: Stub pages (Tasks, DQ, Sync, Dashboard), dead buttons, no correction UI
- M-ADM-01 through M-ADM-06: Hardcoded values, no validation library, no response shape validation

GLM noted the correction backend gap (CR-8) but didn't review the admin frontend at all.

### Repo/Architecture Issues (15 issues)
- C-SCH-04: ESM/CJS mismatch in shared packages
- C-SCH-05: Zod schema type mismatches with DB
- M-ARCH-01 through M-ARCH-08: Naming divergences, stale spec paths, Redis debt, React overrides, hardcoded study dates
- L-STR-01 through L-STR-08: .js routing files, test runner chain, missing README, iOS platform

### Expo App Architecture (8 issues)
- C-APP-01: Task schema missing ~15 columns
- C-APP-02: Shared workflow rules not consumed by Expo
- C-APP-05: Missing response_status column
- H-APP-01 through H-APP-04: No detail screens, no visit screen, single worklist
- M-APP-01 through M-APP-08: VAF vs VA naming, window_end vs deadline_date, no autosave, no visit model

### Backend API (8 issues)
- H-API-04: Missing attempted_by_user_id
- H-API-05: Pushed domain events never consumed
- H-API-06: BAF subject_type wrong
- M-API-02 through M-API-12: N+1 queries, missing indexes, redundant fetches, no updated_at enforcement, filesystem reads on every request

---

## Issues UNIQUE to GLM (Not in MiMo)

GLM caught these that MiMo completely missed:

### Critical Protocol Violations
| GLM ID | Issue | Severity |
|--------|-------|----------|
| CR-1 | Duplicate task completions silently dropped/double-applied — the core duplicate rule | CRITICAL |
| CR-3 | **Area-scope enforcement missing on sync pull/push** — cross-site PII exposure | CRITICAL |
| CR-5 | Read-then-write TOCTOU race under concurrent push | CRITICAL |
| CR-6 | `task_key`-based status flip is write-anything, scope-less | CRITICAL |
| CR-7 | No session/token revocation; logout is a no-op | CRITICAL |
| CR-10 | Non-deterministic ID/date generation breaks offline determinism | CRITICAL |
| HI-2 | No "current due task only" — whole series emitted up front | HIGH |
| HI-7 | Dev seed creates central_admin with published password | HIGH |
| HI-8 | IDOR / missing scope on admin & user routes | HIGH |
| HI-11 | domain_events_outbox UPDATE references non-existent column | HIGH |
| HI-12 | Two SQLite handles; sync handle never creates household tables | HIGH |
| HI-13 | Pull sync overwrites locally-captured immutable evidence | HIGH |

### Deep Protocol Logic
| GLM ID | Issue |
|--------|-------|
| MD-1 | `toISODate` uses local getters vs UTC mismatch |
| MD-7 | `promotePof` bundles miscarriages with stillbirths |
| MD-8 | HHQ member upsert overwrites with different person's data |
| MD-9 | `woman_permanent_id` always null; prefill exposes mutable ID |
| MD-10 | `usual_resident` hardcoded true; visitor rule not enforced |
| MD-11 | In-migration/married-in events defined but never handled |
| MD-12 | Corrections allow editing household_number/locality_code without rebuilding household_id |
| MD-13 | ID-part normalization inconsistent (padStart, case) |
| MD-14 | Two DOB-inference paths disagree |
| MD-16 | `promoteNff` passes subject_id as protocolVisitLabel |
| MD-17 | `parseHouseholdId` silently becomes 0 for non-numeric site codes |
| MD-18 | No sync mutex / backoff on device |
| MD-20 | eventOutbox JSON.parse unconditional — one bad row blocks all sync |
| MD-21 | Manual BEGIN/COMMIT strings instead of withTransactionSync |
| MD-22 | ALTER TABLE swallows all errors |

---

## Depth Comparison

### Security
| Aspect | MiMo | GLM |
|--------|------|-----|
| JWT secret | Found (C-SEC-01) | Found + adds `algorithms` lock (CR-4) |
| Unauthenticated endpoints | Found (C-SEC-02) | Found + frames as IDOR (HI-8) + adds user enumeration |
| Rate limiting | Found (C-SEC-03) | Found + adds user enumeration concern (HI-6) |
| Body size limit | Found (C-SEC-04) | Not flagged |
| Admin role guards | Found (C-SEC-05) | Not flagged |
| Token revocation | Not flagged | Found (CR-7) |
| Dev seed backdoor | Not flagged | Found (HI-7) |
| Area-scope enforcement | Not flagged | **Found — CR-3 — the single largest security issue** |

**GLM wins on security depth.** The area-scope enforcement gap (CR-3) is the most critical finding in either review and MiMo missed it entirely.

### Offline Correctness
| Aspect | MiMo | GLM |
|--------|------|-----|
| Duplicate completion handling | Partial (C-APP-03) | Deep (CR-1) — describes double-application |
| No transactions | Found (C-API-01) | Found (CR-2) — more precise |
| TOCTOU races | Not flagged | Found (CR-5) |
| Non-deterministic IDs | Partial (H-APP-06) | Deep (CR-10) — covers server + device |
| Current-due-only / no-backfill | Not flagged | Found (HI-2) |
| Failed-attempt limits | Not flagged | Found (HI-4) — full picture |
| VA disabled lock | Partial (H-APP-05) | Found (HI-3) — server + client |

**GLM wins decisively on offline correctness.** This is the core of the study design and GLM went much deeper.

### Forms / Data Capture
| Aspect | MiMo | GLM |
|--------|------|-----|
| Corrupted extraction choices | Found (14 issues) | Not reviewed |
| Skip logic missing | Found (H-FORM-01) | Not reviewed |
| Prefill readOnly | Found (H-FORM-03) | Found (HI-5) — deeper |
| Placeholder facility lists | Found (H-FORM-02) | Not reviewed |

**MiMo wins on form JSON review** — GLM didn't touch this layer.

### Admin App
| Aspect | MiMo | GLM |
|--------|------|-----|
| Stub pages | Found (7 issues) | Not reviewed |
| No correction UI | Found (H-ADM-05) | Found backend gap (CR-8) |
| No error boundaries | Found (C-ADM-01) | Not flagged |
| tsconfig strict:false | Found (M-ADM-06) | Not flagged |

**MiMo wins on admin app review** — GLM focused on backend.

---

## Key Disagreements / Corrections

### 1. "No transactions anywhere" — Both correct, but GLM is more precise
MiMo says "no database transactions anywhere" (C-API-01). GLM says the same (CR-2) but pinpoints the exact failure modes and the incomplete rollback in the catch block. Both are right; GLM's description is more actionable.

### 2. Children route filter bug
Both independently found the same bug (`eq(children.household_id, locality_code)`). High confidence this is real.

### 3. Sync push "completed" status
MiMo frames it as "bypassing attempt lifecycle" (H-API-08). GLM frames it as "duplicate completions silently dropped / double-applied" (CR-1). Both are correct; GLM's framing is more impactful because it describes the data-corruption consequence.

### 4. Area-scope enforcement
**GLM found this; MiMo did not.** This is the single biggest gap between the two reviews. GLM's CR-3 describes how any field_worker can request any site/locality and download the entire study's data. MiMo reviewed auth endpoints but missed the sync-pull/push scope enforcement.

### 5. Form JSON corruption
**MiMo found this; GLM did not.** GLM reviewed code but not the questionnaire JSONs. MiMo's form review found 14 critical/high issues that would make forms unusable in the field.

---

## Recommended Combined Priority

Based on both reviews, here is the merged priority:

### Tier 1 — Fix Before Any Testing (Week 1)
1. **CR-3 (GLM)**: Area-scope enforcement on sync — cross-site data exposure
2. **CR-4 (GLM)**: JWT secret boot-time guard + algorithm lock
3. **CR-1 + CR-2 + CR-5 (GLM)**: Duplicate handling + transactions + idempotent inserts
4. **CR-9 + CR-10 (GLM)**: Member number auto-increment + deterministic IDs
5. **C-SEC-04 (MiMo)**: Request body size limit
6. **C-SEC-05 (MiMo)**: Admin role-based route protection

### Tier 2 — Fix Before Field Deployment (Week 2)
7. **CR-8 + HI-3 + HI-4 + HI-5 (GLM)**: Corrections recalc, VA lock, failed-attempts, prefill readOnly
8. **CR-7 + HI-6 + HI-7 (GLM)**: Token revocation, rate limiting, dev seed gating
9. **C-FORM-01 through C-FORM-09 (MiMo)**: Fix corrupted extraction choices in form JSONs
10. **H-FORM-01 (MiMo)**: Implement skip logic as visibleIf
11. **H-FORM-03, H-FORM-05 (MiMo)**: Mark all prefilled IDs readOnly

### Tier 3 — Fix Before Enrollment (Week 3-4)
12. **HI-1 + HI-2 (GLM)**: NFF fractional months + current-due-only
13. **C-APP-01 + C-APP-02 (MiMo)**: Connect shared-workflow to Expo app; fix task schema
14. **H-ADM-01 through H-ADM-07 (MiMo)**: Wire up admin stub pages
15. **C-ADM-01 (MiMo)**: Add error boundaries to admin app
16. **M-API-02, M-API-03 (MiMo)**: Fix sync N+1 queries + add indexes

### Tier 4 — Ongoing
17. All MEDIUM and LOW issues from both reviews
18. Repo structure cleanup (MiMo L-STR-* series)
19. Admin validation library (MiMo M-ADM-02)
20. Code quality (GLM LO-*, MiMo L-* series)

---

## Conclusion

**GLM is the better review for the core study design** — offline correctness, security, sync integrity, and protocol rule enforcement. Its findings in CR-1 through CR-10 are the most consequential issues in the codebase.

**MiMo is the better review for breadth** — form JSON corruption, admin UI gaps, architecture debt, and surface-level problems across the full monorepo.

**Neither review is a superset of the other.** A production-ready audit needs both. The area-scope enforcement gap (GLM CR-3) and the form corruption issues (MiMo C-FORM-*) are the two most surprising findings that the other agent completely missed.
