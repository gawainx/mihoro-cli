#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/mihoro-cli-pack.XXXXXX")"

# Removes the temporary package directory created for this install run.
cleanup() {
  rm -rf "$PACK_DIR"
}

trap cleanup EXIT

cd "$ROOT_DIR"

pnpm install --frozen-lockfile
pnpm run build

TARBALL="$(pnpm pack --pack-destination "$PACK_DIR" | tail -n 1)"
pnpm add -g "$PACK_DIR/$TARBALL"

mihoro-cli --help
