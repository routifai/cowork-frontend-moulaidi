# Workspace UX Specification (Cowork model)

How Hypatia moves from a chat-first app to a **workspace-first** app, based on
studying Claude Cowork's UX (research 2026-07-31: Claude Help Center, DataCamp
tutorial, ComputeLeap guide, Times of AI coverage, plus the desktop app
itself). Interactive rendition: `reference/cowork-v3.html` — this document is
the written spec behind it.

---

## 1. What Cowork actually does (research findings)

1. **The workspace replaces chat as the organizing idea.** Top-level nav is
   New / Projects / Artifacts / Scheduled / Customize with a Recents list —
   conversations exist but are secondary. The user's mental model is "things
   Claude is working ON," not "things I said to Claude."
2. **Projects are folder-bound workspaces.** A project wraps a folder plus
   instructions, memory, files, and its task history. Context persists across
   sessions; each new session in a project starts already knowing the folder.
3. **The folder IS the context and the sandbox.** The user grants a folder;
   its contents are injected as session context, and folder scoping is the
   safety boundary — Claude cannot leave it. Outputs land **back in the
   folder**, not in a detached chat transcript.
4. **Autonomy is a visible, per-task control.** Permission modes — Manual
   (approve each step), Auto (self-reviews), Skip (no checks) — are chosen at
   the message box, not buried in settings.
5. **The execution loop is: plan → approve → work → checkpoint → deliver.**
   Claude states its approach as discrete steps and the user reviews it before
   it runs; progress is shown step-by-step in real time (reasoning + commands
   visible); before consequential file operations it pauses and shows the
   affected file list; results appear as clickable artifact previews; when
   done, refinement stays conversational ("the chart needs a legend").
6. **Sessions outlive the window.** Runs continue in the background; the same
   session can be monitored from another surface; recurring work lives under
   Scheduled.

## 2. Design position

Hypatia keeps the entire loop but renders it in the V3 language: light
editorial surfaces, mono uppercase micro-labels, one saturated blue, gold
reserved for the single moment that demands the user's eyes, the Pulse as the
working presence. The differentiating bet: **the folder is always on screen**
— Cowork tells you outputs landed in the folder; we show the folder living.

## 3. Information architecture

```
Sidebar (stone, fixed)
├── New task
├── Projects        ← default landing surface
├── Artifacts       (library across projects — see artifacts-v3.html)
├── Scheduled
├── Customize
├── Recent tasks    (live runs show a pulsing blue dot)
└── User footer

Main surface
├── Screen A · Projects hub
└── Screen B · Workspace session   (one per project)
```

Chat as a standalone destination disappears. A "conversation" is just the
feed inside a workspace session.

## 4. Screen A — Projects hub

- Serif display title ("Projects."), gold-dot mono kicker: "Folder-bound
  workspaces · context persists".
- **Project card** (the core object). Leads with identity + folder, never
  with a message preview:
  - icon chip (per-domain color), project name (semibold)
  - folder path + file count, mono: `~/Cowork/rbc-portal · 128 files`
  - instructions summary + memory count rows (book / brain icons)
  - footer: artifact count · last activity
  - live state: `● 1 RUNNING` mono chip, pulsing blue
- **"Bind a folder"** ghost card (dashed border) is the create action — the
  copy states the contract: *"Hypatia works inside it."*
- Sort control + New project (ink button).

## 5. Screen B — Workspace session

Three zones: header (context), main column (task feed + composer), right
rail (the folder).

### 5.1 Header
- Back to hub, project name in serif.
- **Context chips**, always visible, mono: folder path · Instructions ·
  N memories. These are the Cowork project wrapper surfaced as UI.
- Engine pill right: `READY` (green) → `PLANNING` / `WORKING` (blue, pulsing).

### 5.2 Task feed (main column)
Ordered cards, not bubbles:

1. **Context injection divider** — hairline rule with mono center label:
   `WORKSPACE INJECTED · 128 FILES · 4.2 MB INDEXED`. States plainly that the
   folder is in context before anything is asked.
2. **User task** — right-aligned glass panel under mono `YOU · TASK` label
   (same as chat V3).
3. **Plan card** — Hypatia's proposed approach as numbered steps, each with a
   scope annotation in mono (`62 moves · no deletes`, `read-only`). Footer:
   active mode restated + `Edit plan` / `Approve & run`. Approval flips to a
   mono `✓ APPROVED`. In Skip mode the card still appears but auto-approves.
