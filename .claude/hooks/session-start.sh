#!/usr/bin/env bash
# Makes `npm test`, `npm run build` and the dev server work in a fresh session.
set -euo pipefail
cd "$(dirname "$0")/../.."
[ -d node_modules ] || npm install --no-audit --no-fund >/dev/null 2>&1 || true
