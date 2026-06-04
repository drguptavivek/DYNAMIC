# DYNAMIC PreTSING — Key Data Model Concepts

> A plain-language guide to the boundaries and rules in the system.
> Written for study managers, data managers, and site coordinators — not programmers.

---

## The Big Picture

The system tracks **people living in mapped areas** through a **longitudinal study**. Every piece of data — a form filled in the field, a pregnancy outcome, a child's growth — connects back to a **specific person in a specific household**.

There are five layers, each with a clear job:

```
AREA (locality / village / colony)
  └── STRUCTURE (building on the map)
        └── HOUSEHOLD (family unit, permanently numbered)
              └── MEMBER (individual person, permanently numbered)
                    └── EVENTS (pregnancy, birth, death, outcomes)
```

---

## Layer 1: Area and Structure (the map frame)

**What it is:** Before any interviews happen, field teams map every structure in every assigned area. Each structure gets a permanent map ID (e.g., structure `0234` in locality `101`).

**Key rule:** The map frame is set at baseline and does not change. New structures discovered later are added as addenda — they do not renumber existing structures.

**Why this matters:** Every household is anchored to a structure. If a household moves out, the structure still exists on the map. A new family moving in would be a _new_ household, but the structure ID stays the same.

---

## Layer 2: Household (the permanent unit)

**What it is:** A household is the family unit that answered the baseline Household Questionnaire (HHQ). Once enrolled, it gets a **permanent household ID** built from:

```
site_id  +  locality_code  +  structure_map_id  +  household_number
   1     -      101        -       0234          -        01
→ household_id = "1-101-0234-01"
```

**Key rules:**

- A household is enrolled **once** at baseline. If it was empty/vacant at baseline, it is **never enrolled** — even if a family moves in later.
- If a family splits (son moves out), the original household **keeps its number**. There is no split event or new household number.
- New members can join later (marriage, birth, migration) through valid additions.

**What the HHQ form populates:**

- The household record (enrollment date, head name, consent status)
- The initial member roster (every usual resident listed at baseline)

---

## Layer 3: Household Member (the permanent person record)

**What it is:** Every usual resident listed in the household gets a **permanent member number** within that household. Their ID is:

```
household_id  +  member_number
"1-101-0234-01"  +  "03"
→ person_id = "1-101-0234-01-03"
```

**Key rules:**

