#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

rm -rf "$ROOT_DIR/dist" "$ROOT_DIR/build"

"$ROOT_DIR/../../.venv/bin/pyinstaller" \
  --clean \
  -y \
  --distpath "$ROOT_DIR/dist" \
  --workpath "$ROOT_DIR/build" \
  "$ROOT_DIR/learning-os-generator.spec"
