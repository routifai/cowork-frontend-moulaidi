# Capturing artifacts created during a Hypatia session

How to reliably know **every file the agent created or changed** during a
session — including ones written by a script the agent ran, not just files
it wrote directly — so they can be surfaced as artifacts (in the Artifacts
library, in per-message chips, in the workspace file rail from the Cowork-UX
concept). Researched 2026-07-31 against the actual pi-mono SDK source, our
own vendored sidecar bundle, and this repo's architecture. No hackery: no
polling loops, no guessing from chat text, no directory-diffing as the
primary mechanism.

**Revision note:** this doc originally recommended a new Rust-side watcher
as the primary mechanism, on the assumption that a pi extension wasn't
buildable without sidecar source access. That assumption was wrong — see
§3. The extension route is now the primary recommendation; the Rust design
is preserved as Appendix A for the one gap it still uniquely fills.

---

## 0. Correcting two claims already in circulation

Two messages have gone around proposing fixes for this. Neither was taken
at face value — both were checked against the actual SDK source and, where
possible, our own vendored sidecar bundle.

### Claim 1 — "pi added a `bash_execution_update` streaming event"

**False.** `packages/coding-agent/docs/json.md` documents the complete event
union. Tool execution is generic for every tool, bash included — there is
no bash-specific variant. `bash.ts` — the bash tool's own source — confirms
its result carries only combined stdout/stderr text and truncation
metadata; no file list, no cwd, no exit code in the structured result. Our
own `src/types/pi-events.ts` already matches this. No such event exists in
any version, upstream or vendored.

### Claim 2 — "build a pi extension today: wrap the bash tool, scope a
watcher to the call, emit a custom event or append `{ wroteFile, path }` to
the tool result"

**Directionally right, wrong on two mechanics.** The core idea — an
extension, loaded without upstream approval, scoping a watcher to one bash
call — is correct and is what this doc now recommends. But:

- *"Append to the tool result"* — not via `tool_execution_start` or
  `tool_execution_end`. Per `docs/extensions.md`, those two are
  **observational only**; no return-value mutation is documented for them.
  The event that **can** modify a result is a distinct one, `tool_result`:
  *"Can modify result... handlers can return partial patches (`content`,
  `details`, `isError`, or `usage`)"*. That's the correct hook.
- *"Emit your own custom event"* — there's no documented mechanism for an
  extension to push an arbitrary event into the session's serialized wire
  stream that a frontend consumer would see. The only bus mentioned,
  `pi.events`, is explicitly *"Shared event bus for communication between
  extensions"* — internal, not serialized out. The way data actually
  reaches this app is the mutation path above: patch `details` on the bash
  tool's own result via `tool_result`, which rides the `tool_execution_end`
  event's existing `result.details` field — the exact channel our frontend
  already parses for `show_artifact` (`pi-events.ts:148-152`). No custom
  event type needed or available.

