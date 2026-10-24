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

`structure_map_id` accepts 1-6 alphanumeric characters (normalized to uppercase). Existing numeric IDs remain valid, and numeric values shorter than four characters retain the legacy four-character zero-padding.

HDSS `house_no` uses the same minimum four-character padding for short numeric values on import and device caching (`1` becomes `0001`, `25` becomes `0025`). Longer and alphanumeric source house numbers are retained without truncation; registry UIDs, village codes, family numbers, and individual numbers are unchanged.

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
- BHQ Q9 dwelling outcomes 7 (vacant/address not a dwelling), 8 (destroyed), 9 (not found), 11 (shifted within the area), and 12 (Other, specify) use the matching interview outcome and a termination notice. Other requires a nonblank reason of at most 120 characters before continuing; preserve the exact entered reason on Outcome and in submitted evidence. Outcomes 11/12 also show `Please report to site supervisor for adding new household`. Final submission excludes the household, cancels other actionable household tasks, and never generates follow-up tasks from stale roster answers. Draft selection alone does not exclude the household. Legacy Outcome 10 remains ordinary Other and does not gain this exclusion behavior.
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
