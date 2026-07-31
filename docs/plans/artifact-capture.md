# Capturing artifacts created during a Hypatia session

How to reliably know **every file the agent created or changed** during a
session — including ones written by a script the agent ran, not just files
it wrote directly — so they can be surfaced as artifacts (in the Artifacts
library, in per-message chips, in the workspace file rail from the Cowork-UX
concept). Researched 2026-07-31 against the actual pi-mono SDK source and
this repo's own architecture. No hackery: no polling loops, no guessing from
chat text, no directory-diffing as the primary mechanism.

---

## 0. Correcting a claim already in circulation

A message going around (screenshotted from another session) asserts pi
recently added a `bash_execution_update` streaming event "correlated with
request IDs" for direct RPC bash commands. **This does not exist.** I
fetched the actual SDK docs and source rather than trust that claim:

- `packages/coding-agent/docs/json.md` documents the complete event union.
  Tool execution is generic for every tool, bash included — there is no
  bash-specific variant:
  `tool_execution_start | tool_execution_update | tool_execution_end`
  (also present but unrelated to file tracking: `queue_update`,
  `compaction_start/end`, `auto_retry_start/end`,
  `summarization_retry_scheduled/attempt_start/finished`).
- `packages/coding-agent/src/core/tools/bash.ts` — the bash tool's own
  source — confirms its result carries only combined stdout/stderr text,
  truncation metadata, and an optional path to the full output if truncated.
  No file list, no cwd, no exit code in the structured result (exit code
  only appears inside the error-message text on failure).
- Our own `src/types/pi-events.ts` (already in this repo, sourced from the
  same docs) matches this exactly — there is no bash-specific event type
  defined anywhere in our wire protocol either.

So the "detective" framing was half right for the wrong reason: bash-spawned
files really are invisible to the tool-call stream, but not because a new
streaming feature almost-but-not-quite solved it — it's because **no such
feature exists**, full stop, in any version. The real fix is filesystem
observation, not waiting for a better event.

## 1. What's actually true, with sources

| Claim | Verdict | Source |
|---|---|---|
| `write`/`edit` tool calls carry the file path in their call arguments | **True** | `tools/write.ts`: `path: Type.String(...)`. `tools/edit.ts`: `path: Type.String(...)` (a legacy `file_path` alias exists in some renderers) |
| The path is knowable the moment the call *starts*, not just when it ends | **True** | `tool_execution_start` already includes `args`, identical shape to what `tool_execution_end` echoes — the SDK doesn't withhold `path` until completion |
| `write`'s structured result names the path again | **False, mostly** | `write.ts` returns `details: undefined`; the path only reappears inside a human-readable success string (`"Successfully wrote {n} bytes to {path}"`). Never parse this string — use `args.path` from the start/end event instead, which is structured and available earlier |
| `edit`'s structured result includes a diff | **True** | `details: { diff, patch, firstChangedLine }` — useful for a richer "what changed" chip, not required for path detection |
| Bash tool result reports files it created | **False** | Confirmed absent from `BashToolDetails` (`{ truncation?, fullOutputPath? }`) |
| SDK provides a built-in filesystem watcher / fs-change hook | **False** | `docs/extensions.md` explicitly states extensions must implement their own; the SDK provides none |
| Session lifecycle events exist to scope a custom watcher's lifetime | **True** | `session_start` (`reason: "startup"\|"reload"\|"new"\|"resume"\|"fork"`) and `session_shutdown` (mirrored reasons) are real, documented hooks |
| Extension factories must not start watchers/timers themselves | **True, verbatim** | `docs/extensions.md`: *"Extension factories may run in invocations that never start a session. Do not start background resources such as processes, sockets, file watchers, or timers from the factory."* Defer to `session_start`, clean up in `session_shutdown` |
| A session's working directory is knowable structurally | **True** | The wire protocol's `session` event carries `cwd` (see `PiSessionEvent` in our own `pi-events.ts`) |

