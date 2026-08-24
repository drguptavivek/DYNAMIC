# Changelog

- Updated WQ Q21_i to capture either completed weeks or completed months through a unit selector and one two-digit input, and opened Q14 pregnancy entry in a dedicated view that returns to the pregnancy summary tables with the selected duration displayed.

- Moved the WQ Reproduction `Add pregnancy outcome` action above the submitted pregnancy tables so the next pregnancy can be started without scrolling to the bottom; other repeat-panel layouts remain unchanged.

- Kept the three WQ Reproduction mobile pages for Q1-Q13, Q14-Q21 pregnancy history, and Q22 onward while presenting and counting all three as one logical `02-Reproduction` section in navigation and progress.

- Updated the WQ pregnancy child summary table to show `S.No.`, born status, child name, sex, and the Q21 pregnancy duration in weeks/months, with horizontal scrolling on narrow mobile screens.

- Split WQ Reproduction into focused mobile sections: Q1-Q13 remains in Reproduction, Q14-Q21 and the submitted pregnancy/child table now occupy a dedicated Pregnancy History section, and the following section starts at Q22_i; respondents with no past pregnancies skip the pregnancy-history section.
- Added WQ pregnancy-order controls that move an entire pregnancy, keep all twins/triplets and answers attached, and renumber the resulting pregnancy sequence before it is saved; each pregnancy now summarizes its children in a compact S.No., name, and sex table.
- Kept the WQ multiple-birth workflow positioned at Q16_i after saving one child and opening the next child row, avoiding manual scrolling back through the pregnancy history.
- Fixed the Android release crash when adding the next child in a WQ twins/triplets pregnancy by importing the multiple-birth index and count fields used by the repeat-panel commit handler, with regression coverage for undeclared WQ runtime constants.
- Corrected the WQ pregnancy-history editor so intermediate twins/triplets advance with child-specific actions, only the final child shows `Add pregnancy outcome`, and the next child uses the actual SurveyJS panel returned during creation instead of an assumed index that could crash the app.
- Corrected the WQ Section 2 pregnancy-history boundary: each pregnancy now records only Q15_i-Q21_i for every baby, groups those baby rows under the pregnancy summary, and continues with Q22_i-Q28_i once outside the repeat editor; Q22_i Yes then opens the next pregnancy entry.
- Prevented WQ pregnancy-history bookkeeping fields, including the pregnancy group index, from rendering as editable questions in the native repeat-row editor.
- Grouped WQ pregnancy-history babies under their pregnancy: Single creates one baby/outcome row, Twins create two, Triplets create three, each baby retains separate Q16_i-Q28_i answers, and pregnancy-level Q22_i appears only after the final baby before another pregnancy can begin.
- Fixed WQ pregnancy-history Q20_i and Q21_i native inputs so exact two-digit day, month, and week values retain leading zeroes such as `01` and `02` instead of being converted to `1` and `2`; missing Q21_i week/month counterparts continue to use `00`.
- Fixed WQ Section 2 Q16_i wording so Q15_i Single shows the single-pregnancy outcome question, while twins and higher multiples show the Excel-defined first-baby and next-baby prompts during one-baby-at-a-time entry.
- Hid the WQ pregnancy-history multiple-birth index and count metadata from the native repeat-row editor while retaining those values for Baby 1/Baby 2 iteration and validation logic.
- Fixed WQ pregnancy-history Q21_i so two-digit Weeks and Months entries retain leading zeroes such as `01` and `02` while continuing to use the numeric mobile keyboard.
- Restored WQ Section 2 Q22_i immediately after Q21_i in the native pregnancy-history flow and made its Yes response continue into a new pregnancy entry after the current entry is completed.
- Completed the WQ Section 2 Q14_i-Q28_i instruction pass: Q20_i now displays the derived pregnancy outcome and correct child-name/date prompt, Q25_i and Q28_i use the recorded child's name and sex-specific wording, stale calculated outcomes are cleared when source answers change, and Q27_i locks the generated `00` when the child is not listed in the household.
- Tightened HRF Q6/Q7_i handling so Q6 accepts only two digits, Q7_i is read-only and generated from the household member sequence, and Household Head ID fills from the local roster when HRF is opened from a real task.
- Updated the Household Rounds Form to the 04 August 2026 Excel workbook sequence, including household-round details, new-woman repeat questions, Q5 No skip-to-outcome behavior, Q14_i pregnancy-tracking eligibility auto-calculation, workbook option codes, and the outcome choices.
- Fixed draft backup sync failing with "Draft sync rejected" after the scheduler regenerated revisit tasks: the drafts upsert now matches existing rows by draft_id or context key and updates in place, so a changed task reference no longer collides on the draft primary key and aborts the whole device sync.
- Reworked WQ Q4 stop routing: selecting option 2 (incapacitated), 3 (postponed), or 4 (not at home) now goes to the outcome page with only the matching outcome preselected (Incapacitated, Posponed, Not at home respectively) and all other options hidden; the reschedule/exclusion notice now appears only after final submit instead of immediately on selection.
- Added the required `wq_result_interview_other_specify` input so selecting Other (specify) on the WQ outcome shows a text box for the reason; WQ catalog count is 170 again.
- Added WQ outcome option 8 "Refused (consent or, refused during interview)" directly above Other (specify); existing option values are unchanged so stored draft/response data keeps its meaning.
- Fixed WQ Section 01 being silently blocked when a Date-of-Birth month/year entry failed its validator: multipletext item errors were stored on the item editor where neither the error display nor the blocked-Next scroll looked, so pressing Next appeared to do nothing. Item validator messages now render under each input, blocked Next scrolls to the offending question (including item, required, and repeat-row problems via the shared `hasNativeValidationProblem` helper), and section status chips flag item errors.
- Fixed WQ (and all native questionnaires) so pressing Next with a validation problem surfaces the failing question instead of silently doing nothing: Survey Core's DOM-dependent error-focus path threw on React Native and killed the Next/Complete handler; the native bootstrap now disables those DOM helpers on DOM-less runtimes.
- Fixed HHQ household-member question `6_i` so its Months and Years inputs read and retain values from the active repeated-member panel while typing.
- Tightened the HHQ household-member summary columns so Count, Name, Age, and Sex remain visible together on mobile screens.
- Fixed grouped HHQ coded-choice rows so starting a vertical scroll no longer changes the selected option; a completed tap is now required.
- Fixed native checkbox questions so scrolling over an option does not select it, and selected options can be tapped again to clear them.
- Made HHQ water-treatment question 4 optional and added `Dont Do Anything` as coded option `I` immediately after option `H`.

