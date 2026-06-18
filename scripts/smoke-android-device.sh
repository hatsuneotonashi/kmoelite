#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="${ROOT_DIR}/apps/kmoe-app"
PACKAGE_ID="${ANDROID_PACKAGE_ID:-moe.kzo.client}"
ACTIVITY="${ANDROID_ACTIVITY:-.MainActivity}"
DEVICE="${ANDROID_DEVICE_ID:-}"

if ! command -v adb >/dev/null 2>&1; then
  echo "android_smoke=failed reason=missing-adb" >&2
  exit 1
fi

ready_devices="$(adb devices | awk 'NR > 1 && $2 == "device" { print $1 }')"
if [[ -n "${DEVICE}" ]]; then
  if ! printf '%s\n' "${ready_devices}" | grep -Fxq "${DEVICE}"; then
    echo "android_smoke=failed reason=invalid-android-device" >&2
    exit 1
  fi
else
  device_count="$(printf '%s\n' "${ready_devices}" | sed '/^$/d' | wc -l | tr -d ' ')"
  if [[ "${device_count}" == "0" ]]; then
    echo "android_smoke=missing-android-device" >&2
    exit 1
  fi
  if [[ "${device_count}" != "1" ]]; then
    echo "android_smoke=failed reason=multiple-android-devices" >&2
    exit 1
  fi
  DEVICE="${ready_devices}"
fi

pnpm --dir "${APP_DIR}" tauri android build --debug

APK="${ANDROID_APK_PATH:-${APP_DIR}/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk}"
if [[ ! -f "${APK}" ]]; then
  echo "android_smoke=failed reason=missing-debug-apk" >&2
  exit 1
fi

adb -s "${DEVICE}" install -r "${APK}" >/dev/null
adb -s "${DEVICE}" shell am force-stop "${PACKAGE_ID}" >/dev/null 2>&1 || true
launch_output="$(adb -s "${DEVICE}" shell am start -W -n "${PACKAGE_ID}/${ACTIVITY}")"
if [[ ! "${launch_output}" =~ Status:[[:space:]]*ok ]]; then
  echo "android_smoke=failed reason=launch-failed" >&2
  exit 1
fi

deep_link_output=""
if [[ -n "${ANDROID_COMIC_ID:-}" ]]; then
  if [[ ! "${ANDROID_COMIC_ID}" =~ ^[A-Za-z0-9_-]{1,80}$ ]]; then
    echo "android_smoke=failed reason=unsafe-comic-id" >&2
    exit 1
  fi
  adb -s "${DEVICE}" shell am start -W -a android.intent.action.VIEW -d "kmoelite://comic/${ANDROID_COMIC_ID}" -p "${PACKAGE_ID}" >/dev/null
  deep_link_output=" deepLink=kmoelite://comic/${ANDROID_COMIC_ID}"
fi

sleep "${ANDROID_RENDER_WAIT_SECONDS:-3}"
screenshot="${TMPDIR:-/tmp}/kmoelite-android-${DEVICE}-$$.png"
trap 'rm -f "${screenshot}"' EXIT
adb -s "${DEVICE}" exec-out screencap -p > "${screenshot}"

if command -v sips >/dev/null 2>&1; then
  width="$(sips -g pixelWidth "${screenshot}" 2>/dev/null | awk '/pixelWidth/ { print $2 }')"
  height="$(sips -g pixelHeight "${screenshot}" 2>/dev/null | awk '/pixelHeight/ { print $2 }')"
  if [[ -z "${width}" || -z "${height}" || "${width}" == "0" || "${height}" == "0" ]]; then
    echo "android_smoke=failed reason=screenshot-not-readable" >&2
    exit 1
  fi
  screenshot_summary="${width}x${height}"
else
  if [[ ! -s "${screenshot}" ]]; then
    echo "android_smoke=failed reason=screenshot-not-readable" >&2
    exit 1
  fi
  screenshot_summary="nonempty"
fi

echo "android_smoke=passed device=${DEVICE}${deep_link_output} screenshot=${screenshot_summary}"
