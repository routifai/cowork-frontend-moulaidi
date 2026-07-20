import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { PlaygroundArtifact } from "@/types/playground";
import {
	Code2,
	Eye,
	FileDiff,
	FileText,
	Globe,
	Image as ImageIcon,
	PanelRight,
	X,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { CodeView } from "./renderers/CodeView";
import { DiffView, UnrecognizedArtifact } from "./renderers/DiffView";
import { HtmlView } from "./renderers/HtmlView";
import { ImageView } from "./renderers/ImageView";
import { MarkdownView } from "./renderers/MarkdownView";

const RENDERERS: Record<string, (props: { artifact: PlaygroundArtifact }) => React.JSX.Element> = {
	html: HtmlView,
	markdown: MarkdownView,
	code: CodeView,
	diff: DiffView,
	image: ImageView,
};

export const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
	html: Globe,
	markdown: FileText,
	code: Code2,
	diff: FileDiff,
	image: ImageIcon,
};

/** Types with a genuine rendered-vs-raw distinction worth a toggle for.
 * "code"/"diff" are already raw text — nothing to toggle. */
const TOGGLABLE_TYPES = new Set(["html", "markdown", "image"]);

const DEFAULT_WIDTH = 420;
const MIN_WIDTH = 320;
const MAX_WIDTH = 800;

interface PlaygroundPanelProps {
	artifacts: Record<string, PlaygroundArtifact>;
	onClose: () => void;
	/** Which artifact tab is active. Null means "auto-follow the most
	 * recently updated artifact." Controlled by the parent so that a click
	 * on an artifact's chip in the chat transcript (elsewhere in the tree)
	 * can select it here, even if the panel is currently closed. */
	selectedId: string | null;
	onSelectId: (id: string) => void;
}

/**
 * Playground panel — renders what the agent deliberately shows via the
 * show_artifact tool (html/markdown/code/diff/image) as persistent,
 * updatable tabs keyed by artifact id, instead of inline chat bubbles.
 * Read-only. Resizable (drag the left edge) and has a Code/Preview toggle
 * for renderable types.
 */
export function PlaygroundPanel({
	artifacts,
	onClose,
	selectedId,
	onSelectId,
}: PlaygroundPanelProps) {
	const [viewMode, setViewMode] = useState<"preview" | "code">("preview");
	const [width, setWidth] = useState(DEFAULT_WIDTH);

	const sorted = useMemo(
		() => Object.values(artifacts).sort((a, b) => b.updatedAt - a.updatedAt),
		[artifacts],
	);

	const resize = useResizeHandle(width, setWidth);

	if (sorted.length === 0) return null;

	const activeId = selectedId && artifacts[selectedId] ? selectedId : sorted[0].id;
	const active = artifacts[activeId];
	const canToggle = TOGGLABLE_TYPES.has(active.type);
	const Renderer =
		canToggle && viewMode === "code" ? CodeView : (RENDERERS[active.type] ?? UnrecognizedArtifact);

	return (
		<div
			className="relative flex flex-col min-w-0 border-l bg-card border-border shrink-0"
			style={{ width }}
		>
			{/* Drag handle — left edge, resizes between MIN_WIDTH and MAX_WIDTH.
			    Pointer Capture (see useResizeHandle) keeps the drag tracking even
			    when the cursor crosses an <iframe> preview. */}
			<button
				type="button"
				aria-label="Resize playground panel"
				className="absolute left-0 top-0 bottom-0 w-1.5 -ml-0.5 cursor-col-resize z-10 hover:bg-primary/30 transition-colors touch-none"
				onPointerDown={resize.onPointerDown}
				onPointerMove={resize.onPointerMove}
				onPointerUp={resize.onPointerUp}
			/>
			<div className="flex items-center justify-between px-2 pt-2">
				<ScrollArea className="flex-1 min-w-0">
					<div className="flex items-center gap-1 pb-2">
						{sorted.map((artifact) => (
							<Tab
								key={artifact.id}
								artifact={artifact}
								active={artifact.id === activeId}
								onSelect={() => onSelectId(artifact.id)}
							/>
						))}
					</div>
				</ScrollArea>
				<div className="flex items-center gap-1 shrink-0 ml-1">
					{canToggle && (
						<button
							type="button"
							onClick={() => setViewMode((m) => (m === "preview" ? "code" : "preview"))}
							title={viewMode === "preview" ? "View code" : "View preview"}
							aria-label={viewMode === "preview" ? "View code" : "View preview"}
							className="flex items-center gap-1 px-1.5 py-1 rounded transition-colors hover:bg-accent text-muted-foreground text-[11px]"
						>
							{viewMode === "preview" ? (
								<Code2 className="w-3.5 h-3.5" />
							) : (
								<Eye className="w-3.5 h-3.5" />
							)}
						</button>
					)}
					<button
						type="button"
						onClick={onClose}
						className="p-1 rounded transition-colors hover:bg-accent text-muted-foreground"
						aria-label="Close playground panel"
					>
						<X className="w-4 h-4" />
					</button>
				</div>
			</div>
			<ScrollArea
				className="flex-1 min-h-0 border-t border-border"
				data-testid="playground-content"
			>
				<Renderer artifact={active} />
			</ScrollArea>
		</div>
	);
}

