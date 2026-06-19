# Cohort And Identity Policy

This policy is subordinate to `docs/architecture.md` and source protocol material in `Refs/`.

## Source Inputs

- `Refs/FLOW.md`
- `Refs/Unique_Ids.md`
- `Refs/pretesing forms/forms_summary table_v2026.05.17.pdf`
- specific source questionnaire PDFs in `Refs/pretesing forms/`

## Canonical IDs

```text
household_id = site_id-locality_code-structure_map_id-household_number
household_member_id = household_id-member_number
person_id = household_member_id unless a later permanent person identifier is added
woman_id = household_member_id for WQ-eligible women unless a later permanent woman identifier is added
```

Current household ID format:

```text
1-02-0042-03
```

Current member ID format:

```text
1-02-0042-03-01
```

Rules:

- Normalize ID parts consistently before building IDs.
- Member number is allocated within the household. Do not trust editable form row order as the only identity authority.
- Pregnancy sequence is allocated within the woman.
- Birth rank is allocated within the pregnancy outcome.
- Deterministic protocol identity wins over random IDs when the protocol provides stable parts.

## Baseline Cohort

- Baseline HHQ validates/enrolls a household from the mapped frame.
- A mapped but not enrolled baseline household is outside the longitudinal cohort.
- Empty, vacant, or not-occupied households at baseline remain outside future follow-up.
- Future household visits are only for households enrolled at baseline.
- Household splits keep the original `household_id`. Do not create a split event or new analytic household number.
- Notes can document field context, but notes are not analysis, routing, eligibility, skip-logic, or cohort-definition inputs.

## Household Members

- HHQ and valid later household events create or update household members.
- Temporary visitors are not roster members.
- Temporary pregnancy/delivery visitors to a natal or maternal household must not become eligible from that household.
- New usual residents in an enrolled household may be added by the valid workflow for in-migration, birth, or marriage-in.
- Corrections to identity, DOB, sex, relationship, marital status, or residency status require audit and downstream recalculation.

## Scope

- Field workers operate inside assigned site/locality scope.
- Pull scope is enforced by intersecting request filters with active server-side user assignments.
- Push scope is resolved from server-known tasks/subjects when possible, not only from client-provided answers.
- New baseline HHQ scope for a mapped household is resolved from assigned area plus canonical ID parts.
