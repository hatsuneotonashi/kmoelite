# AGENTS.md

## No-Context AI Handoff

This file is the first and canonical entrypoint for any AI or maintainer with no prior chat context. Do not rely on previous conversations, hidden state, local memory, or assumptions from another machine. Treat the repository files as the source of truth.

Before changing code or docs, complete this handoff sequence:

1. Run `git status --short --branch`.
2. Read this `AGENTS.md` file fully.
3. Read `README.md`, `docs/README.md`, `docs/status/README.md`, `TASK_PROGRESS.md`, and `CHANGELOG.md`.
4. Read the docs relevant to the task, such as `docs/architecture/README.md`, `docs/development/README.md`, `docs/release/README.md`, `docs/security/README.md`, `docs/platforms/README.md`, `docs/web-adapter/README.md`, or `docs/reader-shelf/README.md`.
5. Inspect the task-relevant source, tests, scripts, schemas, platform configs, and native/Rust boundaries before editing.
6. Produce a handoff summary before implementation. It must cover the project goal, current status, relevant architecture, touched files/modules, risks, verification plan, and documentation updates.

For every new goal, read all core docs plus the task-relevant source. Do not start from memory or from a prior chat transcript. If local observations conflict with `docs/status/README.md` or `TASK_PROGRESS.md`, treat those files as the current status and verification fact sources, then reconcile the inconsistency before claiming a result.

## Project Snapshot

- kmoelite is a lightweight unofficial KMOE online manga reader and personal reading-management app.
- The project is Alpha / developer preview, not stable public binary software.
- The main product direction is low-storage online reading: open one comic, read in high quality, and avoid default long-term local downloads.
- Reader cache is temporary storage. The default cache policy keeps a rolling previous/current/next chapter window.
- Current user-facing surfaces include Home, Search, Categories, Detail, Reader, Shelf, Library, Download Center, Account, and Settings.
- iPhone, iPad, and macOS are developer-preview usable targets; Windows has source/package paths but lacks full real-machine validation.
- Android phone/tablet have an experimental Tauri Android source/build path and emulator smoke coverage through live EPUB Reader flows. Android TV has an experimental Leanback launcher/runtime-detection path, emulator launch/focus smoke, native DPAD/OK input bridging, remote Back handling, and emulator smoke coverage through live EPUB Reader flows. These remain incomplete until real device, file export/share, and signed-release validation are finished. Apple TV remains a research target with readiness checks for tvOS SDK, simulator runtime, Apple TV simulator device types, actual simulator devices, and tvOS Rust targets.
- Real website smoke and real download validation are explicit, runtime-only, redacted, and disabled by default.
- The detailed status source is `docs/status/README.md`; the verification log is `TASK_PROGRESS.md`; public changes belong in `CHANGELOG.md`.

## Documentation Source Of Truth

- `AGENTS.md`: no-context AI handoff, durable product/architecture/safety rules, and contribution discipline. Do not use it as a phase log.
- `README.md`: public project entry, value proposition, platform summary, screenshots, quick start, and recent 5 public updates.
- `CHANGELOG.md`: public-facing update log. Write only user-visible or contributor-relevant changes.
- `TASK_PROGRESS.md`: verification log in reverse chronological order. Record scope, commands, results, skipped checks, risks, and release blockers.
- `docs/status/README.md`: current status and platform/release blocker fact source.
- `docs/architecture/README.md`: runtime boundaries, data model separation, storage strategy, and test boundaries.
- `docs/development/README.md`: local development, tests, live-profile rules, and deterministic fixture expectations.
- `docs/release/README.md`: source release, GitHub update wording, upload checks, and release gates.
- `CONTRIBUTING.md`: public contributor rules, aligned with this file without duplicating every AI-only instruction.

If documentation conflicts, use this priority order: `docs/status/README.md` and `TASK_PROGRESS.md` for current state and verification facts; `AGENTS.md` for durable rules; `README.md` and `CHANGELOG.md` for public-facing wording.

## Project Goal

