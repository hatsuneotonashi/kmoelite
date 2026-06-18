#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/apps/kmoe-appletv"
PROJECT_PATH="$APP_DIR/KmoeliteAppleTV.xcodeproj"
SCHEME="KmoeliteAppleTVTests"
DERIVED_DATA="${APPLETV_DERIVED_DATA:-${TMPDIR:-/tmp}/kmoelite-appletv-derived}"
DEVICE="${APPLETV_SIM_UDID:-}"

if ! command -v xcodegen >/dev/null 2>&1; then
  echo "xcodegen is required for Apple TV tests." >&2
  exit 1
fi

xcodegen generate --spec "$APP_DIR/project.yml" --project "$APP_DIR" >/dev/null

if [[ -z "$DEVICE" ]]; then
  DEVICE="$(xcrun simctl list devices available -j | node -e '
const fs = require("node:fs")
const input = JSON.parse(fs.readFileSync(0, "utf8"))
const devices = Object.values(input.devices || {}).flat()
const preferred = devices.find((item) => /Apple TV 4K.*1080p/.test(item.name)) || devices.find((item) => /Apple TV/.test(item.name))
if (preferred?.udid) process.stdout.write(preferred.udid)
')"
fi
if [[ -z "$DEVICE" ]]; then
  echo "No available Apple TV simulator device found." >&2
  exit 1
fi

xcrun simctl boot "$DEVICE" >/dev/null 2>&1 || true
xcrun simctl bootstatus "$DEVICE" -b >/dev/null

xcodebuild \
  -project "$PROJECT_PATH" \
  -scheme "$SCHEME" \
  -configuration Debug \
  -sdk appletvsimulator \
  -destination "id=$DEVICE" \
  -derivedDataPath "$DERIVED_DATA" \
  CODE_SIGNING_ALLOWED=NO \
  test
