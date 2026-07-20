export type ArtifactType = "html" | "svg" | "image" | "code" | "unknown";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico"]);

// Well-known filenames without a dot extension that should be treated as code
const KNOWN_CODE_FILES = new Set([
	"Dockerfile",
	"Makefile",
	"Gemfile",
	"Rakefile",
	"Justfile",
	"Procfile",
]);

/**
 * Extract file paths from a tool call result string.
 * - Matches "Written to <path>" and "Written N lines to <path>"
 * - Matches diff headers ("--- a/<path>" / "+++ b/<path>")
 */
export function extractFilePaths(result: string): string[] {
	const paths: string[] = [];

	// Match "Written to <path>" or "Written N lines to <path>"
	// Capture path up to optional parenthesized metadata
	const writtenRegex = /Written\s+(?:\d+\s+lines\s+)?to\s+(.+?)(?:\s+\(|$)/g;
	let writtenMatch: RegExpExecArray | null;
	// biome-ignore lint/suspicious/noAssignInExpressions: regex exec loop pattern
	while ((writtenMatch = writtenRegex.exec(result)) !== null) {
		const path = writtenMatch[1].trim();
		if (!paths.includes(path)) {
			paths.push(path);
		}
	}

	// Match diff headers: "--- a/<path>" and "+++ b/<path>"
	const diffRegex = /^(?:---\s+a\/|\+\+\+\s+b\/)(.+)$/gm;
	let diffMatch: RegExpExecArray | null;
	// biome-ignore lint/suspicious/noAssignInExpressions: regex exec loop pattern
	while ((diffMatch = diffRegex.exec(result)) !== null) {
		const path = diffMatch[1].trim();
		if (!paths.includes(path)) {
			paths.push(path);
		}
	}

	return paths;
}

/**
 * Detect the artifact type from a file path based on extension.
 */
export function detectArtifactType(filePath: string): ArtifactType {
	// Check known code filenames (no extension but still code)
	const filename = filePath.split("/").pop() || filePath;
	if (KNOWN_CODE_FILES.has(filename)) return "code";

	const parts = filePath.split(".");
	// If there's no dot in the filename, there's no extension
	if (parts.length <= 1) return "unknown";
	const ext = parts.pop()?.toLowerCase() || "";

	if (ext === "html" || ext === "htm") return "html";
	if (ext === "svg") return "svg";
	if (IMAGE_EXTENSIONS.has(ext)) return "image";
	if (ext) return "code";
	return "unknown";
}

/**
 * Encode SVG content as an `<img>`-safe data URI. Per spec, browsers never
 * execute embedded `<script>` tags or event-handler attributes for SVG
 * loaded via `<img>` — unlike raw `innerHTML`, which runs them in the
 * main-frame context. This is the standard, dependency-free way to render
 * untrusted SVG safely (see ArtifactPreview.tsx, which used to do
 * `innerHTML = svgContent` directly — a real XSS risk once SVG content
 * could come from an arbitrary pre-existing file, not just one the agent
 * just wrote).
 */
export function svgToImgSrc(svgContent: string): string {
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgContent)}`;
}

/**
 * Extract directory path from a file path for "Open folder" action.
 */
export function parentDir(filePath: string): string {
	// Normalize Windows backslashes to forward slashes for consistency
	const normalized = filePath.replace(/\\/g, "/");
	const lastSlash = normalized.lastIndexOf("/");
	if (lastSlash === -1) return normalized;
	return normalized.slice(0, lastSlash);
}
