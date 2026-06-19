# Testing Patterns

**Analysis Date:** 2026-06-19

## Test Framework

**Runner:**
- API unit tests use Node's built-in test runner via `tsx --test "src/**/*.test.ts"` in `apps/api/package.json`.
- API integration tests use Node's built-in test runner via `tsx --test "src/**/*.integration.ts"` after `db:test:push` in `apps/api/package.json`.
- Shared packages use Jest with `ts-jest` in `packages/event-core/jest.config.js`, `packages/shared-domain/jest.config.js`, and `packages/shared-workflow/jest.config.js`.
- `packages/shared-context` uses Node's built-in test runner through `tsx --test src/__tests__/prefill.test.ts` in `packages/shared-context/package.json`.
- Expo prototype checks are plain Node `.mjs` validation scripts chained by `expo-prototype/package.json`.
- Config: `packages/event-core/jest.config.js`, `packages/shared-domain/jest.config.js`, `packages/shared-workflow/jest.config.js`, `apps/api/package.json`, `expo-prototype/package.json`.

**Assertion Library:**
- API and Expo tests use `node:assert/strict`: `apps/api/src/app.test.ts`, `apps/api/src/hhq-offline-sync.e2e.integration.ts`, `expo-prototype/src/tests/validateSyncWorkflow.mjs`.
- Jest packages use `expect`: `packages/shared-domain/src/__tests__/ids.test.ts`, `packages/shared-workflow/src/__tests__/schedule-rules.test.ts`, `packages/event-core/src/__tests__/index.test.ts`.
- `packages/shared-context` uses `node:assert` with `node:test`: `packages/shared-context/src/__tests__/prefill.test.ts`.

**Run Commands:**
```bash
npm test
npm --workspace @dynamic/api test
npm --workspace @dynamic/api run test:integration
npm --workspace @dynamic/api run typecheck
npm --workspace @dynamic/event-core test
npm --workspace @dynamic/event-core run typecheck
npm --workspace @dynamic/shared-domain test
npm --workspace @dynamic/shared-workflow test
npm --workspace @dynamic/shared-context test
npm --workspace expo-prototype test
```

**Database/Runtime Verification:**
```bash
make db-reset-full
make db-status
make db-smoke
```

Use the DB order from `docs/testing.md` after DB, schema, sync ingest/replay, or runtime changes. Use root Make targets from `AGENTS.md`; do not hand-roll Docker, ports, or host log files when a Make target exists.

## Test File Organization

**Location:**
- API unit tests are co-located with source files as `*.test.ts`: `apps/api/src/app.test.ts`, `apps/api/src/lib/formCatalog.test.ts`, `apps/api/src/services/hhqPromotion.test.ts`.
- API integration tests are co-located under `apps/api/src/` as `*.integration.ts`: `apps/api/src/hhq-offline-sync.e2e.integration.ts`, `apps/api/src/admin-users.integration.ts`, `apps/api/src/masters.integration.ts`, `apps/api/src/smoke.integration.ts`.
- Shared package tests live under `src/__tests__/`: `packages/event-core/src/__tests__/index.test.ts`, `packages/shared-domain/src/__tests__/dob.test.ts`, `packages/shared-workflow/src/__tests__/task-generators.test.ts`.
- Expo validation scripts live under `expo-prototype/src/tests/`: `expo-prototype/src/tests/validateQuestionnaireDraftWorkflow.mjs`, `expo-prototype/src/tests/validateSurveyNavigation.mjs`, `expo-prototype/src/tests/validateNavigationPolicy.mjs`.

**Naming:**
- Use `*.test.ts` for API and shared unit tests, matching `apps/api/package.json` and Jest `testMatch` in `packages/event-core/jest.config.js`.
- Use `*.integration.ts` for API integration tests that require the test database and HTTP server: `apps/api/src/admin-workflows.integration.ts`, `apps/api/src/hhq-offline-sync.e2e.integration.ts`.
- Use `validate*.mjs` for Expo policy and workflow validation scripts: `expo-prototype/src/tests/validateForms.mjs`, `expo-prototype/src/tests/validateSyncWorkflow.mjs`.

**Structure:**
```text
apps/api/src/
  app.test.ts
  *.integration.ts
  lib/*.test.ts
  services/*.test.ts
packages/<name>/src/__tests__/
  *.test.ts
expo-prototype/src/tests/
  validate*.mjs
```

## Test Structure

**Suite Organization:**
```typescript
// apps/api/src/app.test.ts
import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { createApp } from "./app";

test("createApp exposes health endpoint without binding a fixed port", async () => {
  const server = createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
```

```typescript
// packages/shared-workflow/src/__tests__/schedule-rules.test.ts
describe("schedule-rules", () => {
  describe("generateNffSchedule", () => {
    it("should have all 12 fixed protocol labels", () => {
      const schedules = generateNffSchedule({
        birth_date: "2026-11-01",
        study_end_date: "2035-09-01",
        rules_version: "v1",
      });
      expect(schedules[0].label).toBe("NFF-7d");
    });
  });
});
```

