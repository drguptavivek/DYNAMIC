## 2026-08-19 (reverted) [saved]
Goal: Restore the original WQ outcome page after the boss reversed the shared-outcome request.
Decisions:
- The WQ outcome keeps its original seven options (1 Completed, 2 Not at home, 3 Postponed, 4 Refused, 5 Partly completed, 6 Incapacitated, 7 Other) with title "Result of Interview"; the copied HHQ list and `wq_result_interview_other_specify` are removed (form JSON and catalog restored from before the change).
- Incapacitated auto-routing is back to preselecting outcome 6.
Rejected:
- Sharing the HHQ outcome list across HHQ and WQ (request reversed on 2026-08-19; commits e4fcd26 and 780dbc5 reverted).
Open:
- Re-sync the field device so its cached WQ definition returns to the original outcome list.

## 2026-08-19 (later) [saved]
Goal: Stop the WQ Next button from silently doing nothing after Section 01.
Decisions:
- Root cause: Survey Core's validation error-focus path dereferences `settings.environment` (browser DOM) unguarded; on React Native `nextPage()` threw a TypeError that killed the Next/Complete handler, so blocked sections showed no error and no scroll.
- `expo/src/polyfills/surveyCoreNative.js` now no-ops `SurveyModel.scrollElementToTop` and `Question.focusInputElement` on DOM-less runtimes; native renderers own scrolling and focus.
- Device evidence (draft pulled from the phone via debug-build `run-as`): the field worker's active WQ draft was blocked by exactly one error - DOB month stored as "2" (validator requires 2 digits "02") - and the error lived on the multipletext item editor, invisible to both the error display and the blocked-Next scroll.
- `hasNativeValidationProblem` (new shared helper in `nativeSurveyModel.js`) now detects question errors, required-empty answers, multipletext item errors, and repeat-panel rows; the renderer uses it for blocked Next/Complete scrolling.
- `MultipleTextRenderer` renders item editor errors under each input, and section status chips count item errors.
- An intermediate build crashed on the phone (`ReferenceError: Property 'QuestionFrame' doesn't exist`) after an import rewrite accidentally dropped the `QuestionFrame` import in `MultipleTextRenderer.js`; fixed, and `validateRendererImports.mjs` now statically blocks unimported JSX components (in the suite).
- Device QA passed on the physical phone: blocked Next now scrolls to the failing question with its validator error, and Section 2 advances once the value is corrected (confirmed by the field user on their own draft).
Rejected:
- try/catch wrappers around every `model.nextPage()`/`validate()` call site; the bootstrap patch fixes every form in one place.
- Stubbing `settings.environment` with a fake DOM; no-op scroll/focus is strictly safer.
Open:
- None for this entry; remaining repo-wide Open items stay in the 2026-08-19 HHQ entry.

## 2026-08-19 [saved]
Goal: Preselect and filter the HHQ outcome question when section 3 observation questions end the interview.
Decisions:
- Q60 (`hhq_we_like_learn_about_places_that_households_use`) options 2/3 force outcome `hhq_result_interview = 1` (Completed) with only that choice visible; option 4 forces value 10 (Other) with only that choice plus the required specify text visible.
- Any Q62 (`hhq_observation_only`) selection after Q60 = 1 forces outcome 1 with only that choice visible.
- Choice filtering uses per-choice `visibleIf` added by `applyHhqOutcomeChoiceVisibility`; value forcing uses `applyForcedHhqOutcomeResult` in the HHQ runtime behaviors, which also clears the stale other-specify text.
- Untriggered states keep all ten outcome options so the normal manual outcome flow is unchanged.
Rejected:
- Editing the bundled HHQ form JSON directly; runtime transforms keep the definition reusable.
- Backend changes; `result_interview` is already a pass-through integer projection.
Open:
- Device QA of the preselected outcome rendering after the next explicitly requested APK build.
- Rebuild the release APK with `EXPO_PUBLIC_API_BASE_URL=http://192.168.1.81:3310/api/v1` (laptop Wi-Fi IP) plus a firewall rule for inbound 3310, then drop the `adb reverse tcp:3310` tunnel.

## 2026-08-18 13:35 [saved]
Goal: Make Uploaded Forms distinguish HHQ revisit history from duplicate submissions.
Decisions:
- Keep every immutable HHQ visit response as study evidence.
- Group HHQ responses by household and show chronological visit number plus server result.
- Keep person-level and other forms as separate submission records.
Rejected:
- Deleting legitimate revisit records just because they share a household ID.
- Grouping WQ submissions from different women in the same household.
Open:
- Build/install only when explicitly requested.

