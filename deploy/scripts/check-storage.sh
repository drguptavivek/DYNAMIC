#!/usr/bin/env bash
set -Eeuo pipefail

mountpoint -q /data || { echo "ERROR: /data is not a mounted filesystem" >&2; exit 1; }
test -d /data/docker_volumes || { echo "ERROR: /data/docker_volumes is missing" >&2; exit 1; }
docker_root="$(docker info --format '{{.DockerRootDir}}')"
test "$docker_root" = /data/docker_volumes || {
  echo "ERROR: DockerRootDir is $docker_root; expected /data/docker_volumes" >&2
  exit 1
}
printf 'Storage OK: /data mounted; DockerRootDir=%s\n' "$docker_root"