Build kmoelite into a lightweight unofficial KMOE online manga reader for personal daily use. The primary product goal is to let users open one comic, read it comfortably in high quality, and avoid long-term local storage growth by using temporary Reader cache and cleanup policies instead of default permanent downloads.

Public project positioning: kmoelite is an Alpha / developer-preview unofficial KMOE online manga reader and personal reading-management tool. It is not affiliated with KMOE and must not be presented as KMOE-owned software.

## Project Memory Policy

- Keep this file. Do not delete `AGENTS.md`; it is the durable project memory and collaboration rule file. The canonical project memory filename is `AGENTS.md`.
- Treat user references to `agent.md`, `agents.md`, or project memory as references to this canonical `AGENTS.md` file unless a specific different file is explicitly requested.
- Read this file at the start of each substantial phase before changing product architecture, Reader/cache behavior, download behavior, storage, or release workflows.
- Add only long-lived engineering rules, architecture decisions, safety boundaries, and product invariants here.
- Do not use this file as a phase log. Concrete phase history, command results, known gaps, and verification evidence belong in `TASK_PROGRESS.md`.
- Do not store credentials, cookies, session state, tokens, temporary authorization URLs, private local paths from real downloads, or one-off debugging notes here.
- When a new feature changes a cross-cutting invariant, update this file in the same commit as the code and docs.
- During repo cleanup, preserve this file and prune only stale or non-durable entries after verifying they are no longer project rules.
- Before ending a substantial phase, decide whether a durable invariant changed. If it did, update this file; if it did not, leave this file untouched and record only the phase result in `TASK_PROGRESS.md`.
- If the user asks to clean up "agent" wording, "agent.md", or project memory, reconcile and simplify this file instead of deleting it.
- Keep this file current-state oriented: it should explain how the project must behave now, not preserve every historical milestone.
- After context compaction or handoff to another coding agent, follow the no-context handoff sequence at the top of this file.

## Current Product Memory

- Production runtime is live-first and does not expose a user-facing mock/demo mode. Test fixtures live only under Vitest and Playwright test folders.
- Public documentation must use the unofficial-client framing and GPL-3.0 licensing consistently.
- Public documentation must describe the project as Alpha / developer preview until platform validation proves a stable release.
- The visible product name is `kmoelite` across the web title, app shell, mobile/desktop bundle metadata, packaging scripts, and public docs. Do not rename the app back to `Kmoe Client`. Legacy storage identifiers, bundle identifiers, SQLite filenames, and localStorage keys may keep `kmoe-client`/`moe.kzo.client` compatibility names unless a deliberate migration is designed and tested.
- The default product direction is online reading with temporary cache. Permanent download and Library flows are advanced/compatibility capabilities, not the primary public promise.
- Main app surfaces include Home, Shelf, Search, Categories, Login, Comic Detail, Download Center, Library, Account, Settings, and Reader.
- Reader opens prepared local reading cache at `/reader/cache/:chapterCacheId`.
- Detail, Library, Shelf, and Continue Reading can resolve ready reading cache or trusted local Reader archive records into the Reader flow. Reader archives currently include source ZIP/CBZ and EPUB; MOBI remains file-only.
- Completed source ZIP/CBZ and EPUB downloads in Download Center should prefer opening through Reader-cache preparation; external file open/reveal remains secondary and file-only formats such as MOBI remain outside Reader.
- Download Center command buttons must be state-gated against the real queue state. Empty queues must not expose a clickable start action, and unfinished-task cleanup must not be available when there is nothing to clear or while a native task is actively running.
- Download Center task controls must be driven by successful native/SQLite commands and refreshed native snapshots. If the native command boundary is unavailable, the UI may report the unavailable action but must not locally fake pause, resume, cancel, retry, or cleanup state transitions.
- The production client must not expose a destructive "clear Library" command or UI. Library records should be preserved unless a deliberate per-item removal/rebind product flow is designed and tested.
- Missing Reader archives may queue exactly one local `source_zip` or `epub` task for the selected volume/chapter; this is not a package or VIP batch action.
- Automatic "start reading" and automatic download selection should prefer EPUB when EPUB is available and queueable, because it is Reader-capable and currently the most reliable live single-item path. Source ZIP/CBZ remains a supported explicit high-quality/manual option and an existing local archive format.
- Reader-initiated archive downloads may promote that one queued task to the next queue item, but must still respect single-item sequential downloading.
- Reader recovery may queue a missing EPUB/source ZIP only after confirming an authenticated live session. Signed-out users must be sent to Login before any native download task is created.