## 2026-08-18 12:20 [saved]
Goal: Prevent an out-of-scope stale local draft from blocking a field worker's complete sync.
Decisions:
- Keep the API's assignment-scope rejection strict.
- Remove only local drafts explicitly rejected as outside the authenticated user's assigned area, then continue syncing valid records.
- Continue treating all other draft rejection reasons as blocking errors.
Rejected:
- Weakening server area-scope enforcement.
- Allowing one stale draft to abort task, household, response, and questionnaire sync.
Open:
- Rebuild/install the Android app only when requested, then verify site2 Sync Now on device.

## 2026-06-18 09:14 [saved]
Goal: Standardize DYNAMIC local dev runtime commands.
Decisions:
- Root Makefile owns dev startup and Docker container logs.
- Host backend/admin/Expo HMR logs stay foreground-only.
Rejected:
- Hand-rolled docker/npm startup when Make targets exist.
- Host log or PID files for HMR servers.
Open:
- Keep browser verification after runtime changes.
Archive:
- `session-log-archive.md#2026-06-18-0914-runtime-standardization`

## 2026-06-18 10:04 [saved]
Goal: Preserve event-driven HHQ ingest/replay checkpoint.
Decisions:
- `packages/event-core` is the shared event/reducer kernel.
- HHQ backend ingest records applied and held-duplicate evidence.
- Expo HHQ local submit writes provisional baseline events.
- Dev DB uses full schema push/reset, not migrations.
Rejected:
- Adding Cedar/OPA before command/event boundaries stabilize.
- Continuing procedural-only HHQ promotion.
Open:
- Wire next workflow slice beyond HHQ baseline replay.
Archive:
- `session-log-archive.md#2026-06-18-1004-hhq-event-ingest-and-replay`

## 2026-06-18 10:46 [saved]
Goal: Keep agent instructions concise but replayable.
Decisions:
- `AGENTS.md` stays pointer-focused so startup/runtime rules are hard to miss.
- `docs/architecture.md` holds system design detail because agents need architecture without bloating prompts.
- `docs/testing.md` holds command order and DB caveats because verification sequences are too verbose for AGENTS.
Rejected:
- Long Makefile target lists in `AGENTS.md`.
- Detailed replay sequences in active prompt context.
Open:
- Keep new durable decisions linked from AGENTS or archive.

## 2026-06-18 11:22 [saved]
Goal: Start the pregnancy enrollment event-driven slice after HHQ replay.
Decisions:
- `pregnancy_enrolled` is now an event-core reducer/orchestration boundary.
- PEF backend promotion emits `pregnancy_enrolled`, replays it into the pregnancy projection, then schedules PFF/UF through event-core orchestration.
- Held duplicate/rejected pregnancy events are reducer-level no-ops.
Rejected:
- Adding Cedar/OPA before another concrete workflow slice exists.
- Moving the whole WQ/PEF/POF chain in one edit.
Open:
- Add backend duplicate PEF completion classification and data-quality flags.
- Add Expo provisional pregnancy events for offline PEF submit.

## 2026-06-18 12:08 [saved]
Goal: Complete HHQ and pregnancy enrollment end to end across Expo, sync, and backend.
Decisions:
- PEF finalization/sync/backend now completes `pregnancy_enrolled` through PFF/UF generation.
- Duplicate PEF completions are preserved as held evidence with DQ flags.
Rejected:
- Using device/server wall-clock as the primary PEF protocol anchor when `pef_enrollment_date` is present.
Open:
- Refactor Expo HHQ and PEF local task generation to import the shared TS event/workflow kernel once the Expo test/runtime can load workspace TS packages directly.

## 2026-06-18 12:42 [saved]
Goal: Extend event path through PFF evidence and POF outcome.
Decisions:
- PFF sync now records `pregnancy_followup_completed` and holds duplicate task completions.
- POF sync records `pregnancy_outcome_recorded`, outcome rows, child provenance, and BAF tasks from one event.
Rejected:
- Shifting pregnancy enrollment anchors from PFF completion dates.
Open:
- Add Expo provisional POF child/outcome tasks when offline outcome completion is needed.

## 2026-06-19 10:10 [saved]
Goal: Consolidate repo architecture and policy docs into one current canon.
Decisions:
- `docs/architecture.md` is the single agreed architecture.
- Current policy docs live only in `docs/policies/`.
- Superpower skills must not create active DYNAMIC policy docs under `docs/superpowers/`.
- Prior audits, specs, SurveyJS policy notes, and superpowers drafts are archived under `docs/archive/2026-06-19-pre-canonical/`.
- `AGENTS.md` points to the current canon and treats archived docs as historical only.
Rejected:
- Continuing multiple active docs with conflicting architecture and rule precedence.
Open:
- Keep future durable rules promoted into `docs/architecture.md` or `docs/policies/`, not new parallel drafts.

## 2026-06-19 10:35 [saved]
Goal: Promote missing code-direction policies into current canon.
Decisions:
- Preview, drafts/autosave, navigation/progress, route surfaces, and auth/device/scope now have active policies.
- Policy may lead implementation; code drift is debt against `docs/policies/`.
Rejected:
- Waiting for complete code before documenting these operating rules.
Open:
- Implement gaps against the active policy set.

