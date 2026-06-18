# kmoelite Apple TV

This is the native tvOS developer-preview project for Apple TV.

It intentionally does not reuse the Tauri/WKWebView shell because the current tvOS SDK does not provide WebKit. The v1 direction is a separate SwiftUI app that shares the same product rules: online reading first, app-private storage, temporary Reader cache, and explicit local reading-data deletion.

## Current Scope

- SwiftUI tvOS app shell.
- `URLSession` KMOE client pointed at `https://kxo.moe`.
- Browser-like headers and cookie session handling.
- SQLite3 progress storage.
- Catalog/detail/book_data parser coverage.
- Apple TV simulator build/install/launch smoke.

Not complete yet:

- Real Reader implementation.
- EPUB fetch and extraction.
- Remote-control Reader page-turn behavior.
- Previous/current/next cache window cleanup.
- Explicit local reading-data deletion.
- Physical Apple TV signing and distribution validation.

## Commands

```bash
pnpm test:appletv
pnpm smoke:appletv-sim
```

`APPLETV_SMOKE_LIVE=1 pnpm smoke:appletv-sim` may pass runtime credentials from `.env.local` into the simulator process. The script must not print the credential values.
