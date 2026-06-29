# DYNAMIC Domain

DYNAMIC is an offline-first field data collection and workflow system for protocol-driven household, pregnancy, birth, child, and verbal autopsy follow-up.

Field workers complete Study Forms (CRFs) in the Expo app. When a form is finalized, it becomes a Finalized CRF. Some Finalized CRFs indicate that a real-world study event has occurred, such as household enrollment, pregnancy enrollment, birth outcome, or child death. These are recorded as Study Events. Accepted Study Events can change cohort state and trigger Workflow Decisions, which create Task Plans and Tasks for the Task Worklist.

```text
Study Form (CRF)
  -> Finalized CRF
  -> Study Event
  -> Workflow Decision
  -> Task Plan
  -> Task
  -> Task Worklist
```

## Language

### Study Forms And Evidence

**Study Form (CRF)**:
A protocol Case Report Form implemented as a DYNAMIC form, such as HHQ, WQ, PEF, PFF, POF, BAF, CDF, or VA.
_Avoid_: Generic form, SurveyJS page, questionnaire screen

**Finalized CRF**:
An immutable field-confirmed response to a Study Form that counts as study evidence and may drive Study Events, cohort state, and Tasks.
_Avoid_: Saved form, draft, preview, synced response, submitted evidence, finalized evidence record

**Form Submission**:
The reviewer-facing record of a Finalized CRF, identified by form, submitter, submitted date, and review outcome.
_Avoid_: Abstract evidence item, raw response

**Form Submission Status**:
The current review outcome for a Form Submission, such as under review, accepted, superseded, duplicate, rejected, or field revisit requested.
_Avoid_: Has issues

**Open Issue Flag**:
An indicator that one or more unresolved Issues are linked to a Form Submission, independent of the Form Submission Status.
_Avoid_: Form status, resolution outcome

### Events

**Study Event**:
A recorded study fact that may affect cohort state, workflow, Tasks, Issues, or audit history. Code and architecture may call this a Domain Event.
_Avoid_: Generic event, log entry, message

**Cohort Event**:
A Study Event about household, woman, pregnancy, birth, child, or verbal autopsy state.
_Avoid_: Generic event, task event

**Provisional Study Event**:
A Study Event derived locally from a Finalized CRF before backend sync classifies and accepts, rejects, duplicates, or holds the evidence.
_Avoid_: Local event, client event, accepted event, provisional event, provisional domain event

**Accepted Study Event**:
A Study Event accepted as authoritative after evidence classification or admin approval.
_Avoid_: Provisional Study Event, local event, accepted event, accepted domain event

**Correction Event**:
A backend/admin-originated Study Event created from an Approved Resolution when accepted evidence changes authoritative cohort state or workflow.
_Avoid_: Direct projection edit, comment, resolution note

### Workflow

**Workflow Decision**:
The outcome of applying study workflow rules to accepted or provisional evidence, such as creating Task Plans, suppressing Tasks, disabling Tasks, or creating review-visible Issues.
_Avoid_: Direct data edit, hidden sync result

**Workflow Rule Engine**:
The shared study-rule logic that reacts to Study Events and current subject state to produce Workflow Decisions. Architecture discussions may call this an inline Process Manager.
_Avoid_: Saga, BPM engine, workflow service, event bus consumer, inline process manager

**Task Plan**:
A deterministic description of protocol work to create, cancel, suppress, or supersede, including subject, task type, protocol label, target date, rule version, and provenance. Code may call this a Task Descriptor.
_Avoid_: Task row, random task id, scheduled job, task descriptor

**Task**:
A protocol-defined unit of field or review work for a known subject, with lifecycle state, scheduling context, and provenance from evidence or workflow rules.
_Avoid_: Pending work, Form Submission, Task Plan

**Task Lifecycle State**:
The current allowed state of a Task, such as planned, due, in progress, completed, missed, cancelled, superseded, closed, or disabled.
_Avoid_: Form Submission Status, Issue Status

**Task Lifecycle Event**:
A recorded fact about a Task's progress or disposition, such as an attempt, completion, missed outcome, cancellation, supersession, close, or reopen.
_Avoid_: Direct task row update, status edit

