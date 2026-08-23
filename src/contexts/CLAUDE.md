# contexts/

One React context: `UpdateProvider.tsx` (+ test).

## Purpose

Wraps `useAppUpdate` (`@/hooks/useAppUpdate`) in a `UpdateContext` so a single in-app-update state
machine is shared across the tree — specifically so the launch `UpdateBanner` (rendered from
`App.tsx`) and the Settings → About page (`@/components/settings/About.tsx`) stay in sync instead
of each running an independent poll/download cycle (issue #271, per the source comment).

`main.tsx` mounts `<UpdateProvider>` around `<App />` at the top of the tree. Consumers call
`useUpdate()`; it throws if called outside the provider (no default context value) — every
consumer must be a descendant of `main.tsx`'s tree, which in practice all of them are.

No other app-wide contexts exist. If you need to share state across components, check whether it
belongs here (truly global, e.g. update status) vs. lifted state passed down from `App.tsx` (the
pattern used for session/stream/playground state).
