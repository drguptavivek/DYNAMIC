# Unique ID Creation and Linkage

Working document for ID creation in the offline DYNAMIC data-capture app. The goal is to keep every questionnaire response linkable across household, woman, pregnancy, birth, visit, and event records.

## Principles

1. IDs used for linkage should be stable offline.
2. The PDF `Variable ID` is the canonical question code for each questionnaire item.
3. Form display labels can follow PDF wording, but stored question keys must remain unique and analyzable.
3. Every saved form response should store:
   - `form_id`
   - `form_version`
   - `visit_id`
   - the relevant entity IDs
   - `created_offline_at`
   - `updated_offline_at`
   - sync metadata when available
4. Human-readable hierarchical IDs can be used where the protocol defines components.
5. Random UUIDs can be used for app events, visits, and any permanent IDs that should not change if hierarchy labels are corrected.

## Question Code Convention

The questionnaire PDFs already define a `Variable ID` column. That value should be treated as the protocol code for the question.

In JSON, keep both:

| JSON field | Meaning | Example |
| --- | --- | --- |
| `sourceCode` | Exact PDF `Variable ID` | `4`, `3_i`, `23a` |
| `analysisCode` | Unique analysis-safe code derived from form + PDF variable ID | `hhq_04`, `hhq_3_i`, `pef_23a` |
| `name` | SurveyJS answer key, preferably same as `analysisCode` once migration is done | `hhq_04` |
| `title` | Question label only | `What is the number of the structure on map?` |
| `description` | Instructions/hints only | `Enter exactly 4 digits from the structure map.` |

Recommended analysis code format:

```text
<form_prefix>_<pdf_variable_id>
```

Examples:

| Form | PDF Variable ID | Analysis code |
| --- | --- | --- |
| Baseline Household | `4` | `hhq_04` |
| Baseline Household member row | `3_i` | `hhq_3_i` |
| Baseline Woman | `18` | `wq_18` |
| Pregnancy Enrollment | `23a` | `pef_23a` |
| Pregnancy Outcome | `34` | `pof_34` |
| Birth Assessment | `39` | `baf_39` |

Rules:

| Case | Rule |
| --- | --- |
| Numeric PDF IDs | zero-pad only if needed for readability, e.g. `04`; keep original in `sourceCode` |
| Letter suffix IDs | preserve suffix, e.g. `23a` |
| Repeated row IDs | preserve `_i`, e.g. `3_i` |
| Split PDF rows caused by extraction | merge back to one question and keep the single PDF ID |
| App-only calculated fields | use semantic app code and mark `sourceCode` as absent or `APP_CALC` |
| Repeated instances | store same question code inside repeated panel rows; row identity comes from parent row index/member ID |

Important: the current JSON already stores the exact PDF variable ID in `sourceCode`. A later migration should align SurveyJS `name` with `analysisCode` after all forms have passed PDF verification, because renaming `name` changes saved answer keys and skip expressions.

## ID Summary

