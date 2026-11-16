#!/usr/bin/env bash
# Deploys the audit console to project-workflow-builder-auditlog.pages.dev.
#
# Wrangler's `pages` commands, run anywhere inside this repo, pick up the main
# site's wrangler.jsonc (and its databases). The console is therefore copied
# to a temporary folder with only its own config and the one shared server
# file it uses, and deployed from there.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/auditlog-console.XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$STAGE/auditlog" "$STAGE/functions/api"
cp -R "$ROOT/auditlog/public" "$ROOT/auditlog/functions" "$ROOT/auditlog/migrations" "$STAGE/auditlog/"
grep -v '"\$schema"' "$ROOT/auditlog/wrangler.jsonc" > "$STAGE/auditlog/wrangler.jsonc"
cp "$ROOT/functions/api/_audit.ts" "$STAGE/functions/api/_audit.ts"

cd "$STAGE/auditlog"
node "$ROOT/node_modules/wrangler/bin/wrangler.js" pages deploy public \
  --project-name project-workflow-builder-auditlog --branch main --commit-dirty=true "$@"
