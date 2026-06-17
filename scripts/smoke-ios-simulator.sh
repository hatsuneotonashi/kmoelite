#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="${ROOT_DIR}/apps/kmoe-app"
BUNDLE_ID="moe.kzo.client"

device="${IOS_SIM_UDID:-}"
if [[ -z "${device}" ]]; then
  device="$(xcrun simctl list devices booted \
    | awk '/^-- iOS / { ios=1; next } /^-- / { ios=0 } ios && /Booted/ { print; exit }' \
    | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/')"
fi

if [[ -z "${device}" ]]; then
  device="$(xcrun simctl list devices available \
    | awk '/^-- iOS / { ios=1; next } /^-- / { ios=0 } ios && /iPhone|iPad/ { print; exit }' \
    | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/')"
  if [[ -z "${device}" ]]; then
    echo "ios_sim_smoke=missing-ios-simulator" >&2
    exit 1
  fi
  xcrun simctl boot "${device}" >/dev/null 2>&1 || true
  xcrun simctl bootstatus "${device}" -b >/dev/null
fi

pnpm --dir "${APP_DIR}" tauri ios build --debug --target aarch64-sim --no-sign

app="${APP_DIR}/src-tauri/gen/apple/build/arm64-sim/kmoelite.app"
if [[ "${IOS_SIM_FRESH:-0}" == "1" ]]; then
  xcrun simctl terminate "${device}" "${BUNDLE_ID}" >/dev/null 2>&1 || true
  xcrun simctl uninstall "${device}" "${BUNDLE_ID}" >/dev/null 2>&1 || true
fi

xcrun simctl install "${device}" "${app}"
launch_output="$(xcrun simctl launch "${device}" "${BUNDLE_ID}")"
echo "ios_sim_smoke=passed device=${device} ${launch_output}"