| ID | Entity | Created in | Required inputs | Used by |
| --- | --- | --- | --- | --- |
| `site_id` | Site | Mapping frame / Baseline Household | Site choice: 1 Bareilley, 2 Ballabgarh, 3 Belgavi, 4 Chennai | All forms |
| `locality_code` | Hamlet/village/colony | Mapping frame / Baseline Household | Code of hamlet, village, or colony | Household ID |
| `structure_map_id` | Structure | Mapping frame / Baseline Household | HH number of structure on map | Household ID |
| `household_number` | Household within structure | Mapping frame / Baseline Household | HH number in structure | Household ID |
| `household_id` | Household | Mapping frame, confirmed in Baseline Household | `site_id + locality_code + structure_map_id + household_number` | All household-linked forms |
| `member_number` | Household member number | Baseline Household listing and later valid member additions | Sequential member number within household | Person ID |
| `household_member_id` | Person / household member | Household listing | `household_id + member_number` | Eligibility, Woman questionnaire, tracking |
| `woman_id` | Eligible woman | Derived from household member eligibility | `household_member_id` | WQ, pregnancy forms |
| `woman_permanent_id` | Woman permanent identity | Woman questionnaire or tracking eligibility process | Generated once | Pregnancy forms |
| `pregnancy_event_id` | Pregnancy event | Pregnancy Enrollment | `woman_id` + pregnancy event sequence or UUID | Ultrasound, follow-up, outcome |
| `outcome_event_id` | Pregnancy outcome event | Pregnancy Outcome | `pregnancy_event_id` + outcome sequence/type | Birth assessment, stillbirth, child follow-up |
| `child_id` / `birth_id` | Child/infant/fetus from outcome | Pregnancy Outcome / Birth Assessment opening | `pregnancy_event_id + birth_rank` | Birth assessment, stillbirth, newborn follow-up, child death |
| `visit_id` | Interview/session | App creates when a form is opened | UUID | All saved form responses |
| `event_id` | Domain event | App creates when a meaningful event occurs | UUID | Event log, routing, sync |
| `movement_event_id` | Individual movement event | Household Rounds | UUID + household/member link | Movement audit, eligibility recalculation |

## Primary Linkage Chain

For analysis and longitudinal follow-up, the key linkage chain is:

```text
site_id
  + locality_code
  + structure_map_id
  + household_number
  = household_id

household_id
  + member_number
  = household_member_id / person_id

household_member_id
  -> eligibility determination
  -> woman_id if eligible
  -> pregnancy_event_id for each pregnancy
  -> outcome_event_id for each pregnancy outcome
  -> child_id / birth_id for each child or qualifying fetal outcome
```

The household number plus member number, within site/locality/structure context, uniquely identifies a person. Eligibility is derived from that person's household listing data and subsequent valid membership updates.

## Baseline Household Questionnaire

Creates household-level IDs and household member IDs.

Important: sites first draw/map the study area and list all structures/households. Baseline Household Questionnaire should work from this pre-created household frame. HHQ validates and fills household details for an already mapped household; it should not create arbitrary new households outside the frame.

## Pre-Baseline Mapping and Household Frame

Before questionnaire administration:

| Step | Output |
| --- | --- |
| Draw/map study area | `map_area_id` / locality frame |
| List all structures in area | `structure_id` candidates |
| List households within each structure | `household_id` candidates |
| Assign structure map number | `hhq_structure_map_id` source |
| Assign household number within structure | `hhq_household_number` source |

The app should store this frame separately from questionnaire responses.

Suggested mapping-frame record:

```json
{
  "map_area_id": "site-locality-or-segment",
  "site_id": "01",
  "locality_id": "003",
  "structure_map_id": "0127",
  "household_number": "02",
  "structure_id": "01-003-0127",
  "household_id": "01-003-0127-02",
  "mapping_status": "listed",
  "baseline_enrollment_status": "pending"
}
```

Baseline HHQ then updates:

| Field | Behavior |
| --- | --- |
| `hhq_site_id` | selected/copied from mapping frame |
| `hhq_locality_code` | selected/copied from mapping frame |
| `hhq_structure_map_id` | selected/copied from mapping frame; validate exactly 4 digits |
| `hhq_household_number` | selected/copied from mapping frame; validate exactly 2 digits |
| `household_id` | created from mapping frame and confirmed at HHQ |

Future visit gate:

| Baseline status | Future visits allowed? | Rule |
| --- | --- | --- |
| `enrolled` / baseline HHQ completed | Yes | Household is part of longitudinal cohort |
| `empty_at_baseline` | No | Remains outside cohort even if later occupied |
| `vacant_or_not_dwelling` | No | Remains outside cohort |
| `not_found` | No | No future household rounds |
| `refused` | Unresolved | Confirm whether refusal is followed up or excluded |
| `postponed` | Temporary | Must complete baseline enrollment before future visits |

The app should check `baseline_enrollment_status` before opening Household Rounds or any downstream form for a household.

