# types/

Shared TypeScript types, no logic. `index.ts` re-exports `./pi-events` and `./playground`, so
`import type { X } from "@/types"` reaches all three files' exports.

- `index.ts` — domain types owned by this app: `ChatMessage` (with `kind?: "queued-steer" |
  "queued-follow-up"` for #201's mid-turn queue badges), `ToolCallInfo`, `ExtensionInfo`,
  `ProviderInfo`/`ModelInfo`/`ConfigPayload` (from the sidecar's `pi` models.json), and
  `ZemExtension` (the "Hypatia Extension Model" shape — `runtime: "pi" | "dhara" | "native"`,
  install scope, capabilities).
- `pi-events.ts` — `PiEvent` union: the JSON streaming protocol emitted by the `pi` coding agent
  inside the sidecar (session/agent_start/turn_start/message_update/toolcall_end/... — see the
  file's header link to the upstream `pi-mono` docs). Consumed almost exclusively by
  `@/hooks/usePiStream.ts`; treat this as the wire contract, not app-internal state.
- `commands.ts` — `Command`/`CommandCategory` for the slash-command palette (epic #179): pure data
  descriptors, no implementations. Actual command behavior lives in `@/lib/builtinCommands.ts`
  (app-action commands) and the sidecar's extension-registered commands.
- `playground.ts` — `PlaygroundArtifact(Payload)` + `isPlaygroundArtifactPayload` type guard.
  Mirrors the sidecar's `show-artifact` extension schema — two independent declarations of the
  same shape across the stdio boundary (see `src/playground/CLAUDE.md`).
- `tauri-stubs.d.ts` — **ambient module declarations that shadow the real `@tauri-apps/*`
  packages** (`api/core`, `api/event`, `api/app`, `plugin-dialog`, `plugin-fs`, `plugin-updater`,
  `plugin-process`) with a minimal subset of their surface. Per its header comment: "Stub
  declarations for the Tauri packages we are removing from the web build ... Once all consumers
  use EngineAdapter, this file can be deleted." Only touch this file if you're adding a new Tauri
  API call site that needs a type for a web/non-Tauri build target — it is not needed for normal
  Tauri-mode development, where the real `@tauri-apps/*` type packages resolve instead.
- `speech-recognition.d.ts` — ambient types for the browser SpeechRecognition API (dictation
  input), unrelated to the Tauri stub file above.

## Gotcha

Two different "artifact" concepts exist in this codebase: `ArtifactType` (`@/lib/artifacts.ts`,
`html|svg|image|code|unknown` — used by `useArtifactLoader`/`ArtifactPreview` for on-disk file
previews) vs. `PlaygroundArtifactType` (`@/types/playground.ts`,
`html|markdown|code|diff|image` — used by the playground panel). They overlap in name but are not
interchangeable; check which one a function expects.