## Runtime Credential Handling

- Test accounts, passwords, cookies, sessions, tokens, and temporary authorization URLs are runtime-only inputs. They must never be written into tracked files, commits, screenshots, logs intended for the repository, or durable project memory.
- Test account emails and passwords may only be supplied at runtime through shell environment variables or gitignored machine-local files such as `.env.local`. This rule applies even when full real-site tests or guarded real-download tests are allowed.
- `.env.local` may be used on a developer machine for convenience, but it must stay untracked and must not be copied into docs, fixtures, examples, release manifests, screenshots, or progress logs.
- Do not store actual account emails or passwords in this file. `AGENTS.md` may document the approved handling pattern only.
- Scripts and app code that need live credentials should read explicit runtime variables such as `KMOE_SMOKE_EMAIL`, `KMOE_SMOKE_PASSWORD`, `KMOE_VERIFY_EMAIL`, and `KMOE_VERIFY_PASSWORD`. Do not hardcode fallback credentials.
- Login form fields must mirror the live website constraints where known. Disable mobile auto-capitalization, auto-correction, and spelling assistance for account/password inputs; trim only the account/email value and preserve the password exactly as typed.
- KMOE login must request the site session cookie even when local remembered-login is off. The "remember login" setting controls only whether the native app persists the website session locally after a successful authenticated session check.
- When the user explicitly enables remembered login, the native app may persist only the Kmoe website session cookie header in app-private runtime settings so the reqwest session can be restored after restart. It must be cleared on logout or on a successful non-remembered login, and must never be exported, logged, documented, committed, or included in migration snapshots.
- If credentials are accidentally printed, saved, or staged, stop the release/commit path, remove the artifact, rotate the credential if needed, and record only a redacted incident note in `TASK_PROGRESS.md`.

## Platform Product Rules

- Planned target platforms are iPhone, iPad, Android phone, Android tablet, Windows, and macOS. Android phone/tablet currently have an experimental Tauri Android project and debug build path, not stable release status. Android TV currently has an experimental Android/Leanback shell, remote-focus baseline, native DPAD/OK input bridge, remote Back navigation, and emulator smoke coverage through live EPUB Reader flows; it still needs real-device and signed-release validation. Apple TV remains a future research target until platform architecture and input constraints are designed; platform readiness must at least track tvOS SDK, simulator runtime, Apple TV simulator device types, actual simulator devices, and tvOS Rust targets.
- macOS, Windows, iPad, iPhone, and Android phone/tablet are first-class design targets. Android implementation may remain experimental, but UI and storage rules must follow the same product principles. Do not treat mobile as the only polished surface or stretch one layout across every platform.
- Layout decisions must be derived from runtime, device, window, and input classes together. iPad split view may become tablet-compact but not a phone layout, and macOS/Windows/Linux narrow windows must remain desktop runtime contracts rather than switching into the phone shell.
- iPhone and Android phone should use touch-first navigation and safe-area aware layouts; iPad and Android tablet should use split/multi-column layouts when space allows; macOS and Windows should use desktop navigation, keyboard/focus states, hover states, and higher information density; Android TV should use a wide TV contract, Leanback launcher entry, remote/direction-key focus, Back navigation, and Reader OK/Back keys before any broader TV-specific Reader work is claimed.
- Cover-aware visual surfaces should follow an Apple Music-like adaptive art direction: the cover may drive saturated page color, but the hue must come from real cover pixels whenever a cover can be loaded. Hash/fallback palettes are failure-only fallbacks, not the normal theme source. Text and controls must remain high-contrast over dark/tinted translucent layers. Do not ship muddy beige/gray wash, white-on-white glass, unreadable metadata, or decorative blur that competes with real cover/comic content.
- Platform-specific validation belongs in docs and progress logs. Keep the code paths resilient through breakpoints and capability detection instead of relying on a single simulator or workstation result.
- Native packaging and file behavior must be verified per platform before release: macOS app bundle, Windows package/file actions, iPhone/iPad simulator, and signed physical iPhone/iPad install/export checks.

