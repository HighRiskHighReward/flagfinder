#!/bin/sh
# Free-tier entrypoint (ADR-022): migrate, then run the web app and the combined
# worker+scheduler in one container. If either process exits, the container exits
# so the host restarts it cleanly.
set -eu
cd /app
echo "[start-all] applying migrations"
pnpm --filter @ff/db migrate

echo "[start-all] starting background worker + scheduler"
(cd apps/worker && exec /app/node_modules/.bin/tsx src/background.ts) &
BG=$!

echo "[start-all] starting web on port ${PORT:-3000}"
(cd apps/web && exec ./node_modules/.bin/next start -p "${PORT:-3000}") &
WEB=$!

trap 'kill -TERM "$BG" "$WEB" 2>/dev/null' TERM INT
# Exit as soon as either child stops.
while kill -0 "$BG" 2>/dev/null && kill -0 "$WEB" 2>/dev/null; do sleep 5; done
echo "[start-all] a process exited; stopping container"
kill -TERM "$BG" "$WEB" 2>/dev/null || true
wait || true
exit 1
