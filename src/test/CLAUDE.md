# test/

Vitest support files, not a test suite itself (actual `*.test.ts(x)` files live alongside the
code they cover, throughout `src/`).

- `setup.ts` — registered as `test.setupFiles` in `vite.config.ts`. Imports `@testing-library/
  jest-dom` matchers, polyfills `Element.prototype.scrollIntoView` (jsdom lacks it) and
  `window.matchMedia` (needed by `lib/themes.ts`'s `getThemeMode`, which several components read).
- `mocks.ts` — shared Tauri mocks. Calls `vi.mock("@tauri-apps/api/core")` and `vi.mock("@tauri-
  apps/plugin-fs")` at module scope (so any test file importing this module gets the mock
  installed), using `vi.hoisted()` factories since `vi.mock` callbacks are hoisted above imports.
  Exposes `mockInvoke(impl?)`, `mockReadTextFile(impl?)`, `mockReadFile(impl?)`, `cleanupMocks()`.

## Gotcha

Because `vi.mock` runs at import time, any test file that needs `invoke`/`readTextFile` mocked
must import from `@/test/mocks` (even just for its side effect) — importing `@tauri-apps/api/core`
directly in a test without going through this module will hit the real (unavailable) Tauri API.
There is no `EngineAdapter` test double here — tests mock the Tauri layer directly, consistent
with the adapter not being wired into any real code path yet (see `src/adapters/CLAUDE.md`).
