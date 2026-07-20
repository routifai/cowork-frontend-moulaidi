// Playground artifact types — shape produced by the backend's show_artifact
// tool (hypatia-backend/src/extensions/show-artifact.ts). Mirrors that
// tool's TypeBox schema; there's no shared package across the stdio
// boundary, so these are two independent declarations of the same shape,
// same as every other command payload in this app.

export type PlaygroundArtifactType = "html" | "markdown" | "code" | "diff" | "image";

export interface PlaygroundArtifactPayload {
	id: string;
	type: PlaygroundArtifactType;
	title: string;
	content: string;
	language?: string;
}

export interface PlaygroundArtifact extends PlaygroundArtifactPayload {
	updatedAt: number;
}

const ARTIFACT_TYPES: readonly string[] = ["html", "markdown", "code", "diff", "image"];

export function isPlaygroundArtifactPayload(v: unknown): v is PlaygroundArtifactPayload {
	if (typeof v !== "object" || v === null) return false;
	const p = v as Record<string, unknown>;
	return (
		typeof p.id === "string" &&
		typeof p.title === "string" &&
		typeof p.content === "string" &&
		typeof p.type === "string" &&
		ARTIFACT_TYPES.includes(p.type)
	);
}
