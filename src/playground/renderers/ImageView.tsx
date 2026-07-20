import type { PlaygroundArtifact } from "@/types/playground";

/** v1 scope: data: URI content only. Absolute file-path support (reading
 * off disk + blob conversion) is a documented fast-follow, not required
 * for this redesign. */
export function ImageView({ artifact }: { artifact: PlaygroundArtifact }) {
	if (!artifact.content.startsWith("data:")) {
		return (
			<div className="p-3 text-xs opacity-60">
				File-path images aren't supported yet — pass a data: URI in content.
			</div>
		);
	}
	return (
		<div className="p-3 flex items-center justify-center bg-muted/30">
			<img
				src={artifact.content}
				alt={artifact.title}
				className="max-w-full max-h-[500px] object-contain rounded"
			/>
		</div>
	);
}
