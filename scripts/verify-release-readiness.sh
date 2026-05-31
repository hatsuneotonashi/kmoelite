#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/apps/kmoe-app"
TAURI_DIR="$APP_DIR/src-tauri"

run() {
  printf '\n==> %s\n' "$*"
  "$@"
}

scan_sensitive_artifacts() {
  printf '\n==> sensitive artifact scan\n'
  local pattern
  pattern='Set-Cookie:|Authorization: Bearer|session=[A-Za-z0-9_%.-]{12,}|token=[A-Za-z0-9_%.-]{12,}|password=[^ <`"'"'"']{8,}|https?://[^[:space:]]*/getdownurl\.php\?'

  if rg -n "$pattern" \
    -g '!node_modules' \
    -g '!dist' \
    -g '!target' \
    -g '!coverage' \
    -g '!playwright-report' \
    -g '!test-results' \
    -g '!pnpm-lock.yaml' \
    -g '!scripts/verify-release-readiness.sh' \
    "$ROOT_DIR"; then
    echo "Sensitive artifact scan found a forbidden pattern." >&2
    exit 1
  fi

  local artifact_matches
  artifact_matches="$(
    find "$ROOT_DIR" \
      \( -path "$ROOT_DIR/node_modules" \
      -o -path "$ROOT_DIR/apps/kmoe-app/node_modules" \
      -o -path "$ROOT_DIR/apps/kmoe-app/dist" \
      -o -path "$ROOT_DIR/apps/kmoe-app/src-tauri/target" \
      -o -path "$ROOT_DIR/apps/kmoe-app/src-tauri/gen/apple/build" \
      -o -path "$ROOT_DIR/apps/kmoe-app/src-tauri/gen/apple/assets" \
      -o -path "$ROOT_DIR/apps/kmoe-app/test-results" \
      -o -path "$ROOT_DIR/playwright-report" \) -prune \
      -o -type f \( \
        -name 'storage-state*' \
        -o -name 'auth-state*' \
        -o -name 'cookies.txt' \
        -o -name 'cookie.txt' \
        -o -name 'cookies.json' \
        -o -name 'cookie.json' \
        -o -name 'session.json' \
        -o -name 'sessions.json' \
      \) -print
  )"
  if [[ -n "$artifact_matches" ]]; then
    echo "$artifact_matches"
    echo "Sensitive artifact scan found runtime auth artifacts." >&2
    exit 1
  fi
}

scan_development_residue() {
  printf '\n==> development residue scan\n'
  local pattern
  pattern="$(printf '%s|%s|%s|%s|%s' 'T''ODO' 'F''IXME' 'todo!' 'unimplemented!' 'not'' implemented')"

  if rg -n "$pattern" \
    -g '!verify-release-readiness.sh' \
    "$APP_DIR/src" \
    "$TAURI_DIR/src" \
    "$ROOT_DIR/scripts"; then
    echo "Development residue scan found a forbidden marker." >&2
    exit 1
  fi
}

scan_sensitive_artifacts
scan_development_residue

run node "$ROOT_DIR/scripts/check-platform-readiness.mjs" --self-test
run node "$ROOT_DIR/scripts/create-release-manifest.mjs" --self-test
run pnpm --dir "$APP_DIR" test:run
run pnpm --dir "$APP_DIR" typecheck
run pnpm --dir "$APP_DIR" build
run node "$ROOT_DIR/scripts/check-ios-assets.mjs"
run cargo fmt --all --manifest-path "$TAURI_DIR/Cargo.toml" -- --check
run cargo test --manifest-path "$TAURI_DIR/Cargo.toml"
run cargo check --manifest-path "$TAURI_DIR/Cargo.toml"
run pnpm check:platforms

if [[ "${KMOE_SKIP_E2E:-0}" != "1" ]]; then
  run pnpm --dir "$APP_DIR" e2e
fi

if [[ "${KMOE_SKIP_TAURI_BUNDLE:-0}" != "1" ]]; then
  run pnpm --dir "$APP_DIR" tauri:build:mac-app:debug
fi

if [[ "$(uname -s)" == "Darwin" && "${KMOE_SKIP_DMG:-0}" != "1" ]]; then
  run "$ROOT_DIR/scripts/package-macos-dmg.sh"
fi

if [[ "${KMOE_SKIP_TAURI_BUNDLE:-0}" != "1" ]]; then
  run pnpm manifest:release -- --profile debug --require-artifacts
fi

scan_sensitive_artifacts

printf '\nrelease_readiness=ok\n'
