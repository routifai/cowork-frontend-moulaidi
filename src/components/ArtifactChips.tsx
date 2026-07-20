import { TYPE_ICONS } from "@/playground/PlaygroundPanel";
import type { ToolCallInfo } from "@/types";
import { FileText } from "lucide-react";

/**
 * Inline, clickable references to whatever this turn showed in the
 * playground — rendered in every chat view mode (streaming/recap/expanded),
 * not just behind Ctrl+O, so a closed panel or a reopened past session still
 * gives the user something to click back into.
 */
export function ArtifactChips({
	toolCalls,
	onOpen,
}: {
	toolCalls?: ToolCallInfo[];
	onOpen: (id: string) => void;
}) {
	const artifacts = collectShowArtifactCalls(toolCalls);
	if (artifacts.length === 0) return null;

	return (
		<div className="flex flex-wrap items-center gap-1.5 my-1">
			{artifacts.map(({ id, title, type }) => {
				const Icon = TYPE_ICONS[type] ?? FileText;
				return (
					<button
						key={id}
						type="button"
						onClick={() => onOpen(id)}
						title={`View "${title}" in the playground`}
						className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] text-muted-foreground bg-muted/50 hover:bg-muted hover:text-foreground transition-colors"
					>
						<Icon className="w-3 h-3 shrink-0" />
						<span className="max-w-[180px] truncate">{title}</span>
					</button>
				);
			})}
		</div>
	);
}

/** Later `show_artifact` calls with the same id win — mirrors the backend's
 * reconstructShowArtifacts rule, so a turn that updated one id twice shows
 * one chip, not two. */
function collectShowArtifactCalls(
	toolCalls?: ToolCallInfo[],
): { id: string; title: string; type: string }[] {
	if (!toolCalls || toolCalls.length === 0) return [];
	const byId = new Map<string, { id: string; title: string; type: string }>();
	for (const tc of toolCalls) {
		if (tc.name !== "show_artifact") continue;
		const id = tc.args.id;
		if (typeof id !== "string" || !id) continue;
		const title = typeof tc.args.title === "string" ? tc.args.title : id;
		const type = typeof tc.args.type === "string" ? tc.args.type : "";
		byId.set(id, { id, title, type });
	}
	return Array.from(byId.values());
}
