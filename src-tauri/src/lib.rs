//! Hypatia Cowork — Tauri backend
//!
//! A thin relay between the React frontend and the Node.js agent sidecar.

mod analytics;

use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{oneshot, Mutex};

#[derive(Default)]
struct SidecarState {
    // The Child handle is owned by the exit-watcher task spawned in setup()
    // (not stored here) so we can wait() on it and log unexpected deaths.
    // tokio's kill_on_drop ensures it's reaped on app shutdown when the
    // watcher task is aborted.
    stdin: Mutex<Option<tokio::process::ChildStdin>>,
    ready: Arc<AtomicBool>,
}

struct PendingPrompt {
    channel: Channel<Value>,
}
struct PendingRequest {
    sender: oneshot::Sender<Result<Value, String>>,
}

struct TelemetryState {
    enabled: Arc<AtomicBool>,
}

#[derive(Default)]
struct AppState {
    sidecar: SidecarState,
    pending_prompts: Arc<Mutex<HashMap<String, PendingPrompt>>>,
    pending_requests: Arc<Mutex<HashMap<String, PendingRequest>>>,
}

/// Strip the Windows `\\?\` extended-length path prefix.
///
/// Tauri's `app.path().resource_dir()` on Windows returns paths in the
/// extended-length form (e.g. `\\?\C:\Program Files\...`) because the
/// underlying call to `GetFinalPathNameByHandleW` produces that form.
/// This is fine for most Rust file I/O, but Node.js v24's main-module
/// resolver calls `realpathSync` on its argv[1] and then walks the
/// path component-by-component starting from the prefix — it ends up
/// calling `lstat('C:')`, which on Windows returns EISDIR, and Node
/// crashes with `Error: EISDIR: illegal operation on a directory` before
/// the sidecar's first line runs. The crash is invisible because the
/// Tauri parent has no console and stderr is normally inherited.
///
/// Strip the prefix unconditionally — `dunce::simplified` does the same
/// check; we avoid the dependency here. The non-extended path is
/// equivalent for paths <260 chars (which all our resource paths are).
fn strip_unc_prefix(p: PathBuf) -> PathBuf {
    let s = p.to_string_lossy();
    if let Some(stripped) = s.strip_prefix(r"\\?\") {
        PathBuf::from(stripped.to_string())
    } else {
        p
    }
}

