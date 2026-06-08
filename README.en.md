# kmoelite

kmoelite is an **Alpha / developer preview** unofficial KMOE online manga reader built with Tauri 2, React, TypeScript, Rust, and SQLite.

The project is meant to feel closer to a native app than a browser workflow: open the app, search or continue reading, open a title, and start reading without manually managing web tabs or downloaded files.

It focuses on users who do not want to keep manga files downloaded locally. Its product direction is lightweight online reading: open one title, read in high quality through temporary Reader cache, keep a rolling previous/current/next chapter window, and clean up older cache so handheld devices such as iPhone and iPad do not lose large amounts of storage.

This project is not affiliated with, endorsed by, or representative of KMOE. Users are responsible for following the target site's terms of service, copyright law, and account-safety requirements. The project must not be used to bypass access controls, membership limits, quotas, anti-abuse mechanisms, or copyright restrictions.

The default website entry point is currently `https://kxo.moe`. If that origin changes, frontend config, the Rust Web Adapter, Tauri CSP, test fixtures, and live smoke defaults must be updated together.

Chinese documentation is canonical: [README.md](README.md).

## Preview

The screenshots below are redacted macOS developer-preview captures. Manga covers and pages are pixelated so the public repository can show the app structure without redistributing raw manga artwork.

![macOS detail page with cover-aware theming](docs/assets/screenshots/kmoelite-macos-detail-redacted.jpg)

![macOS home, continue reading, and shelf entry](docs/assets/screenshots/kmoelite-macos-home-redacted.jpg)

![Reader spread layout](docs/assets/screenshots/kmoelite-macos-reader-redacted.jpg)

![Reader page and chapter panel](docs/assets/screenshots/kmoelite-macos-reader-menu-redacted.jpg)

## Status

This project is not stable software.

Developer-preview usable surfaces:

- iPhone: usable for personal testing and daily preview use; signed-device validation still needs more work.
- iPad: usable for personal testing and daily preview use; tablet layout and Reader are current priorities.
- macOS: usable as the main local development and preview platform.
- Windows: source and packaging paths exist, but real-machine install/open/reveal/signing validation is incomplete.

Future plan:

- Android phones and tablets: planned for low-storage online reading and temporary cache.
- Apple TV and Android TV: future research targets for remote-control input, landscape Reader, focus navigation, and cache policy.

## Recent Updates

- 2026-06-08: fixed iPad/iPhone login input behavior and the site `e400` message; the email is trimmed while the password is submitted exactly as typed.
- 2026-06-08: fixed the iPhone/iPad explicit-download storage path and download error messaging; mobile downloads are saved in the app-private area first, then exported through the system share sheet.
- 2026-06-08: switched the default KMOE website entry point to `kxo.moe` across frontend config, native adapter URLs, CSP, test fixtures, and live smoke defaults.
- 2026-06-07: polished detail loading, related-title cards, cover-derived theming, the Reader status-bar setting, and Continue Reading layout; fixed some chapters being misclassified as unavailable for source-image reading.
- 2026-06-07: fixed Chinese IME composition in text inputs and added unified local reading data deletion for Reader cache plus local EPUB/source ZIP reading files.

See [CHANGELOG.md](CHANGELOG.md) for the public update log, [TASK_PROGRESS.md](TASK_PROGRESS.md) for verification logs, and [docs/status](docs/status/README.md) for platform limitations.

## Features

- Live-first catalog, search, category, detail, account, and reading flows.
- Temporary Reader cache as the primary reading path, with a default rolling previous/current/next retention window; explicit local download remains an advanced/compatibility capability.
- Explicit local reading data deletion from Detail, Shelf, Library, Reader, and Settings removes Reader cache plus matching EPUB/source ZIP reading files.
- Shelf, Continue Reading, reading history, reading progress, and settings.
- Reader modes for single page, spread, continuous flow, LTR/RTL, zoom, crop, rotation, chapter navigation, thumbnails, keyboard shortcuts, touch gestures, and the iOS status-bar visibility preference.
- Cover-aware visual theming derived from real cover pixels when available.

## Quick Start

```bash
corepack enable
corepack prepare pnpm@11.1.3 --activate
pnpm install
pnpm --dir apps/kmoe-app exec playwright install chromium
pnpm dev
```

Run the desktop app:

```bash
pnpm tauri dev
```

Common checks:

```bash
pnpm typecheck
pnpm test:run
pnpm build
pnpm check:platforms
```

See [docs](docs/README.md) for architecture, development, release, security, platform status, web-adapter, and Reader/Shelf notes.

## Release Status

This repository is prepared as source code. Public binary distribution still requires platform signing, notarization or installer QA, and signed physical-device validation where applicable. See [docs/status](docs/status/README.md).

## License

kmoelite is distributed under the [GNU General Public License v3.0](LICENSE).
