import type { ToolCallInfo } from "@/types";
import { BrainCircuit } from "lucide-react";

/**
 * Inline, clickable pill for memories saved during this turn.
 * Clicking opens Settings → Memory ( handled by caller ).
 */
export function MemoryChips({
	toolCalls,
	onOpen,
}: {
	toolCalls?: ToolCallInfo[];
	onOpen: () => void;
}) {
	const memories = collectSaveMemoryCalls(toolCalls);
	if (memories.length === 0) return null;

	return (
		<div className="flex flex-wrap items-center gap-1.5 my-1">
			{memories.map(({ topic, summary }) => (
				<button
					key={topic}
					type="button"
					onClick={onOpen}
					title={`Open "${topic}" in Settings → Memory`}
					className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] text-muted-foreground bg-muted/50 hover:bg-muted hover:text-foreground transition-colors"
				>
					<BrainCircuit className="w-3 h-3 shrink-0" />
					<span className="max-w-[180px] truncate">{summary}</span>
				</button>
			))}
		</div>
	);
}

function collectSaveMemoryCalls(toolCalls?: ToolCallInfo[]): { topic: string; summary: string }[] {
	if (!toolCalls || toolCalls.length === 0) return [];
	const byTopic = new Map<string, { topic: string; summary: string }>();
	for (const tc of toolCalls) {
		if (tc.name !== "save_memory") continue;
		const topic = typeof tc.args.topic === "string" ? tc.args.topic : "";
		if (!topic) continue;
		const summary = typeof tc.args.summary === "string" ? tc.args.summary : topic;
		byTopic.set(topic, { topic, summary });
	}
	return Array.from(byTopic.values());
}