/// Locate the `hypatia-backend` source entry point for dev mode.
///
/// `hypatia-backend` is a separate repo from `hypatia-frontend` (the split
/// keeps the stdio protocol, but the two live in independent checkouts).
/// `HYPATIA_BACKEND_DEV_PATH` overrides the default sibling-checkout
/// convention (`<frontend repo>/../hypatia-backend/src/index.ts`) for anyone
/// who clones it somewhere else.
fn find_backend_dev_entry() -> PathBuf {
    if let Ok(override_path) = std::env::var("HYPATIA_BACKEND_DEV_PATH") {
        return PathBuf::from(override_path);
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent() // src-tauri -> hypatia-frontend
        .unwrap()
        .parent() // hypatia-frontend -> sibling checkouts dir
        .unwrap()
        .join("hypatia-backend")
        .join("src")
        .join("index.ts")
}

fn find_sidecar_path(app: &tauri::AppHandle) -> PathBuf {
    // In debug/dev mode, prefer the TypeScript source via tsx.
    // This avoids resource copying issues and lets typebox resolve
    // naturally from agent-sidecar/node_modules/.
    if cfg!(debug_assertions) {
        let dev_path = find_backend_dev_entry();
        if dev_path.exists() {
            return dev_path;
        }
    }

    // Try production resource dir — works on macOS .app bundles
    // and Linux AppImage/dpkg builds.
    let resource = app
        .path()
        .resource_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("agent-sidecar")
        .join("index.cjs");
    if resource.exists() {
        return strip_unc_prefix(resource);
    }

    // Check common system paths for distro-packaged installations.
    // Linux: /usr/lib/hypatia-cowork/agent-sidecar/index.cjs
    // Windows: %PROGRAMFILES%\HypatiaAI\HypatiaCowork\agent-sidecar\index.cjs
    #[cfg(target_os = "windows")]
    {
        let program_files =
            std::env::var("PROGRAMFILES").unwrap_or_else(|_| "C:\\Program Files".into());
        let win_path = PathBuf::from(format!(
            "{}\\HypatiaAI\\HypatiaCoWork\\agent-sidecar\\index.cjs",
            program_files
        ));
        if win_path.exists() {
            return win_path;
        }
        // Also check %LOCALAPPDATA% (per-user installs)
        let local_app_data = std::env::var("LOCALAPPDATA").unwrap_or_default();
        if !local_app_data.is_empty() {
            let local_path = PathBuf::from(format!(
                "{}\\HypatiaAI\\HypatiaCoWork\\agent-sidecar\\index.cjs",
                local_app_data
            ));
            if local_path.exists() {
                return local_path;
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        let lib_path = PathBuf::from("/usr/lib/hypatia-cowork/agent-sidecar/index.cjs");
        if lib_path.exists() {
            return lib_path;
        }
    }

    // Try relative to the current executable (works for portable installs,
    // manual unpack, or any non-standard layout).
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            let rel_path = exe_dir.join("../lib/hypatia-cowork/agent-sidecar/index.cjs");
            if rel_path.exists() {
                return rel_path;
            }
            // Also try plain relative (e.g. portable extraction)
            let plain_path = exe_dir.join("agent-sidecar/index.cjs");
            if plain_path.exists() {
                return plain_path;
            }
        }
    }

    // Last resort — dev fallback (only useful during development)
    find_backend_dev_entry()
}

/// Pick the first candidate that exists and is NOT a stub placeholder.
/// `fetch-node.mjs` writes shell-script (`#!/bin/bash ... exit 1`) or
/// batch (`@echo off ... exit /b 1`) placeholders for variants it didn't
/// download. Spawning a `#!` script on Unix gives EPIPE on the next write;
/// spawning a `@echo off` text file on Windows fails CreateProcessW with
/// ERROR_BAD_EXE_FORMAT. Sniff the first two bytes for either signature.
fn pick_real_node(candidates: &[PathBuf]) -> Option<PathBuf> {
    use std::io::Read;
    for p in candidates {
        if !p.exists() {
            continue;
        }
        let mut buf = [0u8; 2];
        match std::fs::File::open(p).and_then(|mut f| f.read(&mut buf).map(|n| (n, buf))) {
            Ok((2, [b'#', b'!'])) => {
                log::warn!("Skipping shebang Node.js shim: {:?}", p);
                continue;
            }
            // `@e` is the first two bytes of "@echo off" — fetch-node.mjs's
            // Windows stub. Real node.exe starts with `MZ` (PE header).
            Ok((2, [b'@', _])) => {
                log::warn!("Skipping batch-file Node.js shim: {:?}", p);
                continue;
            }
            Ok(_) => return Some(p.clone()),
            Err(e) => {
                log::warn!("Failed to read Node.js candidate {:?}: {}", p, e);
                continue;
            }
        }
    }
    None
}

fn find_node(app: &tauri::AppHandle) -> PathBuf {
    // 1. Allow override via NODE env var (useful for testing and CI)
    if let Ok(path) = std::env::var("NODE") {
        if !path.is_empty() {
            return PathBuf::from(path);
        }
    }

    // 2. Try bundled Node.js in app resources (production builds)
    // In production, Tauri bundles Node.js as a resource.
    // macOS universal builds ship both node-arm64 and node-x64.
    //
    // fetch-node.mjs creates `#!/bin/bash; exit 1` shim placeholders for
    // any variants it didn't download (so Tauri's resource validation
    // passes). Spawning a shim succeeds at the OS level but the shim
    // immediately exits, leaving the next write_all() to its stdin with
    // EPIPE ("Broken pipe (os error 32)"). Use `pick_real_node` to skip
    // shims by sniffing the first two bytes for a shebang.
    if !cfg!(debug_assertions) {
        if let Ok(resource_dir) = app.path().resource_dir() {
            let binaries_dir = resource_dir.join("binaries");

            // Windows: prefer node.exe (the real downloaded binary). Older
            // copies of fetch-node.mjs leave `binaries/node` as an 84-byte
            // `.cmd` stub (`@echo off ... exit /b 1`) because the stub-creation
            // loop ran before the `node.exe → node` copy and the copy was
            // guarded by `!existsSync(nodeCopy)`. CreateProcessW on that stub
            // fails with ERROR_BAD_EXE_FORMAT, killing the sidecar before init.
            // pick_real_node only sniffs for `#!` shebangs, so the `.cmd`
            // stub slips past — listing node.exe first sidesteps it entirely.
            #[cfg(target_os = "windows")]
            let candidates = [binaries_dir.join("node.exe"), binaries_dir.join("node")];

            #[cfg(target_os = "macos")]
            let candidates = {
                let current_arch = std::process::Command::new("uname")
                    .arg("-m")
                    .output()
                    .ok()
                    .and_then(|o| String::from_utf8(o.stdout).ok())
                    .unwrap_or_default();
                let arch_specific = if current_arch.starts_with("arm") {
                    binaries_dir.join("node-arm64")
                } else {
                    binaries_dir.join("node-x64")
                };
                // Try the arch-specific name first (correct for universal
                // builds), then the generic `node` (correct for single-arch
                // builds where the arch-specific name was a shim).
                [arch_specific, binaries_dir.join("node")]
            };

            #[cfg(target_os = "linux")]
            let candidates = [binaries_dir.join("node")];

            if let Some(real) = pick_real_node(&candidates) {
                let real = strip_unc_prefix(real);
                log::info!("Using bundled Node.js: {:?}", real);
                return real;
            }
        }
    }

    // 3. Check common Node.js installation paths (dev mode / fallback).
    // macOS GUI apps launched via Finder inherit a minimal PATH
    // (/usr/bin:/bin:/usr/sbin:/sbin) which excludes Homebrew paths,
    // so we need to check these explicitly.
    // On Windows, desktop apps may not inherit the user's full PATH
    // so we check common install locations.

    #[cfg(target_os = "windows")]
    let candidates: Vec<String> = {
        let userprofile = std::env::var("USERPROFILE").unwrap_or_default();
        vec![
            "C:\\Program Files\\nodejs\\node.exe".into(),
            "C:\\Program Files (x86)\\nodejs\\node.exe".into(),
            format!("{}\\scoop\\apps\\nodejs\\current\\node.exe", userprofile),
            format!("{}\\nvm4w\\nodejs\\node.exe", userprofile),
            "C:\\ProgramData\\chocolatey\\lib\\nodejs\\tools\\node.exe".into(),
            "node.exe".into(),
        ]
    };

    #[cfg(not(target_os = "windows"))]
    let candidates: Vec<&str> = vec![
        "/opt/homebrew/bin/node",          // Homebrew Apple Silicon
        "/opt/homebrew/opt/node/bin/node", // Homebrew Node formula (no @version)
        "/usr/local/bin/node",             // Homebrew Intel / general
        "/usr/bin/node",                   // macOS bundled or pkgsrc
    ];

    for path in &candidates {
        let p = PathBuf::from(path);
        if p.exists() {
            return p;
        }
    }

    // 4. Last resort
    #[cfg(target_os = "windows")]
    {
        log::warn!("No bundled or system Node.js found — trying PATH");
        PathBuf::from("node.exe")
    }

    #[cfg(not(target_os = "windows"))]
    {
        log::warn!("No bundled or system Node.js found — relying on PATH");
        PathBuf::from("node")
    }
}

/// Split a sidecar stderr line `[sidecar:LEVEL] message` into (level, message).
/// Returns ("info", line) when the prefix is missing or malformed.
fn parse_sidecar_level(line: &str) -> (&str, &str) {
    if let Some(rest) = line.strip_prefix("[sidecar:") {
        if let Some(end) = rest.find("] ") {
            let level = &rest[..end];
            let msg = &rest[end + 2..];
            if matches!(level, "error" | "warn" | "info" | "debug") {
                return (level, msg);
            }
        }
    }
    ("info", line)
}

async fn spawn_sidecar(
    app: tauri::AppHandle,
    zm: &str,
) -> Result<
    (
        Child,
        tokio::process::ChildStdout,
        tokio::process::ChildStdin,
    ),
    String,
> {
    let p = find_sidecar_path(&app);
    let p_str = p.to_string_lossy().to_string();

    // Determine runtime: tsx for .ts (dev), node for .cjs (production)
    let run_cmd: String;
    let run_args: Vec<String>;
    let is_dev = p.extension().map(|e| e == "ts").unwrap_or(false);

    if is_dev {
        // Dev mode: use tsx from agent-sidecar's node_modules.
        // On Windows, npm creates THREE files per bin: a POSIX shell wrapper
        // (`tsx`, no extension) for Git Bash, plus `tsx.cmd` for cmd.exe and
        // `tsx.ps1` for PowerShell. Rust's Command/CreateProcessW cannot
        // execute the POSIX wrapper (it's not a PE binary), so picking it
        // makes spawn fail with ERROR_BAD_EXE_FORMAT and the sidecar never
        // starts. Prefer `tsx.cmd` on Windows.
        // `p` is `<hypatia-backend checkout>/src/index.ts` (see
        // find_backend_dev_entry) — walk up two levels to the repo root
        // where its own node_modules/.bin/tsx lives.
        let sidecar_dir = p
            .parent() // src/
            .and_then(|d| d.parent()) // hypatia-backend/
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("."));
        let bin_dir = sidecar_dir.join("node_modules").join(".bin");
        #[cfg(target_os = "windows")]
        let tsx_bin = {
            let cmd = bin_dir.join("tsx.cmd");
            if cmd.exists() {
                cmd
            } else {
                bin_dir.join("tsx")
            }
        };
        #[cfg(not(target_os = "windows"))]
        let tsx_bin = bin_dir.join("tsx");
        if tsx_bin.exists() {
            run_cmd = tsx_bin.to_string_lossy().to_string();
            run_args = vec![p_str];
            log::info!("Sidecar: {} {}", run_cmd, run_args[0]);
        } else {
            // npx is also a .cmd on Windows — let cmd.exe resolve it via PATH.
            #[cfg(target_os = "windows")]
            {
                run_cmd = "npx.cmd".to_string();
            }
            #[cfg(not(target_os = "windows"))]
            {
                run_cmd = "npx".to_string();
            }
            run_args = vec!["tsx".to_string(), p_str];
            log::info!("Sidecar: {} tsx {}", run_cmd, run_args[1]);
        }
    } else {
        let node_path = find_node(&app);
        run_cmd = node_path.to_string_lossy().to_string();
        // `--use-system-ca` (Node 22.15+/24) makes Node consult the OS trust
        // store for OAuth token exchange behind corporate MITM proxies. We pass
        // it as a real Node CLI ARG (not via NODE_OPTIONS) on purpose: child
        // Node processes inherit the parent's NODE_OPTIONS. Older child Nodes
        // reject unknown flags in NODE_OPTIONS and exit with code 9. A CLI arg
        // is consumed by THIS Node only and never leaks to child processes.
        // See the NODE_OPTIONS block below.
        run_args = vec!["--use-system-ca".to_string(), p_str];
        log::info!("Sidecar: {} {} {}", run_cmd, run_args[0], run_args[1]);
    }
    // True when `--use-system-ca` was handed to Node as a CLI arg above (the
    // production/bundled-Node path). Dev mode runs via tsx and still relies on
    // NODE_OPTIONS below.
    let system_ca_via_arg = !is_dev;

    let mut c = Command::new(&run_cmd);
    for a in &run_args {
        c.arg(a);
    }
    // Set the sidecar log verbosity unless the caller already exported it.
    // Release builds default to `warn` (errors + warnings only) so production
    // stays quiet; dev builds default to `debug` for full tracing.
    if std::env::var("SIDECAR_LOG_LEVEL").is_err() {
        let default_level = if cfg!(debug_assertions) {
            "debug"
        } else {
            "warn"
        };
        c.env("SIDECAR_LOG_LEVEL", default_level);
    }
    // macOS GUI apps launched via Finder don't inherit a terminal's env
    // vars, and our bundled Node 24's stock CA bundle doesn't include
    // corporate MITM root certs (ZScaler / Cloudflare WARP / Fortinet /
    // etc.). `--use-system-ca` (Node 22.4+) makes Node consult the OS
    // trust store — macOS keychain, Windows cert store, Linux
    // ca-certificates — in addition to its built-in CAs, so any root the
    // browser already trusts becomes valid for OAuth token exchange too.
    // Falls back gracefully when the OS store has no extras. Preserve any
    // pre-existing NODE_OPTIONS the user has set.
    let existing_node_opts = std::env::var("NODE_OPTIONS").unwrap_or_default();
    if system_ca_via_arg {
        // Production: `--use-system-ca` is already a Node CLI arg (see above), so
        // we must NOT add it to NODE_OPTIONS — doing so would re-introduce the
        // exit-code-9 leak into the child `npm` process. Preserve any
        // user-provided NODE_OPTIONS untouched.
        if !existing_node_opts.is_empty() {
            c.env("NODE_OPTIONS", existing_node_opts);
        }
    } else {
        // Dev (tsx): pass `--use-system-ca` via NODE_OPTIONS. Dev machines run a
        // modern Node that accepts it, and installs there use the dev toolchain.
        let node_options = if existing_node_opts.contains("--use-system-ca") {
            existing_node_opts
        } else if existing_node_opts.is_empty() {
            "--use-system-ca".to_string()
        } else {
            format!("{existing_node_opts} --use-system-ca")
        };
        c.env("NODE_OPTIONS", node_options);
    }
    // Dev mode: parse the repo-root .env and inject each var directly onto
    // the child process. This is the only safe approach — Node.js explicitly
    // disallows --env-file inside NODE_OPTIONS (exits with code 9).
    // Skipped in production where secrets are baked in by prebuild.mjs.
    if is_dev {
        let env_file = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .map(|p| p.join(".env"))
            .filter(|p| p.exists());
        if let Some(env_path) = &env_file {
            log::info!("Sidecar: .env file found at {}", env_path.display());
            if let Ok(contents) = std::fs::read_to_string(env_path) {
                log::info!("Sidecar: loading dev .env from {}", env_path.display());
                for line in contents.lines() {
                    let line = line.trim();
                    // skip blanks and comments
                    if line.is_empty() || line.starts_with('#') {
                        continue;
                    }
                    if let Some((key, val)) = line.split_once('=') {
                        let key = key.trim();
                        let val = val.trim().trim_matches('"').trim_matches('\'');
                        if !key.is_empty() && std::env::var(key).is_err() {
                            c.env(key, val);
                            log::info!("Sidecar: injected env var {}", key);
                        }
                    }
                }
            }
        } else {
            log::info!(
                "Sidecar: .env file NOT FOUND at {:?}/../.env",
                env!("CARGO_MANIFEST_DIR")
            );
        }
    }
    c.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    // Without CREATE_NO_WINDOW (0x08000000), spawning a console-subsystem
    // child (node.exe / npx.cmd / tsx.cmd are all console-subsystem) from a
    // windows-subsystem GUI parent makes Windows allocate a brand new
    // console window for the child — a black cmd.exe popup that sits open
    // for the entire lifetime of the sidecar. CREATE_NO_WINDOW suppresses
    // it and is the universal Windows-GUI-spawning-CLI-child fix.
    #[cfg(target_os = "windows")]
    {
        c.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    log::info!("Sidecar: spawning cmd={run_cmd:?} args={run_args:?} hypatiaDir={zm}");
    let mut c = c.spawn().map_err(|e| format!("spawn: {e}"))?;
    let o = c.stdout.take().ok_or("no stdout")?;
    let mut i = c.stdin.take().ok_or("no stdin")?;
    // Pipe sidecar stderr into our logger so crashes are visible.
    // Without this, on Windows GUI apps stderr inherit() silently
    // discards everything because windows-subsystem parents have no
    // console attached. See issue #140.
    if let Some(err) = c.stderr.take() {
        tauri::async_runtime::spawn(async move {
            use tokio::io::AsyncBufReadExt as _;
            let mut lines = tokio::io::BufReader::new(err).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                // Sidecar prefixes lines `[sidecar:LEVEL] ...` — map to the
                // matching Rust log severity so the file log keeps real levels
                // (previously every sidecar line was logged as a warning).
                let (level, msg) = parse_sidecar_level(&line);
                match level {
                    "error" => log::error!("sidecar: {msg}"),
                    "warn" => log::warn!("sidecar: {msg}"),
                    "debug" => log::debug!("sidecar: {msg}"),
                    _ => log::info!("sidecar: {msg}"),
                }
            }
            log::warn!("sidecar: stderr EOF");
        });
    }
    let msg = serde_json::json!({"type":"init","hypatiaDir":zm});
    let l = format!("{}\n", serde_json::to_string(&msg).unwrap());
    i.write_all(l.as_bytes())
        .await
        .map_err(|e| format!("init: {e}"))?;
    i.flush().await.map_err(|e| format!("flush: {e}"))?;
    log::info!("Sidecar: init sent, pid={:?}", c.id());
    Ok((c, o, i))
}

