## What this is

Hypatia Cowork desktop app — frontend package (`hypatia-frontend`, v0.3.0). React 19 + TypeScript
UI wrapped in a Tauri v2 shell. This is a fresh copy of `zosma-cowork/frontend` mid-migration to a
standalone repo (see README.md) — Tauri is being made an optional/removable transport, not a
permanent dependency.

Design direction ("V3") lives in `new-design/` (`INSTRUCTIONS.md`, `COWORK-UX.md`) — read those
before touching visual/UX code; the various `*-v3.html` files at repo root are throwaway static
prototypes referenced from there, not part of the app build.

## Architecture

Three processes, two repos:

```
React UI (src/)  <--Tauri IPC-->  Tauri Rust shell (src-tauri/)  <--stdio JSON-->  Node sidecar (hypatia-backend, sibling repo)
```

- **`src-tauri/`** (Rust) is a thin relay, not business logic: it spawns the `hypatia-backend`
  Node process (`src-tauri/agent-sidecar/index.cjs` in prod; `tsx` on the sibling checkout's
  `src/index.ts` in dev, overridable via `HYPATIA_BACKEND_DEV_PATH`), writes commands to its
  stdin, and reads newline-delimited JSON events from its stdout, forwarding them to the frontend
  via Tauri `Channel`s and global `emit`. See `src-tauri/src/lib.rs`.
- **The frontend talks to Rust today via direct `@tauri-apps/api/core` `invoke()` /
  `@tauri-apps/api/event` `listen()` calls**, scattered across `App.tsx` and several
  hooks/components (grep `from "@tauri-apps/api"` in `src/`). `src/adapters/engine-adapter.ts`
  defines an `EngineAdapter` transport interface (`invoke`/`listen`/`stream`) meant to replace all
  of that so a future HTTP+SSE backend can be swapped in — **it is not wired up anywhere yet**
  (no caller sets an adapter or calls `getEngineAdapter()`). Don't assume it's live; check before
  relying on it. `src/types/tauri-stubs.d.ts` shadows the real `@tauri-apps/*` type defs for the
  same eventual web-only build.
- **`src/api/` is currently empty** — reserved for that migration, not yet used.
- The single richest wire-protocol type is `PiEvent` (`src/types/pi-events.ts`), the JSON stream
  format emitted by the `pi` coding-agent engine running inside the sidecar; `usePiStream`
  (`src/hooks/usePiStream.ts`) is the reducer that turns a `Channel<PiEvent>` (opened per
  `send_prompt` invoke) into per-session `StreamState`.

## src/ subdirectory map

| Dir | Role |
|---|---|
| `App.tsx` / `main.tsx` | App root: owns session list, active session, invoke/listen wiring, wires every hook and top-level component together. `main.tsx` sets theme/wallpaper/chat-width/external-link-handler before render. |
| `adapters/` | Transport-abstraction interface (`EngineAdapter`) — aspirational, not yet consumed. |
| `api/` | Empty — reserved for the same migration. |
| `chat/` | `ChatView` — the message list + composer dock; presentational, driven by props from `App.tsx`. |
| `components/` | All other UI: chat message rendering, sidebar, settings pages (`settings/`), dialogs, and generic primitives (`ui/`). See `components/CLAUDE.md`. |
| `contexts/` | One React context (`UpdateProvider`) sharing app-update state app-wide. |
| `hooks/` | Stateful logic: the sidecar bridge (`usePiStream`, `useExtensionUi`, `useProviders`), the WebGL presence (`usePresence`), app-update, playground artifacts, misc UI hooks. See `hooks/CLAUDE.md`. |
| `lib/` | Framework-free helpers: telemetry, theming, artifact parsing, command palette matching, `presence/` (Three.js WebGL avatars). See `lib/CLAUDE.md`. |
| `playground/` | Slide-over panel that renders `show_artifact` tool outputs (html/markdown/code/diff/image) in per-type renderers. |
| `test/` | Vitest setup + shared Tauri API mocks. |
| `types/` | Shared TS types: `ChatMessage`/`ToolCallInfo` domain types, `PiEvent` wire protocol, slash-`Command`, playground artifact shape, Tauri API stub declarations. |

Path alias: `@/*` → `src/*` (see `tsconfig.json`, `vite.config.ts`).

## Commands

- `pnpm run dev` — full Tauri app (`tauri dev`); `pnpm run dev:frontend` — Vite only, no Rust/sidecar.
- `pnpm run build` — `tauri build`; `pnpm run build:frontend` — `tsc && vite build` (frontend only).
- `pnpm run test` / `pnpm run test:watch` — Vitest (jsdom, setup in `src/test/setup.ts`).
- `pnpm run typecheck` — `tsc --noEmit`.
- `pnpm run lint` — Biome (`biome.json`; tabs, double quotes, 100-col). `pnpm run lint:styles` runs
  the inline-token-color guardrail (`scripts/inline-token-style-guardrail.mjs`) — a ratcheting
  baseline check, not a normal lint rule; regenerate with `--update` if you legitimately reduce a
  file's inline `hsl(var(--token))` usage.
- `pnpm run validate` — lint + typecheck + test; run before considering work done.

`src-tauri/binaries/npm/` and `target/` contain vendored/build third-party code (npm CLI source,
Rust build artifacts) — not part of this project, ignore when exploring.

## Agent skills

### Issue tracker

Issues tracked in GitHub (routifai/cowork-frontend-moulaidi), via `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context layout (root `CONTEXT.md` + `docs/adr/`, created lazily). See `docs/agents/domain.md`.
