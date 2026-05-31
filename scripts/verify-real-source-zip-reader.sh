#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TAURI_DIR="$ROOT_DIR/apps/kmoe-app/src-tauri"

cargo run --manifest-path "$TAURI_DIR/Cargo.toml" --example verify_real_download_once