This file records notable changes to DYNAMIC. The repository does not currently use tagged releases, so completed work is grouped by dated development checkpoints from the Git history.

The format follows the principles of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), using the categories Added, Changed, Fixed, Security, Documentation, and Testing where applicable.

## Unreleased

- Updated WQ Section 2 Q16_i so single and multiple pregnancies use the same four coded outcomes; twins, triplets, and higher multiples complete the applicable Q16_i-Q28_i path one baby at a time on separate pregnancy-history rows under the same question columns, with Q16_i born-alive responses skipping Q17_i, and Q22 shown only after the final baby.
- Fixed WQ Section 2 Q15_i pregnancy-history wording so the first pregnancy row asks the i=1 first-pregnancy question and later rows ask the i>1 next-pregnancy question while keeping the same stored field and option codes.
- Fixed WQ Section 5 Domestic Violence skip and check logic from the Excel workbook: Q3-Q8 now require privacy plus current/live-in marital status, Q2 and Q21 are read-only calculated CHECK fields, and Q22 now accepts two-digit years while preserving special code `95`.
- Fixed WQ Section 4 Q13 and Q14 so husband alcohol days/drinks provide a two-digit numeric entry while preserving Excel special codes `00` and `95`.
- Fixed WQ Section 4 Q1 option 2 skip routing so it now starts at Q6 instead of jumping to Q15.
- Fixed WQ Section 4 Q2, Q7, and Q9 so husband age, cigarette count, and bidi count accept exactly two digits and preserve leading zeroes.
- Fixed WQ Section 4 Q5 so the husband occupation text changes from "What is..." for currently married to "What was..." for formerly married while keeping the same editable text answer field.
- Fixed WQ Q38 pregnancy-status-tracking eligibility so hidden/skipped Q34 no longer blocks Section 3; Q34 is required only when the Q33b/Q33c skip path actually asks the hysterectomy question.
- Fixed WQ Section 3 alcohol skip logic so Q16 = No hides Q17/Q18 and Q17 = 00 hides Q18 instead of letting a blank hidden Q17 reveal the drink-count question.
- Fixed WQ Section 4 Work/Husband Background skip logic from the Excel workbook, including currently-married-only husband follow-ups and the Q15-Q21 woman-work branch.
- Fixed the WQ Section 4 duplicate Q23 typo by renumbering the later mobility/property questions sequentially through Q28.
- Fixed WQ Section 2 pregnancy-history Q14-Q28 handling so the repeated pregnancy panel uses Excel code `14`, Q15_i remains editable, Q16_i is a single-choice outcome, Q20_i/Q21_i/Q28_i render their required date/duration/age boxes, `(NAME)` labels fill from Q18_i, Q23_i is calculated from Q16_i/Q17_i/Q21_i, and applicable two-digit blanks such as Q21_i/Q27_i/Q28_i preserve `00`.
- Added WQ Section 2 reproduction calculations for Q8, Q12, and CHECK 12, and made parent "No" skip paths store `00` in the related two-digit count fields from the Excel instructions.
- Tightened WQ Section 2 Reproduction skip logic from the Excel workbook so pregnancy-history date/duration fields wait for the Q16/Q17 outcome path, Q33c waits for Q33b, and Q34 waits for both Q33b and Q33c.
- Fixed HHQ Q60/Q62 outcome routing so skipped handwashing observations show only the correct preselected outcome option: Completed for Q60 options 2/3 and any Q62 selection, or Other specify for Q60 option 4.
- Grouped uploaded HHQ submissions by household, backfilled server classifications once after upgrade, and displayed chronological visit numbers plus results so legitimate revisit history no longer looks like duplicate forms.
- Fixed mobile sync so an obsolete local draft outside the freshly logged-in field worker's assignment scope is securely removed without blocking valid draft, response, task, household, or questionnaire synchronization.
- Added deauthorized-device deletion controls to Admin Users, including confirmation, role/site scope enforcement, active-device deletion protection, and preservation of historical records carrying the device ID.
- Fixed Android device registration so repeated logout and login on the same phone reuses a stable app-scoped Android device ID instead of creating a new random registered device on every login.
- Added per-device authorization controls to Admin Users, with confirmation before deauthorization and API enforcement that blocks deauthorized devices from login registration and sync until reauthorized.
- Added authenticated server backup and cross-device restore for active questionnaire drafts, including visible sync counts, while keeping drafts separate from finalized evidence and workflow processing.
- Fixed the questionnaire close button so exiting a baseline WQ form returns directly to Worklist instead of opening the empty questionnaire submissions dashboard.

