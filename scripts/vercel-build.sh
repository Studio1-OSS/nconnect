#!/usr/bin/env bash
# Builds the nconnect site (landing page, install.sh, nconnect.js bundle,
# latest.json, llms.txt). Telemetry is opt-in in this fork and its Convex
# backend is not part of the deploy, so every environment uses the standalone
# build with no Convex deploy key required. To run the telemetry backend, set
# up Convex separately and restore the `convex deploy` wrapper here.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# The CLI bundle is produced with `bun build`; Vercel's build image may not
# ship Bun, so install it on demand when missing.
if ! command -v bun >/dev/null 2>&1; then
  npm install -g bun
  export PATH="$(npm prefix -g)/bin:$PATH"
fi

pnpm build:site:preview
