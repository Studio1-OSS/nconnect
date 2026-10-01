#!/usr/bin/env bash
# Builds the nconnect site (landing page, install.sh, nconnect.js bundle,
# latest.json, llms.txt). Telemetry is opt-in in this fork and its Convex
# backend is not part of the deploy, so every environment uses the standalone
# build with no Convex deploy key required. To run the telemetry backend, set
# up Convex separately and restore the `convex deploy` wrapper here.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Vercel runs this from the project's Root Directory, which is either the repo
# root (vercel.json) or site/ (site/vercel.json). Remember it so the output
# lands where Vercel looks for it.
INVOKE_DIR="$(pwd)"
cd "$ROOT"

# The CLI bundle is produced with `bun build`; Vercel's build image may not
# ship Bun, so install it on demand when missing.
if ! command -v bun >/dev/null 2>&1; then
  npm install -g bun
  export PATH="$(npm prefix -g)/bin:$PATH"
fi

pnpm build:site:preview

# Nitro writes the Build Output API tree to <repo>/.vercel/output. When the
# project's Root Directory is site/, Vercel reads site/.vercel/output instead.
if [ "$INVOKE_DIR" != "$ROOT" ]; then
  rm -rf "$INVOKE_DIR/.vercel/output"
  mkdir -p "$INVOKE_DIR/.vercel"
  cp -R "$ROOT/.vercel/output" "$INVOKE_DIR/.vercel/output"
fi