## Visual Design Hard Rules

- The app should feel like a native, premium manga reader, not a demo, admin dashboard, marketing landing page, or plain website wrapper. UI polish must support the core promise: open a comic, start reading quickly, and avoid wasting storage.
- The base visual system must stay calm, sharp, and Apple-platform-friendly: system fonts, no negative letter spacing, no viewport-scaled type, clear hierarchy, tight spacing, crisp icons, and controls sized for their target platform.
- Default non-cover pages should use the existing neutral system palette: light mode is soft off-white/near-white, and dark mode is near-black/graphite. Do not replace the app with muddy beige, brown/orange, flat gray, one-note purple/blue, or heavy decorative gradient themes.
- Detail and other cover-aware surfaces should be dark/tinted and cover-driven. The cover image decides the hue from real cover pixels; CSS may darken, desaturate, mix, and layer for contrast, but must not force all works into one fixed red, rose, purple, gray, or beige palette.
- Apple Music-like means adaptive cover color, glass depth, restrained saturation, and readable foregrounds. It does not mean opaque color washes, giant decorative blobs, low-contrast blur, or hiding content under visual effects.
- Text, buttons, metadata, badges, and table/list rows must remain readable on iPhone, iPad, and desktop. White-on-white glass, low-contrast gray-on-tint, clipped titles, overflowing buttons, and metadata that disappears into the background are release blockers.
- Glass and translucent panels should have real structure: subtle borders, controlled blur, enough backing opacity, and restrained shadows. Avoid nested card-on-card layouts, excessive blur layers, and large empty decorative panels.
- Cards and panels should use modest radii aligned with the current system (`--radius-card`, `--radius-panel`, and `--radius-cover`); pill shapes are for buttons/chips only. Do not make every surface a large rounded floating card.
- Reader is content-first. Manga pages must dominate the screen and must not be dimmed, blurred, faded, shadowed, or covered by persistent panels. Reader chrome should stay minimal by default, with advanced controls in panels/sheets.
- Desktop and iPad navigation must remain stable while scrolling. Sidebars/rails should keep their full-height contract, and only the main content area should scroll unless a platform-specific design deliberately says otherwise.
- iPhone layouts must respect safe areas and bottom navigation. iPad layouts must use rail/sidebar, split, or multi-column structure when space allows. Narrow desktop windows are still desktop runtime, not a stretched phone shell.
- Interactive states are part of the visual system. Desktop must expose hover, focus-visible, keyboard, disabled, and loading states; touch platforms must expose clear pressed/disabled states without shrinking tap targets below usable size.
- Visual changes must be checked in representative desktop, iPad/tablet, and iPhone/mobile viewports. If a change touches routes, layout, Reader, accessibility, or visual baselines, run the required Playwright E2E/visual checks or record why they could not run.
- Public screenshots and visual baselines must follow the repository screenshot policy: no raw manga pages, raw covers, account state, cookies, tokens, private paths, runtime storage, or temporary manual screenshots.

## Current Architecture Rules