### Documentation

- Added a root README describing the application purpose, backend and frontend structure, data flow, local development commands, and canonical project documentation.
- Added a branch inventory describing each local and remote branch, their relationships, their high-level contents, and the working-branch convention.
- Added a development guide covering the canonical runtime, environment setup, verification, and tested Android APK build and emulator workflow.
- Added production build and deployment guidance for the backend API and Admin UI, and clarified that the checked-in Nginx configuration is for local development.
- Updated the native SurveyJS renderer and survey-navigation policies with the compact mobile shell, section progress, repeat editing, and date-display rules.

### Added

- Added the 28 July 2026 Excel version of the WQ Baseline Woman's Questionnaire as workbook-ordered sections, including Respondent Background, Reproduction, Other Health Issues, Work/Husband Background, Domestic Violence, Biomarkers, and Outcome.
- Added WQ Q17 never-married terminal routing so option 7 opens the outcome page and sync records the response without creating follow-up tasks.
- Added WQ Q38 pregnancy-status-tracking eligibility as a read-only calculated field and switched WQ pregnancy enrollment task promotion to use that eligibility result.
- Added WQ Q10 month and year of birth entry boxes while preserving the 98/9998 unknown-month/year coded responses.
- Merged WQ Q10 don't-know month/year responses into the same Q10 card instead of rendering them as a separate question.
- Limited WQ Q11 age at last birthday to a two-digit numeric entry while preserving leading zeroes.
- Changed WQ Q18 husband/live-in partner entry to a household-member dropdown limited to male members older than 15, with a "Husband not in household" option that fills Q19 as 00.
- Changed the WQ Q18 household-member dropdown to open inline below the question instead of as a bottom sheet.
- Changed WQ Q19 outside-household husband/partner line numbering to allocate 00, 99, 98, and so on by the woman's order within the household.
- Added a two-digit WQ Q9 years entry above the Always/Visitor special responses while preserving values like 00, 02, and 09.
- Added faker-based admin password generation using three 5-7 letter internally capitalized words plus a 3-digit code, reset QR codes on the Users page, and mobile QR-code login through the existing field-app authentication flow.
- Refined the admin generated-password modal so the one-time password and QR warning is shown as a single notice without an extra top heading.
- Changed generated-password QR codes to contain only an encrypted server-issued login payload instead of readable username/password credentials, and added a dedicated mobile QR login endpoint.
- Made the mobile left drawer menu scrollable so all navigation pages remain reachable on smaller phone screens.
- Added mobile Worklist Outdated-stage filtering for overdue draft tasks, with overdue draft cards shown in the blue outdated style while Draft/Pending cards remain yellow.
- Fixed mobile Worklist draft matching so WQ drafts saved by woman individual ID are also matched to their parent household task and appear consistently with Draft/Pending Forms.
- Added a WQ pregnancy-history repeated panel for Excel questions 15_i through 28_i while keeping the existing `wq_pregnant` answer key for pregnancy workflow promotion.
- Added Excel-derived WQ skip and applicability rules for respondent background, reproduction, pregnancy-history follow-ups, eligible-only health/work/domestic-violence/biomarker sections, and related follow-up questions.
- Added WQ visit-number handling plus Q4 woman-availability revisit, incapacitated outcome, and visit-3 exclusion flow to match the finalized task rule.
- Added a mobile Draft/Pending Forms drawer page for read-only review of local draft forms saved on the device.
- Added admin Form Language Management for global questionnaire translations, including form/permission-site/language selectors, English source text, saved selected-language review text, per-question Edit/Save controls for question and option translations, and central-admin permission ON/OFF for all non-field-worker users of a selected site.
- Added CSV export/import to Form Language Management so global questionnaire language files can be exported in fixed questionnaire order, filled offline, previewed on import, and saved only after confirming the matched rows.
- Added option-level Edit buttons in Form Language Management so each option opens only its own translation editor.
- Added backend form-language translation and user-level permission storage, with global translated SurveyJS JSON returned through protocol form endpoints and sync form-version checksums.
- Added database seeding of bundled HHQ translations so existing Hindi question text in the questionnaire JSON is copied into database-backed global language records and then shown from the database.
- Added mobile runtime form loading from synced protocol form JSON so field devices can use refreshed questionnaire language after Sync Now.
- Added Kannada, Marathi, Tamil, and Telugu to the mobile questionnaire language switcher while keeping Urdu available only as questionnaire content.
- Added mobile Completed Forms and Uploaded Forms drawer pages for pending and synced submitted CRFs.
- Added a mobile Upload Errors drawer page for submitted CRFs that the server rejects or classifies as duplicates during sync.
- Added search plus Site ID, Form ID, and Locality filters to the mobile Completed Forms and Uploaded Forms pages.
- Added mobile Worklist draft badges, household head/address display, and an eye action for household detail review.
- Showed the household head name beside the Worklist task-type badge for quick HHQ identification.
- Added a prominent HHQ Visit No badge on mobile Worklist household cards.
- Added member count display to the mobile Worklist household eye-details popup.
- Aligned the mobile Worklist HHQ Visit badge with the current visit number shown inside the HHQ form.
- Removed the duplicate household ID from the Worklist card detail line, leaving address below the primary household ID.
- Labeled the Worklist card date as Target Date for clearer field-worker context.
- Added the Household ID above the dedicated mobile HHQ final review screen so field workers can verify which household they are submitting.
- Added HHQ Section 2 CHECK LISTING roster flow so completed member entries are reviewed by count/name/age/sex before continuing or adding another member.
- Added a grouped HHQ Section 3 drinking-water source control where label-only categories reveal coded child options while saving only the final source code.
- Added the same grouped coded-option control for HHQ Section 3 toilet facility type, keeping label-only toilet categories out of saved answers.
- Added grouped coded-option controls for HHQ Section 3 floor, roof, and external wall material questions so Natural, Rudimentary, and Finished category labels reveal coded child options without being saved.

