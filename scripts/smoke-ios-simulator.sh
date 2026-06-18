#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="${ROOT_DIR}/apps/kmoe-app"
BUNDLE_ID="moe.kzo.client"
device_kind="${IOS_SIM_DEVICE_KIND:-any}"

case "${device_kind}" in
  any) device_name_re='iPhone|iPad' ;;
  iphone) device_name_re='iPhone' ;;
  ipad) device_name_re='iPad' ;;
  *)
    echo "ios_sim_smoke=failed reason=invalid-device-kind" >&2
    exit 1
    ;;
esac

device="${IOS_SIM_UDID:-}"
if [[ -z "${device}" ]]; then
  device="$(xcrun simctl list devices booted \
    | awk -v name_re="${device_name_re}" '/^-- iOS / { ios=1; next } /^-- / { ios=0 } ios && $0 ~ name_re && /Booted/ { print; exit }' \
    | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/')"
fi

if [[ -z "${device}" ]]; then
  device="$(xcrun simctl list devices available \
    | awk -v name_re="${device_name_re}" '/^-- iOS / { ios=1; next } /^-- / { ios=0 } ios && $0 ~ name_re { print; exit }' \
    | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/')"
  if [[ -z "${device}" ]]; then
    echo "ios_sim_smoke=missing-ios-simulator kind=${device_kind}" >&2
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
deep_link_output=""
if [[ -n "${IOS_SIM_COMIC_ID:-}" ]]; then
  if [[ ! "${IOS_SIM_COMIC_ID}" =~ ^[A-Za-z0-9_-]{1,80}$ ]]; then
    echo "ios_sim_smoke=failed reason=unsafe-comic-id" >&2
    exit 1
  fi
  xcrun simctl openurl "${device}" "kmoelite://comic/${IOS_SIM_COMIC_ID}"
  deep_link_output=" deepLink=kmoelite://comic/${IOS_SIM_COMIC_ID}"
fi
sleep "${IOS_SIM_RENDER_WAIT_SECONDS:-3}"
screenshot="${TMPDIR:-/tmp}/kmoelite-ios-sim-${device}-$$.png"
trap 'rm -f "${screenshot}"' EXIT
xcrun simctl io "${device}" screenshot "${screenshot}" >/dev/null
image_info="$(sips -g pixelWidth -g pixelHeight "${screenshot}" 2>/dev/null)"
width="$(awk '/pixelWidth/ { print $2 }' <<<"${image_info}")"
height="$(awk '/pixelHeight/ { print $2 }' <<<"${image_info}")"
size="$(stat -f%z "${screenshot}")"
if [[ -z "${width}" || -z "${height}" || "${width}" -le 0 || "${height}" -le 0 || "${size}" -le 0 ]]; then
  echo "ios_sim_smoke=failed reason=screenshot-not-readable" >&2
  exit 1
fi
echo "ios_sim_smoke=passed kind=${device_kind} device=${device} ${launch_output}${deep_link_output} screenshot=${width}x${height}"