### Site and Locality

| Field | Stored ID role |
| --- | --- |
| `hhq_site_id` | `site_id` |
| `hhq_locality_code` | `locality_id` within `site_id` |

Recommended storage:

```text
site_id = hhq_site_id
locality_id = site_id + "-" + hhq_locality_code
```

Unresolved: final site/locality master list should decide whether codes are numeric only or prefixed by site.

### Structure ID

Created from:

| Field | Rule |
| --- | --- |
| `hhq_structure_map_id` | exactly 4 digits |

Recommended storage:

```text
structure_id = site_id + "-" + locality_code + "-" + structure_map_id
```

Example:

```text
01-003-0127
```

### Household ID

Created from:

| Field | Rule |
| --- | --- |
| `hhq_site_id` | site |
| `hhq_locality_code` | village/hamlet/colony |
| `hhq_structure_map_id` | 4-digit structure number |
| `hhq_household_number` | 2-digit household number within structure |

Recommended storage:

```text
household_id = site_id + "-" + locality_code + "-" + structure_map_id + "-" + household_number
```

Example:

```text
01-003-0127-02
```

Validation:

| Component | Validation |
| --- | --- |
| `structure_map_id` | exactly 4 digits |
| `household_number` | exactly 2 digits |
| full `household_id` | unique within study database |

Household split rule:

| Situation | ID behavior |
| --- | --- |
| Enrolled household splits during follow-up | Keep original `household_id` and household number |
| New household number requested because of split | Do not create one |
| Field context needed | Use non-analytic household notes or individual notes |
| Analysis | Do not use split notes for analysis or cohort definition |

### Household Member ID

Created inside the dynamic household listing.

Fields:

| Field | Role |
| --- | --- |
| `hhq_household_members` | repeated listing |
| `member_line_number` | member sequence within household |

Recommended storage:

```text
household_member_id = household_id + "-" + member_line_number
```

Example:

```text
01-003-0127-02-05
```

Validation:

| Rule | Note |
| --- | --- |
| member line number unique within household | Required |
| do not reuse line number for a different person after sync | Preserve audit trail |
| if a row is deleted before final save | app may renumber before IDs are committed |

Unresolved: whether member line numbers should be fixed once entered or only after HHQ completion.

### Household Listing Calculated IDs and Flags

The listing produces eligibility flags used for routing.

| Field | Created from | Use |
| --- | --- | --- |
| `member_woman_questionnaire_eligible` | sex, age, marital status | opens Woman questionnaire |
| `member_pregnancy_tracking_eligible` | sex, age, marital status | tracking / household rounds |
| `hhq_total_household_members` | count listing rows | household total |
| `hhq_total_eligible_women` | count WQ-eligible rows | expected WQ instances |
| `hhq_total_pregnancy_tracking_women` | count pregnancy-tracking eligible rows | expected tracking cohort |

## Woman ID

Created when a household member is eligible for the Woman questionnaire.

Recommended rule:

```text
woman_id = household_member_id
```

Reason: the woman is already uniquely identified as a household member.

Also store:

| Field | Source |
| --- | --- |
| `woman_name` | HH listing / WQ |
| `household_id` | HHQ |
| `household_member_id` | HHQ listing |
| `woman_permanent_id` | generated/stored if protocol requires a permanent random ID |

Unresolved: whether `woman_permanent_id` should be generated in Baseline Woman questionnaire or at the moment the HH listing marks her eligible.

## Woman Permanent ID

Appears in pregnancy forms as a stable woman identifier.

Recommended approach:

```text
woman_permanent_id = UUID generated once when woman enters tracking universe
```

Store a mapping:

| Key | Value |
| --- | --- |
| `woman_id` | hierarchical/member-linked ID |
| `woman_permanent_id` | UUID or protocol-generated permanent ID |
| `created_form_id` | form that created it |
| `created_visit_id` | visit where generated |

Reason: a permanent ID should survive corrections in site/locality/structure coding.

