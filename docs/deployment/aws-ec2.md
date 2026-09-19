# AWS EC2 deployment

This production shape targets the Ubuntu EC2 instance and the EBS volume mounted at `/data` (currently `nvme1n1`). The Git checkout, releases, and Docker data stay on `/data`; `/etc` contains only host configuration and systemd units. Docker runs PostgreSQL, Redis, and Nginx. The Node API and admin web server run directly on the host as `dynamic-api` and `dynamic-web` without sudo or Docker access.

## Network and storage

Internet `:80/:443` reaches Nginx. Nginx proxies `/health` and `/api/v1/` to API `127.0.0.1:3310`, and `/` to the admin production server `127.0.0.1:5317`. PostgreSQL `5432` and Redis `6379` use host networking but bind to loopback; never open them in the security group.

Before cloning, verify the EBS mount and configure Docker (an OS-level file) so it cannot fall back to the root disk:

```bash
findmnt /data
lsblk -o NAME,SIZE,FSTYPE,MOUNTPOINTS
sudo install -d -m 0750 /data/docker_volumes /data/dynamic/releases /data/dynamic/imageuploads
sudo chown dynamic-api:dynamic-api /data/dynamic/imageuploads
sudo install -d -m 0755 /etc/docker
printf '{"data-root":"/data/docker_volumes"}\n' | sudo tee /etc/docker/daemon.json
sudo systemctl restart docker   # interrupts Docker services; maintenance window
  sudo bash /data/dynamic/current/deploy/scripts/check-storage.sh
```

The check must report `/data` mounted and `DockerRootDir=/data/docker_volumes`.

## Clone and first deployment

Clone the reviewed Git commit directly onto the EBS volume; do not clone under `/`, `/opt`, or `/home`:

```bash
sudo git clone <repository-url> /data/dynamic/releases/<release-id>
sudo ln -sfnT /data/dynamic/releases/<release-id> /data/dynamic/current
sudo chown -R dynamic-api:dynamic-api /data/dynamic/current
sudo chown -R dynamic-web:dynamic-web /data/dynamic/current/apps/admin
cd /data/dynamic/current
npm ci
VITE_API_BASE_URL=/api/v1 npm --workspace @dynamic/admin run build
npm --workspace @dynamic/api run typecheck
npm --workspace @dynamic/api run build
```

Create `/etc/dynamic/production.env`, `/etc/dynamic/api.env`, and `/etc/dynamic/web.env` from `deploy/env/*.example`; replace placeholders, use URL-encoded connection passwords, and `chmod 600` them. Never commit these files. Create `/etc/dynamic/tls/fullchain.pem` and `privkey.pem` through the approved TLS/Certbot process; certificates are never stored in Git.

Install the units (unit files are intentionally in `/etc`, while application files remain on `/data`):

```bash
sudo install -m 0644 deploy/systemd/*.service /etc/systemd/system/
sudo sed -i 's/dynamic.example.org/your-real-hostname.example/' deploy/nginx/production.conf
sudo systemctl daemon-reload
sudo systemctl enable --now dynamic-docker dynamic-api dynamic-web
```

For an existing installation of the PEF image release, take a verified database backup, then apply the reviewed idempotent ultrasound-date/multi-image migration before restarting the API. This migration only adds attachment metadata and replaces the per-report uniqueness constraint; it does not reset or reseed data:

```bash
sudo docker compose -f /data/dynamic/current/deploy/docker-compose.production.yml --env-file /etc/dynamic/production.env exec -T postgres \
  psql -U dynamic_app -d dynamic -v ON_ERROR_STOP=1 \
  < /data/dynamic/current/deploy/sql/2026-09-19-form-attachment-ultrasound-date.sql
```

The earlier `2026-09-18-form-attachments.sql` remains the base table-creation script for a new installation.

`dynamic-docker` starts the production Compose file, named volumes, and Nginx. `dynamic-web` runs the built admin bundle through Vite's production preview server, not the development HMR server. It does not run schema pushes or development seeds. Apply reviewed versioned migrations separately after a verified backup; never use `make db-reset-full` or `make db-push` in production.

## Operations, backup, and rollback

```bash
sudo systemctl status dynamic-docker dynamic-api dynamic-web
sudo journalctl -u dynamic-api -f
sudo journalctl -u dynamic-web -f
sudo docker compose -f /data/dynamic/current/deploy/docker-compose.production.yml --env-file /etc/dynamic/production.env ps
curl --fail --silent https://your-real-hostname.example/health
```

Back up PostgreSQL and `/data/dynamic/imageuploads` together with the organization's encrypted backup procedure and verify a restore periodically. Attachment database rows store paths relative to this persistent directory, which must not be placed inside an individual release. Keep the previous release under `/data/dynamic/releases/`. A rollback can interrupt service:

```bash
sudo bash /data/dynamic/current/deploy/scripts/rollback-release.sh /data/dynamic/releases/<previous-release-id>
sudo docker compose -f /data/dynamic/current/deploy/docker-compose.production.yml --env-file /etc/dynamic/production.env exec nginx nginx -t
```

Application rollback does not reverse database migrations; use a release-specific restore plan.

## Security checklist

- Use an IAM role with least privilege; prefer SSM Session Manager and restrict/disable SSH.
- Security groups expose only 80/443 (and temporary restricted SSH); never 3310, 5317, 5432, or 6379.
- Keep AWS credentials, secrets, database passwords, TLS keys, and populated env files out of Git; use mode 600.
- Keep `dynamic-api` and `dynamic-web` non-root with no sudo/Docker-group membership.
- Enable encrypted EBS, snapshots, tested backups, OS/Docker/Node updates, and secret rotation.
