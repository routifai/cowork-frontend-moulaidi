# chat/

`ChatView.tsx` (+ its test) — the message-thread + composer surface. Two files only.

## Role

Purely presentational relative to `App.tsx`: all chat state (`messages`, `streamingMessage`,
`isRunning`, `error`, model list, slash-command registry, steer/follow-up queue) is passed in as
props from `App.tsx`, which owns `usePiStream`. `ChatView` owns only its own local UI state:
scroll position/stick-to-bottom, in-thread find, details-expanded toggle, model selector open
state passthrough.

## Key composition

- Renders `ChatMessageItem` (`@/components/ChatMessage`) per message, `ErrorBanner`,
  `InThreadFind`, and `MessageInput` (the composer, which itself owns `CommandPalette` +
  `ModelSelector`).
- Owns the "Pulse" WebGL presence avatar via `usePresence()` (`@/hooks/usePresence`): docks it in
  the composer at rest, flies it to a `thinkingDockRef` element while `isRunning && no streamed
  content yet`. The presence is DOM-anchored (see `lib/presence/CLAUDE.md`), so `ChatView` only
  needs to hand it ref elements, not manage its animation.
- Reads `usePiStream`'s `StreamStateStatus` union (`idle | thinking | tool_call | responding |
  error`) — kept as a local type here rather than imported, so check both definitions stay in
  sync if the status set changes.

## Gotchas

- `sessionKey` prop remounts the composer intentionally (retriggers its entrance animation on
  session switch) — don't memoize it away.
- Steer vs. follow-up (`onSteer`/`onFollowUp`) is deliberately distinct from `onSend`: steering
  interrupts an in-flight turn, follow-up queues after it. Both ultimately reach `usePiStream`'s
  `steerStream`/`followUpStream` through `App.tsx`.
