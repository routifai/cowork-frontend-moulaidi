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
├── Connectors      (always-visible status list: Email ● CONNECTED,
│                    Web search ● CONNECTED, + Add connector)
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
- **Project card** (the core object). Leads with identity + folders, never
  with a message preview:
  - icon chip (per-domain color), project name (semibold)
  - **folder list**, mono, primary folder shown + count if more:
    `~/Cowork/rbc-portal +2 · 128 files` — a project binds N folders (client
    docs, shared templates, output dir are commonly separate places)
  - instructions summary + memory count rows (book / brain icons)
  - footer: artifact count · last activity
  - live state: `● 1 RUNNING` mono chip, pulsing blue
- **"Bind folders"** ghost card (dashed border) is the create action — the
  copy states the contract: *"Hypatia works inside them."* Binding flow lets
  you add folders one at a time (each with its own read/edit/delete grant),
  not a single picker.
- Sort control + New project (ink button).

## 5. Screen B — Workspace session

Three zones: header (context), main column (task feed + composer), right
rail (the folder).

### 5.1 Header
- Back to hub, project name in serif.
- **Context chips**, always visible, mono: **folder chip becomes a dropdown**
  when the project has more than one bound folder (e.g. `~/rbc-portal ▾`,
  opening a short list with per-folder file counts and a "+ add folder"
  row) · Instructions · N memories · N connectors (green plug icon when
  live — tells the user this session can reach email / the web before they
  ask it to). These are the Cowork project wrapper + connector controls
  surfaced as UI.
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

### 5.4 Right rail — the living workspace (multi-folder)
- `WORKSPACE · 128 FILES` mono header; scrollable tree with **one top-level
  root per bound folder**, each root labeled with its full path (mono,
  truncated middle) and its own file count — not merged into one anonymous
  tree. Roots are collapsible independently and remember their expand state
  per project.
- **Add folder** row pinned at the bottom of the tree (same affordance as the
  hub's ghost card) — folders can be added to a project mid-session, not only
  at creation.
- **Live activity badges**: as the run touches files they pick up mono chips —
  `READ` (gray), `EDIT` (blue), `NEW` (green) — appearing in real time,
  regardless of which root the file lives under. This is the "watch Claude
  work" transparency made spatial instead of textual.
- **Artifacts this run** section pinned below: outputs appear here the moment
  they're written (icon chip, name, `NEW · in /reports`), clickable into the
  artifact viewer (Phase 6). Because a project can span folders, the artifact
  row's meta line always names which root it landed in. Empty state:
  *"Nothing yet — outputs land here and in the workspace."*

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
- A checkpoint touching files across more than one bound folder must name
  each folder in its affected-list, not just "62 files" — cross-folder moves
  are exactly the case a single-folder mental model hides.
- Reduced motion: no shimmer, badges appear without animation, Pulse slows.

## 7. Integration mapping (this repo)

| Spec element | Existing hook point |
|---|---|
| Project = folder binding | a project stores an **array** of bound folders, not a single `cwd` — extend session/project state accordingly; existing folder-grouped sidebar becomes the "primary folder" grouping key |
| Instructions chip | INSTRUCTIONS.md sidecar injection (already exists) |
| Memory chip | project memory from `a51b4b4` (cross-session project memory) |
| Plan / progress cards | tool-call stream (`usePiStream`) + ActivityBlock lineage |
| Checkpoint card | extension ui.* permission gate (`useExtensionUi`) — restyle, don't rebuild |
| File tree + badges | Tauri fs plugin listing, once per bound folder (one root each); badge events from tool calls (read/edit/write paths), matched to whichever root contains the path |
| Artifacts rail | `usePlaygroundArtifacts` |
| Modes | map to the sidecar's permission modes; default Auto |
| Connectors list | sidecar extension/tool registry (email, web search) — connected = tool available this session |

## 8. Decisions

1. **Recents**: both places — flat "Recent tasks" in the sidebar for
   cross-project overview, plus a recent badge on project cards.
2. **Multi-folder projects: yes, from v1.** A project binds N folders, not
   one. Diverges from Cowork's own v1 (single folder) on purpose — our
   projects are meant to span a client's docs, shared templates, and an
   output dir as separate places from day one, and Cowork issue #57177
   (users asking for configurable base paths) is evidence single-folder is
   already a friction point upstream. See §4, §5.1, §5.4, §6, §7 for what
   this changes: project cards show a folder count, the header folder chip
   becomes a dropdown, the right rail shows one root per folder, checkpoints
   name folders explicitly, and project state stores a folder array.
3. **File tree depth: 2 levels + lazy expand.** Full recursive upfront risks
   hanging on real client folders (10k+ files) — expand on click instead.
4. **Plan audit: keep plan cards in feed.** The approved plan card stays
   permanently as the receipt's sibling — collapsing it after approval would
   throw away the one thing that makes the loop auditable. If the feed gets
   noisy, collapse individual steps inside the card, not the card itself.
