# Household Management

This document tracks the working routes and behavior for the household management feature while it is being polished. Keep it aligned with the Expo field app, the admin UI, and the API.

## ID Rules

Household IDs use the mapped household frame:

```text
site_id-locality_code-structure_map_id-household_number
```

Current format:

- `site_id`: 1 digit
- `locality_code`: 2 digits
- `structure_map_id`: 4 digits
- `household_number`: 2 digits

Example:

```text
1-02-0042-03
```

Household member IDs append the two-digit member number:

```text
1-02-0042-03-01
```

## Expo Field App Routes

| Route | Screen | Purpose |
| --- | --- | --- |
| `#/households` | Households | Offline household list, household search, member search, sync entry point, and household slideout. |
| `#/households/new` | Add Household | Opens the Baseline Household Questionnaire (HHQ) as the household enrollment form. |
| `#/household-members` | Household Members | Offline member directory across the selected locality or all localities. |
| `#/household-members/:householdId` | Household Members for HH | Member directory prefiltered to one household. |
| `#/profile` | Field Worker Profile | Worker identity, site, and active locality assignments. |

The Expo route names are lowercase kebab-case. The parser also accepts the older `householdmembers` spelling for compatibility.

## Expo Households Screen

`#/households` shows:

- Global locality switcher inherited from the app shell. All household and member lists follow this selected locality.
- `Sync` button for pulling household/member data from the backend.
- `Add Household` button that navigates to `#/households/new`.
- Household search by household ID, hamlet/locality, structure, address, or household head.
- Member search filters: member name, household number, and sex.
- Paginated household rows.
- Paginated matching member rows, including household head name.

Household table columns:

- `Structure + HH`
- `Hamlet / village / colony`
- `Address`
- `Household head`

The consent column is intentionally hidden from this list.

## Field Worker Profile

`#/profile` shows the logged-in field worker's current profile:

- display name or username
- role
- assigned site
- active locality assignments

Locality names are resolved from the synced household/locality cache when available. Expired assignments are hidden. The route is available from the drawer as `Profile` and from the profile shortcut in the drawer user section.

Demo seed rule:

- `dev-field-worker` is a site-1 field worker.
- In the large field seed, site `1` is `BRL / Bareilly`.
- The demo field worker is assigned only to site-1 localities `01`, `02`, `03`, and `04`.
- Other seeded sites exist for admin/search scale testing, but they are not assigned to `dev-field-worker`.

## Household Slideout

Clicking a household ID, household number, or member result opens the household slideout.

The slideout shows:

- Household ID
- Address
- Mobile number of the household head or adult contact
- Household members

The member list shows:

```text
Name [full-member-id] copy-icon
age years · sex · marital status
```

Status labels are field-meaning labels only:

- `Household head`
- `WQ eligible`
- `Active member`

The UI does not show `local` or `synced` as member status labels.

## Add Household

`#/households/new` opens the HHQ form. Saving the form creates:

- one local household record
- local household member records from the HHQ roster
- a local immutable HHQ form submission

The household head must also be one of the household members. The first member listed as relationship `Self / HOH` is displayed as the household head in household/member views.

### Runtime Site and Locality Choices

The HHQ site and locality choices are scoped from the logged-in user context, not from the static questionnaire JSON alone.

Source of truth:

1. `POST /api/v1/auth/login` authenticates the field user.
2. The Expo app immediately fetches `GET /api/v1/users/me`.
3. The returned `site_id` and active `area_assignments` drive the HHQ choices.
4. On app reload/session restore, Expo refreshes `GET /api/v1/users/me` again before rendering user-scoped forms.

Behavior:

- If the user belongs to one site, the HHQ site list shows only that site and preselects it.
- The HHQ locality list shows only the user's active assigned localities for that site.
- The global locality switcher preselects the HHQ locality when the selected locality is available in the user's assignments.
- If assignment metadata is not available but the synced household locality cache has site-scoped localities, the app uses that cache.
- If neither assignments nor synced localities are available, the app falls back to the maintained questionnaire choices so the form can still render.

### Duplicate HH Check

The HHQ performs a real-time duplicate check once these fields are valid:

- site
- locality
- 4-digit structure map ID
- 2-digit household number

The app computes the canonical household ID and checks the local household registry. If the household already exists, the household number question shows:

```text
Household ID <id> already exists. Use another structure or household number.
```

Completion is blocked for duplicate household IDs. The save handler also checks again before writing, so duplicate records are not overwritten even if the visible warning has not finished rendering.

## Offline Sync

