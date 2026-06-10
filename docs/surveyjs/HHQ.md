# HHQ: Plain Language Behaviour Notes

This document explains what should happen when a field worker fills and submits the Household Questionnaire (HHQ) in the mobile app.

HHQ is the baseline household form. After HHQ is finally submitted, the app must be ready to continue the next work even when there is no internet.

## What HHQ Does

HHQ records:

- the household identity
- the household address and interview details
- the household member list
- which women are eligible for the Woman Questionnaire (WQ)

HHQ is not only a form. A completed HHQ creates the household record that later forms depend on.

## Draft Save

`Save Draft` is only for recovery.

Draft save means:

- the field worker can close and reopen the form
- entered answers are kept on the device
- the backend does not receive the draft
- no household is created from the draft
- no household members are created from the draft
- no WQ task is created from the draft

Drafts must never be treated as final survey evidence.

## Preview

Preview helps the field worker review the form before final submission.

Opening Preview may save the current answers as a draft, but this is still not final.

Nothing downstream should be created until the field worker confirms final submission.

## Final Submission

Final submission is the important step.

When the field worker finally submits HHQ, the app must immediately do all of this on the device:

1. Save one final HHQ response waiting to sync.
2. Create or update the household record.
3. Create or update household member records.
4. Find WQ-eligible women from the household roster.
5. Create local WQ eligibility records.
6. Create local WQ tasks for eligible women.

This must work offline.

The field worker should not need to wait for backend sync before seeing the household members or the WQ work that follows from HHQ.

## Household Identity

The household identity comes from:

- site
- locality
- structure map id
- household number

The stored household id looks like:

```text
site-locality-structure-household
```

Example:

```text
1-DEV001-9090-01
```

If this household does not already exist, final HHQ submission creates it.

If it already exists, final HHQ submission updates it.

This same rule applies on the device and on the backend.

## Household Members

HHQ creates household member records from the member list.

Each member id is made from the household id and the member number.

Example:

```text
household_id = 1-DEV001-9090-01
member 2 id = 1-DEV001-9090-01-02
```

If the member already exists, the record is updated.

If the member does not exist, the record is created.

## WQ Eligibility

HHQ decides who should get WQ.

A member is WQ eligible when:

- the member is female
- age is 18 to 49 years
- marital status is not `7`

For each WQ-eligible woman, final HHQ submission creates:

- an eligible-woman record
- a WQ task

The eligible-woman id is the same as the household member id.

Example:

```text
eligible woman id = 1-DEV001-9090-01-02
```

At this point:

- `wq_status` is `pending`
- `tracking_status` is `not_tracked`

Pregnancy tracking starts only after WQ is completed and the WQ answers show that the woman is pregnant.

## WQ Task Identity

The app may use a local UUID for the task row id.

But the task must also have a stable task key.

The stable task key is what prevents duplicate WQ tasks when both the mobile app and backend create the same task.

Example:

```text
1-DEV001-9090-01|person|1-DEV001-9090-01-02|WQ|baseline|2026-09-01|v1
```

Plain meaning:

- this task belongs to this household
- it is for this person
- it is a WQ task
- it is the baseline WQ
- it is linked to the HHQ interview date
- it uses this workflow rules version

The local task id can be different from the backend task id. The task key must be the same.

## Sync Push

When the device syncs, it pushes the final HHQ response.

It does not need to push separate household edits, member edits, eligible-woman edits, or WQ task edits as independent source records.

The final HHQ response is the evidence.

The backend uses that final response to create the same household, members, eligible women, and tasks.

## Backend Behaviour

When the backend receives a final HHQ response, it must:

1. Store the final form response.
2. Create or update the household.
3. Create or update household members.
4. Create or update eligible-woman records.
5. Create WQ tasks for WQ-eligible women.
6. Create HRF tasks anchored to the HHQ completion date.

The backend must not reject a valid HHQ just because the household was not already present.

HHQ is allowed to create the household.

## Sync Pull Back to Device

After backend sync, the device pulls back the confirmed backend state.

The pull should include:

- household records
- household member records
- eligible-woman records
- WQ tasks
- HRF tasks

If the backend sends a WQ task with the same task key as the local WQ task, the app should treat it as the same task.

It should not create a duplicate WQ task.

## Important Rule

Drafts are not evidence.

Final HHQ responses are evidence.

All household creation, member creation, WQ eligibility, WQ tasks, backend promotion, and sync reconciliation must come from final HHQ responses.

## Current Test Coverage

The main end-to-end test is:

```text
apps/api/src/hhq-offline-sync.e2e.integration.ts
```

It checks that:

- HHQ final submission works offline
- the local household is created
- local household members are created
- local eligible women are created
- local WQ tasks are created
- sync push sends the HHQ response to the backend
- backend creates the same household, members, eligible women, and WQ task
- duplicate push does not create another copy
- pull sync returns the backend-confirmed state

Related Expo tests:

```text
expo-prototype/src/tests/validateQuestionnaireSubmissionWorkflow.mjs
expo-prototype/src/tests/validateHouseholdSurveyBehaviors.mjs
expo-prototype/src/tests/validateQuestionnaireSurveyJsonTransforms.mjs
```

## Developer Pointers

Main implementation files:

```text
expo-prototype/src/modules/questionnaires/questionnaireSubmissionRepository.js
expo-prototype/src/modules/tasks/taskRepository.js
expo-prototype/src/modules/sync/syncService.js
apps/api/src/services/eventProcessor.ts
packages/shared-workflow/src/task-generators.ts
```

HHQ validation and rendering helpers:

```text
expo-prototype/src/modules/questionnaires/questionnaireSurveyJsonTransforms.js
expo-prototype/src/lib/householdSurveyBehaviors.js
expo-prototype/src/modules/questionnaires/questionnaireSurveyBehaviors.js
```

## Validation Summary

HHQ also has runtime validation for common field errors.

The app checks:

- required HHQ questions
- duplicate household id
- only one household head
- member age is not less than years living in the household
- member line numbers
- WQ eligibility count
- household member summary before Section 03
- GPS capture fields

These checks help the field worker fix errors before final submission.

Final submission still rechecks the blocking rules.
