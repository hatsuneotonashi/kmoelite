#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TAURI_DIR="$ROOT_DIR/apps/kmoe-app/src-tauri"
temp_download_dir=""

if [[ -z "${KMOE_VERIFY_DOWNLOAD_DIR:-}" ]]; then
  temp_download_dir="$(mktemp -d "${TMPDIR:-/tmp}/kmoelite-real-download.XXXXXX")"
  export KMOE_VERIFY_DOWNLOAD_DIR="$temp_download_dir"
fi
export KMOE_VERIFY_FORMAT="${KMOE_VERIFY_FORMAT:-epub}"

cleanup() {
  if [[ -n "$temp_download_dir" && "${KMOE_VERIFY_KEEP_DOWNLOAD:-0}" != "1" ]]; then
    rm -rf "$temp_download_dir"
  fi
}
trap cleanup EXIT

cargo run --manifest-path "$TAURI_DIR/Cargo.toml" --example verify_real_download_once
