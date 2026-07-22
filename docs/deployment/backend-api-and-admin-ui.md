# Backend API and Admin UI Build and Deployment

This guide covers the DYNAMIC backend surfaces:

- the Express API in `apps/api`; and
- the React/Vite admin UI in `apps/admin`.

It does not cover the Expo field application. The production example uses one Linux VM, a system service for the API, and Nginx for TLS, API proxying, and static admin UI hosting.

## Prerequisites

- Node.js 20 or newer and npm 10
- PostgreSQL 16
- Redis 7 (recommended for shared access-session caching)
- Nginx
- a non-root service account, for example `dynamic`

Run commands from the repository root. Install the locked workspace dependencies before building:

```bash
npm ci
```

The current API production runtime uses `tsx`, which is a development dependency, so do not use `npm ci --omit=dev` on the application host.

## Build the backend API

Compile and type-check the API:

```bash
npm --workspace @dynamic/api run typecheck
npm --workspace @dynamic/api run build
```

The compiler writes JavaScript and source maps to `apps/api/dist`.

> **Current packaging limitation:** `apps/api/dist` is not yet a deployable Node.js artifact. The emitted ESM imports do not include file extensions, and some private workspace packages expose TypeScript source as their runtime entry points. Consequently, `npm --workspace @dynamic/api start` currently fails with `ERR_MODULE_NOT_FOUND`. Until the API is bundled or its ESM packaging is corrected, run the TypeScript entry point with the installed `tsx` binary as shown below. The build remains a required compile-time verification step.

## Build the admin UI

The admin UI uses `/api/v1` by default, which is correct when Nginx serves the UI and proxies the API on the same origin. Build it with:

```bash
VITE_API_BASE_URL=/api/v1 npm --workspace @dynamic/admin run build
```

The deployable static files are written to `apps/admin/dist`. `VITE_API_BASE_URL` is embedded at build time; changing it after the build does not change the UI.

To inspect the production build locally:

```bash
npm --workspace @dynamic/admin run preview
```

Then open `http://127.0.0.1:5318`.

## Configure the API host

Keep production secrets outside the repository. For example, create `/etc/dynamic/api.env`, readable only by the service account:

```dotenv
NODE_ENV=production
APP_ENV=production
PORT=3310
DATABASE_URL=postgresql://dynamic_app:REPLACE_ME@127.0.0.1:5432/dynamic
REDIS_URL=redis://127.0.0.1:6379
JWT_SECRET=REPLACE_WITH_A_LONG_RANDOM_SECRET
JWT_REFRESH_SECRET=REPLACE_WITH_A_DIFFERENT_LONG_RANDOM_SECRET
AUTH_RATE_LIMIT_MAX=10
AUTH_RATE_LIMIT_WINDOW_MS=900000
```

Both JWT secrets are mandatory when `NODE_ENV` or `APP_ENV` is `production`. Use different, randomly generated values and do not reuse the development examples.

### Database schema

Do not use `make db-reset-full` or `make db-push` against production. Those targets are for the disposable development database.

Before the first production deployment or any schema-changing release:

1. take and verify a database backup;
2. review the SQL files in `apps/api/drizzle/migrations` against the target database; and
3. run the approved, versioned migration with the production `DATABASE_URL`:

```bash
set -a
. /etc/dynamic/api.env
set +a
npm --workspace @dynamic/api run db:migrate
```

Run migrations as a controlled release step, not from every API process at startup.

## Run the API as a system service

Assume the checked-out release is at `/opt/dynamic/current`. Create `/etc/systemd/system/dynamic-api.service`:

```ini
[Unit]
Description=DYNAMIC backend API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=dynamic
Group=dynamic
WorkingDirectory=/opt/dynamic/current
EnvironmentFile=/etc/dynamic/api.env
ExecStart=/opt/dynamic/current/node_modules/.bin/tsx apps/api/src/index.ts
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Load and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now dynamic-api
sudo systemctl status dynamic-api
```

Inspect logs with:

```bash
sudo journalctl -u dynamic-api -f
```

The API should listen only on a private interface or behind a firewall. Expose it publicly through Nginx, not directly on port `3310`.

## Serve the admin UI and proxy the API

Use an Nginx server block similar to the following. Replace the hostname and TLS certificate paths for the deployment:

```nginx
server {
    listen 80;
    server_name dynamic.example.org;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name dynamic.example.org;

    ssl_certificate /etc/letsencrypt/live/dynamic.example.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/dynamic.example.org/privkey.pem;

    client_max_body_size 25m;
    root /opt/dynamic/current/apps/admin/dist;
    index index.html;

    location = /health {
        proxy_pass http://127.0.0.1:3310/health;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/v1/ {
        proxy_pass http://127.0.0.1:3310/api/v1/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Validate and reload Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

The checked-in `deploy/nginx/default.conf` is for local development: it proxies the UI to the Vite HMR server. Do not use it unchanged in production.

## Release procedure

For each backend release:

1. Check out the exact reviewed commit in a new release directory.
2. Run `npm ci`.
3. Run the API type-check and build commands above.
4. Build the admin UI with its production API base URL.
5. Back up the database and apply reviewed migrations when the release changes the schema.
6. Point `/opt/dynamic/current` to the new release.
7. Restart `dynamic-api`, validate Nginx, and reload Nginx.
8. Run the smoke checks below before removing the previous release.

Keep the previous release directory so that application code and static UI files can be rolled back together. Database rollback requires a release-specific plan; do not assume reversing an application release reverses its schema changes.

## Smoke checks

Check the API directly on the host:

```bash
curl --fail --silent http://127.0.0.1:3310/health
```

Expected response:

```json
{"status":"ok","service":"dynamic-api"}
```

Check the public edge:

```bash
curl --fail --silent https://dynamic.example.org/health
curl --fail --silent --head https://dynamic.example.org/
```

Finally, open the admin UI, sign in with a non-development account, and verify one authenticated API-backed screen. A healthy `/health` response alone does not prove database access, authentication, or admin-to-API routing.

## Rollback

If post-deployment checks fail:

1. point `/opt/dynamic/current` back to the previous release;
2. restart `dynamic-api`;
3. validate and reload Nginx; and
4. rerun the smoke checks.

Restore or reverse database changes only through the migration-specific rollback plan prepared before deployment.
