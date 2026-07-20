# Persistent project memory

Status: planned, not started.
Spans both repos: `hypatia-backend` (store, tool, RPC handlers) and `hypatia-frontend` (Rust Tauri commands, transcript UI, settings panel).

## Problem

Hypatia Cowork "feels stateless." Within one session — or reopening the *same* saved
session — continuity already works: pi's SDK restores the full prior transcript into
`agent.state.messages` on session load (`sessions.ts:88-157`, pi's
`createAgentSession`, `sdk.js:76-78, 228-233`), so that's not the gap.

The actual gap is **cross-session / cross-project**: starting a *new* session is a
hard blank slate (`spawnSession`, `sessions.ts:32-48`, empty message array). There is
no mechanism anywhere in either repo for the agent's own knowledge to persist across
that boundary. The one persistent cross-session file that exists — `INSTRUCTIONS.md`
(`hypatia-backend/src/instructions-store.ts`) — is global (not per-project) and
exclusively user-authored; the agent never writes to it. The already-installed pi
extensions (`summarize.ts`, `custom-compaction.ts`, loaded via pi's
`~/.pi/agent/extensions/` auto-discovery) don't fill this either — `summarize.ts` is a
slash command Hypatia's frontend never wires up, and `custom-compaction.ts` only
manages context-window size within a single long session. pi's own SDK ships no
memory primitive at all (confirmed against `earendil-works/pi`'s README/docs/CHANGELOG).

## Approach (researched against Claude Code's own auto-memory, Cursor Memories, Devin
Knowledge, Windsurf/Cascade Memories, ChatGPT memory, MemGPT/Letta, Mem0, Zep)

Every one of those converges on the same shape regardless of storage tech: a small
always-loaded index + a larger on-demand detail layer, agent-judgment-driven writes
(not just explicit user commands), scoped per-project rather than global, and —
critically, per the failure modes several of them hit in production (stale-fact
lock-in, low visibility, Cursor outright removing its opaque auto-memory in 2.1) —
**plain, user-visible, user-editable files**, not an opaque black box.

This plan replicates Claude Code's own `MEMORY.md` + topic-files structure directly
(it's the most directly analogous precedent — and it's the system that produced this
plan), scoped per-workspace to match how Hypatia's sessions are already scoped.

## Steps

