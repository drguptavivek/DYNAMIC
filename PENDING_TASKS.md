# Pending Tasks

This file tracks concrete unfinished engineering work. Canonical architecture and behavior rules remain in `docs/architecture.md` and `docs/policies/`.

## Priority 0 - Clear hidden household-roster values after declined consent

Status: Blocker for full baseline household-questionnaire acceptance.

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

The clean npm 11 installation currently reports 39 audit findings: 16 moderate and 23 high.

- Identify direct versus transitive findings and whether they affect shipped runtime paths.
- Prefer compatible upstream upgrades; do not use a forced audit fix that breaks the Expo SDK 57 dependency policy.
- Re-run `npm ci`, dependency-tree checks, workspace tests, Expo Doctor, exports, and Android builds after any dependency change.

## Priority 1 - Extend native questionnaire coverage

- Continue device QA for long English and Hindi labels, accessibility, keyboard behavior, and small-screen layouts.
- Extend the native capability registry to the remaining questionnaire definitions without adding DOM or WebView fallbacks.
- Preserve the existing Survey Core state/validation boundary and the canonical draft, preview, navigation, and submission policies.