**Task Projection**:
The derived current state of a Task, rebuilt from its Task Plan and Task Lifecycle Events.
_Avoid_: Source of truth, task event

**Provisional Task**:
A Task generated locally from a Finalized CRF or Provisional Study Event before backend sync confirms the authoritative Task.
_Avoid_: Local pending work, offline-only task

**Correction/Revisit Task**:
A Task created from an Issue or Approved Resolution that asks a field worker to correct, clarify, or revisit a prior Form Submission.
_Avoid_: Reopened protocol task, issue

**Task Worklist**:
A merged view of backend-confirmed Tasks and Provisional Tasks that tells a user what work needs attention next.
_Avoid_: Separate offline list, pending-work store, task projection

**Pending work**:
A worklist view over Tasks that still require field action, sync resolution, admin review, or operational attention.
_Avoid_: Domain object, task record

**Replay**:
Rebuilding projections, Tasks, or worklists from accepted evidence, Study Events, Task Plans, and Task Lifecycle Events.
_Avoid_: Manual repair, direct table edit

### Sync

**Outbox Entry**:
A local queued record that carries a snapshot of a Finalized CRF, Provisional Study Event, Task Lifecycle Event, or related sync item to the backend.
_Avoid_: Direct API call, live pointer, retry flag

**Sync Envelope**:
The push/pull payload exchanged between Expo and the backend, carrying outbound local records and inbound authoritative deltas.
_Avoid_: Batch API call, event bus message

**Sync Ingest Result**:
The backend's recorded classification and outcome for a synced record, such as accepted, duplicate, rejected, held, or confirmed.
_Avoid_: Silent overwrite, HTTP success flag

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
A Site Data Manager's guided proposed answer to "Which form should be used?", comparing relevant Form Submissions with plain labels, notes, and an other-describe option for central approval.
_Avoid_: Approved Resolution, direct evidence edit

**Approved Resolution**:
A Central Data Manager's accepted disposition for a Workflow Issue that becomes authoritative through a backend/admin event.
_Avoid_: Direct task edit, direct evidence edit

### Actors, Devices, And Scope

**Institution**:
A real-world organization participating in or supporting the study, such as a study site, coordinating center, collaborator institution, funder, or ethics body.
_Avoid_: User group, app role, site

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

**Site Data Manager**:
An area-scoped review responsibility that proposes resolutions for Workflow Issues and records supporting notes.
_Avoid_: Local Data Manager, authentication role, final approver, central arbitrator

**Central Data Manager**:
A central review responsibility that approves, rejects, or returns proposed resolutions for Workflow Issues.
_Avoid_: Authentication role, site reviewer

**US Collaborator**:
A study collaborator outside India who can review non-PII aggregate, de-identified, or analysis-ready study data but must not access participant-identifying data.
_Avoid_: Site Data Manager, Central Data Manager, field user, PII reviewer

**Study Staff Member**:
A real-world person who works on or collaborates with the study, whether or not they have an app login.
_Avoid_: User Account, role, device user

**Designation**:
A Study Staff Member's real-world title or appointment, such as field worker, site coordinator, investigator, co-investigator, statistician, or collaborator.
_Avoid_: App role, permission, area scope

**Study Role**:
A study responsibility assigned to a Study Staff Member, such as Field Worker, Site Data Manager, Central Data Manager, or US Collaborator.
_Avoid_: Designation, job title, login role

**User Account**:
An app login credential linked to a Study Staff Member when that person needs system access.
_Avoid_: Study Staff Member, Institution, designation

**Data Access Profile**:
The data boundary for a Study Staff Member or User Account, especially whether they may access PII, raw CRFs, de-identified exports, aggregate dashboards, or admin/audit surfaces.
_Avoid_: Role, designation, site assignment

**Registered Device**:
A field device known to the system and associated with a user for audit, sync, and local draft context.
_Avoid_: Unknown device, unregistered device

**Area Scope**:
The site, locality, or operational assignment that limits what a user may pull, push, review, or administer.
_Avoid_: Client filter, form answer
