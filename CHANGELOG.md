# Changelog

This file records notable changes to DYNAMIC. The repository does not currently use tagged releases, so completed work is grouped by dated development checkpoints from the Git history.

The format follows the principles of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), using the categories Added, Changed, Fixed, Security, Documentation, and Testing where applicable.

## Unreleased

### Documentation

- Added a root README describing the application purpose, backend and frontend structure, data flow, local development commands, and canonical project documentation.
- Added a branch inventory describing each local and remote branch, their relationships, their high-level contents, and the working-branch convention.
- Added a development guide covering the canonical runtime, environment setup, verification, and tested Android APK build and emulator workflow.
- Added production build and deployment guidance for the backend API and Admin UI, and clarified that the checked-in Nginx configuration is for local development.
- Updated the native SurveyJS renderer and survey-navigation policies with the compact mobile shell, section progress, repeat editing, and date-display rules.

### Added

- Added field app Worklist search and locality filtering so synced tasks can be narrowed on device.
- Added a Mapping Frame CSV import workflow for the study-site Excel format, including upload preview, HHID generation, duplicate/error reporting, and Add Data commit into mapping frame and household records.
- Added a guarded Delete action for pending CSV-imported Add Households rows, with API protection against deleting records that already have study data.
- Added a Field Worker Household Assignment admin menu page for the upcoming dedicated assignment workflow.
- Added responsive site and locality selector controls to the Field Worker Household Assignment page.
- Added Start and End Household Range inputs to the Field Worker Household Assignment selector row.
- Added a View button to the Field Worker Household Assignment selector row.
- Added the first Field Worker Household Assignment table view with range filtering, row selection, select-all, assign-selected, clear-selected, and per-row Assign controls.
- Added multi-field-worker household assignment support with checkbox user selection for per-row and bulk assignment.
- Added clearing of selected field-worker household assignments from the assignment page.
- Added per-worker unassign controls and outside-click closing for household assignment field-worker selectors.
- Moved assigned field-worker tags into a separate assignment column on the household assignment page.
- Added household search and 1000-row pagination to the field-worker household assignment table.
- Added backend field-worker household assignment storage and API support for saving selected household assignments.
- Added Drizzle migration metadata for field-worker household assignments so the schema history includes the new assignment table.
- Scoped field-worker household sync/access to assigned household IDs.
- Accepted the official Mapping Listing CSV headers when Excel saves wrapped header text with line breaks and range hints.
- Added selected-site validation to Mapping Frame CSV import so uploaded Study Site IDs and locality codes must match existing Study Sites and Study Localities master rows before household import.
- Added Mapping Frame upload archiving with matched and unmatched CSV outputs plus an Unmatched Uploads history/download view for central admins.
- Added Mapping Frame CSV invalid-row rules for missing IDs, Excel-internal duplicate HHIDs, master site/locality mismatches, over-length codes, and left-side zero padding of short numeric codes.
- Added search and pagination to the Mapping Frame CSV preview so large upload previews remain usable.
- Added central-admin Study Masters edit flows for updating existing study site codes/names and locality codes/names/types, including dependent locality-code records.
- Added checked-in API and Expo environment examples while keeping real environment files ignored.
- Added the Expo Android application ID required by native prebuild and documented that the current local release APK is debug-signed and intended only for testing.
- Added a fully native Expo renderer for the baseline household questionnaire while retaining Survey Core for questionnaire state, validation, visibility, and localization.
- Added SQLite-backed questionnaire drafts with manual save, timed/background autosave, navigation autosave, and restoration of the active applicable section.
- Added compact section-state dots and a detailed section drawer, English/Hindi switching, partial-data preview, native Android date selection, and compact repeat-entry Add, Update, and Delete flows.
- Added the Expo and EAS agent-skill bundle used for future Expo development, upgrade, simulator, hosting, and store workflows.
- Added a password-verified Forgot PIN unlock flow and a Profile option for changing the field-app PIN.

### Testing

- Updated field-worker household scope coverage to verify only explicitly assigned households are visible to that worker.

### Changed

