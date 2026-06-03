# Review Questions for DYNAMIC SurveyJS Forms

These are the remaining items that need a domain decision before the SurveyJS
JSON can be treated as production-ready for offline data capture. All other
clear skip/display rules have been converted into `visibleIf` or app-level
`workflowActionIf` metadata.

## 1. HHQ cooking branch

Form: `HHQ`  
Source code: `8A`

Question: What type of fuel does your household mainly use for cooking?

Issue: The PDF extraction merged `8A`, `8B1`, and `8B2`. The intended logic
appears to be:

- If no food is cooked in the household, skip to question `9`.
- If cooking uses a stove, ask whether the stove has a chimney.
- If cooking uses a chullah, open fire, or other source, skip to cooking place /
  exhaust question `8C`.

Please confirm:

1. Should `8B1` and `8B2` be restored as separate SurveyJS questions?
2. Should `8B2` be visible only when `8B1 = Stove`?
3. Should `8C` be visible for all cooking households, or only for chullah/open
   fire/other cooking arrangements?

## 2. WQ pregnancy history dynamic panel

Form: `WQ`  
Source codes: `10`, `13`, `15_i` to `28_i`

Issue: The pregnancy-history section is now represented as a SurveyJS
`paneldynamic`, but the exact row logic needs confirmation. The PDF implies a
retrospective pregnancy history with special handling for singletons versus
multiple pregnancies and live birth versus stillbirth/miscarriage/abortion.

Please confirm the intended data model:

1. Should each panel row represent one pregnancy, or one fetus/baby within a
   pregnancy?
2. For twins/triplets, should there be one pregnancy row with nested baby rows,
   or multiple rows with the same pregnancy number?
3. Should miscarriage and abortion rows stop after pregnancy end date, without
   child survival fields?
4. For live births, should household line number be asked only when the child is
   still alive and living in the household?
5. Should the current-pregnancy question open only after the pregnancy-history
   loop is complete?

## 3. WQ husband and work module

Form: `WQ`  
Source codes: `04-Husband's background and Woman's work`, questions `1` to `9`

Issue: The PDF text for the marital-status check and work questions is merged
across rows. The app needs a clear branch structure.

Please confirm:

1. For the husband background questions, should husband age/education be asked
   only when the woman is currently married?
2. If marital status is widowed/divorced/separated/deserted, should husband
   background be skipped but work questions still asked?
3. For work:
   - If she worked in the last 7 days, go directly to occupation/payment.
   - If she did not work in the last 7 days, ask whether she has a job/business
     from which she was absent.
   - If no current job/business, ask whether she worked in the last 12 months.

Is this the intended flow?

Current WQ skip-pass note:

- I removed clear extraction-artifact skip conditions that incorrectly hid
  respondent identification/background fields based on later tobacco/alcohol
  questions.
- I added direct visibleIf logic for live-birth counts, child-death counts,
  pregnancy-loss count, delivery-complication details, anemia treatment, and
  work-module branches.
- Still needs PDF-level confirmation: whether husband education/occupation
  should be asked for currently married plus widowed/divorced/separated/deserted
  women, and whether `gauna not performed` / `live-in relationship` should skip
  husband background or be handled separately.

Additional WQ extraction issues to resolve:

1. `WQ 23` religion is split into two variables (`wq_religion` with Hindu only
   and `wq_religion_2` with the remaining categories). This should probably be
   one radio question with all categories and one `other_specify` field.
2. `WQ 18a` anemia is split into `wq_currently_anemia` and
   `wq_currently_anemia_18a` for the `don't know` option. This should probably
   be one radio question with Yes / No / Don't know.
3. `WQ 19c` husband-justification item is split into two variables, one with
   Yes/No and one with Don't know. This should probably be one radio question.
4. `WQ 1` in reproduction and `WQ 14` pregnancy-history intro were extracted as
   malformed radio questions with instruction text as choices. These likely need
   conversion to clean question/instruction plus, for pregnancy history, a
   repeat panel.
5. `WQ 38` pregnancy-status tracking eligibility is currently a malformed radio
   row. It should be an app-derived eligibility flag from WQ responses after
   marital status, hysterectomy, and sterilization questions are resolved.

## 4. HRF new-woman panel

Form: `HRF`  
Source codes: `17` to `25_i`

Issue: New women joining the household are represented as a `paneldynamic`.
Some extracted rows are duplicated or malformed around age and marital status.

Please confirm:

1. Should this panel open only when `How many women? > 0`?
2. Should marital status be asked only if age is 13 years or older?
3. Should education be asked only if age is 5 years or older?
4. Should eligibility for pregnancy tracking be auto-derived from sex, age
   18-44, and marital status currently married / gauna not performed / live-in?

## 5. PFF alcohol branch

Form: `PFF`  
Source code: `63`

Issue: The alcohol-introduction row was merged with example text and skip
instructions. It needs to be split into proper SurveyJS questions.

Please confirm the intended branch:

1. Ask whether alcohol was ever/currently consumed.
2. If no, skip to biomarkers/end of long form.
3. If yes, ask number of drinking days in the last month.
4. If drinking days is `00`, skip the standard-drinks question.
5. Otherwise ask average number of standard drinks.

## 6. POF home-delivery and multi-response branch

Form: `POF`  
Source codes: `42`, `54`, `56`, `59`, `62`

Issue: The home-delivery section contains multi-response questions and several
skip-to-next-item rules. The extraction preserved the source text but the exact
SurveyJS branching needs confirmation.

Please confirm:

1. Should the home-delivery section open only when delivery place is home?
2. For complications during delivery, should complication details open only if
   `yes`?
3. For “anything done to help the baby come out,” should this be a checkbox with
   up to three responses?
4. If C-section is selected in that question, should the form stop immediately?
5. For oral medication after all babies came out, should detail fields open only
   if `yes`?
6. For placenta not coming out on its own, should “what was done to help the
   placenta come out” open only if placenta did not come out on its own?
7. Should “entire placenta came out” be asked only for home deliveries?
