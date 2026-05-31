#!/usr/bin/env bash
set -euo pipefail

XCODEGEN_VERSION="${XCODEGEN_VERSION:-2.45.4}"
COCOAPODS_VERSION="${COCOAPODS_VERSION:-1.11.3}"
GEM_BIN="${HOME}/.gem/ruby/2.6.0/bin"
LOCAL_BIN="${HOME}/.local/bin"
PATH="${LOCAL_BIN}:${GEM_BIN}:${PATH}"

check_tools() {
  echo "path.local_bin=${LOCAL_BIN}"
  echo "path.gem_bin=${GEM_BIN}"
  if command -v pod >/dev/null 2>&1; then
    echo "cocoapods=$(pod --version)"
  else
    echo "cocoapods=missing"
  fi
  if command -v xcodegen >/dev/null 2>&1; then
    xcodegen --version
  else
    echo "xcodegen=missing"
  fi
  if command -v idevice_id >/dev/null 2>&1; then
    echo "libimobiledevice=available"
  else
    echo "libimobiledevice=missing"
  fi
  if command -v brew >/dev/null 2>&1; then
    echo "homebrew=$(brew --version | head -n 1)"
  else
    echo "homebrew=missing"
  fi
}

if [[ "${1:-}" == "--" ]]; then
  shift
fi

if [[ "${1:-}" == "--check" ]]; then
  check_tools
  exit 0
fi

mkdir -p "${LOCAL_BIN}"

if ! command -v pod >/dev/null 2>&1; then
  gem install --user-install ffi -v 1.15.5 -N
  gem install --user-install securerandom -v 0.3.2 -N
  gem install --user-install drb -v 2.0.6 -N
  gem install --user-install zeitwerk -v 2.6.18 -N
  gem install --user-install cocoapods -v "${COCOAPODS_VERSION}" -N
fi

if ! command -v xcodegen >/dev/null 2>&1; then
  tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/kmoe-xcodegen.XXXXXX")"
  cleanup() {
    rm -rf "${tmp_dir}"
  }
  trap cleanup EXIT
  curl -fL "https://github.com/yonaskolb/XcodeGen/releases/download/${XCODEGEN_VERSION}/xcodegen.zip" -o "${tmp_dir}/xcodegen.zip"
  unzip -q "${tmp_dir}/xcodegen.zip" -d "${tmp_dir}"
  cp "${tmp_dir}/xcodegen/bin/xcodegen" "${LOCAL_BIN}/xcodegen"
  chmod +x "${LOCAL_BIN}/xcodegen"
fi

check_tools

if ! command -v brew >/dev/null 2>&1; then
  echo "note=Homebrew is still missing; Tauri iOS init may still require libimobiledevice from Homebrew." >&2
fi
