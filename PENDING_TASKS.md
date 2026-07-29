# Pending Tasks

This file tracks concrete unfinished engineering work. Canonical architecture and behavior rules remain in `docs/architecture.md` and `docs/policies/`.

## Priority 0 - Clear hidden household-roster values after declined consent

Status: Core implementation fixed locally; full baseline household-questionnaire acceptance still needs device/export/database verification.

When consent is changed to `No`, the roster and later interview sections correctly disappear, but the saved draft can still contain a minimum dynamic-panel placeholder and derived totals, for example:

- `hhq_household_members: [{"member_line_number":1,"member_woman_questionnaire_eligible":2}]`
- `hhq_total_household_members: 1`

Deleting the final visible roster entry can similarly show zero committed entries while retaining a calculated household total of one.

Acceptance criteria:

- Declining consent clears values owned by every newly hidden container according to the questionnaire's `clearInvisibleValues` policy.
- Household-listing calculations do not recreate a minimum placeholder after the roster page becomes non-applicable.
- Derived member and eligible-woman totals are cleared or recomputed consistently when the roster is hidden or its final entry is deleted.
- Manual save, autosave, preview, close/reopen, and final review preserve the cleared state.
- Add regression coverage for consent Yes to No transitions and deletion of the final committed roster entry.
- Re-run Expo tests, Android/web exports, native emulator interaction, SQLite draft inspection, and the fatal/error logcat filter.

Likely investigation area: the household-listing behavior refresh and dynamic-panel minimum-row normalization around `BaselineHouseholdForm` and `DynamicPanelRenderer`.

## Priority 1 - Triage npm audit findings

Status: Direct high-severity API dependency fixed locally; remaining production findings are moderate transitive Expo/React Router audit items requiring upstream/major-upgrade review.

The current production audit (`npm audit --omit=dev`) reports 12 moderate findings and 0 high findings after upgrading `drizzle-orm` to 0.45.2. The previous direct high-severity `drizzle-orm` SQL identifier advisory is cleared.

- Identify direct versus transitive findings and whether they affect shipped runtime paths.
- Prefer compatible upstream upgrades; do not use a forced audit fix that breaks the Expo SDK 57 dependency policy.
- Re-run `npm ci`, dependency-tree checks, workspace tests, Expo Doctor, exports, and Android builds after any dependency change.

## Priority 1 - Extend native questionnaire coverage

Status: Generic native renderer coverage implemented locally for all 11 bundled questionnaire definitions; broad device QA remains.

- The generic questionnaire route now uses native Expo controls instead of `survey-react-ui`.
- All bundled definitions are covered by the native capability registry regression test.
- Web and Android exports passed locally after the route change.
- Continue device QA for long English and Hindi labels, accessibility, keyboard behavior, and small-screen layouts.
- Extend form-specific workflow behavior where remaining questionnaire definitions need derived IDs, promotion rules, task creation, or attachment persistence.
- Preserve the existing Survey Core state/validation boundary and the canonical draft, preview, navigation, and submission policies.

## Priority 1 - Verify app-lock biometric unlock on physical Android

Status: Functional state handling fixed locally; physical APK verification still pending.

- App-lock biometric unlock now depends on the saved per-user biometric preference, not only device hardware availability.
- The unlock screen hides the biometric button unless biometrics are enabled for the current app PIN.
- Profile exposes a biometric enable/disable control after the user is logged in and the phone reports enrolled biometrics.
- Expo native config now includes the local-authentication plugin for future APK builds.
- Rebuild and install the Android APK, then verify PIN setup with biometric enabled, app background/return lock, biometric prompt display, successful unlock, cancel fallback to PIN, and Profile enable/disable behavior.
