#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="${ROOT_DIR}/apps/kmoe-app"
APK="${ANDROID_APK_PATH:-${APP_DIR}/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk}"
PACKAGE_ID="${ANDROID_PACKAGE_ID:-moe.kzo.client}"
ACTIVITY="${ANDROID_ACTIVITY:-.MainActivity}"
PORT="${ANDROID_DEVTOOLS_PORT:-9222}"
AVD="${ANDROID_AVD:-}"
EMU_PID=""

cleanup() {
  if [[ -n "${EMU_PID}" ]]; then
    adb emu kill >/dev/null 2>&1 || true
    wait "${EMU_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if ! command -v adb >/dev/null 2>&1; then
  echo "android_live_reader=failed reason=missing-adb" >&2
  exit 1
fi

if [[ "${ANDROID_SKIP_BUILD:-0}" != "1" ]]; then
  pnpm --dir "${APP_DIR}" tauri android build --debug
fi
if [[ ! -f "${APK}" ]]; then
  echo "android_live_reader=failed reason=missing-debug-apk" >&2
  exit 1
fi

if [[ -n "${AVD}" ]]; then
  emulator -avd "${AVD}" -no-snapshot-save -no-boot-anim -gpu swiftshader_indirect -no-audio -no-window >"${TMPDIR:-/tmp}/kmoelite-${AVD}.log" 2>&1 &
  EMU_PID="$!"
  adb wait-for-device
  for _ in $(seq 1 90); do
    booted="$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
    [[ "${booted}" == "1" ]] && break
    sleep 2
  done
fi

ready_devices="$(adb devices | awk 'NR > 1 && $2 == "device" { print $1 }')"
DEVICE="${ANDROID_DEVICE_ID:-}"
if [[ -n "${DEVICE}" ]]; then
  if ! printf '%s\n' "${ready_devices}" | grep -Fxq "${DEVICE}"; then
    echo "android_live_reader=failed reason=invalid-android-device" >&2
    exit 1
  fi
else
  device_count="$(printf '%s\n' "${ready_devices}" | sed '/^$/d' | wc -l | tr -d ' ')"
  if [[ "${device_count}" == "0" ]]; then
    echo "android_live_reader=failed reason=missing-android-device" >&2
    exit 1
  fi
  if [[ "${device_count}" != "1" ]]; then
    echo "android_live_reader=failed reason=multiple-android-devices" >&2
    exit 1
  fi
  DEVICE="${ready_devices}"
fi
if [[ -z "${DEVICE}" ]]; then
  echo "android_live_reader=failed reason=missing-android-device" >&2
  exit 1
fi

adb -s "${DEVICE}" install -r "${APK}" >/dev/null
adb -s "${DEVICE}" shell pm clear "${PACKAGE_ID}" >/dev/null 2>&1 || true
adb -s "${DEVICE}" shell am start -W -n "${PACKAGE_ID}/${ACTIVITY}" >/dev/null
sleep "${ANDROID_RENDER_WAIT_SECONDS:-5}"
socket="$(adb -s "${DEVICE}" shell cat /proc/net/unix | awk -F'@' '/webview_devtools_remote_/ {print $2; exit}' | tr -d '\r')"
if [[ -z "${socket}" ]]; then
  echo "android_live_reader=failed reason=missing-webview-devtools" >&2
  exit 1
fi
adb -s "${DEVICE}" forward "tcp:${PORT}" "localabstract:${socket}" >/dev/null
ANDROID_DEVTOOLS_PORT="${PORT}" node "${ROOT_DIR}/scripts/smoke-android-live-reader.mjs"
