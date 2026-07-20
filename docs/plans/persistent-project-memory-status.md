# Persistent Project Memory — Implementation Status

Status: **implemented, tested, and manually verified end-to-end** in both
`hypatia-backend` and `hypatia-frontend`. The first pass below (backend store,
tool, RPC handlers, transcript chip, settings UI) all landed cleanly; manual
end-to-end testing then surfaced two real bugs that unit tests couldn't catch
because they were both integration gaps, not logic errors — see
"Bugs found during manual verification" below. Both are fixed.

## Backend (`hypatia-backend`)

- ✅ `src/memory-store.ts` + `src/memory-store.test.ts`
  - workspace encoding scheme matching pi's session-dir sanitization
  - `loadMemoryIndex`, `upsertMemoryEntry`, `loadMemoryNote`, `saveMemoryNote`, `deleteMemoryTopic`
  - soft line (150) / size (25KB) guard with consolidation nudge
  - `memoryIndexBlock()` for system-prompt injection

- ✅ `src/extensions/save-memory.ts` + `src/extensions/save-memory.test.ts`
  - registered `save_memory` tool following `show_artifact` pattern
  - parameters: topic, summary, type, detail

- ✅ `src/agent-init.ts`
  - imports `saveMemoryExtension` and registers it in `extensionFactories`
  - injects the memory block into `systemPromptOverride`
  - added a `save_memory` guideline to `HYPATIA_SYSTEM_PROMPT`

- ✅ `src/commands/handlers/memory.ts` + `memory.test.ts`
  - RPC handlers: `get_memory_index`, `get_memory_note`, `save_memory_note`, `delete_memory_topic`

- ✅ `src/commands/types.ts` + `src/commands/handler-registry.ts`
  - four new command shapes wired into dispatch

## Frontend (`hypatia-frontend`)

- ✅ `src/components/ToolCallTimeline.tsx`
  - added `save_memory` header, running label, and no-body rendering

- ✅ `src/components/MemoryChip.tsx` + `MemoryChip.test.tsx`
  - inline chips for remembered topics, clickable to open Settings → Memory

- ✅ `src/components/ChatMessage.tsx`
  - renders `<MemoryChips />` next to `<ArtifactChips />`

- ✅ `src/components/settings/MemorySettings.tsx` + test
  - editable MEMORY.md index, expandable per-topic notes, delete button

- ✅ `src/components/SettingsPage.tsx`
  - added "Memory" nav section

## Bugs found during manual verification (all fixed)

Real-world testing ("I'm Moroccan" → new session in the same folder → "what's
my background?") surfaced that the fact wasn't recalled, even though the
write to disk was correct. Root causes and fixes:

1. **The Settings → Memory panel was entirely non-functional.**
   `src-tauri/src/lib.rs` had zero Tauri commands for memory —
   `MemorySettings.tsx`'s `invoke("get_memory_index")` etc. would all reject
   at runtime. Unit tests didn't catch it because they mock `invoke`
   directly. Fixed by adding `get_memory_index`, `get_memory_note`,
   `save_memory_note`, `delete_memory_topic` as real `#[tauri::command]`s,
   mirroring `get_instructions`/`save_instructions`, and registering them in
   the `invoke_handler` list. Verified with `cargo check`.
2. **A field-name mismatch that silently dropped the memory `type` on every
   settings-UI edit.** The backend's `SaveMemoryNoteCommand` contract expects
   `memoryType` (to dodge the Rust `type` keyword), but `MemorySettings.tsx`
   was sending `type`. Fixed the frontend call and pinned it with a test that
   asserts the exact wire shape via `toHaveBeenCalledWith`.
3. **The actual root cause of the "new session doesn't remember" bug**:
   `handleNewSession` (`hypatia-backend/src/commands/handlers/sessions.ts`)
   only rebuilt the resource loader — which is what recomputes the system
   prompt, including the `## Project memory` block — when the new session's
   workspace **cwd changed**. Starting a new session in the *same* folder
   (the common case, and the one that was tested) reused the existing
   resource loader with its system prompt cached from whenever it was last
   built, which predates any `save_memory` call made since. The write to
   disk and `memoryIndexBlock()` itself were both already correct;
   `handleLoadSession` already had a "best-effort `reload()` even when cwd
   is unchanged" fallback for this exact situation — `handleNewSession` was
   just missing the equivalent branch. Fixed by adding it, with a regression
   test (`sessions.test.ts`) pinning both branches (same workspace → reload
   called, no rebuild; different workspace → rebuild, no reload of the stale
   loader).
4. A broken sentence fragment in the injected system-prompt text
   (`memory-store.ts`'s `memoryIndexBlock()`) — cleaned up.
5. `MemorySettings.test.tsx` had one shallow test with a `vi.mock` hoisting
   anti-pattern (a real deprecation warning). Rewrote with `vi.hoisted` and
   added coverage for expand/edit/save, delete, and the wire-shape assertion
   from point 2.

## Verification

- `hypatia-backend`: `npx tsc --noEmit` ✅ / `npx vitest run` 93 tests passed ✅
- `hypatia-frontend`: `pnpm exec tsc --noEmit` ✅ / `pnpm run test` 442 tests
  passed ✅ / `pnpm run lint` ✅ / `cargo check` (src-tauri) ✅
- Manual end-to-end: saved a memory via chat, started a new session in the
  same workspace, confirmed the fact is now recalled after the
  `handleNewSession` fix.

## Notable remaining work

- The frontend build (`pnpm run build`) currently attempts a full Tauri
  bundle and fails because `TAURI_SIGNING_PRIVATE_KEY` is unset. This is
  unrelated to the memory feature and already existed before this
  implementation.
