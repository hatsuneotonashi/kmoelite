#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="${ROOT_DIR}/apps/kmoe-app"
APP_BUNDLE="${APP_DIR}/src-tauri/target/debug/bundle/macos/kmoelite.app"

pnpm --dir "${APP_DIR}" tauri build --debug --bundles app

if [[ ! -d "${APP_BUNDLE}" ]]; then
  echo "macos_smoke=failed reason=missing-app-bundle" >&2
  exit 1
fi

info_plist="${APP_BUNDLE}/Contents/Info.plist"
bundle_id="$(plutil -extract CFBundleIdentifier raw "${info_plist}")"
executable="$(plutil -extract CFBundleExecutable raw "${info_plist}")"

osascript -e "tell application id \"${bundle_id}\" to quit" >/dev/null 2>&1 || true
sleep 1
open -n "${APP_BUNDLE}"

pid=""
for _ in {1..20}; do
  pid="$(pgrep -x "${executable}" | head -1 || true)"
  [[ -n "${pid}" ]] && break
  sleep 0.5
done

if [[ -z "${pid}" ]]; then
  echo "macos_smoke=failed reason=launch-timeout" >&2
  exit 1
fi

screenshot="${TMPDIR:-/tmp}/kmoelite-macos-smoke-$$.png"
trap 'rm -f "${screenshot}"; osascript -e "tell application id \"${bundle_id}\" to quit" >/dev/null 2>&1 || true' EXIT
sleep "${MACOS_RENDER_WAIT_SECONDS:-3}"
screencapture -x "${screenshot}"

image_info="$(sips -g pixelWidth -g pixelHeight "${screenshot}" 2>/dev/null)"
width="$(awk '/pixelWidth/ { print $2 }' <<<"${image_info}")"
height="$(awk '/pixelHeight/ { print $2 }' <<<"${image_info}")"
size="$(stat -f%z "${screenshot}")"
if [[ -z "${width}" || -z "${height}" || "${width}" -le 0 || "${height}" -le 0 || "${size}" -le 0 ]]; then
  echo "macos_smoke=failed reason=screenshot-not-readable" >&2
  exit 1
fi

echo "macos_smoke=passed pid=${pid} screenshot=${width}x${height}"
