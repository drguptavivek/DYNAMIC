# Same-VM Nginx Edge Routing

Use an Nginx container as the single HTTP edge when the admin SPA and API run on the same VM.
For current dev work, Nginx proxies the Vite admin dev server so HMR stays active.

## Local ports

The repo avoids common host ports by default:

- Postgres: `55432`
- Redis: `56379`
- API: `3310`
- Admin dev: `5317`
- Expo dev: `8088`
- Nginx edge: `58080`

## Local smoke

Start the API as a single process, not a watcher. Start the Vite admin dev server separately for HMR.

```bash
DATABASE_URL=postgresql://dynamic:dynamic_dev_password@localhost:55432/dynamic_dev \
  JWT_SECRET=dev_jwt_secret \
  JWT_REFRESH_SECRET=dev_refresh_secret \
  PORT=3310 \
  npm --workspace @dynamic/api run dev

VITE_API_BASE_URL=http://localhost:58080/api/v1 npm --workspace @dynamic/admin run dev
docker compose --profile edge up -d nginx
```

Then open:

- Admin SPA through Vite HMR proxy: `http://localhost:58080/`
- API health through Nginx: `http://localhost:58080/health`
- API routes through Nginx: `http://localhost:58080/api/v1/...`

## Production note

For one VM, keep Nginx at the edge and run the API behind it. Override `DYNAMIC_NGINX_PORT=80` or terminate TLS at Nginx on `443` when certificates are configured.
For production, switch the Nginx app route from Vite proxying to serving `apps/admin/dist`.

HAProxy is not needed for this first deployment shape. It becomes useful later if the API/admin path is split across multiple backend nodes or we need load-balancing-specific features.