- React UI calls the app API and native command boundaries; do not bypass those boundaries from pages when a shared store/helper already exists.
- Tauri/Rust owns SQLite, filesystem validation, archive inspection/extraction, cache directory cleanup, file open/reveal, website HTTP, and real downloads.
- Native Kmoe website HTTP must use a browser-compatible user agent plus normal browser headers where needed. The site can return legacy success markers while failing to preserve an authenticated session for non-browser-like clients.
- The canonical Kmoe website origin for runtime catalog, login, detail, book-data, cover referer, CSP, E2E fixtures, and live smoke defaults is `https://kxo.moe`. If this origin changes, update TypeScript config, Rust web adapter URLs, Tauri CSP, safe host checks, tests, E2E routes, and live verification scripts in the same change.
- Native Kmoe website HTTP must use bounded connection/read timeouts, and frontend native website commands must surface a retryable timeout error instead of leaving catalog, detail, account, or cover-image UI in an indefinite loading state.
- Packaged mobile frontend assets must stay relative. Do not reintroduce a root `<base href="/">` in `index.html`; iOS simulator/device bundle loading can resolve scripts against the filesystem root and render a white screen.
- Android TV remote DPAD/OK input must be bridged through the native Tauri Android WebView when Android WebView does not reliably emit DOM key events; Android Back must use the Tauri AppPlugin `onBackButtonPress` path instead of a custom key bridge so Reader/App shell handlers can run before Activity exit.
- Native authenticated profile checks must require strong account-page markers such as account email, KMOE ID, quota, or logout affordances. Do not reject an otherwise authenticated account page solely because the HTML still contains login form/script references.
- Native cover-image recovery may fetch only HTTPS images from explicitly allowlisted Kmoe cover hosts, return in-memory `data:image/*` content to the UI, and must not persist cover bytes, private URLs, cookies, or credentials.
- Kmoe volume/source availability parsing must consider both per-format size fields and per-format generation/resolution metadata. Do not mark a chapter as `无源图` only because the source ZIP size field is zero when source-image metadata indicates the format exists.
- Native list/snapshot commands must return typed errors when SQLite or filesystem reads fail; they must not convert native failures into empty successful snapshots that can overwrite real frontend state.
- TypeScript owns page composition, reader controls, user-facing state, optimistic local stores, and browser-preview fallbacks.
- Reading cache, permanent downloaded files, metadata cache, shelf items, reading progress, reading history, and download tasks must remain separate data models.
- Reading cache should be treated as temporary storage for online reading and high-quality page display. The default cache policy is a rolling previous/current/next chapter window: when the active chapter advances, caches outside that window become cleanup candidates, while the next chapter may be prefetched from a trusted local archive.
- Permanent downloaded files and Library records must require explicit user intent. They should not become the default path for ordinary reading.
- On iPhone/iPad, explicit downloaded files must be written first to the app-private download root under app data, then exported or shared through the system sheet when the user asks to save/open them outside the app. Do not rely on `HOME/Documents` or assume a Files-visible directory is writable during native downloads.
- A multi-select download action creates local queue items; each task still authorizes and downloads one item at a time.
- Real download progress persistence must be rate-limited before writing SQLite; the network receive loop must not persist every chunk.
- Production behavior should use the real website adapter and native persistence. Mock data may exist only as isolated test fixtures, not as a user-facing runtime mode.
- Avoid broad rewrites that collapse page logic, download behavior, Reader cache handling, and storage into one layer. Keep cross-cutting behavior behind shared helpers/stores and native commands.
- Shelf read-state actions must keep shelf snapshots and reading progress consistent: marking a shelf item read/unread should update the embedded shelf progress and the reading-progress store when a progress record exists.
- Shelf all-filtered read-state actions must operate on the current query result and reuse the same shelf/reading-progress synchronization path as selected-item actions.
- Shelf category management must preserve multi-category semantics. Batch category actions should use `move_categories` with explicit `add`, `replace`, or `remove` modes instead of overwriting categories implicitly.
- Shelf user-facing filters must expose supported store filters for updates, unfinished, reading-completed, publication-completed, cached, downloaded, and archived states. Do not conflate `已读完` reading progress with `已完结` comic publication status. New shelf filters need UI coverage and tests unless they are explicitly internal-only.

## Safety Rules

