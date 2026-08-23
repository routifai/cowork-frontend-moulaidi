# components/

51 files. All presentational-first; state is generally owned by `App.tsx`/hooks and passed down as
props. Grouped by subarea below — see individual file headers for details, most have a doc
comment explaining the "why."

## Chat transcript rendering

`ChatMessage.tsx` (`ChatMessageItem`) is the per-message renderer, composing:
- `ActivityBlock.tsx` — non-technical "Creating a document…" activity summary (issue #173),
  driven by `@/lib/statusLabels.ts`'s `clubActivities`/`headlineActivity`. Never shows raw tool
  names/paths/commands by design.
- `ToolCallTimeline.tsx` — the technical/detailed alternative to ActivityBlock: flat inline tool
  execution log matching the `pi` TUI's style (bash `$ cmd` + output, side-by-side diffs, etc).
- `ThinkingBlock.tsx` — collapsible model reasoning trace; has a `simple` mode for the non-technical view.
- `ArtifactChips.tsx` / `ArtifactPreview.tsx` — inline chips for `show_artifact` tool calls
  (`ArtifactChips` reads `@/playground/PlaygroundPanel`'s `TYPE_ICONS`) and a preview card for
  on-disk file artifacts (`ArtifactPreview`, backed by `@/hooks/useArtifactLoader`) — **two
  separate artifact concepts**, see `src/types/CLAUDE.md` gotcha.
- `MemoryChip.tsx` (`MemoryChips`) — inline chip for `save_memory` tool calls, opens Settings → Memory.
- `MarkdownComponents.tsx` — shared `react-markdown` component overrides; its critical job is
  intercepting `<a>` clicks so external links open in the system browser, not the Tauri webview
  (paired with `@/lib/external-links.ts`'s document-level handler installed in `main.tsx`).
- `FeedbackButtons.tsx` + `FeedbackDialog.tsx` — thumbs up/down and expanded bug/feature/general
  feedback dialog, both send via `trackEvent` (telemetry), not a backend ticket.
- `InThreadFind.tsx` — floating find-in-conversation bar; pairs with `@/lib/rehypeHighlightTerm.ts`
  for match highlighting inside rendered markdown.

## Composer

`MessageInput.tsx` — the text input + toolbar; owns paste-image detection
(`@/hooks/usePasteDetection`), slash-command parsing (`parseSlashInput`, exported for tests), and
renders `CommandPalette.tsx` (fuzzy-matched popover, pure presentation — filtering logic lives in
`@/lib/commandFilter.ts`) and `ModelSelector.tsx` (provider/model picker keyed by the
`provider/id` string from `@/lib/model-key.ts`).

## App shell / navigation

- `Sidebar.tsx` — session list with folder grouping, pin/rename/delete, `ConversationSearch.tsx`
  (deep content search popover).
- `SettingsPage.tsx` — tab shell over `settings/` subpages (see below).
- `AuthGate.tsx` — dummy V3 auth/splash screen shown once per browser session before the
  "metamorphosis" transition into chat; drives the `OrbPresence` WebGL orb (`@/lib/presence/`).
  Fixed light palette, deliberately independent of app dark/light theme.
- `SplashScreen.tsx` — shown while the sidecar is still booting (replaces old onboarding flash, issue #169).
- `UpdateBanner.tsx` — dismissible launch-time "update available" banner; only for self-updatable
  builds (see `@/lib/updateChannel.ts` — managed/package-manager installs use
  `settings/UpdateSettingsRow.tsx` instead).
- `HelpDialog.tsx` — renders `BUILTIN_COMMANDS` (`@/lib/builtinCommands.ts`) for `/help`.
- `ChatWidthToggle.tsx` — small/medium/full reading-column width control (`@/lib/chat-width.ts`).
- `ErrorBanner.tsx` — stream error display with retry/switch-model actions.
- `BrandIcons.tsx` — hand-drawn SVG marks for AI providers (Claude, etc.), 24×24 viewBox.
- `CommandPalette.tsx`, `ModelSelector.tsx` — see Composer above.
- **`RightPanel.tsx` is dead code** — grep confirms no other file imports it. Verify before
  building on it; it's a `StreamState`-driven "Context" side panel that isn't mounted anywhere.

## Settings pages (`settings/`)

Small, single-purpose sections mounted by `SettingsPage.tsx`: `About.tsx` (version, links, uses
`useUpdate()` context + `UpdateSettingsRow.tsx`), `Appearance.tsx` (thin wrapper rendering
`Theme.tsx`), `Instructions.tsx` (wraps the top-level `CustomInstructions.tsx` editor —
`INSTRUCTIONS.md`, sidecar-injected system-prompt context, reloads live session on save),
`MemorySettings.tsx` (`MEMORY.md` index + per-topic notes editor), `Workspace.tsx` (default
Cowork home-folder picker, persisted as `coworkHomeDir`), `Theme.tsx` (dark/light + reuses
chat-width control), `UpdateSettingsRow.tsx` (full update state machine UI).

`ExtensionUiDialog.tsx` (top-level, not under `settings/`) renders whatever `pi` extension `ui.*`
request is queued by `@/hooks/useExtensionUi.ts` (confirm/select/input/editor) — **required** for
extension permission gates (e.g. around bash/edit/write) to ever resolve; without a mounted
renderer the tool call hangs forever.

## `ui/` — generic primitives

Framework-level building blocks with no app-specific knowledge: `button.tsx`, `badge.tsx`,
`dialog.tsx` (modal shell w/ focus mgmt, scroll lock, Esc/click-outside — `confirm-dialog.tsx` and
`rename-dialog.tsx` are built on it), `scroll-area.tsx`, `segmented-control.tsx`, `separator.tsx`,
`skeleton.tsx`, `tooltip.tsx` (wraps `@radix-ui/react-tooltip`). Treat these like a tiny internal
design-system layer — prefer composing them over ad hoc markup when adding new UI.

## Gotchas

- Two independent artifact type systems collide in naming (`ArtifactType` vs
  `PlaygroundArtifactType`) — see `src/types/CLAUDE.md`.
- Many components still import `invoke` from `@tauri-apps/api/core` directly
  (`ChatMessage.tsx`, `CustomInstructions.tsx`, `ToolCallTimeline.tsx`,
  `settings/MemorySettings.tsx`, `settings/Workspace.tsx`) — the `EngineAdapter` abstraction in
  `@/adapters` is not used by any of them yet.
