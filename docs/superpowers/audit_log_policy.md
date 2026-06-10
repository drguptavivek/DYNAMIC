# DYNAMIC - PreTESTING - Audit Log Policy

Status: accepted working policy

This file defines the audit-log rule for field-level edits made after a form has been submitted.

## Scope

This policy applies to edits at the submitted-form field level.

The submitted form response remains immutable. Field edits are recorded in a separate audit-log table. Approved edits may then update normalized domain state through the correction workflow, but the original submitted answers are not overwritten.

## Field-Level Audit Log

One row captures the full lifecycle of one proposed field edit.

```text
form_submission_field_audit_log
  audit_log_id
  form_submission_id
  field_date
  value_prog
  value_new
  comments
  edited_on
  edited_by
  approved_on
  approved_by
  rejected_on
  rejected_by
```

## Field Meanings

| Field | Meaning |
| --- | --- |
| `audit_log_id` | Permanent ID for the audit-log row. |
| `form_submission_id` | Submitted form being audited. |
| `field_date` | Date linked to the submitted field/edit context. |
| `value_prog` | Value present before the proposed edit. |
| `value_new` | Proposed edited value. |
| `comments` | Edit reason, review note, or contextual comments. |
| `edited_on` | Date/time when the edit was recorded. |
| `edited_by` | User who recorded the edit. |
| `approved_on` | Date/time when the edit was approved. |
| `approved_by` | User who approved the edit. |
| `rejected_on` | Date/time when the edit was rejected. |
| `rejected_by` | User who rejected the edit. |

## Lifecycle Rules

- On edit, create one audit-log row with `edited_on`, `edited_by`, `value_prog`, `value_new`, and `comments`.
- On approval, update the same row with `approved_on` and `approved_by`.
- On rejection, update the same row with `rejected_on` and `rejected_by`.
- A row must not have both approval and rejection fields populated.
- Current lifecycle state is derived from the row:
  - pending: neither `approved_on` nor `rejected_on` is populated.
  - approved: `approved_on` is populated.
  - rejected: `rejected_on` is populated.

## Excluded Fields

The field-level audit-log table does not include:

- `action_type`
- `approval_status`
- `form_version`
- `source_code`
- `analysis_key`
- `field_label_snapshot`
- linked lifecycle/action rows
