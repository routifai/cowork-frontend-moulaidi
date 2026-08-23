# api/

Empty directory. No files, no exports, nothing imports from `@/api/*`.

Per the repo README, this is reserved for the `EngineAdapter` migration (see
`src/adapters/CLAUDE.md`) — the intended home for a future concrete adapter implementation (e.g.
an `HttpAdapter` for the standalone-server transport) once one exists. Do not assume any API
client code lives here; check `src/adapters/engine-adapter.ts` and the direct
`@tauri-apps/api/core` `invoke()` call sites instead for how the frontend actually talks to the
backend today.