```javascript
// expo-prototype/src/tests/validateSyncWorkflow.mjs
import assert from "node:assert/strict";

const { collectAssignedLocalityCodes } = await import("../modules/sync/syncWorkflow.js");

assert.deepEqual(collectAssignedLocalityCodes(user, "2026-06-04"), ["101", "102"]);
console.log("Validated sync workflow helpers.");
```

**Patterns:**
- API tests that exercise HTTP create a server with `createServer(createApp())`, bind to port `0`, and always close in `finally`: `apps/api/src/app.test.ts`, `apps/api/src/admin-users.integration.ts`.
- API tests use `fetch` against the ephemeral server rather than Supertest: `apps/api/src/app.test.ts`, `apps/api/src/smoke.integration.ts`, `apps/api/src/admin-workflows.integration.ts`.
- Integration tests set `process.env.DATABASE_URL`, `JWT_SECRET`, and `JWT_REFRESH_SECRET` inside the test before dynamic imports: `apps/api/src/hhq-offline-sync.e2e.integration.ts`, `apps/api/src/admin-users.integration.ts`.
- Tests that import Expo browser-oriented modules create a minimal `globalThis.window.localStorage` mock: `apps/api/src/hhq-offline-sync.e2e.integration.ts`, `expo-prototype/src/tests/validateQuestionnaireDraftWorkflow.mjs`.
- Shared package tests group behavior by helper or reducer and assert deterministic outputs: `packages/shared-domain/src/__tests__/ids.test.ts`, `packages/event-core/src/__tests__/index.test.ts`.
- Expo validation scripts assert top-level behavior directly without `describe` blocks: `expo-prototype/src/tests/validateQuestionnaireSubmissionWorkflow.mjs`, `expo-prototype/src/tests/validateSurveyNavigation.mjs`.

## Mocking

**Framework:** No dedicated mocking framework detected

**Patterns:**
```typescript
// apps/api/src/hhq-offline-sync.e2e.integration.ts
const localStore = createLocalStorage();
globalThis.window = { localStorage: localStore } as any;
```

```javascript
// expo-prototype/src/tests/validateQuestionnaireDraftWorkflow.mjs
const store = new Map();
globalThis.window = {
  localStorage: {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
  },
};
```

**What to Mock:**
- Mock browser storage only when Node tests import Expo modules that depend on `window.localStorage`: `expo-prototype/src/tests/validateQuestionnaireDraftWorkflow.mjs`, `expo-prototype/src/tests/validateQuestionnaireSubmissionWorkflow.mjs`.
- Use seeded dev/test users instead of mocking auth flows in API integration tests: `apps/api/src/admin-users.integration.ts`, `apps/api/src/hhq-offline-sync.e2e.integration.ts`.
- Use signed JWTs for narrow auth middleware tests when the database is not the subject: `apps/api/src/app.test.ts`.

**What NOT to Mock:**
- Do not mock shared reducer/workflow behavior when testing API sync or HHQ promotion; `apps/api/src/hhq-offline-sync.e2e.integration.ts` exercises Expo local submission helpers, API sync push, database projection, duplicate evidence handling, and replay.
- Do not mock protocol schedule calculations in shared packages; assert real generated task labels and dates in `packages/shared-workflow/src/__tests__/schedule-rules.test.ts`.
- Do not mock active policy route/navigation constants; validate them directly in `expo-prototype/src/tests/validateNavigationPolicy.mjs`.

## Fixtures and Factories

**Test Data:**
```typescript
// apps/api/src/services/hhqPromotion.test.ts
const answers = {
  hhq_site_id: 1,
  hhq_locality_code: 2,
  hhq_structure_map_id: "0042",
  hhq_household_number: "03",
  hhq_interview_date: "2026-09-01",
  hhq_household_members: [
    {
      member_line_number: 2,
      member_name: "Member Two",
      member_sex: 2,
      member_age_years: 35,
      member_woman_questionnaire_eligible: 1,
    },
  ],
};
```

```typescript
// packages/shared-domain/src/__tests__/ids.test.ts
const params = {
  household_id: "1-LC01-0023-01",
  subject_type: "woman",
  subject_id: "1-LC01-0023-01-03",
  task_type: "HRF",
  protocol_visit_label: "HRF-R1",
  target_date: "2026-09-01",
  rules_version: "v1",
};
```

**Location:**
- Fixtures are mostly inline in test files: `apps/api/src/services/hhqPromotion.test.ts`, `packages/shared-domain/src/__tests__/ids.test.ts`, `expo-prototype/src/tests/validateQuestionnaireSubmissionWorkflow.mjs`.
- Dev/test database seed helpers live in `apps/api/src/dev/dev-seed.ts` and are imported by integration tests such as `apps/api/src/admin-users.integration.ts`.
- Source questionnaire and protocol references live under `Refs/`; `docs/policies/questionnaire-authoring.md` requires reading the relevant source PDF and summary inputs before questionnaire JSON changes.

