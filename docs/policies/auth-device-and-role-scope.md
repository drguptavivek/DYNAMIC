# Auth, Device, And Role-Scope Policy

This policy defines authentication, device registration, token behavior, and role/scope boundaries. It is canonical even where code still lags.

## Authentication

Rules:

- Login requires username/password over HTTPS in deployed environments.
- Login failures must not reveal whether username or password was wrong.
- Disabled users cannot login or refresh tokens.
- Authentication secrets must be required in non-dev environments.
- JWT verification must lock the expected algorithm and token type.
- Login and refresh endpoints need rate limiting before field deployment.

## Tokens

Token policy:

- Access tokens are short-lived.
- Refresh tokens are longer-lived and must be distinguishable from access tokens.
- Refresh token use should rotate or otherwise support revocation before production deployment.
- Logout must invalidate refresh capability before production deployment.
- Token payload includes only stable identity/scope fields needed by the API:
  - user id
  - username
  - role
  - site id
  - token type

Current code may have limited logout/rotation behavior; treat that as implementation debt against this policy.

## Devices

Field devices must be registered.

Rules:

- Field workers can register their own device.
- Central admins can bulk-register devices.
- Device records bind `device_id` to user, name, and registration time.
- Sync push requires a registered or otherwise accepted `device_id`.
- Device ID is part of audit, sync, and local draft context.
- Reassigning a device to another user is an administrative action and must be auditable before deployment.

## Roles

Canonical roles:

```text
field_worker
field_supervisor
site_research_scientist
central_admin
```

Role rules:

- Field workers operate only within assigned site/locality scope.
- Supervisors operate only within their assigned operational scope.
- Site research scientists operate within their site and cannot create central admins.
- Central admins can manage cross-site users, masters, and device assignments.
- Admin correction and data-quality permissions must follow role and site/locality scope.

## Area Scope

Area scope is enforced server-side.

Rules:

- Pull scope is the intersection of request filters and active server-side assignments.
- Push scope is resolved from server-known tasks/subjects when possible.
- Client-provided `site_id`, `locality_code`, and `answers_json` are validation inputs, not the only source of truth.
- Household/member/task routes must enforce role and assignment scope, not only authentication.

## Development Mode

Dev seed credentials may exist only for local development. They must not be accepted as production defaults.

Any code path that relies on default secrets, published seed passwords, or unrestricted dev scope must be guarded by explicit dev environment checks.
