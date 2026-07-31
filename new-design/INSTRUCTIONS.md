# Hypatia V3 — Integration Instructions

You are integrating a validated design language into the existing Hypatia frontend
(React 18 + Vite + Tauri, source in `src/`). The design was prototyped and approved
as static HTML in `reference/`. Your job is a faithful port, not a redesign.

Read this file fully before touching code. Open `reference/chat-v3.html` and
`reference/v3-concept.html` in a browser first — the motion IS the spec.

---

## 1. Design philosophy

**"Serious engineering with a living presence."**

- Light, editorial, calm surfaces. Playfair Display for display headings, Inter for
  UI, JetBrains Mono for labels/data. Generous whitespace, hairline borders.
- One WebGL "presence" per screen is the emotional core. Everything else is quiet
  so the presence reads.
- Motion is state communication, not decoration. Every animation must answer
  "what is the system doing right now?"
- Glitch = punctuation. Short bursts (~300 ms) on state transitions only. If a
  glitch loops or fires more than ~once per 8 s at rest, it's wrong.
- Finance texture: mono uppercase micro-labels with wide tracking, market ticker,
  tabular numbers. RBC blue is the only saturated color; gold appears only in
  details (active-session rail, hot ticks, badges).

## 2. The two presences

### Auth / landing: Royal Gloss orb (`webgl/orb-presence.js`)
Simplex-displaced icosphere, chrome-sapphire fragment shader (deep royal blue core,
ice-white liquid streaks). States: `idle | listening | thinking | settled`.
Reference behavior: `reference/v3-concept.html`.

### Chat: Pulse (`webgl/pulse-presence.js`)
96 radial bars + inner hairline ring — part cardiogram, part market tape.
States: `rest | thinking | speaking | settled`. Choreography (the important part):

1. **rest** — docked in the composer, small (≈28 px), calm 3-lobe wave.
   Keystrokes kick a brief volatility spike (`chaos` bump).
2. **send** — `glitch()` burst, then flies to a 64 px slot in a "thinking" row in
   the thread: fast rotation, high chaos. Status text cycles with shimmer;
   skeleton lines hint at the incoming answer.
3. **first token** — second smaller `glitch()`; thinking row morphs into the real
   assistant message; Pulse docks as its 28 px avatar; mode `speaking` while text
   streams.
4. **done** — mode `settled`, then after ~1 s fly home to the composer, mode `rest`.

The flight works by **DOM anchoring**: every frame the Three.js group lerps toward
the world-space position of the current anchor element
(`getBoundingClientRect` → NDC → unproject to the z=0 plane). This makes the
presence scroll with the thread and survive resizes for free. Both modules
implement it — do not replace it with fixed positioning.

## 3. Integration plan (do in this order)

### Phase 1 — tokens
- Merge `design-tokens.css` into the global stylesheet (`src/App.css` or an
  imported `tokens.css`).
