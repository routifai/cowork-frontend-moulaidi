import MDEditor from "@uiw/react-md-editor";
import "@uiw/react-md-editor/markdown-editor.css";
import { invoke } from "@tauri-apps/api/core";
import { ChevronDown, ChevronRight, Trash } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type ThemeMode, getThemeMode } from "../../lib/themes";

interface MemoryEntry {
	topic: string;
	summary: string;
	type?: "project" | "preference" | "decision";
	updatedAt: string;
}

/**
 * Project memory editor.
 *
 * Shows the always-loaded MEMORY.md index and allows per-topic edits in the
 * notes/ directory. Topics can be deleted from the index and from disk.
 */
export function MemorySettings() {
	const [entries, setEntries] = useState<MemoryEntry[]>([]);
	const [indexContent, setIndexContent] = useState("");
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);
	const [expandedTopic, setExpandedTopic] = useState<string | null>(null);
	const [notes, setNotes] = useState<Record<string, string>>({});
	const [colorMode, setColorMode] = useState<ThemeMode>(() => getThemeMode());
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		let cancelled = false;
		loadAll().finally(() => {
			if (!cancelled) setLoading(false);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		const sync = () => setColorMode(getThemeMode());
		const observer = new MutationObserver(sync);
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["data-theme"],
		});
		return () => observer.disconnect();
	}, []);

	useEffect(
		() => () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		},
		[],
	);

	async function loadAll() {
		try {
			const indexResp = await invoke<{ entries: MemoryEntry[] }>("get_memory_index");
			const loadedEntries = Array.isArray(indexResp?.entries) ? indexResp.entries : [];
			setEntries(loadedEntries);

			const noteContents: Record<string, string> = {};
			for (const entry of loadedEntries) {
				try {
					const noteResp = await invoke<{ content: string | null }>("get_memory_note", {
						topic: entry.topic,
					});
					noteContents[entry.topic] = noteResp?.content ?? "";
				} catch {
					noteContents[entry.topic] = "";
				}
			}
			setNotes(noteContents);

			// Best-effort reconstructed index for the editor.
			setIndexContent(rebuildIndexMd(loadedEntries));
		} catch {
			setEntries([]);
			setIndexContent("# Project memory\n\nNo memories recorded yet.");
		}
	}

	function rebuildIndexMd(items: MemoryEntry[]): string {
		if (items.length === 0) return "# Project memory\n\nNo memories recorded yet.";
		const lines = ["# Project memory", ""];
		for (const item of items) {
			const prefix = item.type ? `[${item.type}] ` : "";
			lines.push(`- **${item.topic}** — ${prefix}${item.summary}`);
		}
		lines.push("");
		return lines.join("\n");
	}

	async function handleSaveTopic(topic: string) {
		setSaving(true);
		try {
			const entry = entries.find((e) => e.topic === topic);
			if (!entry) return;
			await invoke("save_memory_note", {
				topic,
				summary: entry.summary,
				memoryType: entry.type,
				noteContent: notes[topic] ?? "",
			});
			setSaved(true);
			if (timerRef.current) clearTimeout(timerRef.current);
			timerRef.current = setTimeout(() => setSaved(false), 2000);
		} catch {
			// ignore
		} finally {
			setSaving(false);
		}
	}

	async function handleDelete(topic: string) {
		try {
			await invoke("delete_memory_topic", { topic });
			const next = entries.filter((e) => e.topic !== topic);
			setEntries(next);
			setIndexContent(rebuildIndexMd(next));
			const { [topic]: _, ...rest } = notes;
			setNotes(rest);
		} catch {
			// ignore
		}
	}

	return (
		<section className="flex flex-col flex-1 min-h-0 h-full">
			<h2 className="text-sm font-semibold text-foreground mb-1 shrink-0">Project Memory</h2>
			<p className="text-xs text-muted-foreground mb-5 shrink-0">
				Facts the agent remembers across sessions for this workspace. Edit the index below or expand
				a topic to edit its detail note.
			</p>

			<div
				data-color-mode={colorMode}
				className="glass overflow-hidden cwk-md-fill flex-1 min-h-0 mb-4"
			>
				<MDEditor
					value={indexContent}
					preview="edit"
					visibleDragbar={false}
					textareaProps={{
						disabled: loading,
						"aria-label": "Project memory index",
						readOnly: true,
					}}
				/>
			</div>

			<div className="flex-1 min-h-0 overflow-auto pr-1 space-y-2">
				{entries.map((entry) => {
					const expanded = expandedTopic === entry.topic;
					return (
						<div key={entry.topic} className="rounded-lg border border-border/50 bg-muted/30">
							<button
								type="button"
								onClick={() => setExpandedTopic(expanded ? null : entry.topic)}
								className="flex items-center justify-between w-full px-3 py-2 text-left"
							>
								<span className="text-xs font-medium flex items-center gap-2">
									{entry.type && (
										<span className="text-[10px] uppercase tracking-wide text-muted-foreground">
											{entry.type}
										</span>
									)}
									<span className="truncate max-w-[220px]">{entry.topic}</span>
									<span className="text-muted-foreground font-normal truncate max-w-[200px]">
										{entry.summary}
									</span>
								</span>
								<span className="flex items-center gap-1">
									{expanded ? (
										<ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
									) : (
										<ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
									)}
									<button
										type="button"
										onClick={(e) => {
											e.stopPropagation();
											handleDelete(entry.topic);
										}}
										title="Delete topic"
										className="p-1 rounded hover:bg-destructive/10 hover:text-destructive"
									>
										<Trash className="w-3.5 h-3.5" />
									</button>
								</span>
							</button>
							{expanded && (
								<div className="px-3 pb-3">
									<div data-color-mode={colorMode} className="glass overflow-hidden cwk-md-fill">
										<MDEditor
											value={notes[entry.topic] ?? ""}
											onChange={(value) =>
												setNotes((prev) => ({ ...prev, [entry.topic]: value ?? "" }))
											}
											preview="edit"
											visibleDragbar={false}
											textareaProps={{
												"aria-label": `${entry.topic} detail note`,
											}}
										/>
									</div>
									<div className="flex items-center justify-end gap-3 mt-2">
										{saving && <span className="text-xs text-muted-foreground">Saving…</span>}
										{saved && <span className="text-xs text-primary font-medium">Saved!</span>}
										<button
											type="button"
											onClick={() => handleSaveTopic(entry.topic)}
											disabled={saving}
											className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:brightness-110 disabled:opacity-50"
										>
											Save note
										</button>
									</div>
								</div>
							)}
						</div>
					);
				})}
			</div>
		</section>
	);
}