Sources: [pi-mono `docs/json.md`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/json.md), [`docs/extensions.md`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md), [`src/core/tools/write.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/tools/write.ts), [`edit.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/tools/edit.ts), [`bash.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/tools/bash.ts).

## 2. The real problem, stated precisely

Not "bash vs. everything else." The accurate split is:

- **Self-reporting tools** — any tool whose call arguments or structured
  result name the exact path(s) touched. `write` and `edit` are the two
  built-ins that qualify today. (If the sidecar's extension set ever adds a
  multi-file tool — `multiedit`, `apply_patch` — the same rule applies:
  extract every `path`/`file_path` string or `paths`/`files` array found in
  `args`.) **Zero infrastructure needed** — this is a pure function over
  events we already receive.
- **Non-self-reporting tools** — `bash`, and *any* extension tool (including
  a future Hypatia-specific one) whose `execute()` writes files without
  naming them in its result. The model can hide file creation from us
  arbitrarily deeply (a Python script invoked via bash, which itself shells
  out to a converter, which writes the real output). No amount of parsing
  the tool-call stream closes this gap **by construction** — the SDK has no
  such reporting for shell-outs, confirmed above. The only correct fix is
  independently observing the filesystem.

## 3. Where the fix can actually live in this codebase

Two architectural options exist in theory; only one is buildable from this
repo today.

**Option A — a pi extension inside the sidecar**, using `session_start` /
`session_shutdown` to run a watcher colocated with the agent process. This
is the SDK-idiomatic place for it and is where I'd put it if we owned that
code. We don't: `src-tauri/agent-sidecar/index.cjs` is a 347k-line minified
bundle, **gitignored** (`.gitignore:9`), dropped in by a separate build this
repo doesn't run. There's no source here to add an extension to.

**Option B — a native watcher in the Tauri Rust layer**, which we do fully
own. `src-tauri/src/lib.rs` already relays every sidecar stdout line to the
frontend via `app.emit(kind, tag_with_session_id(event, session_id))`
(lib.rs:616) and already threads a per-session `cwd` through `new_session`
(lib.rs:1107) — the exact input a watcher needs. **This is the buildable,
correct-today option**, and everything below designs it.

If the sidecar's source ever becomes reachable (e.g. it's vendored, or we
gain a way to ship a first-party extension bundle with it), Option A should
replace the correlation logic below — a same-process watcher can attribute
file events to tool calls with zero ambiguity, because it can hook directly
into the tool's own execution scope instead of correlating by timestamp.
Until then, Option B is not a workaround; it's the only privileged position
this app is in.

## 4. Design — Rust-native workspace watcher

### 4.1 Libraries

- [`notify`](https://docs.rs/notify) — cross-platform native OS filesystem
  events (FSEvents on macOS, inotify on Linux, ReadDirectoryChangesW on
  Windows). Not polling; the OS pushes events.
- [`notify-debouncer-full`](https://docs.rs/notify-debouncer-full) — coalesces
  the burst of raw OS events a single file write produces (create → several
  modify → close-write) into one settled event per path, and absorbs the
  platform-specific quirks (e.g. Windows' `ReadDirectoryChangesW` buffer
  overflow behavior on very large trees) instead of us hand-rolling that.
- [`ignore`](https://docs.rs/ignore) — the same crate ripgrep uses for
  gitignore-aware directory walking; reused here as a filter so a `bash`
  call that runs `npm install` doesn't flood the UI with 12,000
  `node_modules` events. Respects `.gitignore` in the workspace root plus a
  small built-in denylist (`.git/`, `.DS_Store`, `*.tmp`, `~*`).

None of these are new categories of dependency for this project — `notify`
is the de facto standard, used by watch-mode tooling across the Rust
ecosystem; this is not a novel or fragile choice.

### 4.2 Lifecycle — one watcher per live session, not per displayed tab

Mirrors the multi-session architecture already landed in `usePiStream`
(`MultiStreamState` — background sessions keep streaming while another is
displayed). The watcher must follow the same rule: **bound to the sidecar
process's session, not to which tab the user is looking at.**

```
new_session(cwd) spawns sidecar for session S
  → start_workspace_watcher(session_id: S, root: cwd)
       (mirrors: don't start it in a "factory"/setup path that might
        run without a session — same principle pi's own docs state for
        extension factories, applied to our Rust layer)

session S's sidecar exits / session explicitly closed
  → stop_workspace_watcher(S)   // idempotent, mirrors session_shutdown
```

Multiple concurrent sessions with different `cwd`s (already supported) get
independent watcher instances, keyed by `session_id`, in a `HashMap` on
`AppState` next to the existing sidecar handle.

### 4.3 Correlating a filesystem event to a tool call

We don't get free attribution the way a same-process extension would. What
we do get, precisely, from the existing event stream: the **exact start and
end timestamp of every `bash` tool call** (`tool_execution_start` →
`tool_execution_end` for a given `toolCallId`).

Algorithm:

1. On `tool_execution_start` where `toolName === "bash"`, record
   `{ toolCallId, startedAt: now() }` in an in-memory per-session map.
2. The watcher buffers debounced fs events as they arrive, each stamped with
   its own observed time, independent of any tool call.
3. On `tool_execution_end` for that `toolCallId`, close the window
   (`endedAt: now()`) and sweep the buffer: any event whose timestamp falls
   in `[startedAt, endedAt]` (plus a small trailing grace period —
   see 4.5) is attributed to that call.
4. Events that don't fall inside **any** open or recently-closed window
   (e.g. the user manually dropped a file into the folder in Finder while a
   session was idle) are still reported, just with no `toolCallId` —
   surfaced as a generic "workspace changed externally" signal rather than
   attached to a specific turn.
5. If two `bash` calls run concurrently (the SDK permits parallel tool
   calls) and their windows overlap, an event landing in the overlap is
   attributed to **both** — better to over-attribute in the UI (a file chip
   appears under two tool calls) than silently drop it.

This is the same underlying idea as "snapshot the directory before, diff
after" — but implemented as a live watcher plus timestamp correlation, which
is strictly better than snapshot-diffing:
- No need to walk (`stat`) a potentially large tree twice per bash call.
- Catches files that are created **and removed** within the same call (a
  temp file a script cleans up) — a before/after diff would show nothing;
  the watcher can at least record and discard it explicitly (4.6) instead
  of an invisible pass costing a full extra directory walk for nothing.
- Doesn't race with a second concurrent bash call touching the same tree.

### 4.4 What gets filtered before it ever reaches the frontend

- Anything matched by `.gitignore` in the workspace root, plus the built-in
  denylist above — via the `ignore` crate's `WalkBuilder`/`Gitignore`
  matcher applied to each incoming path, not by re-walking the tree.
- Directory-only events (`mkdir` with no file inside yet) — suppressed;
  only leaf-file create/modify/remove events are reported. A directory that
  ends up containing reported files is implied by their paths.
- Paths outside the watched root (a symlink escape, or a tool writing to an
  absolute path elsewhere) — never watched in the first place, since the
  watcher only has a handle on `cwd`. This is a feature, not a gap: it's
  consistent with the folder-scoped sandbox model already documented in
  `new-design/COWORK-UX.md` (§5.4, §6) — a bash call reaching outside its
  granted folder shouldn't be silently absorbed into "artifacts," it should
  fail the sandbox, which is a separate, existing concern.

### 4.5 Debounce window

`notify-debouncer-full` default settle window (a few hundred ms) is
sufficient — matches how a script actually writes a file (open → write →
close in a tight loop) without merging two genuinely separate files that
happen to land close together. Use its default rather than hand-tuning
unless real-world testing shows otherwise.

### 4.6 Transient files

A file created and then deleted within the same bash-call window (a script's
own scratch file) should not be surfaced as an artifact. `notify-debouncer-
full` naturally coalesces a rapid create+remove pair for the same path
within its settle window into a no-op; for a slower create-then-later-remove
within one long bash call, track path state across the window and drop any
path whose final state (at `tool_execution_end`) is "removed."

### 4.7 Emission to the frontend

New Tauri event channel, additive to the existing sidecar relay — does not
touch the pi wire-protocol passthrough at all:

```rust
// Shape mirrors the existing tag_with_session_id convention (lib.rs:566)
#[derive(Serialize, Clone)]
struct WorkspaceFileEvent {
    session_id: String,
    path: String,           // relative to the session's cwd
    kind: FileEventKind,     // Created | Modified | Removed
    tool_call_id: Option<String>, // None => unattributed / external change
    at: String,              // RFC3339 timestamp
}

app.emit("workspace_file_event", event)?;
```

### 4.8 Frontend integration

- New small hook, `useWorkspaceFiles(sessionId)`, listening on
  `workspace_file_event` (same `listen()` pattern already used for `ready`
  and `sidecar_lost` in `App.tsx`), keyed by session id so it composes with
  the existing multi-session model instead of assuming "the" active session.
- Events with a `toolCallId` matching a `bash` call already in
  `ToolCallInfo[]` get attached as a lightweight `detectedFiles: string[]`
  field on that tool call — rendered as small chips inside
  `ActivityBlock`/`ToolCallTimeline`, visually distinct from the
  self-reported case (e.g. a small "found" icon vs. the direct-write icon),
  since we should never claim more certainty than we have — this is
  *detected*, not *declared*.
- For actually promoting a detected file into the Artifacts library
  (`usePlaygroundArtifacts`), don't auto-promote everything a bash call
  touches — that would spam the Artifacts panel with every intermediate
  file. Auto-promote only file types that already make sense as artifacts
  (the same extension allowlist the Artifacts concept implies: `.pptx`,
  `.xlsx`, `.csv`, `.md`, `.png`/`.jpg`, source-code files), and leave
  everything else visible only as a chip on the tool call, one click away
  from "Add to Artifacts" if the user wants it anyway.

### 4.9 Self-reporting tools (`write`/`edit`) — no watcher needed

This half needs no new subsystem, ever. In `usePiStream.ts`'s existing
`tool_execution_start`/`tool_execution_end` handling:

```ts
if (te.toolName === "write" || te.toolName === "edit") {
    const path = typeof te.args.path === "string" ? te.args.path
        : typeof te.args.file_path === "string" ? te.args.file_path
        : undefined;
    // path is known at tool_execution_start already — can render a
    // "pending" artifact chip immediately, confirm on tool_execution_end
    // when isError is false.
}
```

Extend this to any future tool the same way: inspect `args` for `path` /
`file_path` (string) or `paths` / `files` (array of strings) generically,
rather than hardcoding tool names one at a time — this is forward-compatible
with a `multiedit`/`apply_patch`-style tool without another round of changes.

## 5. What this deliberately does *not* do

- **No polling.** `notify` is push-based (native OS events); nothing here
  loops and re-stats a directory on an interval.
- **No parsing of chat/tool-result prose** to infer paths (the
  `"Successfully wrote..."` string). Structured `args.path` is strictly
  better and already available earlier in the lifecycle.
- **No full recursive directory diff as the primary mechanism.** A watcher
  gives named events for free; diffing is reserved as an explicit, opt-in
  *reconciliation* step (4.10) for the one case a live watcher structurally
  can't cover — the app being closed.
- **No hardcoded reliance on a nonexistent `bash_execution_update` event.**
  See §0.

### 4.10 The one true gap: files created while the app was closed

If the sidecar is resumed in a later app launch (`session_start` reason
`"resume"`), any bash-spawned files written during the gap have no live
watcher to have seen them. This is a real, separate, and much smaller
problem — not a reason to fall back to diffing as the default mechanism.
Handle it explicitly as a one-time reconciliation on session resume: list
the workspace root, compare each file's mtime against the session's last
recorded activity timestamp, and surface anything newer as "found on
resume." This only runs once per resume, not on a timer, and is clearly
labeled in the UI as reconciled rather than live-observed.

## 6. Edge cases checklist (what "not hacky" has to survive)

- [ ] Parallel `bash` tool calls with overlapping time windows → attribute
      to all overlapping calls.
- [ ] Rapid create+delete within one call (scratch files) → dropped, not
      surfaced (§4.6).
- [ ] `npm install` / build output inside a bash call → filtered by
      `.gitignore` + denylist before ever reaching the frontend (§4.4).
- [ ] Multiple concurrent sessions, different `cwd`s → independent watcher
      per session, keyed by `session_id`, following background sessions
      exactly like the existing `MultiStreamState` does for chat state.
- [ ] Path outside the granted folder → never watched; sandbox violation is
      a separate, existing concern, not folded into artifact detection.
- [ ] App closed and reopened mid-project → one-shot mtime reconciliation
      on resume (§4.10), not a fallback to continuous diffing.
- [ ] Windows large-tree watcher overflow → delegated to
      `notify-debouncer-full`'s handling rather than reimplemented.
- [ ] A file rewritten many times by a loop in one script → debounced to a
      single settled event (§4.5).
- [ ] Directory-only creates (`mkdir -p`) → suppressed; only leaf files
      reported (§4.4).
- [ ] Future non-bash, non-self-reporting extension tool → covered
      automatically, since the watcher observes the filesystem, not the
      tool name; only `write`/`edit`'s fast path needs per-tool code (§4.9).

## 7. Validation plan before shipping

1. Unit-test the correlation sweep (§4.3) with synthetic timestamps: single
   call, overlapping calls, event with no matching window.
2. Manual test: ask the agent to run a script that writes a `.pptx` via a
   Python library (the exact case from the original report) and confirm a
   chip appears on that `bash` tool call within one debounce window of the
   file landing on disk.
3. Manual test: `npm install` inside the workspace during a session — verify
   zero UI noise.
4. Manual test: two sessions open concurrently, different folders, agent
   writes files in both at once — verify no cross-attribution.
5. Kill the app mid-session, relaunch, resume — verify the reconciliation
   pass (§4.10) surfaces the file and is visually distinguished from a
   live-detected one.