4. **Progress card** — steps materialize one at a time: spinner + shimmer
   label while running, checkmark when done, mono detail on the right. The
   feed IS the progress tracker; no separate progress sidebar.
5. **Checkpoint card** — the only gold-bordered element in the app. Fires
   before consequential file ops (moves, deletes, sends). Contains: what will
   happen, the affected-file summary, explicit no-delete reassurance when
   true, and three actions: `Allow` (ink), `Always allow <op-class>`,
   `Skip this step`. The Pulse calms while waiting — the presence holds its
   breath.
6. **Completion receipt** — not prose-first: a short paragraph naming what
   landed where, then a mono tally strip:
   `✓ 62 MOVED · 0 DELETED · 1 ARTIFACT · 3 FOR REVIEW`. Refinement continues
   in the same composer, conversationally.

### 5.3 Composer
- Glass panel, placeholder states the contract: *"Describe the outcome.
  Hypatia plans first, then works the folder."*
- **Permission mode pills** (Manual / Auto / Skip) live in the composer
  toolbar — autonomy is a per-task, visible choice. Active pill inverts to ink.
- Mini Pulse docked beside send (2D canvas is sufficient at this size; the
  WebGL Pulse stays for chat). States: rest → volatile while working → near
  still at checkpoints.
- Under-composer mono hint: `RUNS CONTINUE IN BACKGROUND · OUTPUTS LAND IN
  THE FOLDER`.

### 5.4 Right rail — the living folder
- `WORKSPACE · 128 FILES` mono header; scrollable file tree of the bound
  folder (folders with counts, files with type icons).
- **Live activity badges**: as the run touches files they pick up mono chips —
  `READ` (gray), `EDIT` (blue), `NEW` (green) — appearing in real time. This
  is the "watch Claude work" transparency made spatial instead of textual.
- **Artifacts this run** section pinned below: outputs appear here the moment
  they're written (icon chip, name, `NEW · in /reports`), clickable into the
  artifact viewer (Phase 6). Empty state: *"Nothing yet — outputs land here
  and in the folder."*

## 6. States & rules

| State | Engine pill | Pulse | Notes |
|---|---|---|---|
| Idle | READY (green) | rest | composer active |
| Planning | PLANNING (blue) | volatile | plan card streaming in |
| Awaiting approval | PLANNING | calm | plan card buttons live |
| Working | WORKING (blue) | volatile | steps + file badges animate |
| Checkpoint | WORKING | near-still | gold card; everything else quiet |
| Done | READY | rest | receipt + artifacts pinned |

- Gold appears **only** on checkpoints (and micro-details ≤ 3px). If two
  things are gold at once, the design is wrong.
- Composer never locks during a run (steering/follow-up as in chat).
- Destructive ops always checkpoint regardless of mode — Skip skips reviews,
  not consent for deletion (mirrors Cowork's delete confirmation).
- Reduced motion: no shimmer, badges appear without animation, Pulse slows.

## 7. Integration mapping (this repo)

| Spec element | Existing hook point |
|---|---|
| Project = folder binding | session `cwd` (already tracked per session) + folder-grouped sidebar |
| Instructions chip | INSTRUCTIONS.md sidecar injection (already exists) |
| Memory chip | project memory from `a51b4b4` (cross-session project memory) |
| Plan / progress cards | tool-call stream (`usePiStream`) + ActivityBlock lineage |
| Checkpoint card | extension ui.* permission gate (`useExtensionUi`) — restyle, don't rebuild |
| File tree + badges | Tauri fs plugin listing of session cwd; badge events from tool calls (read/edit/write paths) |
| Artifacts rail | `usePlaygroundArtifacts` |
| Modes | map to the sidecar's permission modes; default Auto |

## 8. Open questions (decide before build)

1. Do Recents fold into their project cards, or stay a flat global list?
2. Multi-folder projects (Cowork issue #57177 asks for configurable base
   path) — v1: one folder per project.
3. File tree depth: full recursive vs. two levels + expand-on-demand
   (concept shows two levels; prefer lazy expansion for 10k-file folders).
4. Does approving a plan edit it into the task history (audit trail) — lean
   yes: keep the approved plan card permanently in the feed as the receipt's
   sibling.