async fn read_stdout(
    mut out: tokio::process::ChildStdout,
    pp: Arc<Mutex<HashMap<String, PendingPrompt>>>,
    pr: Arc<Mutex<HashMap<String, PendingRequest>>>,
    rd: Arc<AtomicBool>,
    app: AppHandle,
) {
    let mut lines = BufReader::new(&mut out).lines();
    while let Ok(Some(l)) = lines.next_line().await {
        if l.trim().is_empty() {
            continue;
        }
        let m: Value = match serde_json::from_str(&l) {
            Ok(v) => v,
            _ => continue,
        };
        match m.get("type").and_then(|v| v.as_str()).unwrap_or("") {
            "ready" => {
                rd.store(true, Ordering::Release);
                log::info!("Ready");
                let _ = app.emit("ready", m);
            }
            "event" => {
                if let Some(e) = m.get("event") {
                    // Surface OAuth-flow events as Tauri events so the React
                    // UI can listen for them globally (separate from prompt
                    // streaming channels which are scoped to active prompts).
                    if let Some(kind) = e.get("kind").and_then(|v| v.as_str()) {
                        // Surface OAuth, reload, and extension-UI requests as
                        // global Tauri events. `ui_request` carries ctx.ui
                        // dialog calls (e.g. pi-ask-user) so the React UI can
                        // render them regardless of which prompt is active.
                        // `ui_cancel` tells the UI to dismiss a dialog the
                        // sidecar already resolved itself (timeout/abort).
                        if kind.starts_with("oauth_")
                            || kind == "agent_reload_failed"
                            || kind == "ui_request"
                            || kind == "ui_cancel"
                        {
                            let _ = app.emit(kind, e.clone());
                        }
                    }
                    // Pi SDK session-level events (queue_update,
                    // session_info_changed, etc.) use `type` instead of
                    // `kind`. The composer (#201 PR 3) needs to know about
                    // queue mutations EVEN WHEN NO PROMPT IS ACTIVE — e.g.
                    // after the agent finishes and a follow-up dequeues.
                    // Emit those globally so a `listen("queue_update", ...)`
                    // in React works regardless of streaming state.
                    if let Some(t) = e.get("type").and_then(|v| v.as_str()) {
                        if t == "queue_update" {
                            let _ = app.emit("queue_update", e.clone());
                        }
                    }
                    for p in pp.lock().await.values() {
                        let _ = p.channel.send(e.clone());
                    }
                }
            }
            "done" => {
                if let Some(id) = m.get("id").and_then(|v| v.as_str()) {
                    // Forward a terminal `done` to the prompt channel BEFORE
                    // dropping it. The UI ends a turn on `agent_end` OR `done`;
                    // without this forward the only completion signal is
                    // `agent_end`, so any turn that doesn't emit one (incl. the
                    // sidecar's prompt-timeout abort, which only sends `done`)
                    // leaves the UI stuck in "thinking" forever.
                    if let Some(p) = pp.lock().await.remove(id) {
                        let _ = p.channel.send(serde_json::json!({"type":"done"}));
                    }
                }
            }
            "result" => {
                if let Some(id) = m.get("id").and_then(|v| v.as_str()) {
                    if let Some(p) = pr.lock().await.remove(id) {
                        let _ = p
                            .sender
                            .send(Ok(m.get("data").cloned().unwrap_or(Value::Null)));
                    }
                }
            }
            "error" => {
                let id = m.get("id").and_then(|v| v.as_str()).unwrap_or("");
                let t = m.get("message").and_then(|v| v.as_str()).unwrap_or("err");
                // Surface sidecar command errors. Previously these were relayed
                // to the frontend as a rejected Promise and never logged, so a
                // failing command (e.g. load_session) was invisible in the logs.
                log::warn!("sidecar error response id={id}: {t}");
                if let Some(p) = pr.lock().await.remove(id) {
                    let _ = p.sender.send(Err(t.into()));
                } else if let Some(p) = pp.lock().await.get(id) {
                    let _ = p
                        .channel
                        .send(serde_json::json!({"type":"error","message":t}));
                }
            }
            _ => {}
        }
    }
    log::warn!("Sidecar stdout closed");
}

