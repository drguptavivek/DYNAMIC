# DYNAMIC Domain

DYNAMIC is an offline-first field data collection and workflow system for protocol-driven household, pregnancy, birth, child, and verbal autopsy follow-up.

## Language

### Evidence

**Finalized Response**:
An immutable submitted form response that counts as evidence and may drive Domain Events, cohort state, and Tasks.
_Avoid_: Saved form, draft, preview, synced response

**Form Submission**:
The reviewer-facing record of a submitted form, identified by form, submitter, submitted date, and whether it is original, updated, duplicate, rejected, or accepted.
_Avoid_: Abstract evidence item

**Form Submission Status**:
The current review outcome for a Form Submission, such as under review, accepted, superseded, duplicate, rejected, or field revisit requested.
_Avoid_: Has issues

**Open Issue Flag**:
An indicator that one or more unresolved Issues are linked to a Form Submission, independent of the Form Submission Status.
_Avoid_: Form status, resolution outcome

### Events

**Domain Event**:
A recorded domain fact that may affect cohort state, workflow, Tasks, Issues, or audit history.
_Avoid_: Generic event, log entry

**Cohort Event**:
A Domain Event about household, woman, pregnancy, birth, child, or verbal autopsy state.
_Avoid_: Generic event, task event

**Provisional Event**:
A Domain Event derived locally from a Finalized Response before backend sync classifies and accepts, rejects, duplicates, or holds the evidence.
_Avoid_: Local event, client event, accepted event

**Accepted Event**:
A Domain Event accepted as authoritative after evidence classification or admin approval.
_Avoid_: Provisional Event, local event

**Correction Event**:
A backend/admin-originated Domain Event created from an Approved Resolution when accepted evidence changes authoritative cohort state or workflow.
_Avoid_: Direct projection edit, comment, resolution note

### Workflow

**Workflow Decision**:
The outcome of applying workflow rules to accepted or provisional evidence, such as creating Tasks, suppressing Tasks, disabling Tasks, or creating review-visible Issues.
_Avoid_: Direct data edit, hidden sync result

**Task**:
A protocol-defined unit of field or review work for a known subject, with lifecycle state, scheduling context, and provenance from evidence or workflow rules.
_Avoid_: Pending work

**Task Lifecycle State**:
The current allowed state of a Task, such as planned, due, in progress, completed, missed, cancelled, superseded, closed, or disabled.
_Avoid_: Form Submission Status, Issue Status

**Provisional Task**:
A Task generated locally from finalized offline evidence or a Provisional Event before backend sync confirms the authoritative task.
_Avoid_: Local pending work, offline-only task

**Correction/Revisit Task**:
A Task created from an Issue or Approved Resolution that asks a field worker to correct, clarify, or revisit a prior Form Submission.
_Avoid_: Reopened protocol task, issue

**Task Worklist**:
A merged view of backend-confirmed Tasks and Provisional Tasks that tells a user what work needs attention next.
_Avoid_: Separate offline list, pending-work store

**Pending work**:
A worklist view over Tasks that still require field action, sync resolution, admin review, or operational attention.
_Avoid_: Domain object, task record

### Issues And Review

**Issue**:
A non-task item that needs review, comments, or resolution before normal workflow or data-quality handling can continue.
_Avoid_: Task, pending work

**Workflow Issue**:
A review-needed Issue created when provisional or synced evidence cannot safely drive normal workflow because it was rejected, held, duplicated, or conflicts with current cohort state.
_Avoid_: Hidden sync failure, disappeared task

**Manual Issue**:
An Issue created by a user rather than by backend classification, linked to the relevant area, household, person, Task, or Form Submission when known.
_Avoid_: Free-floating note

**Issue Status**:
The review workflow state of an Issue, such as open, commented, proposal submitted, under central review, returned to local review, resolved, or closed no action.
_Avoid_: Form Submission Status, Task Lifecycle State

**Issue Priority**:
A simple urgency label for an Issue, either normal or urgent.
_Avoid_: Severity scale

**Issue Comment**:
Free-text discussion, evidence, or context attached to an Issue.
_Avoid_: Resolution Proposal, approval decision

**Issue Worklist**:
A review queue of Issues that need comments, Resolution Proposals, approval, or operational follow-up.
_Avoid_: Task Worklist, protocol task list

**Issue View**:
A filtered, sorted, or grouped presentation of the same Issues, such as household-first or issue-type-first, without creating separate Issue records.
_Avoid_: Separate issue source, duplicate queue

**Submission Comparison**:
A side-by-side or change-highlighted review of related Form Submissions that helps a reviewer decide which form should be used.
_Avoid_: Raw JSON diff

**Resolution Proposal**:
A Local Data Manager's guided proposed answer to "Which form should be used?", comparing relevant Form Submissions with plain labels, notes, and an other-describe option for central approval.
_Avoid_: Approved Resolution, direct evidence edit

**Approved Resolution**:
A Central Data Manager's accepted disposition for a Workflow Issue that becomes authoritative through a backend/admin event.
_Avoid_: Direct task edit, direct evidence edit

### Actors, Devices, And Scope

**Field Worker**:
A field user who collects data and performs assigned protocol or correction/revisit Tasks within assigned area scope.
_Avoid_: Data manager, reviewer

**Field Supervisor**:
A supervisory user who supports field operations within assigned operational scope.
_Avoid_: Central admin, data manager

**Site Research Scientist**:
A site-scoped admin user who manages site activity and users within the site.
_Avoid_: Central admin, field supervisor

**Central Admin**:
A cross-site admin user who can manage central users, masters, and device assignments.
_Avoid_: Site admin, central data manager

**Local Data Manager**:
An area-scoped review responsibility that proposes resolutions for Workflow Issues and records supporting notes.
_Avoid_: Authentication role, final approver, central arbitrator

**Central Data Manager**:
A central review responsibility that approves, rejects, or returns proposed resolutions for Workflow Issues.
_Avoid_: Authentication role, local reviewer

**Registered Device**:
A field device known to the system and associated with a user for audit, sync, and local draft context.
_Avoid_: Unknown device, unregistered device

**Area Scope**:
The site, locality, or operational assignment that limits what a user may pull, push, review, or administer.
_Avoid_: Client filter, form answer
