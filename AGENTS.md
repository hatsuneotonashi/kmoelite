# AGENTS.md

## Project Goal

Build Kmoe Client into a lightweight unofficial KMOE online manga reader for personal daily use. The primary product goal is to let users open one comic, read it comfortably in high quality, and avoid long-term local storage growth by using temporary Reader cache and cleanup policies instead of default permanent downloads.

Public project positioning: Kmoe Client is an Alpha / developer-preview unofficial KMOE online manga reader and personal reading-management tool. It is not affiliated with KMOE and must not be presented as KMOE-owned software.

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
- After context compaction or handoff to another coding agent, the expected resume path is `git status --short`, read `AGENTS.md`, then inspect the relevant code/docs before editing.

## Current Product Memory

- Production runtime is live-first and does not expose a user-facing mock/demo mode. Test fixtures live only under Vitest and Playwright test folders.
- Public documentation must use the unofficial-client framing and GPL-3.0 licensing consistently.
- Public documentation must describe the project as Alpha / developer preview until platform validation proves a stable release.
- The default product direction is online reading with temporary cache. Permanent download and Library flows are advanced/compatibility capabilities, not the primary public promise.
- Main app surfaces include Home, Shelf, Search, Categories, Login, Comic Detail, Download Center, Library, Account, Settings, and Reader.
- Reader opens prepared local reading cache at `/reader/cache/:chapterCacheId`.
- Detail, Library, Shelf, and Continue Reading can resolve ready reading cache or trusted local Reader archive records into the Reader flow. Reader archives currently include source ZIP/CBZ and EPUB; MOBI remains file-only.
- Completed source ZIP/CBZ and EPUB downloads in Download Center should prefer opening through Reader-cache preparation; external file open/reveal remains secondary and file-only formats such as MOBI remain outside Reader.
- Download Center command buttons must be state-gated against the real queue state. Empty queues must not expose a clickable start action, and unfinished-task cleanup must not be available when there is nothing to clear or while a native task is actively running.
- Download Center task controls must be driven by successful native/SQLite commands and refreshed native snapshots. If the native command boundary is unavailable, the UI may report the unavailable action but must not locally fake pause, resume, cancel, retry, or cleanup state transitions.
- The production client must not expose a destructive "clear Library" command or UI. Library records should be preserved unless a deliberate per-item removal/rebind product flow is designed and tested.
- Missing Reader archives may queue exactly one local `source_zip` or `epub` task for the selected volume/chapter; this is not a package or VIP batch action.
- Reader-initiated archive downloads may promote that one queued task to the next queue item, but must still respect single-item sequential downloading.
- Reader recovery may queue a missing EPUB/source ZIP only after confirming an authenticated live session. Signed-out users must be sent to Login before any native download task is created.

## Runtime Credential Handling

- Test accounts, passwords, cookies, sessions, tokens, and temporary authorization URLs are runtime-only inputs. They must never be written into tracked files, commits, screenshots, logs intended for the repository, or durable project memory.
- Test account emails and passwords may only be supplied at runtime through shell environment variables or gitignored machine-local files such as `.env.local`. This rule applies even when full real-site tests or guarded real-download tests are allowed.
- `.env.local` may be used on a developer machine for convenience, but it must stay untracked and must not be copied into docs, fixtures, examples, release manifests, screenshots, or progress logs.
- Do not store actual account emails or passwords in this file. `AGENTS.md` may document the approved handling pattern only.
- Scripts and app code that need live credentials should read explicit runtime variables such as `KMOE_SMOKE_EMAIL`, `KMOE_SMOKE_PASSWORD`, `KMOE_VERIFY_EMAIL`, and `KMOE_VERIFY_PASSWORD`. Do not hardcode fallback credentials.
- When the user explicitly enables remembered login, the native app may persist only the Kmoe website session cookie header in app-private runtime settings so the reqwest session can be restored after restart. It must be cleared on logout or on a successful non-remembered login, and must never be exported, logged, documented, committed, or included in migration snapshots.
- If credentials are accidentally printed, saved, or staged, stop the release/commit path, remove the artifact, rotate the credential if needed, and record only a redacted incident note in `TASK_PROGRESS.md`.

## Platform Product Rules

- Planned target platforms are iPhone, iPad, Android phone, Android tablet, Windows, and macOS. Apple TV and Android TV are future research targets until platform architecture and input constraints are designed.
- macOS, Windows, iPad, and iPhone are current first-class design targets. Android phone/tablet should follow the same product principles when implementation begins. Do not treat mobile as the only polished surface or stretch one layout across every platform.
- Layout decisions must be derived from runtime, device, window, and input classes together. iPad split view may become tablet-compact but not a phone layout, and macOS/Windows/Linux narrow windows must remain desktop runtime contracts rather than switching into the phone shell.
- iPhone and Android phone should use touch-first navigation and safe-area aware layouts; iPad and Android tablet should use split/multi-column layouts when space allows; macOS and Windows should use desktop navigation, keyboard/focus states, hover states, and higher information density.
- Cover-aware visual surfaces should follow an Apple Music-like adaptive art direction: the cover may drive saturated page color, but the hue must come from real cover pixels whenever a cover can be loaded. Hash/fallback palettes are failure-only fallbacks, not the normal theme source. Text and controls must remain high-contrast over dark/tinted translucent layers. Do not ship muddy beige/gray wash, white-on-white glass, unreadable metadata, or decorative blur that competes with real cover/comic content.
- Platform-specific validation belongs in docs and progress logs. Keep the code paths resilient through breakpoints and capability detection instead of relying on a single simulator or workstation result.
- Native packaging and file behavior must be verified per platform before release: macOS app bundle, Windows package/file actions, iPhone/iPad simulator, and signed physical iPhone/iPad install/export checks.

