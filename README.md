# hypatia-frontend

Standalone Hypatia Cowork web UI. This is the migration target for the React frontend.

## Development

```bash
pnpm install
pnpm run dev
pnpm run test
pnpm run typecheck
pnpm run validate
```

## Notes

- Copied from `zosma-cowork/frontend` as a starting reference.
- Tauri dependencies are temporarily kept as dev dependencies because the UI still imports them.
- Added `src/adapters/engine-adapter.ts` as the future transport abstraction.
- The next step is to migrate each `invoke()`/`listen()` consumer to use `EngineAdapter` and remove Tauri imports.
