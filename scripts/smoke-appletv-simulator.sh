#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/apps/kmoe-appletv"
PROJECT_PATH="$APP_DIR/KmoeliteAppleTV.xcodeproj"
SCHEME="KmoeliteAppleTV"
DERIVED_DATA="${APPLETV_DERIVED_DATA:-${TMPDIR:-/tmp}/kmoelite-appletv-derived}"
DEVICE="${APPLETV_SIM_UDID:-}"

if ! command -v xcodegen >/dev/null 2>&1; then
  echo "xcodegen is required for Apple TV project generation." >&2
  exit 1
fi

sdk_path="$(xcrun --sdk appletvsimulator --show-sdk-path)"
if [[ -d "$sdk_path/System/Library/Frameworks/WebKit.framework" ]]; then
  echo "Unexpected tvOS WebKit.framework found; reassess the native Apple TV plan." >&2
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
  build >/dev/null

APP_PATH="$(find "$DERIVED_DATA/Build/Products" -maxdepth 3 -type d -name '*.app' -print | head -n 1)"
if [[ ! -d "$APP_PATH" ]]; then
  echo "Built Apple TV app not found at expected path." >&2
  exit 1
fi

xcrun simctl install "$DEVICE" "$APP_PATH"

launch_args=(launch --terminate-running-process "$DEVICE")
if [[ "${APPLETV_SMOKE_LIVE:-0}" == "1" ]]; then
  set -a
  [[ -f "$ROOT_DIR/.env.local" ]] && . "$ROOT_DIR/.env.local"
  set +a
  if [[ -z "${KMOE_SMOKE_EMAIL:-}" || -z "${KMOE_SMOKE_PASSWORD:-}" ]]; then
    echo "APPLETV_SMOKE_LIVE=1 requires KMOE_SMOKE_EMAIL and KMOE_SMOKE_PASSWORD at runtime." >&2
    exit 1
  fi
  launch_args+=(--env "KMOELITE_TV_SMOKE_EMAIL=$KMOE_SMOKE_EMAIL" --env "KMOELITE_TV_SMOKE_PASSWORD=$KMOE_SMOKE_PASSWORD")
fi
launch_args+=("moe.kzo.client.kmoelite.tvos")
xcrun simctl "${launch_args[@]}" >/dev/null

sleep "${APPLETV_RENDER_WAIT_SECONDS:-4}"
screenshot="${TMPDIR:-/tmp}/kmoelite-appletv-smoke-${DEVICE}.png"
xcrun simctl io "$DEVICE" screenshot "$screenshot" >/dev/null
width="$(sips -g pixelWidth "$screenshot" 2>/dev/null | awk '/pixelWidth/ { print $2 }')"
height="$(sips -g pixelHeight "$screenshot" 2>/dev/null | awk '/pixelHeight/ { print $2 }')"
rm -f "$screenshot"

if [[ -z "$width" || -z "$height" || "$width" -le 0 || "$height" -le 0 ]]; then
  echo "Apple TV simulator screenshot could not be decoded." >&2
  exit 1
fi

echo "appletv_smoke=ok device=$DEVICE screenshot=${width}x${height} live=${APPLETV_SMOKE_LIVE:-0}"
