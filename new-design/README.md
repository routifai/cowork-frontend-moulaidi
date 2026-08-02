# Hypatia V3 Design Package

Handoff package for integrating the V3 design language into the Hypatia frontend
(React + Vite + Tauri, `src/`).

## Folder map

| Path | What it is |
|---|---|
| `INSTRUCTIONS.md` | **Start here.** Design direction, decisions already made, integration plan, state mapping. |
| `design-tokens.css` | CSS custom properties + utility classes (glass, grain, glitch, shimmer, ticker). Drop into the app's global stylesheet. |
| `tailwind.tokens.js` | Tailwind `theme.extend` snippet matching the tokens. |
| `webgl/orb-presence.js` | ES module — the "Royal Gloss" blob orb (auth/landing hero). Three.js + GSAP peers. |
| `webgl/pulse-presence.js` | ES module — the "Pulse" radial waveform (chat avatar). Three.js + GSAP peers. |
| `reference/v3-concept.html` | Working prototype: auth → workspace, orb hero, ticker, glitch, typewriter. |
| `reference/chat-v3.html` | Working prototype: chat with Pulse avatar full choreography. **Primary reference for chat integration.** |
| `reference/orb-ideas.html` | Orb material studies (6 skins). Context for why Royal Gloss won. |
| `reference/presence-shapes.html` | Form studies (8 shapes). Context for why Pulse won for chat. |
| `reference/artifacts-v3.html` | Artifacts library + slide-over viewer (Phase 6). |
| `reference/cowork-v3.html` | Workspace-first UX (Cowork model): Projects hub + folder-bound session. Toggle "UX notes" for annotations. |
| `reference/plan-v3.html` | Plan Mode (Phase 8): inline decision forms in the chat feed, synthesized into an approvable plan card. |
| `COWORK-UX.md` | **Written spec** for the workspace UX — research findings, IA, screen specs, states, integration mapping. |

## Validated decisions (do not relitigate)

- Light editorial theme; RBC blue `#0051a5` accent; gold `#e8a821` used sparingly.
- Auth/landing presence: **Royal Gloss blob orb**.
- Chat presence: **Pulse** (radial waveform ring), full flight choreography.
- Glitch bursts as punctuation (~300 ms, on state changes), never looping texture.
- Terminal/tool output collapsed by default into dark mono cards.

Prototypes are served by opening the HTML files over any local HTTP server
(they use CDN Three.js r128 / GSAP / Tailwind CDN — network required).