- Merge `tailwind.tokens.js` into `tailwind.config` `theme.extend` (or map to CSS
  vars if the app doesn't use Tailwind).
- Add Google Fonts (Inter, Playfair Display, JetBrains Mono) — for Tauri prefer
  self-hosting the woff2 files; CDN fonts fail offline.

### Phase 2 — chat presence (highest impact)
- Install `three` and `gsap` as real dependencies. Port
  `webgl/pulse-presence.js` usage into a React hook, e.g.
  `src/hooks/usePresence.ts`: create once on mount, expose
  `{ setAnchor, setMode, glitch }`, dispose on unmount.
- Full-viewport transparent `<canvas>` (fixed, `pointer-events: none`, above the
  thread, below modals). Anchor slots are empty `div`s in the message/composer
  layout (see `reference/chat-v3.html` markup: `.orb-slot`).
- Wire to the real stream lifecycle (see `src/hooks/usePiStream.ts`):
  - prompt submitted → `glitch(0.8)` + `setMode('thinking')` + anchor to thinking row
  - first streamed token → `glitch(0.5)` + `setMode('speaking')` + anchor to message avatar
  - stream complete → `setMode('settled')`, then after ~1.2 s anchor back to
    composer + `setMode('rest')`
  - error/abort → `setMode('rest')`, anchor home (add a brief red-tinted glitch if
    you want a failure signal; keep it under 400 ms).
- Port the collapsed terminal card for tool/command output (biggest UX win over
  the current wall-of-logs). Collapsed header = command + status + duration;
  expand animates open.

### Phase 3 — chat chrome
- Sessions sidebar, header (glitch-text thread title, model pill, READY/RUNNING
  pill), glass user bubbles right / typographic assistant prose left, streaming
  cursor, entrance staggers. All present in `reference/chat-v3.html`.

### Phase 4 — auth/landing
- Port `reference/v3-concept.html`: split layout, editorial hero with line-reveal,
  orb hero via `webgl/orb-presence.js`, market ticker strip, auth → workspace
  GSAP timeline where the orb is the continuity object.

### Phase 5 — auth → chat transition ("Starting up" metamorphosis)
Reference: `reference/transition-v3.html` (approved). Four acts, ~6 s, one
Three.js scene containing BOTH presences so there is never a canvas swap:

1. **Departure** — glitch burst on login; auth panel slides out; orb flies to
   screen center.
2. **Splash** — serif "Starting up." under the orb, shimmer status cycle
   (map to real boot events: auth → session restore → engine warmup → context
   sync), gold→blue hairline progress + mono percentage. Orb in `thinking`.
3. **Metamorphosis** — orb overcharges (amp/freq spike, contracts), white
   radial flash + full glitch, orb implodes and dissolves via a `uFade`
   uniform (fragment alpha, `transparent: true`); Pulse becomes visible at the
   same position with ring radius matched to the dying orb's silhouette
   (`bornScale = orbRadius × orbScale / pulseR0`), born spinning/chaotic with a
   `birth` 0→1 param scaling bar heights and line opacity, then calms to rest.
4. **Arrival** — splash title glitches to "Welcome back.", splash lifts away,
   chat chrome enters, Pulse flies into the composer slot via DOM anchoring.

Integration notes: drive the progress bar and status lines from real startup
promises, not timers — the timeline waits on them (min display time ~2.5 s so
the metamorphosis never feels cut short). Reduced motion: skip flash and
charge, crossfade orb→pulse, show statuses without shimmer.

### Phase 6 — Artifacts library
Reference: `reference/artifacts-v3.html`. A dedicated Artifacts view listing
every file the agent generated, with a click-to-view slide-over:

- Grid of artifact cards grouped under mono day headers; each card carries a
  type icon chip (deck/model/doc/code/media), meta line, gold UPDATED badge,
  and a provenance footer naming the originating session.
- Live search + type filter chips; count label tracks results.
- Slide-over viewer (58% width, backdrop blur, Esc/backdrop close) with
  copy/download/open-in-Finder actions and a provenance strip — what inputs
  produced the file + "Open conversation →" deep link back to the source
  chat. Provenance is the differentiator; keep it.
- Per-type preview renderers: pptx → slide-thumbnail grid; xlsx/csv →
  tabular-numeral tables with sheet tabs and delta coloring; md → rendered
  editorial document; code → line-numbered highlighted source; images →
  direct render.

Integrate against the existing `usePlaygroundArtifacts` store + session
files; real file reads go through the Tauri fs plugin. Card → viewer motion:
GSAP slide-in + content stagger, glitch on the page title as punctuation.

## 4. Hard requirements

- `prefers-reduced-motion`: presences drop to slow drift, no glitch, no typewriter
  (render final text immediately). Already implemented in the modules — keep it.
- Pause the RAF loop when `document.hidden`; resume on visibility.
- `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`.
- Dispose GL resources on unmount (`renderer.dispose()`, geometry/material
  dispose) — Tauri webview sessions are long-lived.
- Keep 60 fps with the thread scrolling: Pulse per-frame work is one 96-bar
  position write; do not add per-frame React state updates. The presence lives
  outside React's render cycle; React only calls its imperative API.
- Terminal cards must virtualize/clamp huge logs (the screenshot case was
  thousands of lines) — render last N lines collapsed, full content on expand.

## 5. Don'ts

- No new colors, no purple/pink (was explicitly rejected as "cancer cell" —
  cold blues only), no warm iridescence.
- No looping glitch, no parallax on chat (parallax is auth-only).
- Don't animate layout properties (width/height/top) — transforms + opacity only,
  except the terminal expand which animates height once.
- Don't block input while thinking; composer stays usable.
- Don't re-architect the app around the design; the presence is additive.

## 6. Definition of done

- Chat renders with Pulse completing the full rest → thinking → speaking →
  settled → rest loop against the real backend stream.
- Old dark chat layout replaced by V3 chrome; tool output collapsed by default.
- Reduced-motion audit passes; no console errors; 60 fps scroll with a 100-message
  thread on a MacBook Air.
- Auth screen ported with orb + transition (Phase 4 may land separately).
