# Progress Parameters

Working document for operational progress indicators in the DYNAMIC offline data-capture application.

These parameters are for field monitoring and dashboard reporting. Exact numerators, denominators, grace periods, and edge cases can be refined later.

## Household Contact Coverage

### Percentage of households contacted every 2 months

Purpose: monitor whether enrolled households are being contacted at the expected household-round interval.

Definition draft:

```text
% HH contacted every 2 months
```

Interpretation:

| Item | Draft definition |
| --- | --- |
| Unit | Enrolled baseline household |
| Expected interval | Roughly every 2 months |
| Numerator | Number of enrolled households successfully contacted during the 2-month monitoring window |
| Denominator | Number of enrolled households expected to be contacted during that 2-month monitoring window |
| Exclusions | To be defined |
| Grace period | To be defined |
| Contact modes | To be defined from HRF/PFF/NFF combined visit rules |

Notes:

- Household Rounds Form is bi-monthly and telephonic as per the forms summary table.
- The purpose of household contact is to update the household roster/member status and detect pregnancies.
- If both roster change and pregnancy are detected in the same contact, roster update must happen first. Pregnancy enrollment requires the woman to already have a household member/person ID.
- Exception: if an interval pregnancy is detected for an already-enrolled woman with an existing valid `household_member_id` / `woman_id`, the Pregnancy Enrollment Form can be filled directly without first updating the roster.
- Household contact may later need to account for combined visits with Pregnancy Follow-Up Form and/or Newborn Follow-Up Form.
- This parameter should use only households enrolled at baseline.
- Empty/vacant/not-enrolled baseline households should not be included in the denominator.

Open calculation decisions:

1. Define exact 2-month window boundaries.
2. Define whether a successful HRF, PFF, or NFF contact counts as household contact when forms are combined.
3. Define grace period around expected contact date.
4. Define denominator handling for households temporarily unreachable, refused, migrated, or with no eligible women.
5. Define site-wise and overall reporting levels.
