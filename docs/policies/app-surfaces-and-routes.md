# App Surfaces And Routes Policy

This policy defines the user-facing route and surface contracts. It is canonical even where code still lags.

## Expo Field App

Required field routes:

| Route | Purpose |
| --- | --- |
| `#/households` | Offline household list, search, member search, sync entry point, and household detail surface. |
| `#/households/new` | HHQ baseline household enrollment from the mapped frame. |
| `#/household-members` | Offline member directory across selected/assigned localities. |
| `#/household-members/:householdId` | Member directory filtered to one household. |
| `#/profile` | Field worker identity, site, active locality assignments, and device/session context. |

Rules:

- Field app surfaces are locality-aware.
- The global locality switcher scopes household/member/task lists.
- On narrow field-app layouts, the locality switcher lives in the main DYNAMIC drawer rather than occupying the fixed top bar.
- Field users must not see a global unscoped study dataset.
- Add Household opens HHQ; it does not call a direct admin create-household endpoint.
- Duplicate household ID checks must run before final HHQ submission and again in the save path.
- Household details should load after selecting a household/member, not by rendering all records at once.

## Runtime Site And Locality Choices

HHQ site/locality choices come from authenticated user context:

1. login
2. `GET /api/v1/users/me`
3. active site/locality assignments
4. synced locality cache fallback
5. maintained questionnaire choices only as render fallback

If a field user has one site, preselect it. Locality choices must be limited to active assigned localities for that site.

## Admin App

Required admin surfaces:

| Route | Purpose |
| --- | --- |
| `/` | Operational dashboard. |
| `/tasks` | Task list and task status review. |
| `/data-quality` | Data-quality flags and duplicate evidence review. |
| `/sync-logs` | Sync audit logs. |
| `/households` | Backend household list and detail. |
| `/household-members` | Backend member directory. |
| `/eligible-women` | WQ-eligible woman registry. |
| `/eligible-pregnancy-tracking` | Women promoted into pregnancy tracking. |
| `/pregnant-women` | Active pregnancy registry. |
| `/children` | Child registry. |
| `/masters` | Sites, localities, mapping frame, and study masters. |
| `/users` | User management and active locality assignment summary. |

Rules:

- Admin lists are backend-driven.
- Admin household/member displays use field-meaning labels, not sync internals.
- Admin correction/data-quality actions must follow active correction policy.
- Masters and users are controlled admin surfaces, not field-app workflows.

## API Surface

All protected routes require authentication and role/scope checks.

Core route groups:

- `/api/v1/auth`
- `/api/v1/users`
- `/api/v1/area-assignments`
- `/api/v1/devices`
- `/api/v1/masters`
- `/api/v1/households`
- `/api/v1/household-members`
- `/api/v1/tasks`
- `/api/v1/sync`
- `/api/v1/data-quality`
- `/api/v1/corrections`

Sync pulls are paged. Large household sync should pull households first and members by household batch.

Route contracts should be documented here before UI code depends on them.
