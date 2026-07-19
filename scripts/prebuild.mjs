// Cross-platform prebuild script for Tauri beforeBuildCommand.
//
// hypatia-backend is a separate repo now — this script locates it, builds
// its bundle (which is already complete/self-contained; see
// hypatia-backend/scripts/postbundle.mjs), injects this app's embedded
// Anthropic key (a release/distribution concern that belongs to whoever is
// packaging the desktop app, not to the engine itself), and copies the
// result into src-tauri/agent-sidecar/index.cjs for Tauri to bundle as a
// resource.
//
// Locating hypatia-backend:
//   - $HYPATIA_BACKEND_PATH if set (absolute or relative path to its repo root)
//   - otherwise the sibling-checkout convention: ../hypatia-backend
// A future release pipeline can replace the "build from a local checkout"
// step below with "download a published/released bundle.cjs artifact" —
// the rest of this script (key injection, copy into src-tauri/) is unchanged
// either way.

import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const backendDir = resolve(process.env.HYPATIA_BACKEND_PATH ?? join(root, "..", "hypatia-backend"));

if (!existsSync(backendDir)) {
	console.error(`[prebuild] hypatia-backend not found at ${backendDir}`);
	console.error("[prebuild] Set HYPATIA_BACKEND_PATH or check it out as a sibling of this repo.");
	process.exit(1);
}

console.log(`[prebuild] Using hypatia-backend at ${backendDir}`);
console.log("[prebuild] Building agent-sidecar bundle...");
execSync("pnpm install --frozen-lockfile && pnpm run bundle", {
	cwd: backendDir,
	shell: true,
	stdio: "inherit",
});

const bundlePath = join(backendDir, "dist", "bundle.cjs");
let code = readFileSync(bundlePath, "utf-8");

// Inject the embedded Anthropic API key. There is no user-facing "paste your
// key" UI — the app boots straight into chat, authenticated by this key.
// Sourced from $ANTHROPIC_API_KEY or a gitignored anthropic-api-key file in
// THIS repo (the packaging/distribution side, not the engine repo).
console.log("[prebuild] Injecting embedded Anthropic API key...");
const anthropicKeyFile = join(root, "anthropic-api-key");
const anthropicKey =
	(process.env.ANTHROPIC_API_KEY || "").trim() ||
	(existsSync(anthropicKeyFile) ? readFileSync(anthropicKeyFile, "utf-8").trim() : "");
if (anthropicKey) {
	code = code.split("__ANTHROPIC_API_KEY__").join(anthropicKey);
	console.log("[prebuild]   Anthropic API key injected");
} else {
	console.warn("[prebuild]   no ANTHROPIC_API_KEY — chat will fail until one is configured");
}

// Copy bundled file into src-tauri/ for Tauri resource bundling
const targetDir = join(root, "src-tauri", "agent-sidecar");
mkdirSync(targetDir, { recursive: true });
console.log("[prebuild] Cleaning stale artifacts...");
for (const f of ["index.cjs", "index.d.ts", "index.js", "index.js.map", "index.d.ts.map"]) {
	try {
		rmSync(join(targetDir, f));
	} catch {
		/* ignore */
	}
}

console.log("[prebuild] Writing bundle...");
writeFileSync(join(targetDir, "index.cjs"), code, "utf-8");

console.log(`[prebuild] Done (${(code.length / 1024 / 1024).toFixed(1)} MB)`);
