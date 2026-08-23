# playground/

The "artifacts" slide-over panel — renders whatever the sidecar's `show_artifact` tool produced,
in a type-specific viewer.

## Key files

- `PlaygroundPanel.tsx` — the panel shell: tab strip over `artifacts` (a `Record<id,
  PlaygroundArtifact>`), a `RENDERERS` map (`html|markdown|code|diff|image` → renderer component)
  and matching `TYPE_ICONS`. Toggles a rendered-vs-raw view for types in `TOGGLABLE_TYPES`
  (html/markdown/image — code/diff are already raw text).
- `PlaygroundReopenTab.tsx` — small affordance to reopen the panel after it's been dismissed.
- `renderers/` — one component per artifact type: `HtmlView` (sandboxed `<iframe srcDoc>`, `allow-
  scripts` only — no same-origin, so it cannot reach the app's own DOM/JS/storage), `MarkdownView`,
  `CodeView`, `DiffView` (+ `UnrecognizedArtifact` fallback), `ImageView`.

## Data flow

State lives in `@/hooks/usePlaygroundArtifacts` (owned by `App.tsx`, not by this directory) —
deliberately its own store separate from `usePiStream`'s `StreamState`, so a chat-turn `RESET`
action can never wipe artifacts out from under a live turn (see that hook's doc comment for the
bug this fixes). `App.tsx` passes `playground.upsert` into `usePiStream({ onShowArtifact })` so a
`show_artifact` tool call updates this store directly from the stream reducer.

## Type contract

`PlaygroundArtifact`/`PlaygroundArtifactPayload` (`@/types/playground.ts`) mirror the shape
produced by `hypatia-backend/src/extensions/show-artifact.ts` in the **separate** sidecar repo —
there is no shared package across the stdio boundary; the TS shape here and the TypeBox schema
there are two independent declarations of the same contract. Keep them in sync manually if the
backend's schema changes.

## Cross-reference

`@/components/ArtifactChips.tsx` (inline "show_artifact" chips in a chat message) and `@/hooks/
useArtifactLoader.ts` (loads a file from disk for preview, separate from playground state) both
reference playground types/icons but are not tied to a specific chat-turn's artifacts the way this
directory's store is.