- Renamed the baseline HHQ interview date prompt to "Interviewer visit date".
- Updated the development seed for study site ID 1 to use the Bareilly site code and name.
- Updated the development seed locality for site ID 1 and locality code 01 to use Sunped.
- Removed the separate Site Code field from the Study Sites UI because Site ID is the master identifier.
- Renamed the admin Mapping Frame tab/page to Add Households and updated the CSV import confirmation wording.
- Replaced Mapping Status on the Mapping Frame page with Consent Given.
- Renamed Mapping Frame columns to Structure, Household, and Household consent given for clearer admin review.
- Restricted Mapping Frame import to CSV files in both the Admin file picker and API upload endpoints.
- Ignored fully blank CSV rows during Mapping Frame preview/import while still marking partially filled rows with missing required mapping fields as invalid.
- Reworked the field-app Household page filters into a compact row with locality checkbox multi-select plus household number, address, member name, and sex filters.
- Scoped the Household page locality checkbox filter to the logged-in user's active locality assignments.
- Tightened the Household page mobile spacing and fixed the compact household-member panel overlay positioning.
- Kept the Household page dropdowns from resizing the search panel, added outside-click dismissal for locality and sex selectors, and tightened closed filter widths.
- Standardized active seed, master, and test locality codes to the required 2-digit format.
- Upgraded the Expo application to SDK 57.0.8 with React 19.2.3, React Native 0.86.0, `@expo/ui` 57.0.7, Reanimated 4.5.3, and Worklets 0.10.3.
- Standardized dependency installation on npm 11.14.1 and regenerated the npm lockfile without local native-library workarounds.
- Upgraded API Drizzle ORM to 0.45.2 and pinned the Admin React Router dependency to the audited 6.30.4 build path.
- Routed generic questionnaire entry through the native Expo Survey Core renderer and removed the unused `survey-react-ui` dependency from the Expo workspace.
- Reworked the household-questionnaire mobile shell so the DYNAMIC header collapses on scroll, the questionnaire title remains compact, and Previous/Preview/Save/Next retain their requested bottom positions.
- Changed dynamic-panel rendering to show compact committed-entry summaries and open explicit Add or Update editors only when requested.
- Reworked Admin user management so Create and Edit use named site selectors, while the user table shows readable site and locality names with their codes and IDs.
- Removed locality assignment checkboxes from the Admin Users create/edit dialogs so locality assignment can move to a dedicated admin page.
- Replaced the separate user deactivation action with an accessible Active/Inactive switch in the Users table.

### Fixed

- Fixed the field-app Worklist locality dropdown position on mobile and kept the filters fixed while only the task list scrolls.
- Scoped field-app worklist locality chips and drawer locality buttons to the logged-in worker's visible task and site localities.
- Raised the field-app drawer above Household page filters so the side navigation fully covers page controls on mobile.
- Changed the field-app Worklist locality filter to a compact dropdown so many site localities do not consume mobile screen space.
- Fixed the Study Masters Add Locality button so central admins can create locality master rows from the Localities tab.
- Fixed the embedded Android field app startup crash by using platform-specific SQLite modules instead of a runtime `require`.
- Cleared synced field-app task and household caches on successful login so switching users cannot show stale households from another site.
- Scoped the field-app Households screen and member search to open assigned HHQ tasks so stale local cache cannot show another site's households.
- Tightened the compact field-app Household list so mobile rows no longer stretch into oversized table rows.
- Created HHQ baseline tasks when field-worker household assignments are saved so assigned households can appear in the field-app sync/worklist.
- Rendered the field-app web worklist with direct scroll mapping so all synced tasks are visible after sync.
- Fixed the field-app web SQLite task filters so all pulled worklist tasks remain visible instead of only the first matching task.
- Improved Admin user-create/edit validation messages so required API fields such as password length are shown clearly instead of a generic invalid-body error.
- Added Expo Metro workspace package resolution so Android embedded-bundle builds can resolve shared monorepo packages from the short Windows build path.
- Added Expo Metro WASM asset resolution so the field-app web preview can bundle the `expo-sqlite` web worker.
- Routed the field-app web preview through the localStorage SQLite shim so Chrome does not crash on `SharedArrayBuffer` startup.
- Prevented the field-app worklist task detail modal from stacking on repeated taps, softened the web backdrop so it no longer blacks out the page, and kept the seeded HHQ task identity aligned with the 2-digit locality code.
- Made post-login app-lock biometric unlock use the saved per-user biometric preference and added a Profile control to enable or disable it.
- Kept the Household members slideout inside the Android phone width and allowed the Household toolbar actions to wrap on compact screens.
- Prevented HHQ roster calculations from recreating a hidden or deleted minimum household-member placeholder after declined consent or final-row deletion.
- Fixed the Study Localities edit form so valid 2-digit locality codes pass browser validation.
- Directed blocked forward navigation to the first visible validation error and displayed definition-provided regex messages.
- Preserved ISO date values in the questionnaire model while displaying dates as `DD-MMM-YYYY` and using the native Android Material date picker.
- Prevented non-applicable consent-dependent sections from occupying compact progress space or blocking final review.
- Cleared the partial-preview notice when returning to edit mode and preserved entered values while switching questionnaire languages.
- Shared the native SQLite database owner across repositories and avoided the prior `NativeDatabase.prepareSync` failure during route changes.
- Prevented browser credential autofill from populating Admin user-edit email and password fields.

### Security

- Removed the production high-severity npm audit finding from the direct API Drizzle ORM dependency.
- Enforced site/locality assignment scope on the API, saved user and locality changes atomically, and prevented duplicate or cross-site assignments.
- Prevented users from changing their own account status or the status of higher-precedence roles, and revoked active sessions immediately when an account is deactivated.

### Testing

