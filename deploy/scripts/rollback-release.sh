#!/usr/bin/env bash
set -Eeuo pipefail

previous_release="${1:?Usage: rollback-release.sh /data/dynamic/releases/<previous-release>}"
test -d "$previous_release" || { echo "Release does not exist: $previous_release" >&2; exit 1; }
ln -sfnT "$previous_release" /data/dynamic/current
systemctl restart dynamic-api dynamic-web
docker compose -f /data/dynamic/current/deploy/docker-compose.production.yml --env-file /etc/dynamic/production.env restart nginx
nginx_container="$(docker ps --filter name=nginx --format '{{.ID}}' | head -n 1)"
test -n "$nginx_container" || { echo "ERROR: nginx container is not running" >&2; exit 1; }
echo "Rolled back application release to $previous_release. Database changes require a separate reviewed plan."