### Fixed

- Centered the mobile Worklist task details modal with safe screen-edge spacing so its Open Form action remains clear of Android navigation controls.
- Fixed the mobile Worklist locality and stage dropdowns so they float above the page without expanding the filter panel and close when the user taps outside.
- Removed the manual `Record Failed Attempt` action from the mobile Worklist task details modal while retaining existing attempt history and policy-driven final-close handling.
- Added server form-response history to mobile sync pull with a separate backfill cursor so fresh or already-synced logins can populate Uploaded Forms and Upload Errors after Sync Now.
- Fixed mobile Worklist draft counts by loading non-terminal task candidates, including planned HHQ/WQ tasks that already have active local drafts.
- Hid orphan local drafts without matching non-terminal Worklist tasks from Draft/Pending Forms so the draft count stays consistent with the Worklist Draft section.
- Hid the compact mobile language switcher on questionnaire preview and member-summary screens so it does not cover review header content.
- Kept compact mobile questionnaire preview action buttons inside the screen by stacking the review header controls on small layouts.
- Added a mobile Worklist stage dropdown for All stages, Outdated, Current, Upcoming, Future planned, and Draft views while keeping future planned follow-up tasks hidden from the default list.
- Kept baseline HHQ/WQ planned tasks visible and openable in the mobile Worklist while still hiding future HRF follow-up rounds until their window opens.
- Fixed the compact mobile questionnaire language menu so it opens in a native modal instead of being clipped or blocked by the form scroll surface.
- Hid future planned HRF rounds from the mobile Worklist until their visit window opens, preventing years of scheduled HRF tasks from appearing as current work.
- Fixed the mobile Profile assigned-localities panel so household-assigned field workers see localities derived from their synced worklist tasks when formal locality assignments are absent.
- Closed the mobile Worklist task detail modal before opening a questionnaire so its transparent native overlay cannot block radio buttons, navigation, or form controls.
- Fixed mobile WQ radio answers not staying selected by aligning native SurveyJS read-only checks with renderer behavior and keeping tapped radio state stable while answer snapshots refresh.
- Fixed generic mobile questionnaire radio answers for non-HHQ forms by keeping a live ref-backed answer snapshot in the shared questionnaire dashboard.
- Fixed mobile questionnaire language overlay touch handling so the compact language button cannot block radio/select controls underneath it.
- Fixed WQ Q3 interviewer visit date validation so the date picker no longer shows a numeric-value error.
- Allowed task-backed HHQ revisit submissions to reuse their assigned household ID without triggering duplicate household validation.
- Changed mobile HHQ final submit to remain offline-first by saving completed submissions locally and moving duplicate/server-rejected uploads into Upload Errors during Sync Now.
- Routed mobile final HHQ submit to Completed Forms and handled server-promoted canonical event rejections so classified uploads move out of red pending sync state.
- Prevented non-HHQ task forms from loading HHQ-only survey behavior, keeping all taskbuilder questionnaires on the shared native renderer and routing their final submits to Completed Forms.
- Reduced mobile final-save delay by skipping unnecessary list/household refreshes before navigating submitted forms to Completed Forms.
- Cleaned up the mobile generic questionnaire shell so WQ and other non-HHQ forms use a tighter phone layout without the bulky progress card or duplicate top Save/Preview controls.
- Fixed the mobile WQ/generic questionnaire screen so an open form uses a full-screen compact overlay with an HHQ-style header, floating language control, and no dashboard/submissions panel underneath.
- Fixed offline sync on upgraded mobile databases by adding missing `updated_at` migrations for pending form responses and domain-event outbox records.
- Improved generic questionnaire responsiveness by avoiding full progress/section recalculation on every answer change in large forms such as WQ.
- Improved large mobile questionnaire scrolling and button responsiveness by virtualizing compact native form pages instead of mounting every question in a large section at once.
- Stabilized large mobile questionnaire scrolling and language switching by keeping compact scroll events out of parent state updates, removing the duplicate compact language switcher, and forcing native page rows to repaint when locale changes.
- Reworked compact mobile questionnaire rendering to progressively mount large sections in small batches, preventing variable-height list drift and keeping navigation/language controls responsive while WQ loads.
- Forced native Android/iOS questionnaire entry screens to use the compact mobile form surface regardless of reported window pixel width, keeping WQ and other non-HHQ forms out of the dashboard/submissions layout on phones.
- Reduced typing lag in native text and number questions by deferring full renderer refreshes until blur-time validation instead of every character entry.
- Made generic mobile questionnaire language switching local to the open form first, avoiding broad app-context repaint work before the selected language appears.
- Made native questionnaire language switching read selected-language text directly from the active question and option, keeping large WQ forms responsive and falling back to English when a translation is missing.
- Made the compact native questionnaire language menu open immediately on phones and reduced question-row re-render work during language changes without changing the section-wise mobile layout.
- Kept compact questionnaire sections fully visible while making the native language menu open without layout measurement or animation delays.
- Reduced compact questionnaire background render batch size so WQ controls become usable sooner while large sections continue loading in smaller chunks.
- Kept large generic mobile questionnaires such as WQ in section-wise mobile layout while progressively mounting the section to avoid freezing the screen.
- Opened non-HHQ task questionnaire entry routes in the same collapsed mobile shell as HHQ so WQ uses the full-screen form surface instead of the dashboard/submissions layout.
- Made WQ task openings fillable by preloading the woman member ID, editable woman name, household head, village/site, and today's interview date while locking only generated identity fields.
- Made native single-select/radio answers show their selected state immediately on tap while still writing through the SurveyJS model for draft and submit.
- Fixed WQ/generic mobile questionnaire choice controls so the language menu cannot leave a touch-blocking overlay and choice controls only disable for explicit read-only fields.
- Fixed repeated-panel visibility scoping for non-HHQ questionnaires so WQ pregnancy-history follow-up questions evaluate against the current pregnancy row.
- Cleared mobile offline tasks, households, drafts, submitted forms, protocol form cache, sync metadata, and app-lock PIN/biometric setup on explicit Logout while preserving cached data during normal PIN/biometric unlock.
- Added a mobile Logout confirmation warning before deleting current-user data stored on the device.
- Highlighted mobile Worklist task cards in yellow after a local manual draft save and refreshed Worklist draft status after saving.
- Added localized mobile Save Draft confirmation and returned field workers to Worklist after manually saving a draft.
- Kept HHQ manual draft saves stable across section changes and language switching, preserving earlier section answers and restoring the draft language on reopen.
- Stabilized HHQ draft reopening from the Worklist by carrying the task id in the questionnaire route and recovering the task context from the local task cache before looking up saved drafts.