Unresolved: protocol may require a deterministic permanent ID instead of UUID.

## Pregnancy ID

Created in Pregnancy Enrollment Form.

Fields:

| Field | Role |
| --- | --- |
| `pef_woman_hh_member_id` | links pregnancy to HH member/woman |
| `pef_woman_permanent_id` | stable woman identifier |
| `pef_pregnancy_rank_since_baseline` | pregnancy sequence |
| `pef_pregnancy_id` | pregnancy ID |

Recommended storage:

Option A, deterministic:

```text
pregnancy_id = woman_id + "-P" + pregnancy_rank_since_baseline
```

Example:

```text
01-003-0127-02-05-P1
```

Option B, UUID:

```text
pregnancy_id = generated UUID
```

Recommended app behavior:

| Scenario | Behavior |
| --- | --- |
| pregnancy detected from WQ | create Pregnancy Enrollment with `source = baseline_woman_questionnaire` |
| pregnancy detected from Household Round | create Pregnancy Enrollment with `source = household_round` |
| pregnancy detected externally | create Pregnancy Enrollment with `source = ASHA/register` |
| same woman already has active pregnancy | warn before creating duplicate pregnancy |

Unresolved: choose deterministic pregnancy ID vs UUID. If UUID is chosen, still store `pregnancy_rank_since_baseline`.

## Ultrasound Record ID

Created in Ultrasound Form.

Recommended storage:

```text
ultrasound_id = pregnancy_id + "-USG" + ultrasound_sequence
```

or UUID if multiple reports can be added asynchronously.

Links:

| Field | Source |
| --- | --- |
| `pregnancy_id` | Pregnancy Enrollment |
| `woman_id` | copied from pregnancy |
| `ultrasound_sequence` | first, second, third report |

Unresolved: whether the protocol expects one ultrasound form per pregnancy or one record per ultrasound report.

## Pregnancy Follow-Up Visit ID

Pregnancy Follow-Up is a repeated form.

Recommended storage:

```text
pregnancy_followup_id = pregnancy_id + "-PFU" + followup_sequence
```

Each follow-up form response also has a `visit_id`.

Links:

| Field | Source |
| --- | --- |
| `pregnancy_id` | Pregnancy Enrollment |
| `woman_id` | copied from pregnancy |
| `followup_sequence` | app-generated count |
| `visit_id` | generated when form opened |

Unresolved: follow-up schedule and sequence naming.

## Pregnancy Outcome ID

Pregnancy Outcome closes a pregnancy episode.

Recommended storage:

```text
pregnancy_outcome_id = pregnancy_id + "-OUTCOME"
```

or store outcome as a single outcome record under `pregnancy_id`.

Links:

| Field | Source |
| --- | --- |
| `pof_pregnancy_id` | Pregnancy Enrollment |
| `pof_woman_hh_member_id` | copied from pregnancy/woman |
| `pof_woman_permanent_id` | copied from pregnancy/woman |

The outcome creates downstream `birth_id` records.

## Birth ID

Created after Pregnancy Outcome determines number of live births and qualifying fetal losses.

Fields:

| Field | Role |
| --- | --- |
| POF number of live born infants | number of live birth records |
| POF number of miscarriages/stillbirths | number of fetal-loss records, if GA >=20 weeks / 140 days |
| `baf_birth_rank` | birth/fetus sequence within pregnancy |
| `baf_birth_id` | birth ID |

Recommended storage:

```text
birth_id = pregnancy_id + "-B" + birth_rank
```

Example:

```text
01-003-0127-02-05-P1-B1
```

Rules:

| Scenario | Birth ID creation |
| --- | --- |
| singleton live birth | one `birth_id` |
| twins | two `birth_id`s |
| triplets | three `birth_id`s |
| miscarriage/stillbirth >=20 weeks or 140 days | one `birth_id` per fetus |
| abortion or fetal death <20 weeks | no Birth Assessment unless protocol says otherwise |

Unresolved: exact handling of miscarriage <20 weeks.

