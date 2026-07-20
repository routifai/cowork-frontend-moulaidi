import { SplitDiff } from "@/components/ToolCallTimeline";
import type { PlaygroundArtifact } from "@/types/playground";

export function DiffView({ artifact }: { artifact: PlaygroundArtifact }) {
	return (
		<div className="flex flex-col gap-2 p-3">
			<div className="text-xs font-mono opacity-60">{artifact.title}</div>
			{artifact.content ? (
				<SplitDiff diffText={artifact.content} />
			) : (
				<div className="text-xs opacity-50">No diff content.</div>
			)}
		</div>
	);
}

/** Fallback for an artifact whose `type` doesn't match any known renderer —
 * never silently disappears (e.g. if the frontend lags a backend deploy that
 * adds a new type). */
export function UnrecognizedArtifact({ artifact }: { artifact: PlaygroundArtifact }) {
	return (
		<div className="p-3">
			<div className="text-xs font-mono opacity-60 mb-2">
				{artifact.type} · {artifact.title}
			</div>
			<pre className="text-[11px] whitespace-pre-wrap opacity-80 font-mono">{artifact.content}</pre>
		</div>
	);
}