Sources: [pi-mono `docs/json.md`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/json.md), [`docs/extensions.md`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md), [`src/core/tools/write.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/tools/write.ts), [`edit.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/tools/edit.ts), [`bash.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/tools/bash.ts).

## 1. What's actually true, with sources

| Claim | Verdict | Source |
|---|---|---|
| `write`/`edit` tool calls carry the file path in their call arguments | **True** | `write.ts`: `path: Type.String(...)`. `edit.ts`: `path: Type.String(...)` (legacy `file_path` alias in some renderers) |
| The path is knowable the moment the call *starts* | **True** | `tool_execution_start` already includes `args`, same shape `tool_execution_end` echoes |
| `write`'s structured result names the path again | **False, mostly** | `write.ts` returns `details: undefined`; path only reappears in a human-readable success string. Use `args.path` instead — structured, earlier |
| `edit`'s structured result includes a diff | **True** | `details: { diff, patch, firstChangedLine }` |
| Bash tool result reports files it created | **False** | `BashToolDetails` = `{ truncation?, fullOutputPath? }` only |
| SDK provides a built-in filesystem watcher | **False** | `docs/extensions.md`: extensions must implement their own |
| `bash_execution_update` event exists | **False** | See §0, Claim 1 |
| `tool_execution_start`/`tool_execution_end` can be mutated to attach custom data | **False** | Observational only — see §0, Claim 2 |
| `tool_result` can attach custom data to a tool's result | **True** | *"Can modify result... partial patches (`content`, `details`, `isError`, `usage`)"* |
| An extension can emit an arbitrary event into the frontend-visible wire stream | **False / not documented** | Only `pi.events`, internal to extensions |
| Extensions require sidecar source access to build | **False — this doc's own earlier error** | See §3 |
| Session lifecycle hooks exist to scope a watcher's lifetime | **True** | `session_start` (`reason: "startup"\|"reload"\|"new"\|"resume"\|"fork"`), `session_shutdown` |
| Extension factories must not start background resources themselves | **True, verbatim** | *"Extension factories may run in invocations that never start a session. Do not start background resources such as processes, sockets, file watchers, or timers from the factory."* |
| A session's working directory is knowable structurally | **True** | Wire protocol's `session` event carries `cwd`; extension `ctx.cwd` too |

## 2. The real problem, stated precisely

Not "bash vs. everything else." The accurate split:

- **Self-reporting tools** — any tool whose call arguments or structured
  result name the exact path(s) touched. `write` and `edit` qualify today.
  Zero infrastructure needed — pure function over events already received
  (§4.9).
- **Non-self-reporting tools** — `bash`, and any extension tool whose
  `execute()` writes files without naming them. The model can hide file
  creation arbitrarily deep (a script that shells out to a converter that
  writes the real output). No amount of parsing the tool-call stream closes
  this by construction. The fix is independently observing the filesystem
  — the only question is *where that observation runs*.

## 3. Where the fix can live — corrected

This doc originally concluded a pi extension wasn't buildable from this
repo because `src-tauri/agent-sidecar/index.cjs` is a gitignored,
prebuilt bundle with no source here. **That reasoning doesn't hold**:
extensions are a first-party, runtime-loaded plugin mechanism, entirely
decoupled from the bundle's own source. Per `docs/extensions.md`, pi
auto-discovers extensions from:

- `~/.pi/agent/extensions/*.ts` — **global scope**, not project-scoped
- `.pi/extensions/*.ts` — project-local, *"load only after the project is
  trusted"*
- paths listed in `settings.json`'s `"extensions"` array

None of these require touching `index.cjs`. A `.ts` file dropped at
`~/.pi/agent/extensions/` is picked up the same way a hand-written one would
be for any pi installation — no maintainer approval, no rebuild.

**This isn't hypothetical for our vendored bundle** — I string-searched
`src-tauri/agent-sidecar/index.cjs` directly (not just the upstream docs)
and confirmed the runtime machinery is genuinely present in what Hypatia
ships: an `_extensionRunner`, `session_start` events firing with every
documented reason (`fork`, `reload`, `new`, `resume`, `startup`),
`tool_execution_start` dispatch, and a `tool_result` handler registry
(`handlers.get("tool_result")`) with the project-trust plumbing
(`isProjectTrusted`, `assertProjectTrustedForWrite`, `defaultProjectTrust`)
also present. This is buildable against what we actually ship today, not
against a newer upstream version we don't have.

**Global scope is the right target for Hypatia**, not project-local: it
applies regardless of which folder a session is opened in, and — per the
docs' own wording, which only attaches a trust condition to the
project-local path — appears to sidestep the per-project trust gate
entirely. (Flagged as a to-verify item in §7, not asserted with full
certainty — the docs describe project-local trust explicitly but don't
explicitly confirm global-scope has zero conditions.)

**Deployment**: Hypatia's Rust layer already spawns the sidecar without
overriding `HOME` (`spawn_sidecar` sets `SIDECAR_LOG_LEVEL`/`NODE_OPTIONS`
env vars but no `PI_HOME`/`XDG_CONFIG_HOME`), so the sidecar reads the
user's real `~/.pi`. On app startup, idempotently write (or update, keyed
by a version comment in the file header) our extension to
`~/.pi/agent/extensions/hypatia-artifact-detector.ts`. This is a small,
one-time addition to the existing startup sequence in `lib.rs` — not a new
subsystem.

Given this, the Rust-native watcher (this doc's original §4) is demoted:
still correct engineering, but no longer necessary for live detection.
Preserved as **Appendix A** for the one gap that persists regardless of
which layer does live detection: the app being fully closed (§4.6 below
handles it more cheaply, inside the same extension, but Appendix A's
version is kept as a documented alternative if extension loading ever
proves unreliable in the field).

## 4. Design — sidecar extension (primary mechanism)

### 4.1 The hook pair

```ts
// ~/.pi/agent/extensions/hypatia-artifact-detector.ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import chokidar from "chokidar";
import ignore from "ignore";
import { readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

export default function (pi: ExtensionAPI) {
  const watchers = new Map<string, { close(): Promise<void>; paths: Set<string> }>();

  pi.on("tool_execution_start", async (event, ctx) => {
    if (event.toolName !== "bash") return;

    const ig = ignore();
    const gitignorePath = join(ctx.cwd, ".gitignore");
    if (existsSync(gitignorePath)) ig.add(readFileSync(gitignorePath, "utf8"));
    ig.add([".git", ".DS_Store", "*.tmp", "~*"]); // built-in denylist

    const touched = new Set<string>();
    const watcher = chokidar.watch(ctx.cwd, {
      ignoreInitial: true,
      // Native debounce: waits for a file to stop changing before firing
      // "add"/"change" — the chokidar equivalent of notify-debouncer-full.
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 50 },
    });
    watcher.on("add", (path) => {
      const rel = relative(ctx.cwd, path);
      if (!ig.ignores(rel)) touched.add(rel);
    });
    watcher.on("unlink", (path) => {
      // Created and removed within the same call — drop it (§4.4).
      touched.delete(relative(ctx.cwd, path));
    });

    watchers.set(event.toolCallId, { close: () => watcher.close(), paths: touched });
  });

  pi.on("tool_result", async (event, ctx) => {
    if (event.toolName !== "bash") return;
    const entry = watchers.get(event.toolCallId);
    if (!entry) return;
    await entry.close();
    watchers.delete(event.toolCallId);
    if (entry.paths.size === 0) return; // no patch = no-op, per docs' partial-patch contract

    return {
      details: {
        ...(event.result?.details ?? {}),
        detectedFiles: Array.from(entry.paths),
      },
    };
  });

  // Resume gap (§4.6) — no separate Rust mechanism needed.
  pi.on("session_start", async (event, ctx) => {
    if (event.reason !== "resume") return;
    // one-shot mtime scan against the session's last known activity time;
    // implementation detail left to build time, kept out of the hot path.
  });
}
```

Exact `ExtensionAPI` field names (`event.result`, whether `ctx` exposes a
last-activity timestamp for the resume scan, etc.) should be checked
against the type declarations shipped in `@earendil-works/pi-coding-agent`
at implementation time — the docs quote the shapes but a compile-time check
against the real `.d.ts` is cheap insurance before shipping.

### 4.2 Why this is strictly better than cross-process correlation

The original Rust design (Appendix A) had to correlate filesystem events to
a specific bash call **after the fact**, by bucketing timestamps into
`[startedAt, endedAt]` windows observed from a separate process — inherent
ambiguity at call boundaries, and real complexity for overlapping parallel
calls. Because this extension runs **in the same process, hooked directly
to the specific `toolCallId`'s own lifecycle**, there is no ambiguity at
all: each bash call gets its own watcher instance, keyed by its own
`toolCallId`, opened at that call's `tool_execution_start` and closed at
that exact call's `tool_result`. Concurrent bash calls simply get
independent map entries — no timestamp math, no overlap bucketing.

### 4.3 Debounce and filtering

`chokidar`'s `awaitWriteFinish` is the direct equivalent of
`notify-debouncer-full`'s settle window — a script's open → write → close
loop coalesces into one `add` event instead of several. The `ignore` npm
package (same semantics as the Rust `ignore` crate used in Appendix A)
handles `.gitignore` + the built-in denylist so `npm install` inside a bash
call doesn't flood the UI with thousands of `node_modules` entries.

### 4.4 Transient files

A file created and removed within the same bash call (a script's own
scratch file) is dropped by construction — the `unlink` handler removes it
from the `touched` set before the call ends, so it never appears in
`detectedFiles` at all (simpler than Appendix A's cross-process version,
which had to reconstruct this from separately-timestamped events).

### 4.5 Reaching the frontend — no new plumbing required

This is the real payoff of the extension route: `detectedFiles` rides
inside `result.details` on the bash tool's own `tool_execution_end` event —
**the exact wire-protocol field our frontend already parses** for
`show_artifact` (`pi-events.ts:148-152`, `usePiStream.ts:725-742`). No new
Rust dependency, no new Tauri IPC channel, no new event type on either
side. The only frontend change needed:

```ts
// usePiStream.ts, inside the existing tool_execution_end handling
if (te.toolName === "bash" && Array.isArray(te.result.details?.detectedFiles)) {
    // attach te.result.details.detectedFiles to this ToolCallInfo,
    // rendered as "found" chips (§4.7) distinct from self-reported ones.
}
```

### 4.6 The resume gap

If the sidecar resumes a session in a later app launch
(`session_start` reason `"resume"`), any bash-spawned files written during
the gap had no live watcher. Handled inside the **same** extension file
(§4.1's `session_start` hook) with a one-shot mtime scan against the
session's last recorded activity — no separate mechanism, no Rust crates,
no polling loop running on a timer. Runs once per resume, clearly
distinguishable in the UI as reconciled rather than live-detected.

### 4.7 Frontend rendering

Same policy as originally planned: don't auto-promote every detected path
into the Artifacts library (would spam it with intermediates). Auto-promote
only artifact-shaped extensions (`.pptx`, `.xlsx`, `.csv`, `.md`,
`.png`/`.jpg`, source files); everything else shows as a small "found" chip
on the bash tool call in `ActivityBlock`/`ToolCallTimeline`, visually
distinct from a direct `write`/`edit` chip — this is *detected*, not
*declared*, and the UI should never claim more certainty than it has.

### 4.8 Self-reporting tools (`write`/`edit`) — unchanged, no watcher needed

```ts
if (te.toolName === "write" || te.toolName === "edit") {
    const path = typeof te.args.path === "string" ? te.args.path
        : typeof te.args.file_path === "string" ? te.args.file_path
        : undefined;
    // known at tool_execution_start already — render "pending", confirm
    // at tool_execution_end when isError is false.
}
```

Generalize to any future multi-path tool (`multiedit`/`apply_patch`-style)
by scanning `args` for `path`/`file_path` (string) or `paths`/`files`
(array) rather than hardcoding tool names one at a time.

## 5. What this deliberately does not do

- **No polling anywhere.** Chokidar (native FS events under the hood, same
  family as `notify`) is push-based.
- **No parsing of chat/tool-result prose** to infer paths.
- **No cross-process timestamp correlation** — same-process hooks make it
  unnecessary (§4.2).
- **No new Rust dependencies, no new Tauri IPC channel.** `detectedFiles`
  rides the existing `result.details` pipe already proven by `show_artifact`.
- **No reliance on a nonexistent `bash_execution_update` event** (§0).
- **No custom event bus reaching the frontend** — not available; the
  mutation-via-`tool_result` path is the only documented way out (§0).

## 6. Edge cases checklist

- [x] Parallel `bash` calls — independent watcher per `toolCallId`, no
      overlap ambiguity at all (§4.2), not just "handled by bucketing."
- [x] Rapid create+delete (scratch files) — dropped via the `unlink`
      handler before the call even ends (§4.4).
- [x] `npm install` / build output — filtered by `.gitignore` + denylist
      before ever reaching a result (§4.3).
- [x] Multiple concurrent sessions, different `cwd`s — each session's
      sidecar process runs its own extension instance with its own
      `watchers` map; no cross-session leakage possible since they're
      separate Node processes entirely.
- [x] Path outside the granted folder — chokidar only watches `ctx.cwd`;
      never observed, consistent with the folder-scoped sandbox model in
      `new-design/COWORK-UX.md` §5.4/§6.
- [ ] App closed and reopened mid-project — one-shot mtime reconciliation
      on `session_start` reason `"resume"` (§4.6). **Needs implementation
      detail**: confirm what timestamp `ctx` exposes to scan against.
- [ ] Global-scope extension loading and project trust — confirmed
      project-local requires trust; global scope's exact conditions
      (none? Requires the `.pi` directory to already exist? First-run
      prompt?) should be verified empirically before shipping (§7).
- [x] A file rewritten many times by a script loop — coalesced by
      `awaitWriteFinish` into one settled `add` event (§4.3).
- [x] Directory-only creates (`mkdir -p`) — chokidar's `add` fires per
      file, not per directory; only leaf files are ever collected.
- [x] Future non-bash, non-self-reporting extension tool — not
      automatically covered by this specific hook (it's keyed to
      `toolName === "bash"`); would need the same `tool_execution_start`
      /`tool_result` pair added for that tool name too. Only `write`/
      `edit`'s fast path is name-agnostic by design (§4.8).

## 7. Validation plan before shipping

1. Confirm the exact `ExtensionAPI` and `tool_result` event field names
   against the `.d.ts` shipped with `@earendil-works/pi-coding-agent` in
   our vendored sidecar (the string search in §3 confirms the *symbols*
   exist; it doesn't confirm exact field names match the docs verbatim).
2. Empirically confirm global-scope (`~/.pi/agent/extensions/`) loads
   without a project-trust prompt, on a machine with no prior `~/.pi`
   directory at all (cold-start case).
3. Unit-test the `ignore` filtering against a real `.gitignore` from this
   repo plus the built-in denylist.
4. Manual test: ask the agent to run a script that writes a `.pptx` via a
   Python library (the original motivating case) — confirm a "found" chip
   appears on that `bash` tool call.
5. Manual test: `npm install` inside the workspace during a session —
   verify zero UI noise.
6. Manual test: two sessions open concurrently, different folders, agent
   writes files in both at once — verify no cross-attribution (should be
   structurally impossible per §6, but verify).
7. Kill the app mid-session, relaunch, resume — verify the reconciliation
   pass (§4.6) surfaces the file and is visually distinguished from a
   live-detected one.
8. Confirm the extension file self-updates cleanly across Hypatia app
   updates (version comment check on startup) without leaving stale
   duplicate watchers from a previous version's code still resident in a
   long-running sidecar process that hasn't restarted.

---

## Appendix A — Rust-native watcher (fallback option)

Kept from this doc's first draft. No longer the primary recommendation
(§3), but valid if extension loading ever proves unreliable in the field
(antivirus quarantining a dropped `.ts` file, a future sidecar update
tightening global-scope trust, etc.) — implementable entirely within this
repo's own Rust layer, which we fully control.

### A.1 Libraries

- [`notify`](https://docs.rs/notify) — cross-platform native OS filesystem
  events (FSEvents/inotify/ReadDirectoryChangesW).
- [`notify-debouncer-full`](https://docs.rs/notify-debouncer-full) —
  coalesces raw OS event bursts into settled per-path events, absorbing
  platform quirks (e.g. Windows' overflow behavior on very large trees).
- [`ignore`](https://docs.rs/ignore) — gitignore-aware filtering (same
  crate ripgrep uses).

### A.2 Lifecycle

One watcher per live session (not per displayed tab — mirrors
`MultiStreamState`'s background-session model), keyed by `session_id`,
started when `new_session(cwd)` spawns a sidecar, stopped when that
session's sidecar exits.

### A.3 Correlation (the part the extension route avoids)

Record `{ toolCallId, startedAt }` on `tool_execution_start` for `bash`
calls (relayed through the existing `app.emit` pipe). Buffer debounced fs
events with their own observed timestamps. On `tool_execution_end`, sweep
the buffer for events inside `[startedAt, endedAt]` (plus a small trailing
grace period) and attribute them to that call. Events matching no window
are reported unattributed (a generic "workspace changed externally"
signal). Overlapping concurrent windows attribute to all overlapping calls
rather than dropping the event.

### A.4 Emission

New Tauri channel, additive to the existing sidecar relay:

```rust
#[derive(Serialize, Clone)]
struct WorkspaceFileEvent {
    session_id: String,
    path: String,
    kind: FileEventKind, // Created | Modified | Removed
    tool_call_id: Option<String>,
    at: String,
}
app.emit("workspace_file_event", event)?;
```

Frontend: a `useWorkspaceFiles(sessionId)` hook listening on
`workspace_file_event`, same `listen()` pattern as `ready`/`sidecar_lost`
in `App.tsx`.

### A.5 Why the extension route is preferred over this

Same-process hooks make correlation exact instead of timestamp-bucketed
(§4.2), and reuse the existing `result.details` pipe instead of adding a
new Rust dependency + new IPC channel + new frontend hook. Appendix A
remains useful only for defense-in-depth or as a total fallback if the
extension mechanism turns out not to work reliably in practice.