async fn scmd(state: &AppState, m: &Value) -> Result<(), String> {
    let mut s = state.sidecar.stdin.lock().await;
    let i = s.as_mut().ok_or_else(|| {
        log::error!("scmd: no sidecar (stdin is None) for msg={m}");
        "no sidecar".to_string()
    })?;
    let l = format!("{}\n", serde_json::to_string(m).map_err(|e| e.to_string())?);
    let kind = m.get("type").and_then(|v| v.as_str()).unwrap_or("?");
    let id = m.get("id").and_then(|v| v.as_str()).unwrap_or("-");
    if let Err(e) = i.write_all(l.as_bytes()).await {
        log::error!(
            "scmd[{kind}/{id}]: write_all FAILED: {e} (raw os err: {:?})",
            e.raw_os_error()
        );
        return Err(e.to_string());
    }
    if let Err(e) = i.flush().await {
        log::error!(
            "scmd[{kind}/{id}]: flush FAILED: {e} (raw os err: {:?})",
            e.raw_os_error()
        );
        return Err(e.to_string());
    }
    log::debug!("scmd[{kind}/{id}]: sent ({} bytes)", l.len());
    Ok(())
}

async fn scmd_r(state: &AppState, m: &Value, t: std::time::Duration) -> Result<Value, String> {
    let id = m
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("no id")?
        .to_string();
    let (tx, rx) = oneshot::channel();
    state
        .pending_requests
        .lock()
        .await
        .insert(id, PendingRequest { sender: tx });
    scmd(state, m).await?;
    tokio::time::timeout(t, rx)
        .await
        .map_err(|_| "timeout".to_string())?
        .map_err(|_| "closed".to_string())?
}

#[tauri::command]
async fn get_models(s: State<'_, AppState>) -> Result<Value, String> {
    scmd_r(
        &s,
        &serde_json::json!({"type":"get_models","id":"gm"}),
        std::time::Duration::from_secs(30),
    )
    .await
    .map(|r| r.get("models").cloned().unwrap_or(Value::Array(vec![])))
}

/// Returns the model the engine will actually run (`session.model`) as
/// `{provider, id, name}` or null. The frontend mirrors this on startup so the
/// model shown near the input matches the model that actually answers.
#[tauri::command]
async fn get_active_model(s: State<'_, AppState>) -> Result<Value, String> {
    let id = format!("gam-{}", next_request_id());
    scmd_r(
        &s,
        &serde_json::json!({"type":"get_active_model","id":id}),
        std::time::Duration::from_secs(10),
    )
    .await
}

#[tauri::command]
async fn send_prompt(
    text: String,
    ch: Channel<Value>,
    s: State<'_, AppState>,
) -> Result<(), String> {
    if !s.sidecar.ready.load(Ordering::Acquire) {
        return Err("not ready".into());
    }
    let id = format!("p-{}", next_request_id());
    s.pending_prompts
        .lock()
        .await
        .insert(id.clone(), PendingPrompt { channel: ch });
    scmd(
        &s,
        &serde_json::json!({"type":"prompt","id":id,"text":text}),
    )
    .await
}

#[tauri::command]
async fn abort_prompt(s: State<'_, AppState>) -> Result<(), String> {
    scmd(&s, &serde_json::json!({"type":"abort","id":"ab"})).await
}

