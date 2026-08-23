// Copies the Phosphor icon SVG library and icon metadata (icons.json,
// icons-vectorstore.json) from the upstream Presenton source checkout into
// hypatia-backend/presenting/engine/ so the TypeScript icon-finder-service
// can serve icon search requests.
//
// Source:  presenton/servers/fastapi/static/icons/  (SVGs)
//          presenton/servers/fastapi/assets/        (icons.json, icons-vectorstore.json)
// Dest:    hypatia-backend/presenting/engine/static/icons/
//          hypatia-backend/presenting/engine/assets/
//
// The weight subdirectories in static/icons/ are: bold, duotone, fill, light, regular, thin.
// Each contains ~1512 Phosphor SVG files.

import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const presenton = resolve(process.env.PRESENTON_PATH ?? join(root, "..", "presenton"));
const backendDir = resolve(process.env.HYPATIA_BACKEND_PATH ?? join(root, "..", "hypatia-backend"));

const srcIconsDir = join(presenton, "servers", "fastapi", "static", "icons");
const srcAssetsDir = join(presenton, "servers", "fastapi", "assets");
const srcImagesDir = join(presenton, "servers", "fastapi", "static", "images");

const destEngineDir = join(backendDir, "presenting", "engine");
const destIconsDir = join(destEngineDir, "static", "icons");
const destAssetsDir = join(destEngineDir, "assets");
const destImagesDir = join(destEngineDir, "static", "images");

function copyDir(src, dest, filter) {
	if (!existsSync(src)) {
		console.warn(`  skip: ${src} not found`);
		return 0;
	}
	mkdirSync(dest, { recursive: true });
	let count = 0;
	for (const entry of readdirSync(src)) {
		if (filter && !filter(entry)) continue;
		const srcPath = join(src, entry);
		const destPath = join(dest, entry);
		const stat = statSync(srcPath);
		if (stat.isDirectory()) {
			count += copyDir(srcPath, destPath, filter);
		} else {
			copyFileSync(srcPath, destPath);
			count++;
		}
	}
	return count;
}

if (!existsSync(srcIconsDir)) {
	console.warn(
		`[sync-presenting-icons] Presenton icons dir not found at ${srcIconsDir}\n` +
			`  Set PRESENTON_PATH env var to your presenton checkout root, or clone it to ${presenton}`,
	);
	process.exit(0);
}

// Copy icon SVGs (all weight subdirectories)
console.log("[sync-presenting-icons] Syncing icon SVGs…");
const iconDirs = readdirSync(srcIconsDir).filter((d) => statSync(join(srcIconsDir, d)).isDirectory());
let totalSvgs = 0;
for (const dir of iconDirs) {
	const n = copyDir(join(srcIconsDir, dir), join(destIconsDir, dir), (f) => f.endsWith(".svg"));
	console.log(`  ${dir}: ${n} SVGs`);
	totalSvgs += n;
}
// Copy placeholder.svg at root of icons/ if present
const placeholderSvg = join(srcIconsDir, "placeholder.svg");
if (existsSync(placeholderSvg)) {
	mkdirSync(destIconsDir, { recursive: true });
	copyFileSync(placeholderSvg, join(destIconsDir, "placeholder.svg"));
	totalSvgs++;
}
console.log(`  Total: ${totalSvgs} files`);

// Copy icons.json and icons-vectorstore.json
console.log("[sync-presenting-icons] Syncing icon metadata…");
mkdirSync(destAssetsDir, { recursive: true });
for (const file of ["icons.json", "icons-vectorstore.json"]) {
	const src = join(srcAssetsDir, file);
	const dest = join(destAssetsDir, file);
	if (existsSync(src)) {
		copyFileSync(src, dest);
		console.log(`  ${file} → ${dest}`);
	} else {
		console.warn(`  skip: ${src} not found`);
	}
}

// Copy placeholder images
console.log("[sync-presenting-icons] Syncing placeholder images…");
mkdirSync(destImagesDir, { recursive: true });
for (const file of ["placeholder.jpg", "replaceable_template_image.png"]) {
	const src = join(srcImagesDir, file);
	const dest = join(destImagesDir, file);
	if (existsSync(src)) {
		copyFileSync(src, dest);
		console.log(`  ${file} → ${dest}`);
	} else {
		console.warn(`  skip: ${src} not found`);
	}
}

console.log("[sync-presenting-icons] Done.");