## Stillbirth Record ID

Created from Birth Assessment when stillbirth is determined.

Recommended storage:

```text
stillbirth_id = birth_id + "-SBF"
```

Links:

| Field | Source |
| --- | --- |
| `birth_id` | Birth Assessment |
| `pregnancy_id` | parent pregnancy |
| `woman_id` | parent woman |

Verbal autopsy:

| Rule | ID behavior |
| --- | --- |
| Stillbirth recorded | create/schedule `verbal_autopsy_due` event for 30 days after stillbirth/death event |
| VA completed | store `verbal_autopsy_id` linked to `birth_id` and stillbirth record |

Unresolved: whether Q21 clinical determination overrides signs-of-life fields Q16-Q20.

## Newborn Follow-Up ID

Newborn Follow-Up is repeated for live infants.

Recommended storage:

```text
newborn_followup_id = birth_id + "-NFU" + followup_sequence
```

Each follow-up also stores:

| Field | Source |
| --- | --- |
| `birth_id` | Birth Assessment |
| `pregnancy_id` | parent pregnancy |
| `visit_id` | generated when opened |
| `followup_sequence` | app-generated |

Unresolved: follow-up schedule and maximum follow-up sequence.

## Child Death ID

Created when a live-born infant/child death is reported.

Recommended storage:

```text
child_death_id = birth_id + "-CDF"
```

Links:

| Field | Source |
| --- | --- |
| `birth_id` | Birth Assessment / Newborn Follow-Up |
| `pregnancy_id` | parent pregnancy |
| `woman_id` | mother |
| `death_event_id` | event log |

Verbal autopsy:

| Rule | ID behavior |
| --- | --- |
| Child death recorded | create/schedule `verbal_autopsy_due` event for 30 days after death |
| VA completed | store `verbal_autopsy_id` linked to `birth_id` and child death record |

## Verbal Autopsy ID

Created when verbal autopsy is completed after the 30-day waiting period.

Recommended storage:

```text
verbal_autopsy_id = birth_id + "-VA"
```

If more than one VA attempt must be recorded:

```text
verbal_autopsy_id = birth_id + "-VA" + attempt_sequence
```

Links:

| Field | Source |
| --- | --- |
| `birth_id` | stillbirth or child death parent |
| `stillbirth_id` | if VA follows stillbirth |
| `child_death_id` | if VA follows child death |
| `death_event_date` | stillbirth/death event date |
| `va_due_date` | death/event date + 30 days |
| `visit_id` | VA visit |

## Visit ID

Created every time the app opens a form for data capture.

Recommended storage:

```text
visit_id = UUID
```

One visit may contain one form response. If the app later supports multiple forms in a single interview session, use:

```text
session_id = UUID
visit_id = UUID per form instance
```

Each visit stores:

| Field | Purpose |
| --- | --- |
| `visit_id` | primary key |
| `form_id` | questionnaire |
| `form_version` | exact version |
| `entity_type` | household / woman / pregnancy / birth |
| `entity_id` | relevant entity |
| `started_at` | local start time |
| `completed_at` | local completion time |
| `interviewer_id` | app user |
| `device_id` | offline device |
| `sync_status` | pending/synced/conflict |

## Event ID

Created for domain events that drive routing.

Recommended storage:

```text
event_id = UUID
```

Common event types:

| Event type | Entity |
| --- | --- |
| `household_created` | `household_id` |
| `household_listing_completed` | `household_id` |
| `woman_questionnaire_due` | `woman_id` |
| `woman_questionnaire_completed` | `woman_id` |
| `pregnancy_detected` | `woman_id` |
| `pregnancy_enrolled` | `pregnancy_id` |
| `ultrasound_due` | `pregnancy_id` |
| `ultrasound_completed` | `pregnancy_id` |
| `pregnancy_followup_due` | `pregnancy_id` |
| `pregnancy_followup_completed` | `pregnancy_id` |
| `pregnancy_outcome_recorded` | `pregnancy_id` |
| `birth_assessment_due` | `birth_id` |
| `birth_assessment_completed` | `birth_id` |
| `stillbirth_recorded` | `birth_id` |
| `verbal_autopsy_due` | `birth_id` |
| `verbal_autopsy_completed` | `birth_id` |
| `newborn_followup_due` | `birth_id` |
| `newborn_followup_completed` | `birth_id` |
| `child_death_recorded` | `birth_id` |
| `member_in_migrated` | `household_member_id` |
| `member_out_migrated` | `household_member_id` |
| `member_married_in` | `household_member_id` |
| `member_married_out` | `household_member_id` |
| `member_died` | `household_member_id` |