### 1. Backend store (`hypatia-backend`)
- [ ] Create `src/memory-store.ts` (+ test): `memoryDirForCwd(cwd)` (mirrors pi's own
  `getDefaultSessionDirPath` cwd-sanitization scheme —
  `resolvedCwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")`, wrapped in `--...--` —
  since pi doesn't export it for reuse), `loadMemoryIndex`, `upsertMemoryEntry`
  (upsert-by-topic-slug), `loadMemoryNote`, `saveMemoryNote`, `deleteMemoryTopic`
  (removes both the index line and the note file, kept in sync), `memoryIndexBlock()`
  (system-prompt formatting, mirrors `customInstructionsBlock` in
  `instructions-store.ts:62-66`).
- [ ] Storage layout: `~/.hypatiai/cowork/memory/<encoded-cwd>/MEMORY.md` (index) +
  `~/.hypatiai/cowork/memory/<encoded-cwd>/notes/<topic>.md` (detail, one file per
  topic, not injected at session start).
- [ ] Soft size guard: if `MEMORY.md` exceeds ~150 lines after a write, return a tool
  result nudging the model to consolidate — lightweight version of Claude Code's real
  200-line/25KB cap.

### 2. The `save_memory` tool (`hypatia-backend`)
- [ ] Create `src/extensions/save-memory.ts` (+ test), mirroring the one existing
  custom-tool precedent, `src/extensions/show-artifact.ts:44-72`
  (`pi.registerTool({ name, label, description, parameters, execute })`).
- [ ] Params: `{ topic: string, summary: string (≤150 chars), detail?: string, type?:
  "project"|"preference"|"decision" }`.
- [ ] Register in `extensionFactories` in `src/agent-init.ts` alongside
  `showArtifactExtension`.
- [ ] **Verify manually**: pipe an `init` + a prompt instructing the model to call
  `save_memory`, confirm the file lands on disk and the index updates (same method
  used to verify `show_artifact` originally).

### 3. System-prompt injection (`hypatia-backend`)
- [ ] Extend `systemPromptOverride` in `src/agent-init.ts:176-204` (currently
  `HYPATIA_SYSTEM_PROMPT` → `coworkSelfKnowledgePointer` → `personaBlock`) with a
  fourth optional block: the current workspace's `MEMORY.md`, capped ~200 lines/25KB,
  under a `## Project memory` heading, plus a pointer to where `notes/` lives.
- [ ] Add one Guidelines bullet to `HYPATIA_SYSTEM_PROMPT`, matching the existing
  `show_artifact` bullet's style: call `save_memory` when something would help a
  *future* session — a decision, a preference, a recurring convention, a codebase fact
  — not just this conversation.
- [ ] **Implementation-time check**: confirm exactly how `buildResourceLoader`'s call
  site closes over the resolved workspace cwd for the current session (audit found
  `sessions.ts` already reuses/recreates the resource loader keyed on cwd change,
  implying the cwd is already available here — confirm the precise signature before
  wiring the read).
- [ ] No new "load memory" tool — the model reads `notes/<topic>.md` on demand with
  its existing `read` tool, exactly like Claude Code does.
- [ ] **Verify manually**: start a second real session in the same workspace, dump the
  assembled system prompt, confirm the `## Project memory` block is actually present
  (don't just trust the code).

### 4. RPC + Rust plumbing (both repos)
- [ ] Create `hypatia-backend/src/commands/handlers/memory.ts` (+ test): handlers for
  `get_memory_index`, `get_memory_note`, `save_memory_note`, `delete_memory_topic`,
  mirroring `handleGetInstructions`/`handleSaveInstructions` in
  `commands/handlers/settings.ts:36-64`.
- [ ] Add the 4 command shapes to `src/commands/types.ts` and dispatch cases to
  `src/commands/handler-registry.ts`.
- [ ] Add 4 `#[tauri::command]`s to `hypatia-frontend/src-tauri/src/lib.rs`, mirroring
  `get_instructions`/`save_instructions` (`lib.rs:1102-1129`) and their registration
  in the `invoke_handler` list.
- [ ] **Verify manually**: call each command directly, confirm file changes land on
  disk as expected.

### 5. Transcript visibility (`hypatia-frontend`)
- [ ] Add a `save_memory` case to `ToolCallTimeline.tsx`'s `buildHeader`/
  `ToolContent`/`getRunningLabel` (compact line, e.g. `📝 remembered: "<summary>"`).
- [ ] Create `src/components/MemoryChip.tsx` (+ test), sibling to the just-built
  `ArtifactChips.tsx` (same dedupe-by-key + pill-button shape), rendered in
  `ChatMessage.tsx` in every view mode (not just `Ctrl+O`) — clicking it opens
  Settings → Memory rather than a playground viewer, since there's no canvas content
  to preview.
- [ ] Frontend test pass.

### 6. Settings UI (`hypatia-frontend`)
- [ ] Create `src/components/settings/MemorySettings.tsx` (+ test), sibling to
  `Instructions.tsx`/`CustomInstructions.tsx`: shows `MEMORY.md` in the same
  `MDEditor`, plus a list of topics (from the index) each expandable/editable/
  deletable.
- [ ] Add the Memory nav entry to `SettingsPage.tsx`.
- [ ] **Verify manually** in the running app: create a memory via chat, see it in
  Settings, edit it, delete a topic, confirm the index line disappears too.
- [ ] Optional small touch: a one-line banner when opening a workspace that already
  has a non-empty `MEMORY.md` ("Remembering N things about this project — Settings").

### 7. Regression + end-to-end proof
- [ ] `pnpm typecheck && pnpm lint && pnpm test` in `hypatia-frontend`; backend's
  equivalent suite.
- [ ] **The actual proof this feature exists for**: have a conversation that produces
  a `save_memory` call, start a brand-new session in the *same* workspace, and confirm
  the model's first response in the new session actually reflects the remembered
  fact.

## Explicitly out of scope (v1)
- No global/cross-project memory layer (a "user profile" following the user between
  different project directories) — named fast-follow, not silently dropped.
- No LLM-based consolidation/dedup (Mem0-style ADD/UPDATE/DELETE/NOOP) — upsert-by-
  topic-slug is the pragmatic choice for a single-local-user app.
- No automatic end-of-session summarization pass — writes are judgment-driven via the
  system-prompt guideline, matching Claude Code's own actual behavior.
- Not wiring the pre-existing `summarize.ts` pi extension's slash command — that's
  conversation condensation for display, a separate concern from cross-session memory.