- Added API integration coverage for Mapping Frame CSV preview/import, generated HHID output, and imported household visibility with address, head name, and comments.
- Added native renderer registry coverage for all 11 bundled questionnaire definitions and re-ran Expo web and Android exports.
- Verified Admin typecheck and production build, all Expo validation scripts, Expo Doctor, Android and web exports, and clean npm dependency trees after the SDK 57 upgrade.
- Regenerated the ignored Android project and completed debug and release APK builds plus debug installation on the Pixel 7 API 36 emulator.
- Exercised native household-questionnaire validation, consent routing, date storage/display, preview, draft recovery, section progress, repeat editing, language switching, and current-session Android logcat checks.
- Added database integration coverage for atomic locality assignment, site-admin scope, self/higher-role status protection, and session revocation; verified the Nginx-served Admin Users flow in the browser.

## 2026-07-22

### Added

- Added an Expo task-worklist reconciliation seam for merging backend-confirmed tasks with provisional offline work.

## 2026-06-29

### Added

- Added a study-staff identity model covering staff records, study roles, institutions, user accounts, and data-access profiles.
- Added API enforcement for non-PII collaborator access.
- Added a local application lock after Expo login.
- Centralized pregnancy-detection and birth-task generation in the shared event core.

### Changed

- Renamed the Expo workspace to its current `expo` location and package identity.
- Updated the admin application to support creation of study-staff user accounts.
- Allowed registered devices to be reused across users while retaining server-side identity and access checks.

### Fixed

- Preserved logged-out form sync so finalized field evidence is not lost when a session expires.
- Corrected site-admin user and device scope enforcement.

### Security

- Added API access-token validation against the server-side session cache.

### Testing

- Extended development smoke coverage for device registration and seeded study-staff roles.

## 2026-06-28

### Added

- Added household and pregnancy workflow-decision tracers to improve event and task-generation provenance.

### Documentation

- Checkpointed domain-planning artifacts for continued architecture work.

## 2026-06-26

### Added

- Implemented the shared field-event boundary used by backend and Expo workflows.
- Added projection-replay tooling for rebuilding derived state from accepted evidence and events.

### Changed

- Consolidated event processing around shared domain and workflow rules.
- Remediated identified codebase structure and reliability concerns.

## 2026-06-19

### Documentation

- Established `docs/architecture.md` as the single agreed DYNAMIC architecture.
- Consolidated active implementation rules under `docs/policies/` and archived superseded architecture drafts and audits.
- Added current policies for form drafts and autosave, preview and final submission, survey navigation, application routes, authentication, devices, and role scope.
- Added a codebase map while keeping generated planning material subordinate to the canonical architecture.

## 2026-06-18

### Added

- Added `packages/event-core` as the shared event, reducer, and workflow foundation.
- Implemented HHQ event ingestion, immutable evidence handling, duplicate classification, and projection replay.
- Added provisional Expo household events for offline continuity.
- Completed pregnancy enrollment across Expo, sync, and backend using the `pregnancy_enrolled` event.
- Added pregnancy follow-up and outcome events, including pregnancy closure, outcome provenance, and birth-assessment task generation.
- Added replayable session-log archives for durable engineering handoffs.

### Changed

- Standardized local runtime operations through the root Makefile.
- Adopted full development schema push/reset as the normal local database workflow.
- Moved system design and verification details into canonical architecture and testing documentation.

### Fixed

- Preserved duplicate pregnancy submissions as evidence while preventing duplicate projection and task effects.
- Anchored pregnancy workflows to accepted protocol dates instead of hidden device or server wall-clock values.

## 2026-06-10

### Changed

- Restructured Expo application routing.
- Checkpointed the offline synchronization and questionnaire workflow implementation.

## 2026-06-05

### Added

- Added household-member management and large-field synchronization support.

## 2026-06-04

### Added

- Built the full-stack offline synchronization foundation for Expo and the backend API.
- Added admin correction workflows and integration coverage.
- Added API integration and development smoke tests for authentication, users, master data, and sync.
- Added custom local development ports and an Nginx HMR edge.
- Added protocol-form checksum handling for cached form refresh and synchronization.

### Fixed

- Fixed Expo development login and synchronization behavior.
- Surfaced sync and evidence-promotion failures instead of silently discarding them.
- Hardened failed-promotion, correction-review, and synchronization paths.
- Corrected birth-outcome roster and identity-boundary behavior.
- Replaced placeholder shared-prefill behavior with study context.

### Testing

- Cleaned API integration-test state and expanded coverage for user, master-data, correction, and sync APIs.

## 2026-06-03

### Added

- Created the initial DYNAMIC monorepo and offline architecture specification.
- Established the Expo field application, backend API, admin web application, and shared workspace structure.

## Maintaining This Changelog

Add user-visible, architectural, operational, security, and major testing changes to `Unreleased` as part of the same change. Move those entries into a dated or versioned section when creating a release or formal project checkpoint.
