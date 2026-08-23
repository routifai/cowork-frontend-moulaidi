# Presenting packaging verification

Target: macOS arm64

Verified locally:

- PyInstaller one-file engine builds as an arm64 Mach-O executable.
- Standalone stdio protocol returns `ready` and `pong` with `PATH=/usr/bin:/bin`.
- Frontend production build includes the direct Konva editor.
- Tauri release compilation and `.app`/`.dmg` bundling complete.
- The packaged `.app` contains the engine, presentation-export runtime, Chromium, and bundled Node.
- The packaged app launches with `PATH=/usr/bin:/bin`; logs confirm both the bundled Node sidecar and bundled Presenting Engine reach ready state.

Release gate still requiring external infrastructure:

- Run the `.dmg` on a pristine macOS-arm64 VM with no Python or Node installation.
- Drive preset generation, uploaded-document generation, direct editing, chat rehydration, and `.pptx` export using a release provider credential.

The local build exits non-zero only after producing all bundles because updater artifacts are enabled but `TAURI_SIGNING_PRIVATE_KEY` is unavailable. Release CI must provide that key.
