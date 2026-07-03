#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
VERSION="$(node -e "const fs = require('node:fs'); const pkg = JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); console.log(pkg.version);" "${APP_DIR}/package.json")"
OUTPUT_DIR="${APP_DIR}/dist-packages"
APP_PATH="${OUTPUT_DIR}/mac-arm64/Learning OS.app"
ZIP_PATH="${OUTPUT_DIR}/Learning OS-${VERSION}-arm64.zip"

if [[ ! -d "${APP_PATH}" ]]; then
  echo "未找到应用目录：${APP_PATH}"
  echo "请先执行 pnpm package:dir 生成 .app 产物。"
  exit 1
fi

rm -f "${ZIP_PATH}"
ditto -c -k --sequesterRsrc --keepParent "${APP_PATH}" "${ZIP_PATH}"

echo "已生成 macOS zip 包：${ZIP_PATH}"
