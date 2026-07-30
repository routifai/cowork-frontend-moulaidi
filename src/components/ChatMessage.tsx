import { rehypeHighlightTerm } from "@/lib/rehypeHighlightTerm";
import { trackEvent } from "@/lib/telemetry";
import type { ChatMessage as ChatMessageType, ModelInfo } from "@/types";
import { invoke } from "@tauri-apps/api/core";
import { Clipboard, Download, FolderOpen } from "lucide-react";
import { useCallback, useState } from "react";
import ReactMarkdown, { type Options as ReactMarkdownOptions } from "react-markdown";
import remarkGfm from "remark-gfm";
import { ActivityBlock, ActivityRecap } from "./ActivityBlock";
import { ArtifactChips } from "./ArtifactChips";
import { FeedbackButtons } from "./FeedbackButtons";
import { markdownComponents } from "./MarkdownComponents";
import { MemoryChips } from "./MemoryChip";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolCallSummary, ToolCallTimeline } from "./ToolCallTimeline";

interface ChatMessageProps {
	message: ChatMessageType;
	detailsExpanded?: boolean;
	/** Model catalog, used to show a friendly model name instead of raw id. */
	models?: ModelInfo[];
	/** Active in-thread find term; highlights matches in this message's content. */
	findTerm?: string;
	/** Index (within THIS message) of the occurrence to mark active, if any. */
	activeFindIndex?: number;
	/** Opens the playground panel on a specific artifact id — wired from a
	 * show_artifact chip below, regardless of which activity view is showing. */
	onOpenArtifact?: (id: string) => void;
	/** Opens Settings → Memory — wired from a save_memory chip below. */
	onOpenSettings?: () => void;
}

/**
 * Friendly label for the model that produced a message. Prefer the catalog's
 * display name (e.g. "Claude Sonnet 4") so it matches the model selector; fall
 * back to the raw `provider/id` when the model isn't in the catalog.
 */
function modelLabel(message: ChatMessageType, models?: ModelInfo[]): string {
	// Match on provider+id: ids are not unique across providers, so matching by
	// id alone could show the wrong provider's display name.
	const match = models?.find((m) => m.id === message.model && m.provider === message.provider);
	if (match) return match.name;
	return message.provider ? `${message.provider}/${message.model}` : (message.model ?? "");
}