- Never commit credentials, cookies, session state, tokens, temporary authorization URLs, or private downloaded files.
- Complete real functionality has priority over preserving fixture-only behavior. Real website integration tests, real login, real catalog/detail/profile reads, and real download validation are allowed when the operator explicitly enables a live test profile.
- Local live credentials, including the current test account, must follow the runtime credential handling rules above. Use those rules for all future real-site and real-download work.
- Real-site smoke and integration scripts may use the real website when enabled. They must redact failures, keep cookie jars memory-only or temporary, and avoid upload/admin mutations, deletion, publishing, metadata edits, comment/user deletion, package downloads, and VIP/server-side batch downloads.
- Guarded real-download validation scripts may process real ordinary queue items, including Reader archive tasks, to prove the full app path. They must require an explicit live/real-download confirmation env var, keep authorization URLs in memory, and print only redacted summaries without local paths.
- Keep download concurrency at one unless there is a deliberate product and server-safety decision.
- Authorization URLs are runtime-only and must not be persisted.
- Automated tests default to fixtures, mocked native commands, and local archives, but they may call the real website and real download endpoints in a clearly named live profile that is disabled by default and requires runtime credentials plus explicit confirmation.
- If a real download validation runs, record the reason and redacted result in `TASK_PROGRESS.md` without saving authorization URLs, cookies, account data, private local paths, or credentials.

## Reader And Cache Rules

- Reader page reads must use `chapterCacheId + pageIndex`; never expose arbitrary local paths to web content.
- Public Reader cache commands must enforce the app-owned `ReadingCache` root before saving or reading cached pages, even when a cache row already exists.
- Reader progress history must preserve event semantics: opening a chapter records `open`, ordinary page movement records `page_change`, and first arrival at the final page records `finish`.
- Reader manual read-state actions must write explicit `mark_read`, `mark_unread`, and `restart` history events and must not be overwritten by the next automatic page-change save.
- Reader preferences are per comic, not only per volume. A new volume/chapter without its own progress should inherit that comic's latest reading mode, direction, page layout, zoom, crop, and rotation while starting from its own page position.
- Reader manual spread overrides are per volume/chapter reading progress. Persist manual merge/split overrides in `ReadingProgress` and native SQLite, but do not inherit them as comic-wide `ReaderPreferences` for another volume/chapter.
- Reader restored zoom must affect the actual image transform, not only the displayed preference badge or stored progress record.
- Reader tap zones and swipe paging must work when the pointer starts on the visible image surface, not only on empty background; once zoomed in, image drag/pan should take priority over page navigation.
- Reader keyboard shortcuts must behave like a native desktop/iPad reader: page shortcuts work from the reading surface but must not hijack focused buttons, inputs, sliders, editable fields, or other interactive controls.
- Reader overlays and panels own their shortcut scope: when the page/thumbnail panel is open, page navigation shortcuts should pause and Escape should close the panel before leaving the Reader route.
- Reader must treat TV/remote Back keys as the same scope as Escape: close the open Reader panel first, then leave the Reader route. Remote OK/Enter may toggle Reader chrome only when focus is not inside an interactive control.
- Reader gestures and shortcuts must stay discoverable in the product UI through a help/guide panel; opening help or other Reader panels pauses page navigation shortcuts until the panel closes.
- Reader directory UI should expose both local chapter navigation and page thumbnails when cached sibling chapters are available; users should not need to leave the Reader to move across prepared chapters.
- Reader viewport, orientation, and app background/foreground changes must preserve the current page anchor and flush reading progress before the app is suspended.
- Reader should default to a chrome-light fullscreen experience on iPhone/iPad by hiding the iOS status bar through the native command boundary while the Reader is open. Users must be able to show the status bar from Settings or the Reader control panel, and the app should restore normal status-bar visibility when leaving Reader.
- Reader archive enumeration and extraction must enforce page-count, per-page, and total extracted-size limits before writing cache pages, so malformed or oversized ZIP/CBZ/EPUB files cannot exhaust storage or memory.
- EPUB Reader archive ordering must prefer the EPUB OPF spine/document image order when available, and fall back to natural archive path order only when spine parsing cannot produce image pages.
- Reader archive paths must be trusted through downloaded-file records or the configured download directory before inspection or extraction.
- Automatic cache cleanup may remove reading cache rows, page rows, and registered reader cache directories only. It must preserve permanent downloads, shelf records, reading progress, history, and download tasks.
- User-facing local reading data deletion is a stronger explicit action than automatic cache cleanup: it may delete Reader cache plus corresponding Reader-capable `source_zip` / `epub` local files, downloaded-file records, and terminal source tasks, but must preserve shelf records, reading progress, reading history, and non-Reader-capable formats such as MOBI.
- Every surface that can open Reader from local reading data must expose a real deletion path when local reading data exists: Detail directory entries, Shelf/Continue Reading cards, Library records, Reader controls, and Settings full cleanup. If the native command boundary is unavailable or fails, the UI must report failure and must not fake deletion by clearing only frontend state.
- In Tauri runtime, native SQLite is authoritative for whether a Reader cache exists. Native chapter-cache sync must remove local frontend `reading_cache` rows that are no longer present in native SQLite, so stale persisted store rows cannot reopen or relabel cleared cache.
- Settings full local reading data deletion must call native `delete_local_reading_data` when available and must remove all native/frontend reading-cache rows plus Reader-capable local source records/files. Browser preview must not pretend it can delete device files.
- Policy cleanup runs after opening/changing a Reader chapter and may remove only the computed candidate IDs.
- Ordinary Reader flow should prefer automatic temporary-cache cleanup when moving across chapters or when policy/storage pressure allows. Users should not need to manage storage manually for normal online reading.
- Storage-pressure cleanup is a hard cap for extracted Reader pages: it removes oldest ready reading-cache entries first, preserves the active chapter, tries policy-window entries last, and never removes permanent downloads, shelf records, reading progress, history, download tasks, or downloaded-file records.
- Automatic next-chapter prefetch may only prepare cache from a trusted local Reader archive already in the Library. It must not create download tasks, authorize downloads, or access the website.
- Cache policies with `keepNextChapters` set to `0` disable next-chapter prefetch; custom policies that keep a next-chapter window may prefetch from trusted local archives.
- Automatic next-chapter prefetch must honor explicit runtime constraints: data-saver, low-power, metered connection, and very slow connection signals skip prefetch; unknown desktop connection details should not block local-only prefetch.
- Manual full cleanup must stay explicit in Settings.

