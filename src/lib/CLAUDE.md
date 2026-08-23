# lib/

Framework-free helpers (no React) plus one subdirectory of WebGL classes. Most files are a single
narrow responsibility with a doc comment explaining the "why" — read the file header before
assuming behavior.

## Sidecar/IPC helpers

- **`utils.ts`** — `cn()` (clsx + tailwind-merge, the standard classname helper used everywhere),
  `isExternalUrl`/`openExternalUrl` (allowlist-based external-link opening via `invoke("open_url")`
  with a `window.open` fallback for non-Tauri/browser dev mode), and `isClosedIpcError`/
  `retryOnClosed` — the Tauri sidecar's oneshot channel returns a `"closed"` error (case-
  insensitive) when the sidecar hasn't finished booting yet; `retryOnClosed` retries with
  exponential backoff specifically on that error, rethrowing anything else immediately.
- **`telemetry.ts`** — anonymous usage analytics via an in-house IPC (replacing a buggy
  `tauri-plugin-aptabase`) plus lazily-loaded Sentry crash reporting. Must never throw — all calls
  are no-ops until `initTelemetry()`/`setTelemetryEnabled()` grants consent.
- **`external-links.ts`** — installs one document-level, bubble-phase, delegated click handler
  (`installExternalLinkHandler`, called once from `main.tsx`) that routes external `<a href>`
  clicks to the system browser instead of navigating the Tauri webview away from the app.
  Respects `event.defaultPrevented` so `MarkdownComponents.tsx`'s own anchor override wins first.
- **`log.ts`** — console wrapper; `debug`/`log` are silenced when `import.meta.env.DEV` is false,
  `warn`/`error` always fire. Calls delegate lazily so `console` can be spied in tests. Convention:
  prefix with `[scope]`.

## Command palette / slash commands

- **`builtinCommands.ts`** — the "clean subset" of slash commands wired directly to `App.tsx`
  handlers (`CommandContext`: newSession, openSessions, openModelSelector, openSettings, showHelp,
  sendMessage, ...). Pure + framework-free by design so it's unit-testable without React.
  Plumbing-dependent commands (`/extensions`, `/skills`, `/share`, `/clear`, `/compact`) are
  intentionally NOT here — tracked in `docs/plans/slash-commands-roadmap.md`.
- **`commandFilter.ts`** — dependency-free fuzzy matcher for the command palette: scores exact >
  prefix > subsequence match on name/aliases, then description substring as fallback; stable sort.

## Chat rendering helpers

- **`statusLabels.ts`** — maps raw tool names to friendly present-tense phrases
  ("Creating a document…") and clubs consecutive same-phrase tool calls into one activity line,
  for `ActivityBlock`'s non-technical view (issue #173). Hardcoded phrase table by design — never
  surfaces raw tool names/paths/commands.
- **`rehypeHighlightTerm.ts`** — rehype plugin wrapping matches of a search term in rendered
  markdown, with an `activeIndex` for distinct active-match styling/scroll targeting (in-thread find).
- **`scroll.ts`** — pure "stick to bottom" decision logic (`ScrollMetrics` → should-auto-scroll),
  deliberately DOM-free so it's unit-testable; the actual scroll-container wiring lives in `ChatView`.
- **`artifacts.ts`** — `ArtifactType` (`html|svg|image|code|unknown`) detection from a file
  path/extension, plus `extractFilePaths` (parses tool-result strings for "Written to <path>" /
  diff headers) and `parentDir`/`svgToImgSrc`. This is the **file-preview** artifact concept, not
  the playground's `PlaygroundArtifactType` — see `src/types/CLAUDE.md`.
- **`model-key.ts`** — `modelKey(provider, id)` → `"provider/id"`. Model ids are **not** unique
  across providers (e.g. the same id offered by several providers) — always identify/select a
  model by this composite key, never a bare id.

## App preferences (all localStorage-backed, applied pre-render from `main.tsx`)

- **`themes.ts`** — dark/light via a `data-theme` attribute on `<html>`, overriding
  `prefers-color-scheme`.
- **`wallpaper.ts`** — now just clears any stale wallpaper config from older app versions; Aurora
  is the only backdrop today.
- **`chat-width.ts`** — small(820px)/medium(1080px)/full reading-column width presets.
- **`font-scale.ts`** — UI zoom via CSS `zoom` on the root container; presets `0.85|1|1.15|1.3`.
- **`updateChannel.ts`** — resolves whether the running build may self-update: package-manager
  installs (Homebrew/AUR/Winget/.deb) must not self-replace their binary; inputs come from the
  Tauri `get_install_context` command.
- **`brand-links.ts`** — centralized outbound URLs (website/repo/issues) for About/feedback flows;
  always routed through `external-links.ts`'s system-browser handler.

## `presence/` — WebGL "living avatar" classes

Three.js + GSAP classes, driven imperatively from outside React's render cycle:
- **`OrbPresence.ts`** — "Royal Gloss" blob orb for `AuthGate` (auth/landing hero). Modes:
  `idle|listening|thinking|settled`.
- **`PulsePresence.ts`** — the chat "Pulse" avatar (96-bar radial waveform + hairline ring). Modes:
  `rest|thinking|speaking|settled`. Both track a DOM anchor element every frame
  (`getBoundingClientRect` → NDC → unproject) so they can "fly" between docks and survive
  scroll/resize without React re-renders — see `new-design/INSTRUCTIONS.md` for the full
  choreography spec. Wrapped for React consumption by `@/hooks/usePresence.ts`, which fails soft
  when WebGL is unavailable.

## Gotcha

`utils.ts` and `telemetry.ts` both import `invoke` from `@tauri-apps/api/core` directly — neither
goes through `@/adapters/engine-adapter.ts`.
