// Copies each real Presenting Engine template's thumbnail.png into
// public/presenting-templates/<id>.png so PresentingPanel can show the
// actual template preview instead of a made-up gradient swatch.
//
// The set of ids here MUST match the Presenting Engine's
// presenting/engine/templates/ directory names exactly — those are the
// literal `template` values sent to `presenting_start_generation` (see
// src/presenting/PresentingPanel.tsx's PRESET_TEMPLATES).

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const backendDir = resolve(process.env.HYPATIA_BACKEND_PATH ?? join(root, "..", "hypatia-backend"));
const templatesDir = join(backendDir, "presenting", "engine", "templates");
const outDir = join(root, "public", "presenting-templates");

const TEMPLATE_IDS = ["general", "modern", "standard", "executive", "editorial", "momentum", "dynamic", "swift"];

if (!existsSync(templatesDir)) {
	console.warn(`[sync-presenting-template-thumbnails] templates dir not found at ${templatesDir} — skipping.`);
	process.exit(0);
}

mkdirSync(outDir, { recursive: true });

let copied = 0;
for (const id of TEMPLATE_IDS) {
	const src = join(templatesDir, id, "static", "thumbnail.png");
	if (!existsSync(src)) {
		console.warn(`[sync-presenting-template-thumbnails] missing thumbnail for "${id}" at ${src}`);
		continue;
	}
	copyFileSync(src, join(outDir, `${id}.png`));
	copied++;
}

console.log(`[sync-presenting-template-thumbnails] copied ${copied}/${TEMPLATE_IDS.length} thumbnails`);