## Development Hygiene

- Start each phase with `git status --short --branch`.
- Keep changes scoped, tested, documented, and committed at stable boundaries.
- Every commit must update `TASK_PROGRESS.md` with the change scope, actual validation, skipped checks, and known risks. Keep entries redacted and reverse chronological.
- Update `CHANGELOG.md` for every user-visible or contributor-relevant change. Do not use it for internal command logs.
- Keep `README.md` recent updates to at most 5 entries, and update it only for public-facing changes.
- Update `AGENTS.md` when a durable product invariant, architecture rule, safety boundary, handoff rule, or contribution discipline changes.
- Use fixtures for default automated tests. Put real website and real download automation behind explicit live-profile env flags so normal local/CI runs stay deterministic while full-function verification remains available.
- Before committing, run the full source gate unless the environment cannot support it. The default gate is `git diff --check`, `pnpm --dir apps/kmoe-app typecheck`, `pnpm --dir apps/kmoe-app test:run`, `pnpm --dir apps/kmoe-app build`, `cargo fmt --all --manifest-path apps/kmoe-app/src-tauri/Cargo.toml -- --check`, `cargo check --manifest-path apps/kmoe-app/src-tauri/Cargo.toml`, `cargo test --manifest-path apps/kmoe-app/src-tauri/Cargo.toml --lib`, `pnpm check:platforms`, and `node scripts/check-ios-assets.mjs`.
- Run `pnpm --dir apps/kmoe-app e2e` when the change touches routes, layouts, Reader behavior, accessibility, visual baselines, or browser-visible workflows.
- If any verification cannot run, do not mark it passed. Record the skipped command, reason, and release risk in `TASK_PROGRESS.md`.
- Commit messages should use conventional prefixes such as `feat:`, `fix:`, `docs:`, `test:`, or `chore:`.
- Do not commit transient manual validation screenshots, local build products, downloaded files, runtime caches, or auth/session artifacts. Keep reproducible Playwright visual baselines only under the E2E snapshot directory unless a future release policy explicitly requires another tracked artifact class.
- Public README/docs screenshots may be committed only when they are intentionally prepared release assets under `docs/assets/screenshots/` and do not expose raw manga pages, raw covers, account state, cookies, tokens, private paths, or runtime storage. Use repository-relative image links in Markdown instead of large base64/data-URI image embeds.