The field app syncs household data in stages:

1. Pull localities/forms/tasks and a page of households.
2. Pull household members for the household IDs in that page.
3. Continue through `next_page_token` until all household batches are complete.

The backend returns deterministic progress fields for the household pull:

- `total_households`
- `total_household_batches`
- `household_batch_number`
- `next_page_token`

The Expo sync UI reports progress to the user. Browser localStorage keeps a capped demo cache; Android keeps the full sync in SQLite.

## Admin UI Routes

| Route | Screen | Purpose |
| --- | --- | --- |
| `/` | Dashboard | Admin overview. |
| `/tasks` | Tasks | Task list and task status review. |
| `/data-quality` | Data Quality | Admin data-quality flags. |
| `/sync-logs` | Sync Logs | Sync audit log. |
| `/households` | Households | Backend-driven household list and household detail modal. |
| `/household-members` | Household Members | Backend-driven household member directory. |
| `/household-members/:householdId` | Household Members for HH | Backend-driven member list filtered to one household. |
| `/eligible-women` | Eligible Women | WQ-eligible woman registry. |
| `/eligible-pregnancy-tracking` | Eligible for Pregnancy Tracking | WQ-promoted women whose tracking status is no longer `not_tracked`. |
| `/pregnant-women` | Pregnant Women | Active pregnancy registry. |
| `/children` | Children | Child registry. |
| `/masters` | Study Masters | Study sites, study localities, and mapping-frame administration. Localities are loaded from `/api/v1/masters/localities`. |
| `/users` | Users | User management with site ID and active locality assignment summary loaded from `/api/v1/users/:userId/area-assignments`. |

Admin households table columns:

- `HH ID (HH + Structure)`
- `Head Name`
- `Address`
- `Eligible Women`
- `Eligible for Pregnancy Status Tracking`
- `View`

If more than one woman is eligible in a household, both eligibility columns show all names as a comma-separated list.

`Eligible Women` is the roster-derived WQ eligibility list. `Eligible for Pregnancy Status Tracking` is not roster-derived; it is shown only after a WQ response has been promoted for that woman and the WQ-derived `tracking_status` is no longer `not_tracked`.

Admin household member views use the same display logic as the Expo app:

- full member ID visible next to the name
- relationship to household head visible
- status shown as `Household head`, `WQ eligible`, or `Active member`

Admin user assignment display:

- `/masters` must show seeded localities from the backend, not a static empty placeholder.
- Locality `Type` must use domain values only: `urban` or `rural`.
- The `/masters` locality table shows `Site Name` before `Site ID`.
- `/users` shows each user's `site_id` plus active locality badges in `site_id-locality_code` form.
- The large demo seed assigns `dev-field-worker` to `1-01`, `1-02`, `1-03`, and `1-04`.

## API Routes

All routes below are mounted under `/api/v1` and require authentication.

### Households

| Method | Route | Query | Purpose |
| --- | --- | --- | --- |
| `GET` | `/households` | `site_id`, `locality_code`, `cohort_status`, `search`, `page`, `per_page` | Paginated household list. Includes `eligible_women_names` for each returned household. |
| `GET` | `/households/:id` | - | Single household record. |
| `GET` | `/households/:id/members` | - | Household members ordered by member number. |
| `GET` | `/households/:id/tasks` | `status`, `task_type` | Follow-up tasks for one household. |
| `GET` | `/households/:id/events` | - | Domain events for one household. |

### Household Members

| Method | Route | Query | Purpose |
| --- | --- | --- | --- |
| `GET` | `/household-members` | `household_id`, `site_id`, `locality_code`, `sex`, `search`, `page`, `per_page` | Paginated household member directory with household context. |
| `GET` | `/household-members/:household_id` | `page`, `per_page` | Paginated members for one household. |

### Sync

| Method | Route | Query/body | Purpose |
| --- | --- | --- | --- |
| `GET` | `/sync/pull` | `site_id`, `locality_codes`, `since`, `page_size`, `page_token`, `include_members` | Pull staged sync payload. For large household sync, use `include_members=false` and page through households. |
| `POST` | `/sync/pull/members` | `{ household_ids: string[] }` | Pull members for one household batch. Maximum 500 household IDs per call. |

## Current Constraints

- Expo add household is local-first. Backend persistence occurs through sync push, not through a direct admin-style create household endpoint.
- Browser demo storage is intentionally capped to avoid localStorage quota failures. Android SQLite is the target for full offline household/member data.
- Detailed household/person state should load after selecting a household or member, not by rendering all records at once.
