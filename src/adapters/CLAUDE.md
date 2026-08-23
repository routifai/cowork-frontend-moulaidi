# adapters/

Transport-abstraction layer between the UI and the Hypatia engine. Currently one file:
`engine-adapter.ts`.

## Purpose

Defines `EngineAdapter`: `invoke(command, payload, options)`, `listen(event, handler)`,
`stream(command, payload)` — meant to mirror today's Tauri `invoke()`/`listen()` shape so callers
don't need to change when the engine moves from an embedded Tauri sidecar to a standalone HTTP
server (`invoke` → POST, `listen`/`stream` → SSE).

`setEngineAdapter(adapter)` / `getEngineAdapter()` hold a single module-level global adapter,
defaulting to `noopAdapter` (throws on `invoke`/`stream`, `listen` is a no-op unsubscribe).

## Status: not wired up

**No file in `src/` calls `setEngineAdapter` or `getEngineAdapter`.** Every real caller
(`App.tsx`, `usePiStream`, `useProviders`, `useExtensionUi`, `useTelemetry`, `useGreeting`,
`ChatMessage`, `CustomInstructions`, `ToolCallTimeline`, settings components, `lib/utils.ts`,
`lib/telemetry.ts`) still imports `invoke`/`listen` directly from `@tauri-apps/api/core` /
`@tauri-apps/api/event`. This module is the target shape for a migration described in the repo
README, not a currently-active code path. Don't assume swapping the adapter changes app behavior
today — it doesn't, because nothing reads it yet.

If you're asked to "migrate a caller to EngineAdapter," that means replacing its direct
`invoke`/`listen` calls with `getEngineAdapter().invoke`/`.listen`/`.stream`, consistent with this
file's interface — but until *all* callers move and something calls `setEngineAdapter`, both
paths need to coexist correctly.
