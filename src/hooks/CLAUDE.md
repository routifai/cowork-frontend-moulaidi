# hooks/

11 hooks (each with a co-located test except `usePresence`/`useProviders`). Grouped by role.

## Sidecar/engine bridge

- **`usePiStream.ts`** — the central hook. Owns a `useReducer(multiStreamReducer)` keyed by
  session id, exposing `{ streams, startStream, abortStream, steerStream, followUpStream,
  clearQueue, forgetSession }`. `startStream` opens a Tauri `Channel<PiEvent>`
  (`@/types/pi-events.ts`) and passes it to `invoke("send_prompt", { text, sessionId, ch: channel
  })`; the channel's `onmessage` switches over every `PiEvent` variant (`message_update` →
  thinking/text deltas, `toolcall_end`, `error`, etc.) and dispatches typed `StreamAction`s into
  the reducer. `App.tsx` is the sole consumer, deriving the *displayed* session's `StreamState`
  from the multi-session map so backgrounded sessions keep streaming untouched (see
  `docs/plans/multi-session-concurrency.md`). No test file covers this hook directly per
  codegraph — exercise care and check `App.tsx`'s own tests when changing it.
- **`useExtensionUi.ts`** — listens for the sidecar's `ui_request` Tauri event (pi extensions
  calling `ctx.ui.confirm/select/input/editor`), queues interactive requests one at a time, and
  exposes `respond()` which sends `ui_response` back via `invoke("send_ui_response", ...)`.
  Rendered by `@/components/ExtensionUiDialog.tsx`; without that pairing, an extension's
  permission-gate call never resolves and the tool call — and the whole turn — hangs.
- **`useProviders.ts`** — `invoke("get_models")` → `ModelInfo[]`, refreshable, plus a `listen()`
  presumably for a models-changed event (check current source before assuming refresh triggers).
- **`useGreeting.ts`** — time-of-day salutation + optional last-session reference via `invoke`.
- **`useTelemetry.ts`** — consent state synced three ways: Rust `TelemetryState`
  (`set_telemetry_enabled` invoke), settings persistence (`save_settings` invoke), and the
  frontend telemetry service gate (`@/lib/telemetry.ts`, which lazily loads Sentry).
- **`useAppUpdate.ts`** — wraps `@tauri-apps/plugin-updater` + `@tauri-apps/plugin-process` behind
  a status state machine (`idle→checking→available/managed/uptodate→downloading→restarting→
  error`), applying channel policy from `@/lib/updateChannel.ts` (Homebrew/AUR/Winget/.deb builds
  must not self-update). Shared app-wide via `@/contexts/UpdateProvider.tsx`, not used standalone.

## WebGL presence

- **`usePresence.ts`** — mounts `PulsePresence` (`@/lib/presence/PulsePresence.ts`) for the
  component's lifetime, returns an imperative API (`setAnchor`, `setMode`, `glitch`, `ripple`,
  `snapToAnchor`). **Fails soft**: if WebGL is unavailable (jsdom/CI/headless), the constructor
  throws, the hook logs once, and every API call silently becomes a no-op — chat must work
  identically with or without the presence. Consumed by `@/chat/ChatView.tsx`.

## Playground / artifacts

- **`usePlaygroundArtifacts.ts`** — `Record<id, PlaygroundArtifact>` store with `upsert/seed/
  clear`. Deliberately independent of `usePiStream`'s `StreamState` — see the hook's own doc
  comment: bolting artifacts into `StreamState` previously let a turn-lifecycle `RESET` action
  wipe them out from under a live turn; living in its own state, no chat-turn action can reach it.
- **`useArtifactLoader.ts`** — loads a file from disk via `@tauri-apps/plugin-fs` `readTextFile`
  and detects its type via `@/lib/artifacts.ts`'s `detectArtifactType`, for `ArtifactPreview`'s
  inline file previews. Unrelated to the playground store above (different "artifact" concept —
  see `src/types/CLAUDE.md`).

## Composer UX

- **`usePasteDetection.ts`** — clipboard paste → `PastedImage[]` (dataURL, name, type), no Tauri dependency.
- **`useFilePicker.ts`** — wraps `@tauri-apps/plugin-dialog`'s `open()` for multi-file selection.

## Gotcha

Most of these hooks import `invoke`/`listen` straight from `@tauri-apps/api/core` /
`@tauri-apps/api/event`. None goes through `@/adapters/engine-adapter.ts`'s `EngineAdapter` — that
abstraction exists but nothing calls `getEngineAdapter()` anywhere in `src/` yet.
