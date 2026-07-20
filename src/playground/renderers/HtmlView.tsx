import type { PlaygroundArtifact } from "@/types/playground";

/** Rendered HTML/SVG page, sandboxed — no access to the app's own DOM/JS. */
export function HtmlView({ artifact }: { artifact: PlaygroundArtifact }) {
	return (
		<iframe
			srcDoc={artifact.content}
			title={artifact.title}
			sandbox="allow-scripts"
			className="w-full h-full border-0"
			style={{ minHeight: 300, background: "white" }}
		/>
	);
}