/// Build the JSONL payload sent to the sidecar for a `steer` command.
///
/// Factored out as a pure function so the wire shape is unit-testable
/// without spinning up a real sidecar process. The Tauri command
/// [`steer_prompt`] is a thin wrapper that generates an id and forwards
/// the payload via [`scmd_r`].
///
/// See `agent-sidecar/src/steering.ts` for the matching handler and
/// pi-coding-agent's `docs/rpc.md` for the protocol reference (cowork
/// uses `text` rather than pi's `message` to stay internally consistent
/// with the existing `prompt` command).
fn build_steer_payload(id: &str, text: &str) -> Value {
    serde_json::json!({
        "type": "steer",
        "id": id,
        "text": text,
    })
}

/// Build the install context the frontend uses to decide whether the in-app
/// updater may self-update or should defer to a package manager (issue #271).
///
/// Pure so it can be unit-tested without touching real env/OS state.
fn build_install_context(target_os: &str, is_appimage: bool, channel: &str) -> Value {
    // `std::env::consts::OS` already yields "macos"/"windows"/"linux"/…, which
    // matches the platform strings the frontend's resolveUpdatePolicy expects,
    // so we forward it as-is.
    let channel = if channel.is_empty() {
        "direct"
    } else {
        channel
    };
    serde_json::json!({
        "platform": target_os,
        "isAppImage": is_appimage,
        "channel": channel,
    })
}

/// Tauri command: report the running install context to the frontend.
///
/// - `isAppImage` is true when launched from an AppImage (`APPIMAGE` env set);
///   only then can the Tauri updater self-replace on Linux.
/// - `channel` is a compile-time marker baked by CI: package-manager builds
///   (Homebrew/AUR/Winget) are built with `HYPATIA_UPDATE_CHANNEL=managed` so the
///   app never tries to self-update binaries the package manager owns.
#[tauri::command]
fn get_install_context() -> Value {
    let is_appimage = std::env::var_os("APPIMAGE").is_some();
    let channel = option_env!("HYPATIA_UPDATE_CHANNEL").unwrap_or("direct");
    build_install_context(std::env::consts::OS, is_appimage, channel)
}

/// Build the JSONL payload sent to the sidecar for a `clear_queue` command.
/// Issue #201 PR 3 — atomically drains the SDK queue. No `text` field: this
/// command takes no input. The sidecar replies with the drained
/// `{steering, followUp}` arrays in a `result` envelope.
fn build_clear_queue_payload(id: &str) -> Value {
    serde_json::json!({
        "type": "clear_queue",
        "id": id,
    })
}

/// Build the JSONL payload sent to the sidecar for a `follow_up` command.
/// See [`build_steer_payload`] for rationale.
fn build_follow_up_payload(id: &str, text: &str) -> Value {
    serde_json::json!({
        "type": "follow_up",
        "id": id,
        "text": text,
    })
}

/// Queue a steering message on the active session. Delivered after the
/// current assistant turn finishes its tool calls, before the next LLM
/// call. Round-trips through `scmd_r` with a short timeout because the
/// sidecar replies with a one-shot `result` / `error` envelope (no
/// streaming channel — streaming events keep flowing on the existing
/// prompt channel).
#[tauri::command]
async fn steer_prompt(text: String, s: State<'_, AppState>) -> Result<Value, String> {
    if !s.sidecar.ready.load(Ordering::Acquire) {
        return Err("not ready".into());
    }
    let id = format!("st-{}", next_request_id());
    scmd_r(
        &s,
        &build_steer_payload(&id, &text),
        std::time::Duration::from_secs(5),
    )
    .await
}

/// Queue a follow-up message on the active session. Delivered after the
/// agent has no more tool calls or steering messages pending.
#[tauri::command]
async fn follow_up_prompt(text: String, s: State<'_, AppState>) -> Result<Value, String> {
    if !s.sidecar.ready.load(Ordering::Acquire) {
        return Err("not ready".into());
    }
    let id = format!("fu-{}", next_request_id());
    scmd_r(
        &s,
        &build_follow_up_payload(&id, &text),
        std::time::Duration::from_secs(5),
    )
    .await
}

/// Drain the active session's steer + follow-up queue and return the
/// drained `{steering, followUp}` arrays. Issue #201 PR 3 — the desktop
/// composer calls this when the user presses Ctrl+↑ to recall pending
/// queued messages for editing. Idempotent on an empty queue.
#[tauri::command]
async fn clear_queue(s: State<'_, AppState>) -> Result<Value, String> {
    if !s.sidecar.ready.load(Ordering::Acquire) {
        return Err("not ready".into());
    }
    let id = format!("cq-{}", next_request_id());
    scmd_r(
        &s,
        &build_clear_queue_payload(&id),
        std::time::Duration::from_secs(5),
    )
    .await
}

/// Answer an extension UI dialog (ctx.ui.select/confirm/input/editor). `id` is
/// the UI-request id from the `ui_request` event. Exactly one of `value`/
/// `confirmed` is set, or `cancelled` is true. Fire-and-forget: the sidecar
/// resolves the pending dialog promise and sends no response.
#[tauri::command]
async fn send_ui_response(
    id: String,
    value: Option<String>,
    confirmed: Option<bool>,
    cancelled: Option<bool>,
    s: State<'_, AppState>,
) -> Result<(), String> {
    let mut msg = serde_json::json!({ "type": "ui_response", "id": id });
    if let Some(v) = value {
        msg["value"] = serde_json::Value::String(v);
    }
    if let Some(c) = confirmed {
        msg["confirmed"] = serde_json::Value::Bool(c);
    }
    if let Some(c) = cancelled {
        msg["cancelled"] = serde_json::Value::Bool(c);
    }
    scmd(&s, &msg).await
}

#[tauri::command]
async fn set_active_model(
    provider: String,
    model: String,
    s: State<'_, AppState>,
) -> Result<Value, String> {
    scmd_r(
        &s,
        &serde_json::json!({"type":"set_model","id":"sm","provider":provider,"model":model}),
        std::time::Duration::from_secs(10),
    )
    .await
}

#[tauri::command]
async fn reload_sidecar(s: State<'_, AppState>) -> Result<Value, String> {
    scmd_r(
        &s,
        &serde_json::json!({"type":"reload","id":"rl"}),
        std::time::Duration::from_secs(30),
    )
    .await
}

/// Lightweight env-read for the system username — used in the empty-state
/// greeting. Microseconds, non-blocking, always returns something.
#[tauri::command]
fn get_username() -> String {
    std::env::var("USER")
        .or_else(|_| std::env::var("USERNAME"))
        .unwrap_or_default()
}

#[tauri::command]
async fn list_sessions(
    all_folders: Option<bool>,
    s: State<'_, AppState>,
) -> Result<Value, String> {
    scmd_r(
        &s,
        &serde_json::json!({"type":"list_sessions","id":"ls","allFolders":all_folders}),
        std::time::Duration::from_secs(10),
    )
    .await
}

#[tauri::command]
async fn save_session(
    sid: String,
    title: String,
    messages: Value,
    model: Option<String>,
    provider: Option<String>,
    s: State<'_, AppState>,
) -> Result<Value, String> {
    scmd_r(
        &s,
        &serde_json::json!({
            "type":"save_session",
            "id": sid,
            "title": title,
            "messages": messages,
            "model": model,
            "provider": provider,
        }),
        std::time::Duration::from_secs(10),
    )
    .await
}

#[tauri::command]
async fn load_session(session_file: String, s: State<'_, AppState>) -> Result<Value, String> {
    let id = format!("ld-{}", next_request_id());
    scmd_r(
        &s,
        &serde_json::json!({"type":"load_session","id":id,"sessionFile": session_file}),
        std::time::Duration::from_secs(60),
    )
    .await
}