## 2026-06-19 10:50 [saved]
Goal: Checkpoint all current refactor and policy-canon work in git.
Decisions:
- Commit all dirty files together because the user requested one all-file checkpoint.
- Session log records the policy canon before commit so future sessions inherit it.
Rejected:
- Splitting this checkpoint despite explicit all-files commit request.
Open:
- Implement policy/code drift gaps in later commits.

## 2026-07-27 18:40 [saved]
Goal: Render baseline HHQ natively in Expo from the existing form definition.
Decisions:
- `survey-core` owns form state/rules; standalone Expo capabilities own rendering.
- HHQ has no DOM/WebView fallback and includes native preview, section state, roster confirmation, generated IDs, and duplicate checks.
- Device capabilities use Expo camera, document-picker, and location modules.
- Android bootstraps Survey Core's missing window-listener surface before route imports.
- Native repositories share one Expo SQLite connection for `dynamic_offline.db`.
Rejected:
- Embedding `survey-react-ui` in Android or treating the HHQ renderer as a one-off screen.
Open:
- Extend the native capability registry across the remaining form definitions after HHQ field verification.
Archive:
- `session-log-archive.md#2026-07-27-native-hhq-renderer`

## 2026-07-28 08:45 [saved]
Goal: Reclaim the Android HHQ question viewport and add reliable draft recovery.
Decisions:
- Mobile uses compact header actions, section-state dots, and a left section drawer.
- Locality moved into the main DYNAMIC drawer.
- HHQ drafts persist in shared SQLite, save manually from the bottom row, and autosave after navigation.
Rejected:
- Persistent mobile section cards and a fixed full-width language toggle.
Open:
- Continue device QA across long translated labels and remaining native form definitions.
Archive:
- `session-log-archive.md#2026-07-28-native-hhq-mobile-viewport`

## 2026-07-28 09:45 [saved]
Goal: Make the Android HHQ shell and repeat editing denser and error-directed.
Decisions:
- Questionnaire title row owns Sections, title, and Close; language is an upper-right overlay.
- DYNAMIC chrome collapses on form scroll; compact dots exclude Preview while the drawer retains it.
- Bottom arrows sit at the outer edges, with compact Preview and Save controls centered.
- Blocked Next scrolls to the first visible validation problem.
- Repeat rows stay collapsed until Add/Edit and expose Add, Update, and Delete actions.
- Date questions use platform calendar widgets with `DD-MMM-YYYY` display and ISO storage.
Rejected:
- Treating a completed preview as a green questionnaire-section dot.
- Keeping repeat editors permanently expanded.
Open:
- Continue long-label and translated-content device QA.
Archive:
- `session-log-archive.md#2026-07-28-native-hhq-icon-shell-and-repeat-editor`

## 2026-08-17 [working]
Goal: Back up active mobile questionnaire drafts and restore them after same-user login on another device.
Decisions:
- Drafts use a dedicated authenticated sync channel and remain mutable recovery state, never finalized evidence.
- Server access is restricted to the authenticated user, registered device, raw-CRF permission, and current area scope.
- Newer client timestamps win; finalized evidence and terminal draft states prevent stale active recovery.
Open:
- Device-test backup, logout/local wipe, fresh login, sync, and resume after the next explicitly requested APK build.

## 2026-08-17 [working]
Goal: Stop repeated device registrations when the same Android phone logs out and logs back in.
Decisions:
- Android registration uses the app-scoped Android ID, while web and unsupported platforms retain the persisted UUID fallback.
- Logout continues clearing user study data; the stable Android identity is recomputed before registration on the next login.
Open:
- Rebuild and verify repeated logout/login on the physical phone when explicitly requested; legacy duplicate server rows remain untouched.

## 2026-08-17 [working]
Goal: Let authorized administrators deauthorize or reauthorize individual registered devices.
Decisions:
- Device authorization is stored per registered device and enforced on registration plus draft/main sync pull and push.
- Central administrators may manage every device; site research scientists may manage devices belonging to users in their own site.
- A rejected device registration does not persist the newly issued login tokens on the mobile device.
- Each user is limited to two authorized devices; existing devices may re-register, while a third distinct device requires an administrator to deauthorize one active device first.
Open:
- Rebuild and verify deauthorization against the physical phone when explicitly requested; existing duplicate device rows can be deauthorized individually.
## 2026-08-18 [saved]
Goal: Allow administrators to remove obsolete device registrations.
Decisions:
- Delete is available only after a device is deauthorized.
- Device registration deletion preserves historical form, event, and sync records containing the device ID.
- Central admins retain global scope; Site Research Scientists remain restricted to their site.
Open:
- None.