- Member numbers are assigned in order and **never reused**.
- A member who dies or moves away keeps their record (marked inactive). Their number is not given to anyone else.
- Temporary visitors (e.g., a woman staying for delivery at her mother's house) are **not** added to the roster.
- New legitimate members (new baby, spouse marrying in, returning migrant) are added with the next available number, and eligibility is recalculated.

**Core fields (read-only after baseline):** name, sex, date of birth, relationship to head, member number. These can only be corrected by a Site Research Scientist through the admin app — not by a field worker.

---

## Layer 4: Eligible Women and Pregnancies

**What it is:** Any usual-resident woman of reproductive age found to be **currently pregnant** when the Woman's Questionnaire (WQ) is completed becomes an **Eligible Woman** and gets a **Pregnancy record**.

```
Member record  →  (if WQ shows pregnant)  →  Eligible Woman
                                              └── Pregnancy #1
                                                   └── Pregnancy Outcome (POF)
                                                         └── Child
                                              └── Pregnancy #2 (if later detected)
                                                   └── ...
```

**Key rules:**

- The eligible_woman record is created from the member record — it is the **same person**, just tracked specifically for pregnancy follow-up.
- A woman can have multiple pregnancies over the study period (sequential, never overlapping).
- Pregnancy begins on the date pregnancy is detected/enrolled. All future follow-up dates (PFF visits, NFF visits) are anchored to this date. **Late completion of a visit never shifts future dates.**
- If a pregnancy ends (birth, stillbirth, miscarriage), the pregnancy is closed and a child record (or stillbirth record) is created.

---

## Layer 5: Children

**What it is:** A child record is created when a pregnancy outcome is recorded (POF form). The child belongs to the pregnancy and, through it, to the mother member and household.

```
Child ID = pregnancy_id + birth_sequence (e.g. twins get separate records)
```

**Key rules:**

- Stillbirths also get a child record (with birth_status = 'stillbirth').
- If a child dies, their vital status is updated. A Verbal Autopsy (VA) task is generated 30 days after death.
- VA tasks are currently **disabled** (form not yet available) — they appear in worklists but cannot be opened until the VA questionnaire is finalised (~4 weeks from study start).

---

## The Form Response: Raw Evidence

**What it is:** Every time a field worker fills and submits a form, a **form response** is saved. It contains:

- Which form was filled (HHQ, WQ, HRF, PEF, etc.)
- Which task it was answering
- The **complete answers as filled** — immutable, never edited
- When it was submitted and from which device

**Key principle: Form responses are immutable.** If a field worker made a mistake, the response is not edited. A Site Research Scientist can make a **correction** through the admin app, which creates an audit trail entry — the original response remains intact.

**What happens after submission:**

```
Form response saved
    ↓
Key fields extracted automatically:
  - HHQ answers → household enrolled, member list created
  - WQ answers  → pregnancy detected, eligible woman flagged
  - PEF answers → pregnancy details (LMP, EDD, GA) recorded
  - POF answers → pregnancy closed, child record created
  - BAF answers → child birth details recorded
  - NFF answers → child vital status updated
  - CDF answers → child death recorded, VA task generated
    ↓
Next scheduled tasks auto-generated (HRF rounds, PFF visits, NFF visits)
```

---

## Tasks: The Field Worker's To-Do List

**What it is:** A task is an instruction to fill a specific form for a specific subject, within a specific date window.

```
Task = who + what form + when (target date + window)
Example: "Fill HRF for household 1-101-0234-01, Round 2, between 15 Sep – 28 Sep 2026"
```

**Key rules:**

- **Forms can only be opened from tasks.** There is no "fill any form" button.
- Tasks are generated automatically when events happen (e.g., HHQ completion generates all future HRF rounds; pregnancy enrollment generates PFF schedule).
- Each task has a **window** (earliest open date to deadline). Forms opened outside the window are flagged for review.
- If a field worker cannot complete a task (person not found, refused, etc.), they record a **failed attempt** with a reason. After the configured maximum attempts, they close the task with a final reason.
- **Missed tasks are recorded as missed** — the next round picks up from the correct anchor date. Missed rounds are not back-filled as if they happened on time.

---

## Sync: Connecting Field to Server

**What it is:** Field workers collect data offline on their Android devices. When connectivity is available, data is synced:

```
PUSH  (device → server):  completed form responses, domain events, failed attempts
PULL  (server → device):  assigned household/member/task data for the worker's locality
```

**Key rules:**

- Each field worker syncs only the **households in their assigned localities** — not the whole study.
- If two devices submit the same form response for the same task (e.g., sync collision), the first one wins. Later duplicates are flagged for data quality review — **not silently discarded**.
- The raw form response is always accepted and preserved. Duplicate detection is based on unique response IDs, not content.

---

## Admin Corrections: Fixing Mistakes Without Losing History

**What it is:** If a core field (name, date of birth, locality code, household number) was recorded wrongly, a Site Research Scientist can make a **correction** through the admin web app.

**What happens:**

```
Original value: member name = "Rmeesh Kumar" (typo)
Correction logged: field=full_name, old="Rmeesh Kumar", new="Ramesh Kumar", reason="typo in field", corrected_by=SRS_username, corrected_at=timestamp
Entity updated: household_members.full_name = "Ramesh Kumar"
Original form response: unchanged (still shows "Rmeesh Kumar" in answers_json)
```

**Key rules:**

- Only `central_admin` and `site_research_scientist` roles can make corrections.
- Field workers cannot correct data — they can only flag issues.
- Every correction is permanently logged with who made it and why.
- The original form response is never modified.

---

## Data Quality Flags

**What it is:** The system automatically flags suspicious data patterns:

- Duplicate form responses for the same task
- Form submitted outside its task window
- Conflicting values across forms (e.g., reported birth date inconsistent with GA)
- Tasks closed without required final-reason

Flags are reviewed and resolved by the Site Research Scientist in the admin app.

---

## Summary: Clean Boundaries at a Glance

| Concept               | Permanent?                  | Who creates it                        | Who can change core fields                    |
| --------------------- | --------------------------- | ------------------------------------- | --------------------------------------------- |
| Structure (map frame) | Yes                         | Admin (bulk import)                   | Central admin only                            |
| Household             | Yes (once enrolled)         | HHQ form submission                   | SRS via correction                            |
| Member record         | Yes (once added)            | HHQ or valid addition                 | SRS via correction                            |
| Eligible woman        | Yes                         | WQ form submission (if pregnant)      | System only                                   |
| Pregnancy             | Yes (immutable once closed) | WQ or subsequent detection            | System/SRS                                    |
| Child                 | Yes                         | POF form submission                   | System/SRS                                    |
| Form response         | **Immutable forever**       | Field worker via task                 | No one — corrections create new audit records |
| Task                  | Auto-generated              | System (event-triggered or scheduled) | SRS can close with reason                     |
| Correction            | Append-only log             | SRS via admin app                     | Cannot be deleted                             |