- Kept recovered HHQ task context memoized so SurveyJS does not rebuild the active draft form during route renders or language changes.
- Memoized runtime questionnaire JSON on the route screen so synced form translations do not recreate the HHQ SurveyJS model and clear restored draft answers during reopen.
- Updated native SurveyJS value writes to use the model-backed setter for top-level questions so filled HHQ answers reliably enter `model.data` before draft save.
- Made HHQ draft saves collect top-level SurveyJS question values directly and show saved/restored answer counts for device-side draft verification.
- Reapplied saved HHQ draft answers after restoring the saved form language so reopening Hindi or other-language drafts does not leave the rebuilt form blank.
- Passed the exact active draft id from Worklist into HHQ reopen routes so saved draft answers restore deterministically instead of relying only on task/subject matching.
- Refreshed the Worklist task modal's Open Form action against the latest local task and active draft before routing, preventing stale modal task data from opening a blank HHQ draft.
- Synced native HHQ renderers with SurveyJS model-backed values so restored draft answers display in text, date, radio, checkbox, grouped-select, and read-only controls.
- Made HHQ draft collection read the native question value source used by the mobile controls so visually selected radio answers are included in the saved draft payload.
- Prevented older asynchronous HHQ draft restores from repainting the form after a newer Save Draft action, and made draft restore prefer the newest household/form match over stale route draft ids.
- Restored assigned-locality visibility in the mobile navigation drawer by falling back to synced assignment codes when locality master names are not yet loaded.
- Preserved manually saved questionnaire draft payloads for reopening from Worklist.
- Prevented HHQ draft restore from marking the form dirty and overwriting saved local answers during reopen, and mirrored restored answer snapshots into native controls so saved radio/text/date values remain visible after route refreshes.
- Made HHQ draft restore happen before the SurveyJS model is shown, removed the duplicate post-render restore path, and stopped render-time model mutation so saved draft answers are not cleared immediately after reopening.
- Allowed HHQ questionnaire language switching after draft restore by applying the saved draft language only once when the draft is opened.
- Matched HHQ draft restore by household/form/user/device instead of the changing task id, while still keeping task id on the draft record for context.
- Prevented repeated Save Draft taps from creating duplicate active Draft/Pending entries for the same household form.
- Preserved the field device id when restoring a mobile login session and allowed local draft lookup to recover older rows saved under a different device-key fallback.
- Refreshed mobile draft state after final submission so submitted drafts leave Draft/Pending Forms and appear as pending completed forms for offline sync.
- Scoped mobile Draft/Pending Forms to the logged-in user's site so site users do not see local drafts from other sites.
- Fixed API startup dotenv ordering so DB-backed endpoints use the configured local database connection when the dev server starts.
- Changed field-app shell navigation to replace drawer pages instead of stacking them, preventing Android Back from replaying old app pages or submitted forms.
- Separated the Worklist card tap target from the household eye action so opening household details does not also open the task modal.
- Tightened the mobile Completed Forms and Uploaded Forms layouts so Refresh stays inside the header and filters remain in a compact horizontal row.
- Preserved blank household consent from synced/imported households until HHQ consent is actually collected.
- Fixed mobile questionnaire language fallback so untranslated option labels show English/default text instead of raw coded values when another language is selected.
- Fixed assigned HHQ site/locality master-choice filtering so existing localized option labels are preserved instead of falling back to English after sync.
- Fixed compact mobile questionnaire scrolling so section progress dots inside the form are display-only, preventing accidental section/preview navigation while scrolling.
- Fixed HHQ mobile form section stability by keeping the outer questionnaire shell height fixed during scrolling, updating language in-place instead of rebuilding the survey model, restoring drafts only once per opened task, and navigating only across visible SurveyJS pages.
- Tightened the Form Language Management editor layout by removing repeated language labels inside translation boxes, aligning edit actions in each row, and editing question/option translations inline in the existing value box.
- Added an import confirmation prompt before saving previewed CSV translations in Form Language Management.
- Fixed Form Language Management CSV export so every real questionnaire field is exported in the simple translator-friendly CSV format and fixed questionnaire order.
- Fixed Form Language Management CSV import so option values that lose leading zeroes in spreadsheet tools still match the questionnaire's canonical option codes.
- Avoided duplicate locality labels when locality name and code are identical in mobile household detail views.
- Added automatic Expo field-device registration after login and a Registered Device column in the admin Users table.
- Filled blank restored HHQ drafts in the dedicated mobile HHQ flow with the current automatic household head, address, and interviewer visit date while preserving user edits.
- Added the HHQ competent-respondent availability gate below Visit No, including revisit/exclusion messages and Visit 3 removal of the Postponed option.
- Added a read-only HHQ Visit No field after Interviewer visit date, derived from the current task attempt count and capped at 3.
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

