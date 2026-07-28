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

- Added checked-in API and Expo environment examples while keeping real environment files ignored.
- Added the Expo Android application ID required by native prebuild and documented that the current local release APK is debug-signed and intended only for testing.
- Added a fully native Expo renderer for the baseline household questionnaire while retaining Survey Core for questionnaire state, validation, visibility, and localization.
- Added SQLite-backed questionnaire drafts with manual save, timed/background autosave, navigation autosave, and restoration of the active applicable section.
- Added compact section-state dots and a detailed section drawer, English/Hindi switching, partial-data preview, native Android date selection, and compact repeat-entry Add, Update, and Delete flows.
- Added the Expo and EAS agent-skill bundle used for future Expo development, upgrade, simulator, hosting, and store workflows.
- Added a password-verified Forgot PIN unlock flow and a Profile option for changing the field-app PIN.

### Changed

- Upgraded the Expo application to SDK 57.0.8 with React 19.2.3, React Native 0.86.0, `@expo/ui` 57.0.7, Reanimated 4.5.3, and Worklets 0.10.3.
- Standardized dependency installation on npm 11.14.1 and regenerated the npm lockfile without local native-library workarounds.
- Reworked the household-questionnaire mobile shell so the DYNAMIC header collapses on scroll, the questionnaire title remains compact, and Previous/Preview/Save/Next retain their requested bottom positions.
- Changed dynamic-panel rendering to show compact committed-entry summaries and open explicit Add or Update editors only when requested.
- Reworked Admin user management so Create and Edit use named site selectors and locality checkboxes, while the user table shows readable site and locality names with their codes and IDs.
- Replaced the separate user deactivation action with an accessible Active/Inactive switch in the Users table.

### Fixed

- Directed blocked forward navigation to the first visible validation error and displayed definition-provided regex messages.
- Preserved ISO date values in the questionnaire model while displaying dates as `DD-MMM-YYYY` and using the native Android Material date picker.
- Prevented non-applicable consent-dependent sections from occupying compact progress space or blocking final review.
- Cleared the partial-preview notice when returning to edit mode and preserved entered values while switching questionnaire languages.
- Shared the native SQLite database owner across repositories and avoided the prior `NativeDatabase.prepareSync` failure during route changes.
- Prevented browser credential autofill from populating Admin user-edit email and password fields.

### Security

- Enforced site/locality assignment scope on the API, saved user and locality changes atomically, and prevented duplicate or cross-site assignments.
- Prevented users from changing their own account status or the status of higher-precedence roles, and revoked active sessions immediately when an account is deactivated.

### Testing

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
