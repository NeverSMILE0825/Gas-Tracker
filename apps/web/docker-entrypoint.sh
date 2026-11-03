#!/bin/sh
set -eu
base="${API_BASE_URL:-http://localhost:4000}"
mkdir -p /app/apps/web/public
printf '{"apiBase":"%s"}\n' "$base" > /app/apps/web/public/runtime-config.json
exec pnpm --filter @gasscope/web start