- Added a WQ Survey Core skip-logic test covering key Excel-derived respondent background, reproduction, pregnancy-history, health, work, and domestic-violence branches.
- Updated field-worker household scope coverage to verify only explicitly assigned households are visible to that worker.

### Fixed

- Changed the Expo sync completion message from "forms updated" to "questionnaires refreshed" for server questionnaire-definition refreshes.
- Added native HHQ alerts when competent-respondent options require revisit or final household exclusion.
- Clarified the Expo sync completion message so cancelled/closed task updates are not presented as open Worklist tasks.
- Prevented HHQ early-stop submissions from promoting a household into baseline HRF follow-up tasks; the API now records revisit-needed or excluded status and schedules only the next HHQ visit when applicable.
- Hid the initial HHQ Section 2 add-member launcher and opened the first member-entry form directly, with additional member entry driven by CHECK LISTING.
- Corrected HHQ women-questionnaire eligibility auto-calculation so only female household members aged 18-49 who are not never married are marked eligible.
- Padded HHQ member line numbers to two digits and generated member IDs as household ID plus line number, such as `1-01-0001-01-01`.
- Tightened HHQ Section 2 age skip logic for marital status, birth registration, school attendance, and highest grade questions.
- Synced HHQ generated member fields into the live member editor so women's questionnaire eligibility visibly ticks Yes/No immediately.

### Changed

- Aligned the baseline household questionnaire with the 28 July 2026 Excel workbook sections, including generated HHID/INDVID display fields, a separate Outcome section, exact coded options such as 95/98, and removal of non-Excel GPS fields.
- Moved the HHQ CHECK LISTING A/B prompts out of the member repeat row into the post-roster summary flow, showing member count/name/age/sex before deciding whether to add more members or continue to Section 3.
- Prefilled HHQ household head name, address, and today's interviewer visit date while keeping those HHQ fields editable.
- Expanded the mobile household detail card to show synced head name, site/locality, structure, household number, address, mobile, consent, interview, and sync status.
- Showed household address and head name in the admin Study Masters Add Households table.
- Prefilled and locked HHQ site, locality, structure map number, and household number from the assigned task household ID.
- Capped Expo HHQ and WQ task attempt limits at 3 for the finalized baseline questionnaire flows.
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
- Limited each user account to two authorized mobile devices; third-device login now instructs the user to contact an administrator, while existing registered devices can log in again normally.
