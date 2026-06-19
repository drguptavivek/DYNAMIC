# Admin Corrections And Data Quality Policy

This policy defines correction and data-quality boundaries.

## Correction Ownership

Admin corrections are backend/admin-originated only.

Expo must not originate:

- admin corrections
- approval or rejection events
- central arbitration
- user-management events
- role-management events
- master-data mutation events

Expo may display backend-originated correction/data-quality status when field users need context.

## Raw Evidence

Corrections do not edit raw submitted evidence.

Rules:

- Original finalized form responses remain immutable.
- Corrections append correction events with actor, reason, old value, new value, review state, and source reference.
- Approved corrections update typed projections.
- Corrections that affect future work recalculate future uncompleted tasks.
- Completed history is preserved.

## Recalculation Triggers

Corrections require downstream recalculation or central review when they affect:

- `site_id`
- `locality_code`
- `structure_map_id`
- `household_number`
- `member_number`
- sex
- date of birth / age
- marital status
- household membership/residency
- pregnancy status
- LMP / dating / expected delivery fields
- birth outcome
- stillbirth
- child death
- any field used for eligibility, routing, task generation, or schedule anchors

Identity-key corrections must either rebuild dependent IDs transactionally or hold the case for central review. They must not orphan dependent rows.

## Duplicate Evidence

Offline duplicate task completions are valid evidence.

Rules:

- First valid task completion is primary.
- Later valid completions for the same task are preserved as duplicate evidence.
- Duplicate completions do not re-promote domain state automatically.
- Duplicate completions create data-quality flags for review.

## Data-Quality Flags

Create data-quality flags for:

- duplicate task completions
- scope conflicts
- impossible identity changes
- conflicting pregnancy/birth/child outcomes
- correction effects that need central review
- backend/Expo classification mismatch after sync

Flags must link to the relevant household, subject, task, primary response, duplicate/held response, event, and review state where available.
