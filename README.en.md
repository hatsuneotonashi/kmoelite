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

- iPhone: usable for personal testing and daily preview use; the iPhone simulator now passes packaged debug app install, launch, first-screen render, and session-restore smoke; detail, Reader, download, signed-device, and export/share validation still need more work.
- iPad: usable for personal testing and daily preview use; the iPad simulator now passes packaged debug app install, launch, tablet-layout render, live EPUB download-to-Reader, page-turn, and progress-persistence smoke; signed-device, export/share, and foreground/background validation still need more work.
- macOS: usable as the main local development and preview platform.
- Windows: source and packaging paths exist, but real-machine install/open/reveal/signing validation is incomplete.
- Android phone: experimental source path exists; a Pixel 8 emulator has passed live login, detail, EPUB download, Reader, page-turn, and local reading-data deletion smoke; real-device, export/share, and signed distribution validation are incomplete.
- Android tablet: experimental source path exists; a Pixel Tablet emulator has passed live login, detail, EPUB download, Reader spread page-turn, and local reading-data deletion smoke; real-device, export/share, and signed distribution validation are incomplete.
- Android TV: experimental entry exists; an Android TV emulator has passed live login, detail, EPUB download, Reader, remote page-turn, and local reading-data deletion smoke, but real TV hardware, export/share, and signed distribution validation are incomplete.
- Apple TV: future research target; the local toolchain now has a tvOS simulator runtime and can boot an Apple TV simulator, but no runnable tvOS shell exists yet.

Future plan:

- Apple TV: future research target for remote-control input, landscape Reader, focus navigation, and cache policy.

## Recent Updates

- 2026-06-17: fixed restored site sessions being shown as signed out when the account page is authenticated but profile fields are temporarily unavailable; the iPhone simulator packaged app now shows the account-center entry after session restore.
- 2026-06-17: iPad simulator passed live EPUB download-to-Reader, page-turn, and progress-persistence smoke; iPhone simulator passed packaged render and session-restore smoke.
- 2026-06-17: Android TV emulator passed live login, detail, EPUB-to-Reader, remote page-turn, and local reading-data deletion smoke.
- 2026-06-17: advanced Apple TV/tvOS readiness to an installed tvOS runtime, a bootable Apple TV simulator, and platform checks for actual simulator devices; no runnable tvOS shell exists yet.
- 2026-06-17: fixed an intermittent mobile/tablet detail Reader auto-download queue-start failure; Android phone and tablet emulators have passed live EPUB-to-Reader and local reading-data deletion smoke.

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
pnpm tauri:android:build:debug
```

See [docs](docs/README.md) for architecture, development, release, security, platform status, web-adapter, and Reader/Shelf notes.

## Release Status

This repository is prepared as source code. Public binary distribution still requires platform signing, notarization or installer QA, and signed physical-device validation where applicable. See [docs/status](docs/status/README.md).

## License

kmoelite is distributed under the [GNU General Public License v3.0](LICENSE).