/**
 * Pointer-drag resize: moving left grows the panel (it's docked to the
 * right edge), moving right shrinks it. Clamped to [MIN_WIDTH, MAX_WIDTH].
 *
 * Uses Pointer Capture (setPointerCapture on the handle itself) rather than
 * window-level listeners. This matters specifically because the panel can
 * render an <iframe> (HtmlView) — an iframe is a separate browsing context,
 * so pointermove events firing while the cursor is physically over it never
 * reach a `window`-level listener in the parent document at all, which made
 * dragging feel like it randomly "got stuck" whenever the cursor crossed
 * into the iframe. Pointer capture redirects every subsequent pointer event
 * to the capturing element regardless of what's under the cursor, so the
 * drag keeps tracking correctly even over an iframe.
 */
function useResizeHandle(width: number, setWidth: (w: number) => void) {
	const dragState = useRef<{ startX: number; startWidth: number } | null>(null);

	const onPointerDown = useCallback(
		(e: React.PointerEvent<HTMLButtonElement>) => {
			dragState.current = { startX: e.clientX, startWidth: width };
			// Not implemented in jsdom (test environment) and unavailable on some
			// older WebViews — the drag still works without it, just loses the
			// iframe-crossing fix, so degrade gracefully rather than throw.
			e.currentTarget.setPointerCapture?.(e.pointerId);
		},
		[width],
	);

	const onPointerMove = useCallback(
		(e: React.PointerEvent<HTMLButtonElement>) => {
			if (!dragState.current) return;
			const deltaX = dragState.current.startX - e.clientX;
			const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragState.current.startWidth + deltaX));
			setWidth(next);
		},
		[setWidth],
	);

	const onPointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
		dragState.current = null;
		e.currentTarget.releasePointerCapture?.(e.pointerId);
	}, []);

	return { onPointerDown, onPointerMove, onPointerUp };
}

function Tab({
	artifact,
	active,
	onSelect,
}: {
	artifact: PlaygroundArtifact;
	active: boolean;
	onSelect: () => void;
}) {
	const Icon = TYPE_ICONS[artifact.type] ?? FileText;
	return (
		<button
			type="button"
			onClick={onSelect}
			title={artifact.title}
			className={cn(
				"flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md whitespace-nowrap transition-colors shrink-0",
				active
					? "bg-muted text-foreground"
					: "text-muted-foreground hover:text-foreground hover:bg-muted/50",
			)}
		>
			<Icon className="w-3.5 h-3.5 shrink-0" />
			<span className="max-w-[140px] truncate">{artifact.title}</span>
		</button>
	);
}

/**
 * Slim collapsed strip shown in place of the full panel once the user closes
 * it, as long as artifacts still exist — the only way back in otherwise
 * would be waiting for the next show_artifact call.
 */
export function PlaygroundReopenTab({
	artifacts,
	onOpen,
}: {
	artifacts: Record<string, PlaygroundArtifact>;
	onOpen: () => void;
}) {
	const count = Object.keys(artifacts).length;
	if (count === 0) return null;

	return (
		<button
			type="button"
			onClick={onOpen}
			title="Show playground"
			aria-label="Show playground"
			className="flex flex-col items-center gap-1 w-8 py-3 border-l bg-card border-border shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
		>
			<PanelRight className="w-4 h-4" />
			<span className="text-[10px] font-medium">{count}</span>
		</button>
	);
}
