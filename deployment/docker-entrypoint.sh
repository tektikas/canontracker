#!/bin/sh
set -e

# Swarm secret from the secret store secret/staging: KEY='value' lines (see deploy.yml).
if [ -f /run/secrets/env ]; then
  set -a
  . /run/secrets/env
  set +a
fi

if ! touch /app/.data/.write-test 2>/dev/null; then
  echo "[entrypoint] /app/.data is not writable by uid $(id -u)" >&2
  exit 1
fi
rm -f /app/.data/.write-test

exec "$@"