#[tauri::command]
async fn delete_session(session_file: String, s: State<'_, AppState>) -> Result<Value, String> {
    scmd_r(
        &s,
        &serde_json::json!({"type":"delete_session","id":"dl","sessionFile": session_file}),
        std::time::Duration::from_secs(10),
    )
    .await
}

/// Give a chat session a user-chosen title. The sidecar marks the header
/// `titleLocked` so auto-derived titles never overwrite it again.
#[tauri::command]
async fn rename_session(
    session_file: String,
    title: String,
    s: State<'_, AppState>,
) -> Result<Value, String> {
    scmd_r(
        &s,
        &serde_json::json!({
            "type":"rename_session",
            "id":"rn",
            "sessionFile": session_file,
            "title": title,
        }),
        std::time::Duration::from_secs(10),
    )
    .await
}

/// Pin or unpin a chat session (floats it to the top of the sidebar).
#[tauri::command]
async fn set_session_pinned(
    session_file: String,
    pinned: bool,
    s: State<'_, AppState>,
) -> Result<Value, String> {
    scmd_r(
        &s,
        &serde_json::json!({
            "type":"set_session_pinned",
            "id":"pn",
            "sessionFile": session_file,
            "pinned": pinned,
        }),
        std::time::Duration::from_secs(10),
    )
    .await
}

/// Deep content search across all session bodies (not just titles).
#[tauri::command]
async fn search_sessions(
    query: String,
    all_folders: Option<bool>,
    s: State<'_, AppState>,
) -> Result<Value, String> {
    scmd_r(
        &s,
        &serde_json::json!({"type":"search_sessions","id":"ss","query": query,"allFolders":all_folders}),
        std::time::Duration::from_secs(10),
    )
    .await
}

#[tauri::command]
async fn new_session(cwd: Option<String>, s: State<'_, AppState>) -> Result<Value, String> {
    // `cwd` is the workspace folder the user picked (via the native folder
    // picker). Forwarded to the sidecar, which rebinds the agent's file/bash
    // tools and project-local resource discovery to it. Omitted => the sidecar
    // keeps its current workspace (defaults to the user's home dir).
    let id = format!("ns-{}", next_request_id());
    let mut payload = serde_json::json!({"type":"new_session","id":id});
    if let Some(c) = cwd {
        if !c.trim().is_empty() {
            payload["cwd"] = serde_json::Value::String(c);
        }
    }
    scmd_r(&s, &payload, std::time::Duration::from_secs(60)).await
}

/// Report the sidecar's active workspace folder (and the default), so the UI
/// can display "where am I working" and pre-fill the folder picker.
#[tauri::command]
async fn get_workspace(s: State<'_, AppState>) -> Result<Value, String> {
    scmd_r(
        &s,
        &serde_json::json!({"type":"get_workspace","id":"gw"}),
        std::time::Duration::from_secs(10),
    )
    .await
}

#[tauri::command]
async fn get_settings(s: State<'_, AppState>) -> Result<Value, String> {
    let id = format!("gs-{}", next_request_id());
    scmd_r(
        &s,
        &serde_json::json!({"type":"get_settings","id":id}),
        std::time::Duration::from_secs(10),
    )
    .await
    .map(|r| {
        r.get("settings")
            .cloned()
            .unwrap_or(Value::Object(Default::default()))
    })
}

#[tauri::command]
async fn save_settings(settings: Value, s: State<'_, AppState>) -> Result<Value, String> {
    let mut payload =
        serde_json::json!({"type":"save_settings","id":format!("ss-{}", next_request_id())});
    if let Some(obj) = settings.as_object() {
        for (k, v) in obj {
            payload[k] = v.clone();
        }
    }
    scmd_r(&s, &payload, std::time::Duration::from_secs(10)).await
}

#[tauri::command]
async fn get_instructions(s: State<'_, AppState>) -> Result<String, String> {
    let id = format!("gi-{}", next_request_id());
    scmd_r(
        &s,
        &serde_json::json!({"type":"get_instructions","id":id}),
        std::time::Duration::from_secs(10),
    )
    .await
    .map(|r| {
        r.get("content")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string()
    })
}

#[tauri::command]
async fn save_instructions(content: String, s: State<'_, AppState>) -> Result<Value, String> {
    let id = format!("si-{}", next_request_id());
    // session.reload() in the sidecar can take a moment; allow more headroom.
    scmd_r(
        &s,
        &serde_json::json!({"type":"save_instructions","id":id,"content":content}),
        std::time::Duration::from_secs(30),
    )
    .await
}

// ── Memory commands ───────────────────────────────────────────────

#[tauri::command]
async fn get_memory_index(s: State<'_, AppState>) -> Result<Value, String> {
    let id = format!("gmi-{}", next_request_id());
    scmd_r(
        &s,
        &serde_json::json!({"type":"get_memory_index","id":id}),
        std::time::Duration::from_secs(10),
    )
    .await
}

#[tauri::command]
async fn get_memory_note(topic: String, s: State<'_, AppState>) -> Result<Value, String> {
    let id = format!("gmn-{}", next_request_id());
    scmd_r(
        &s,
        &serde_json::json!({"type":"get_memory_note","id":id,"topic":topic}),
        std::time::Duration::from_secs(10),
    )
    .await
}

#[tauri::command]
async fn save_memory_note(
    topic: String,
    summary: String,
    memory_type: Option<String>,
    detail: Option<String>,
    note_content: Option<String>,
    s: State<'_, AppState>,
) -> Result<Value, String> {
    let id = format!("smn-{}", next_request_id());
    let mut payload = serde_json::json!({
        "type": "save_memory_note",
        "id": id,
        "topic": topic,
        "summary": summary,
    });
    if let Some(mt) = memory_type {
        payload["memoryType"] = Value::String(mt);
    }
    if let Some(d) = detail {
        payload["detail"] = Value::String(d);
    }
    if let Some(nc) = note_content {
        payload["noteContent"] = Value::String(nc);
    }
    // save_memory_note can trigger session.reload() in the sidecar; allow more headroom.
    scmd_r(&s, &payload, std::time::Duration::from_secs(30)).await
}

#[tauri::command]
async fn delete_memory_topic(topic: String, s: State<'_, AppState>) -> Result<Value, String> {
    let id = format!("dmt-{}", next_request_id());
    scmd_r(
        &s,
        &serde_json::json!({"type":"delete_memory_topic","id":id,"topic":topic}),
        std::time::Duration::from_secs(10),
    )
    .await
}

// ── Extension commands ────────────────────────────────────────────

#[tauri::command]
async fn list_extensions(s: State<'_, AppState>) -> Result<Value, String> {
    scmd_r(
        &s,
        &serde_json::json!({"type":"list_extensions","id":"le"}),
        std::time::Duration::from_secs(10),
    )
    .await
    .map(|r| r.get("extensions").cloned().unwrap_or(Value::Array(vec![])))
}

// ── Skills commands ──────────────────────────────────────────────