## Current Architecture Rules

- React UI calls the app API and native command boundaries; do not bypass those boundaries from pages when a shared store/helper already exists.
- Tauri/Rust owns SQLite, filesystem validation, archive inspection/extraction, cache directory cleanup, file open/reveal, website HTTP, and real downloads.
- Native Kmoe website HTTP must use a browser-compatible user agent plus normal browser headers where needed. The site can return legacy success markers while failing to preserve an authenticated session for non-browser-like clients.
- Native Kmoe website HTTP must use bounded connection/read timeouts, and frontend native website commands must surface a retryable timeout error instead of leaving catalog, detail, account, or cover-image UI in an indefinite loading state.
- Native cover-image recovery may fetch only HTTPS images from explicitly allowlisted Kmoe cover hosts, return in-memory `data:image/*` content to the UI, and must not persist cover bytes, private URLs, cookies, or credentials.
- Native list/snapshot commands must return typed errors when SQLite or filesystem reads fail; they must not convert native failures into empty successful snapshots that can overwrite real frontend state.
- TypeScript owns page composition, reader controls, user-facing state, optimistic local stores, and browser-preview fallbacks.
- Reading cache, permanent downloaded files, metadata cache, shelf items, reading progress, reading history, and download tasks must remain separate data models.
- Reading cache should be treated as temporary storage for online reading and high-quality page display. Storage policies should favor cleanup after reading, when moving across chapters, or when pressure limits are reached.
- Permanent downloaded files and Library records must require explicit user intent. They should not become the default path for ordinary reading.
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
- Reader gestures and shortcuts must stay discoverable in the product UI through a help/guide panel; opening help or other Reader panels pauses page navigation shortcuts until the panel closes.
- Reader directory UI should expose both local chapter navigation and page thumbnails when cached sibling chapters are available; users should not need to leave the Reader to move across prepared chapters.
- Reader viewport, orientation, and app background/foreground changes must preserve the current page anchor and flush reading progress before the app is suspended.
- Reader archive enumeration and extraction must enforce page-count, per-page, and total extracted-size limits before writing cache pages, so malformed or oversized ZIP/CBZ/EPUB files cannot exhaust storage or memory.
- EPUB Reader archive ordering must prefer the EPUB OPF spine/document image order when available, and fall back to natural archive path order only when spine parsing cannot produce image pages.
- Reader archive paths must be trusted through downloaded-file records or the configured download directory before inspection or extraction.
- Cache cleanup may remove reading cache rows, page rows, and registered reader cache directories only. It must preserve permanent downloads, shelf records, reading progress, history, and download tasks.
- Shelf cache cleanup actions may clear selected reading-cache entries and reset `reading_cache` shelf flags, but must preserve permanent downloads, downloaded shelf state, shelf membership, reading progress, history, and download tasks.
- Policy cleanup runs after opening/changing a Reader chapter and may remove only the computed candidate IDs.
- Ordinary Reader flow should prefer automatic temporary-cache cleanup after finishing or leaving content when policy allows. Users should not need to manage storage manually for normal online reading.
- Storage-pressure cleanup is a hard cap for extracted Reader pages: it removes oldest ready reading-cache entries first, preserves the active chapter, tries policy-window entries last, and never removes permanent downloads, shelf records, reading progress, history, download tasks, or downloaded-file records.
- Automatic next-chapter prefetch may only prepare cache from a trusted local Reader archive already in the Library. It must not create download tasks, authorize downloads, or access the website.
- Space-saver cache policy disables aggressive next-chapter prefetch.
- Automatic next-chapter prefetch must honor explicit runtime constraints: data-saver, low-power, metered connection, and very slow connection signals skip prefetch; unknown desktop connection details should not block local-only prefetch.
- Manual full cleanup must stay explicit in Settings.

## Development Hygiene

- Start each phase with `git status --short`.
- Keep changes scoped, tested, documented, and committed at stable boundaries.
- Update `TASK_PROGRESS.md`, `README.md`, and relevant docs when product behavior changes.
- Use fixtures for default automated tests. Put real website and real download automation behind explicit live-profile env flags so normal local/CI runs stay deterministic while full-function verification remains available.
- Before committing, run focused tests first, then broader checks when the phase touches shared behavior.
- Do not commit transient manual validation screenshots, local build products, downloaded files, runtime caches, or auth/session artifacts. Keep reproducible Playwright visual baselines only under the E2E snapshot directory unless a future release policy explicitly requires another tracked artifact class.
- Public README/docs screenshots may be committed only when they are intentionally prepared release assets under `docs/assets/screenshots/` and do not expose raw manga pages, raw covers, account state, cookies, tokens, private paths, or runtime storage. Use repository-relative image links in Markdown instead of large base64/data-URI image embeds.
