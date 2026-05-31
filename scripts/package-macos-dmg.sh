#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/apps/kmoe-app"
TAURI_DIR="$APP_DIR/src-tauri"
PROFILE="${KMOE_TAURI_PROFILE:-debug}"

if [[ "$PROFILE" == "release" ]]; then
  TARGET_DIR="$TAURI_DIR/target/release"
  pnpm --dir "$APP_DIR" tauri build --bundles app
else
  TARGET_DIR="$TAURI_DIR/target/debug"
  pnpm --dir "$APP_DIR" tauri build --debug --bundles app
fi

APP_BUNDLE="$TARGET_DIR/bundle/macos/Kmoe Client.app"
OUT_DIR="$TARGET_DIR/bundle/manual-dmg"
STAGING_DIR="$OUT_DIR/staging"
ARCH="$(uname -m)"
DMG_PATH="$OUT_DIR/Kmoe Client_0.1.0_${ARCH}.dmg"

if [[ ! -d "$APP_BUNDLE" ]]; then
  echo "Missing app bundle: $APP_BUNDLE" >&2
  exit 1
fi

rm -rf "$OUT_DIR"
mkdir -p "$STAGING_DIR"
cp -R "$APP_BUNDLE" "$STAGING_DIR/"
ln -s /Applications "$STAGING_DIR/Applications"

hdiutil create \
  -volname "Kmoe Client" \
  -srcfolder "$STAGING_DIR" \
  -ov \
  -format UDZO \
  "$DMG_PATH"

rm -rf "$STAGING_DIR"
echo "$DMG_PATH"