#[tauri::command]
async fn search_skills(query: String, s: State<'_, AppState>) -> Result<Value, String> {
    let id = format!("ssk-{}", next_request_id());
    scmd_r(
        &s,
        &serde_json::json!({"type":"search_skills","id": id, "query": query}),
        std::time::Duration::from_secs(35),
    )
    .await
    .map(|r| r.get("results").cloned().unwrap_or(Value::Array(vec![])))
}

/// Write exported content to a location the user chose via the native "Save
/// As" dialog (frontend always calls `@tauri-apps/plugin-dialog`'s `save()`
/// first — see ChatMessage.tsx's `saveToFile`). `path` is intentionally
/// unrestricted in *where* it can point, matching normal Save-As semantics —
/// the OS dialog is the access control, not this command. What we do reject
/// is a `path` that could only have arrived by a script invoking this Tauri
/// command directly (bypassing the dialog entirely): empty, containing a NUL
/// byte, or relative — the save dialog never returns those.
#[tauri::command]
async fn write_user_file(path: String, content: String) -> Result<(), String> {
    if path.trim().is_empty() {
        return Err("write_file: empty path".into());
    }
    if path.contains('\0') {
        return Err("write_file: invalid path".into());
    }
    if !PathBuf::from(&path).is_absolute() {
        return Err("write_file: path must be absolute".into());
    }
    tokio::fs::write(&path, &content)
        .await
        .map_err(|e| format!("write_file: {e}"))
}

#[tauri::command]
async fn open_url(url: String) -> Result<(), String> {
    // Per-platform browser opener. Previous implementation shelled out to
    // `sh -c "xdg-open ... || open ... || start '' ..."` which silently
    // fails on Windows: GUI Tauri processes don't have `sh` on PATH, and
    // even when Git Bash is installed `start` is a cmd.exe builtin, not
    // a real executable. That broke every OAuth flow (Claude Pro, GitHub
    // Copilot, OpenAI Codex) on Windows — the UI stuck at "Opening
    // browser…" with no error because the React side `.catch(() => {})`s
    // the rejection.
    #[cfg(target_os = "windows")]
    let result = {
        // `cmd /c start "" "<url>"`. Two things are load-bearing here:
        //   1. The empty `""` is the window title `start` expects as its first
        //      quoted arg.
        //   2. The URL MUST be wrapped in double quotes, appended via `raw_arg`
        //      so Rust doesn't re-escape it. Without the quotes, cmd.exe treats
        //      `&` as a command separator and truncates the URL at the FIRST
        //      `&` — so an OAuth URL like
        //        …/auth?client_id=X&redirect_uri=…&response_type=code&scope=…
        //      collapses to just `client_id=X`, and Google rejects it with
        //      "Access blocked: Authorisation error — Required parameter is
        //      missing: response_type" (Error 400: invalid_request). Quoting
        //      also stops `%` in percent-encoded params being read as a cmd
        //      variable reference. This mirrors how the `open` crate (used by
        //      tauri-plugin-shell) opens URLs on Windows.
        // CREATE_NO_WINDOW (0x08000000) prevents a brief console-window flash.
        use std::os::windows::process::CommandExt;
        std::process::Command::new("cmd")
            .args(["/c", "start", ""])
            .raw_arg(format!("\"{url}\""))
            .creation_flags(0x0800_0000)
            .status()
    };
    #[cfg(target_os = "macos")]
    let result = std::process::Command::new("open").arg(&url).status();
    #[cfg(target_os = "linux")]
    let result = std::process::Command::new("xdg-open").arg(&url).status();

    let st = result.map_err(|e| format!("open: {e}"))?;
    if !st.success() {
        return Err(format!("exit: {}", st));
    }
    Ok(())
}

// ── Telemetry ────────────────────────────────────────────────

#[tauri::command]
async fn set_telemetry_enabled(enabled: bool, app: AppHandle) -> Result<(), String> {
    let state = app.state::<TelemetryState>();
    state.enabled.store(enabled, Ordering::Release);
    log::info!(
        "Telemetry: {}",
        if enabled { "enabled" } else { "disabled" }
    );
    Ok(())
}

static INSTALL_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// Generate a unique id for scmd `id` fields so concurrent callers of the
/// same command don't collide in `pending_requests`. Not an RFC 4122 UUID:
/// a timestamp + atomic counter is enough for "unique within this process".
fn next_request_id() -> String {
    use std::sync::atomic::Ordering;
    use std::time::{SystemTime, UNIX_EPOCH};
    let counter = INSTALL_COUNTER.fetch_add(1, Ordering::AcqRel);
    let n = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!(
        "{:016x}",
        (n << 16 | u128::from(counter)) & 0xFFFF_FFFF_FFFF_FFFF
    )
}

/// App log level from the HYPATIA_LOG_LEVEL env var (error/warn/info/debug/trace).
/// Defaults to Debug in dev builds and Info in release, matching the sidecar's
/// spawn defaults so the whole stack goes quiet in production by default.
fn resolve_log_level() -> log::LevelFilter {
    match std::env::var("HYPATIA_LOG_LEVEL").ok().as_deref() {
        Some("error") => log::LevelFilter::Error,
        Some("warn") => log::LevelFilter::Warn,
        Some("info") => log::LevelFilter::Info,
        Some("debug") => log::LevelFilter::Debug,
        Some("trace") => log::LevelFilter::Trace,
        _ if cfg!(debug_assertions) => log::LevelFilter::Debug,
        _ => log::LevelFilter::Info,
    }
}