## Coverage

**Requirements:** No root coverage threshold or enforced coverage target detected in `package.json`, `turbo.json`, or workspace test configs.

**View Coverage:**
```bash
npm --workspace @dynamic/event-core test -- --coverage
npm --workspace @dynamic/shared-workflow test -- --coverage
npm --workspace @dynamic/shared-domain test -- --coverage
```

Coverage collection globs exist in `packages/event-core/jest.config.js` and `packages/shared-workflow/jest.config.js`. API, Expo, and `packages/shared-context` do not define coverage scripts in `apps/api/package.json`, `expo-prototype/package.json`, or `packages/shared-context/package.json`.

## Test Types

**Unit Tests:**
- API unit tests cover app wiring and small service/lib behavior with Node test and `assert`: `apps/api/src/app.test.ts`, `apps/api/src/lib/syncClock.test.ts`, `apps/api/src/services/hhqPromotion.test.ts`.
- Shared package unit tests cover deterministic IDs, date of birth helpers, prefill mappers, schedule rules, task generators, reducers, and workflow orchestration: `packages/shared-domain/src/__tests__/ids.test.ts`, `packages/shared-domain/src/__tests__/dob.test.ts`, `packages/shared-context/src/__tests__/prefill.test.ts`, `packages/event-core/src/__tests__/index.test.ts`, `packages/shared-workflow/src/__tests__/task-generators.test.ts`.
- Expo unit-style validation scripts cover form catalog, SurveyJS transforms, household behavior, draft/submission workflow, navigation, field worker profile, and sync helpers: `expo-prototype/src/tests/validateForms.mjs`, `expo-prototype/src/tests/validateQuestionnaireSurveyJsonTransforms.mjs`, `expo-prototype/src/tests/validateSurveyNavigation.mjs`.

**Integration Tests:**
- API integration tests run against `dynamic_test` and start the real Express app on an ephemeral port: `apps/api/src/smoke.integration.ts`, `apps/api/src/masters.integration.ts`, `apps/api/src/admin-users.integration.ts`.
- HHQ offline sync integration is the broadest vertical path and covers local Expo submission, push records, backend sync, duplicate handling, DQ flagging, projection replay, and pull reconciliation: `apps/api/src/hhq-offline-sync.e2e.integration.ts`.
- `docs/testing.md` defines the command for HHQ backend integration with explicit `TEST_DATABASE_URL`, `JWT_SECRET`, and `JWT_REFRESH_SECRET`.

**E2E Tests:**
- Browser/device E2E framework is not detected. UI-affecting changes require relevant tests plus browser/app verification per `docs/testing.md`.
- The closest end-to-end automated coverage is API-backed sync integration in `apps/api/src/hhq-offline-sync.e2e.integration.ts` and Expo validation scripts under `expo-prototype/src/tests/`.

## Common Patterns

**Async Testing:**
```typescript
// apps/api/src/admin-users.integration.ts
const server = createServer(createApp());
await new Promise<void>((resolve) => server.listen(0, resolve));
try {
  const address = server.address();
  assert.ok(address && typeof address === "object");
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
```

**Error Testing:**
```javascript
// expo-prototype/src/tests/validateNavigationPolicy.mjs
assert.throws(
  () => getRouteForTaskForm({}),
  /Cannot open a form route without a valid task context/,
);
```

```typescript
// packages/shared-workflow/src/__tests__/schedule-rules.test.ts
expect(schedules[0].label).toBe("NFF-7d");
expect(schedules[1].label).toBe("NFF-28d");
```

**Database Testing:**
- Use `npm --workspace @dynamic/api run db:test:push` before API integration tests, as wired in `apps/api/package.json`.
- Use explicit Drizzle schema globs and URL when pushing schema, matching `docs/testing.md` and `apps/api/package.json`; avoid relying on shell one-command env expansion for `DATABASE_URL`.
- Clean up records created by integration tests in `finally` blocks where the test creates mutable rows, as in `apps/api/src/admin-users.integration.ts`.

**Policy Regression Testing:**
- Add tests for architecture verification gates listed in `docs/architecture.md`, especially duplicate offline completion, idempotent retry, area-scoped pull/push, HHQ baseline through WQ/HRF generation, deterministic task keys, VA disabled enforcement, admin correction recalculation, and projection rebuild equivalence.
- For questionnaire JSON changes, follow `docs/policies/questionnaire-authoring.md`: update `expo-prototype/src/data/forms/`, rebuild `outputs/pretsing-form-json/all_forms.json` when extraction output changes, run `npm --workspace expo-prototype test`, and browser-check UI-affecting changes.

---

*Testing analysis: 2026-06-19*