function extractFilePath(content: string): string | null {
	const match = content.match(
		/(?:Written|Created|Wrote)\s+(?:\d+\s+lines\s+)?(?:to\s+)?(.+?)(?:\s+\(|$)/m,
	);
	return match?.[1]?.trim() ?? null;
}

export function ChatMessageItem({
	message,
	detailsExpanded,
	models,
	findTerm,
	activeFindIndex,
	onOpenArtifact,
	onOpenSettings,
}: ChatMessageProps) {
	const [copied, setCopied] = useState(false);
	const [saving, setSaving] = useState(false);
	const isUser = message.role === "user";
	const isSystem = message.role === "system";

	const filePath = !isUser && message.content ? extractFilePath(message.content) : null;

	const copyToClipboard = useCallback(async (text: string) => {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
			trackEvent("export_action", { type: "copy" });
		} catch {
			// fallback
		}
	}, []);

	const saveToFile = useCallback(async (content: string) => {
		try {
			const { save } = await import("@tauri-apps/plugin-dialog");
			const path = await save({
				defaultPath: "hypatia-export.md",
				filters: [
					{
						name: "Markdown",
						extensions: ["md", "mdx", "txt"],
					},
					{
						name: "All files",
						extensions: ["*"],
					},
				],
			});
			if (!path) return;
			setSaving(true);
			await invoke("write_user_file", { path, content });
			trackEvent("export_action", { type: "save" });
		} catch {
			// ignore
		} finally {
			setSaving(false);
		}
	}, []);

	const openFolder = useCallback(async (path: string) => {
		try {
			// Get parent directory
			const parentDir = path.substring(0, path.lastIndexOf("/"));
			if (parentDir) {
				await invoke("open_url", { url: `file://${parentDir}` });
				trackEvent("export_action", { type: "open_folder" });
			}
		} catch {
			// ignore
		}
	}, []);

	if (isSystem) {
		return (
			<div className="flex justify-center py-2">
				<span className="px-3 py-1 rounded-full text-xs bg-chat-system-bg text-chat-system-fg">
					{message.content}
				</span>
			</div>
		);
	}

	const rehypePlugins: ReactMarkdownOptions["rehypePlugins"] = findTerm
		? [[rehypeHighlightTerm, { term: findTerm, activeIndex: activeFindIndex }]]
		: undefined;

	const timeLabel = new Date(message.timestamp).toLocaleTimeString([], {
		hour: "numeric",
		minute: "2-digit",
	});

	// ── V3 user turn: right-aligned frosted-glass panel under a mono label ──
	if (isUser) {
		return (
			<div className="group px-4 py-2 animate-fade-in" data-message-id={message.id}>
				<div
					className="mx-auto flex w-full flex-col items-end"
					style={{ maxWidth: "var(--chat-max-width, 820px)" }}
				>
					<div className="mb-2 flex items-center gap-2 pr-1 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
						{(message.kind === "queued-steer" || message.kind === "queued-follow-up") && (
							<span className="text-status-active-fg">
								{message.kind === "queued-steer" ? "Steering" : "Follow-up"}
							</span>
						)}
						<span>You · {timeLabel}</span>
					</div>
					<div className="chat-bubble chat-bubble-user max-w-xl px-6 py-4">
						<div className="chat-markdown" style={{ color: "hsl(var(--chat-user-fg))" }}>
							<ReactMarkdown
								remarkPlugins={[remarkGfm]}
								rehypePlugins={rehypePlugins}
								components={markdownComponents}
							>
								{message.content || ""}
							</ReactMarkdown>
						</div>
					</div>
				</div>
			</div>
		);
	}

	// ── V3 assistant turn: plain typographic prose, avatar-slot echo + mono
	//    label row (reference: chat-v3.html) ──
	return (
		<div className="group px-4 py-2 animate-fade-in" data-message-id={message.id}>
			<div className="mx-auto w-full" style={{ maxWidth: "var(--chat-max-width, 820px)" }}>
				{/* Label row */}
				<div className="mb-2 flex items-center gap-3">
					{/* Avatar echo: hairline ring where the Pulse docks while streaming */}
					<span
						className="h-7 w-7 shrink-0 rounded-full border"
						style={{ borderColor: "hsl(var(--border))" }}
						aria-hidden="true"
					/>
					<span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
						Hypatia · {timeLabel}
					</span>
					{message.model && (
						<span className="rounded bg-muted/60 px-1.5 py-0 font-mono text-[10px] text-muted-foreground/60">
							{modelLabel(message, models)}
						</span>
					)}
					{message.isStreaming && (
						<span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.2em] text-status-active-fg">
							<span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-primary" />
							streaming
						</span>
					)}
					{message.toolCalls && message.toolCalls.length > 0 && !message.isStreaming && (
						<ToolCallSummary toolCalls={message.toolCalls} />
					)}
				</div>

				{/* Content column, indented past the avatar slot */}
				<div className="min-w-0 pl-10">
					{/* Thinking block — simple (Perplexity-style) by default, full when
				    details are expanded via Ctrl+O. */}
					{!isUser && message.thinking && (
						<ThinkingBlock
							thinking={message.thinking}
							isThinking={message.isStreaming && message.thinking.length > 0}
							expanded={detailsExpanded}
							simple={!detailsExpanded}
						/>
					)}

					{/* Activity / tool calls.
				    - details view (Ctrl+O): full technical ToolCallTimeline
				    - simple + streaming: single friendly ActivityBlock
				    - simple + finished: compact one-line recap */}
					{!isUser &&
						message.toolCalls &&
						message.toolCalls.length > 0 &&
						(detailsExpanded ? (
							<ToolCallTimeline
								toolCalls={message.toolCalls}
								detailsExpanded={detailsExpanded}
								onOpenArtifact={onOpenArtifact}
							/>
						) : message.isStreaming ? (
							<ActivityBlock toolCalls={message.toolCalls} active />
						) : (
							<ActivityRecap toolCalls={message.toolCalls} />
						))}

					{/* Artifact chips — shown in every view mode above (streaming,
					    recap, expanded) so a show_artifact call is always reachable
					    from the transcript, not just behind Ctrl+O. */}
					{!isUser && onOpenArtifact && (
						<ArtifactChips toolCalls={message.toolCalls} onOpen={onOpenArtifact} />
					)}
					{!isUser && onOpenSettings && (
						<MemoryChips toolCalls={message.toolCalls} onOpen={onOpenSettings} />
					)}

					{/* Content */}
					{(message.content || message.isStreaming) && (
						<div
							className="chat-markdown"
							style={{
								color: isUser ? "hsl(var(--chat-user-fg))" : "hsl(var(--chat-assistant-fg))",
							}}
						>
							<ReactMarkdown
								remarkPlugins={[remarkGfm]}
								rehypePlugins={rehypePlugins}
								components={markdownComponents}
							>
								{message.content || ""}
							</ReactMarkdown>
							{message.isStreaming && (
								<span className="inline-block w-2 h-4 ml-0.5 align-middle animate-pulse bg-primary" />
							)}
						</div>
					)}

					{/* Feedback & Export Actions */}
					{!isUser && message.content && !message.isStreaming && (
						<div className="flex items-center justify-between mt-1.5">
							<FeedbackButtons />
							<div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
								<button
									type="button"
									onClick={() => copyToClipboard(message.content)}
									aria-label="Copy content"
									className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
								>
									<Clipboard size={12} />
									{copied ? "Copied!" : "Copy"}
								</button>
								<button
									type="button"
									onClick={() => saveToFile(message.content)}
									disabled={saving}
									aria-label="Save to file"
									className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-50"
								>
									<Download size={12} />
									{saving ? "Saving..." : "Save"}
								</button>
								{filePath && (
									<button
										type="button"
										onClick={() => openFolder(filePath)}
										aria-label="Open folder"
										className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
									>
										<FolderOpen size={12} />
										Open Folder
									</button>
								)}
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