pub fn run() {
    let aptabase_key = option_env!("APTABASE_KEY").unwrap_or("");
    let builder = tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .clear_targets()
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("hypatia".into()),
                    },
                ))
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::Stdout,
                ))
                .level(resolve_log_level())
                .max_file_size(5_000_000)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepAll)
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(TelemetryState {
            enabled: Arc::new(AtomicBool::new(false)),
        });

    #[allow(unused_mut)]
    let mut builder = builder;

    // Only set up our in-house analytics if a key is available at compile time.
    // The analytics module uses tauri::async_runtime::spawn (safe in setup context)
    // into a single .setup() since Tauri only calls the last one.
    let ak = (!aptabase_key.is_empty()).then(|| aptabase_key.to_string());

    builder
        .setup(move |app| {
            // Initialize in-house analytics (runs within Tauri's tokio runtime)
            if let Some(ref key) = ak {
                if let Err(e) = analytics::setup(app, key) {
                    log::warn!("Analytics setup failed: {}", e);
                }
                // Success is logged inside analytics::setup so the key presence
                // is unambiguous in the log.
            } else {
                log::info!("Analytics: no key, disabled");
            }

            let h = app.handle().clone();
            let st: AppState = AppState::default();
            // Resolve hypatia dir. On Windows, GUI apps don't inherit HOME
            // (that's a POSIX convention) — the equivalent is USERPROFILE.
            // Falling through to /tmp/.hypatiai on Windows causes auth.json
            // and models.json to land in C:\tmp\.hypatiai instead of the user's
            // profile, so credentials silently "disappear" between runs and
            // every release-installer user trips over it.
            let zd = std::env::var("HYPATIA_DIR").unwrap_or_else(|_| {
                #[cfg(target_os = "windows")]
                let home = std::env::var("USERPROFILE")
                    .or_else(|_| std::env::var("HOME"))
                    .unwrap_or_else(|_| "C:\\Users\\Default".into());
                #[cfg(not(target_os = "windows"))]
                let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".into());
                format!("{}/.hypatiai", home)
            });
            let pp = st.pending_prompts.clone();
            let pr = st.pending_requests.clone();
            let rd = Arc::clone(&st.sidecar.ready);
            app.manage(st);
            tauri::async_runtime::spawn(async move {
                // Retry loop: if the sidecar crashes (OOM, unhandled error,
                // model-load failure) we restart it up to 3 times so the
                // app keeps working without user intervention (#307).
                let max_retries = 3;
                for attempt in 0..max_retries {
                    match spawn_sidecar(h.clone(), &zd).await {
                        Ok((mut c, o, i)) => {
                            let s: State<AppState> = h.state();
                            let pid = c.id();
                            *s.sidecar.stdin.lock().await = Some(i);
                            rd.store(true, Ordering::Release);
                            let _ = h.emit(
                                "ready",
                                serde_json::json!({
                                    "sidecarRestarted": attempt > 0
                                }),
                            );
                            // Watch the sidecar's exit so unexpected deaths are
                            // diagnosable. Owns the Child for its lifetime;
                            // tokio kill_on_drop ensures cleanup if this task
                            // is aborted (app shutdown).
                            let pid_watch = pid;
                            tauri::async_runtime::spawn(async move {
                                match c.wait().await {
                                    Ok(status) => log::error!(
                                        "Sidecar pid={pid_watch:?} EXITED: status={status:?} code={:?}",
                                        status.code()
                                    ),
                                    Err(e) => log::error!("Sidecar pid={pid_watch:?} wait error: {e}"),
                                }
                            });
                            read_stdout(o, pp.clone(), pr.clone(), rd.clone(), h.clone()).await;
                            // Sidecar died — mark not ready so commands fail
                            // fast with "not ready" instead of hanging.
                            rd.store(false, Ordering::Release);
                            let _ = h.emit("sidecar_lost", ());
                            if attempt < max_retries - 1 {
                                let delay = std::time::Duration::from_millis(
                                    500 * (attempt as u64 + 1),
                                );
                                log::warn!(
                                    "Sidecar: restarting (attempt {}) in {}ms",
                                    attempt + 2,
                                    delay.as_millis(),
                                );
                                tokio::time::sleep(delay).await;
                            }
                        }
                        Err(e) => {
                            log::error!("Sidecar: spawn failed (attempt {}): {}", attempt + 1, e);
                            if attempt < max_retries - 1 {
                                tokio::time::sleep(std::time::Duration::from_millis(1000)).await;
                            }
                        }
                    }
                }
                log::error!("Sidecar: all {} restart attempts exhausted — app restart needed", max_retries);
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_models,
            get_active_model,
            send_prompt,
            abort_prompt,
            steer_prompt,
            follow_up_prompt,
            clear_queue,
            send_ui_response,
            set_active_model,
            reload_sidecar,
            get_username,
            list_sessions,
            save_session,
            load_session,
            delete_session,
            rename_session,
            set_session_pinned,
            search_sessions,
            new_session,
            get_workspace,
            get_settings,
            save_settings,
            get_instructions,
            save_instructions,
            get_memory_index,
            get_memory_note,
            save_memory_note,
            delete_memory_topic,
            list_extensions,
            search_skills,
            write_user_file,
            open_url,
            crate::analytics::track_analytics_event,
            crate::analytics::set_analytics_enabled,
            crate::analytics::flush_analytics,
            set_telemetry_enabled,
            get_install_context,
        ])
        .run(tauri::generate_context!())
        .expect("error running tauri");
}

#[cfg(test)]
mod tests {
    use super::{
        build_clear_queue_payload, build_follow_up_payload, build_install_context,
        build_steer_payload,
    };

    // ── In-app updater install context (#271) ───────────────────────────

    #[test]
    fn install_context_maps_known_platforms_and_flags() {
        let ctx = build_install_context("macos", false, "direct");
        assert_eq!(ctx["platform"], "macos");
        assert_eq!(ctx["isAppImage"], false);
        assert_eq!(ctx["channel"], "direct");
    }

    #[test]
    fn install_context_reports_appimage_on_linux() {
        let ctx = build_install_context("linux", true, "direct");
        assert_eq!(ctx["platform"], "linux");
        assert_eq!(ctx["isAppImage"], true);
    }

    #[test]
    fn install_context_defaults_empty_channel_to_direct() {
        let ctx = build_install_context("windows", false, "");
        assert_eq!(ctx["channel"], "direct");
    }

    #[test]
    fn install_context_preserves_managed_channel_marker() {
        let ctx = build_install_context("macos", false, "managed");
        assert_eq!(ctx["channel"], "managed");
    }

    // Wire-format guards: the sidecar's `case "steer"` / `case "follow_up"` /
    // `case "clear_queue"` handlers (agent-sidecar/src/index.ts) read these
    // exact fields. Drift here = silent breakage on the React → Rust → sidecar
    // path.

    #[test]
    fn steer_payload_uses_steer_type_with_text_and_id() {
        let p = build_steer_payload("st-abc", "hi there");
        assert_eq!(p["type"], "steer");
        assert_eq!(p["id"], "st-abc");
        assert_eq!(p["text"], "hi there");
    }

    #[test]
    fn follow_up_payload_uses_follow_up_type_with_text_and_id() {
        let p = build_follow_up_payload("fu-xyz", "after you finish");
        assert_eq!(p["type"], "follow_up");
        assert_eq!(p["id"], "fu-xyz");
        assert_eq!(p["text"], "after you finish");
    }

    #[test]
    fn steer_payload_preserves_text_with_newlines_and_unicode() {
        // Steering messages are user-authored composer input — must not
        // be mangled by serialization. The Tauri → sidecar transport is
        // LF-delimited JSONL so embedded `\n` and Unicode line separators
        // must round-trip via JSON escaping.
        let p = build_steer_payload("id", "line one\nline two — café");
        let serialized = serde_json::to_string(&p).unwrap();
        // The newline inside the user's text is escaped, never raw.
        assert!(
            !serialized.contains("line one\nline two"),
            "raw newline leaked into JSONL frame: {serialized}"
        );
        assert!(serialized.contains("line one\\nline two"));
        assert!(serialized.contains("caf\u{00e9}"));
    }

    #[test]
    fn clear_queue_payload_uses_clear_queue_type_with_id_only() {
        // No text field — clear_queue takes no input from the user. The
        // sidecar reads `type` to dispatch and `id` to route the response
        // envelope back through `pending_requests`.
        let p = build_clear_queue_payload("cq-abc");
        assert_eq!(p["type"], "clear_queue");
        assert_eq!(p["id"], "cq-abc");
        // Defensive: ensure no extra fields snuck in that the sidecar
        // doesn't expect (sidecar's strict TS Command union would refuse).
        let obj = p.as_object().expect("clear_queue payload is an object");
        assert_eq!(
            obj.len(),
            2,
            "unexpected fields in clear_queue payload: {p}"
        );
    }

    #[test]
    fn payloads_are_pure_no_shared_state_between_calls() {
        // Two calls with the same id must produce byte-identical JSON.
        let a = build_steer_payload("same", "hello");
        let b = build_steer_payload("same", "hello");
        assert_eq!(
            serde_json::to_string(&a).unwrap(),
            serde_json::to_string(&b).unwrap()
        );
    }
}