## Individual Movement Event ID

Individual movement is documented during Household Rounds for existing enrolled households.

Recommended storage:

```text
movement_event_id = UUID
```

Movement event record:

```json
{
  "movement_event_id": "uuid",
  "event_type": "member_in_migrated",
  "household_id": "01-003-0127-02",
  "household_member_id": "01-003-0127-02-06",
  "movement_type": "in_migration",
  "movement_date": "ISO-8601-date",
  "detected_visit_id": "uuid",
  "usual_resident_status": "usual_resident",
  "reason": "marriage_in",
  "eligibility_recalculated": true
}
```

Rules:

| Scenario | ID behavior |
| --- | --- |
| In-migration to enrolled household | create new `household_member_id`; create movement event |
| Marriage-in | create new `household_member_id`; create `member_married_in` event; recalculate eligibility |
| Out-migration | keep existing `household_member_id`; mark inactive/not usual resident from movement date |
| Marriage-out | keep existing `household_member_id`; create `member_married_out` event |
| Temporary visitor | not captured as a household member in current PDFs; do not create eligible woman or pregnancy tracking ID |
| Pregnancy/delivery visitor to natal household | not captured as a household member in current PDFs; do not create Woman questionnaire or pregnancy tracking eligibility for that household |
| Re-entry of same person | reuse original `household_member_id` if identity is certain; otherwise flag for review |

Household splits are not movement events. If field staff need to describe a split, store it only in household or individual notes.

## Notes Fields

Notes fields are free-text field context only.

| Field | Linked to | Used for analysis? |
| --- | --- | --- |
| `household_notes` | `household_id`, `visit_id` | No |
| `individual_notes` | `household_member_id`, `visit_id` | No |

Rules:

| Rule | Meaning |
| --- | --- |
| Notes do not create IDs | No new household, member, woman, pregnancy, or event ID is created from notes |
| Notes do not drive logic | Do not use notes for skip logic, eligibility, or routing |
| Notes are retained for review | Store for supervision, audit, and field context only |

## ID Fields to Add to Saved Form Metadata

The SurveyJS JSON can render the questionnaire, but the app save layer should wrap every response with metadata.

Suggested envelope:

```json
{
  "response_id": "uuid",
  "form_id": "baseline_household_questionnaire",
  "form_version": "2026.05.09",
  "visit_id": "uuid",
  "entity_type": "household",
  "entity_id": "01-003-0127-02",
  "parent_entity_type": null,
  "parent_entity_id": null,
  "ids": {
    "site_id": "01",
    "locality_id": "003",
    "structure_id": "01-003-0127",
    "household_id": "01-003-0127-02"
  },
  "answers": {},
  "created_offline_at": "ISO-8601",
  "updated_offline_at": "ISO-8601",
  "sync_status": "pending"
}
```

## Open Decisions

1. Should `woman_permanent_id`, `pregnancy_id`, and `birth_id` be deterministic hierarchical IDs or UUIDs?
2. At what moment is a household member line number locked?
3. Should deleted household listing rows remain tombstoned for audit?
4. Should all form responses use one generic `response_id`, plus entity IDs, or form-specific primary keys?
5. Should multiple ultrasound reports be repeated records or one form instance with repeated panels?
6. Should event records be generated immediately when eligibility is calculated, or only when the next form is opened?
