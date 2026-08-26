import { open, save } from "@tauri-apps/plugin-dialog";
import {
	ArrowLeft,
	ArrowUp,
	ArrowUpRight,
	CheckCircle2,
	FileUp,
	Loader2,
	Plus,
	Presentation,
	Redo2,
	Sparkles,
	Undo2,
	X,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
	type PresentingDeck,
	type PresentingSlide,
	chatEdit,
	enginePing,
	exportPresentation,
	getPresentation,
	parseDocument,
	restoreSlide,
	startGeneration,
} from "./api/presentingApi";
import { ImportedTemplates } from "./components/ImportedTemplates";
import { ScaledSlideStage } from "./components/ScaledSlideStage";
import { SmartSlideRenderer } from "./components/SmartSlideRenderer";
import {
	TEMPLATE_V2_SURFACE_SELECTED_EVENT,
	type TemplateV2SurfaceSelectedDetail,
} from "./editor/events/events";
import { TemplateV2KonvaSlide } from "./editor/surface/TemplateV2KonvaSlide";
import { PresentingProvider } from "./state/PresentingProvider";

// Quick-prompt suggestions shown below the composer — matches presenton's
// editorQuickPrompts (presentation/components/chat/chat-prompts.tsx).
const QUICK_PROMPTS = [
	"Rewrite for executives",
	"Improve slide layout",
	"Add data & citations",
	"Create speaker notes",
	"Make the deck consistent",
];

/** Human-readable label for a Konva surface selection, e.g. "Title text" or "Image card". */
function selectionLabel(
	selection: NonNullable<TemplateV2SurfaceSelectedDetail["selection"]>,
): string {
	if (selection.kind === "multi-component") {
		return selection.targetLabel || selection.componentLabels?.join(", ") || "Multiple components";
	}
	return (
		selection.targetLabel ||
		selection.componentLabel ||
		selection.elementName ||
		selection.elementType ||
		selection.componentId ||
		"Selected element"
	);
}

// These ids MUST match presenting/engine/templates/ directory names exactly
// — they're sent verbatim as the `template` param to `presenting_start_generation`.
// Picking an id not present there fails with TemplateNotFoundError.
// Thumbnails come from each template's own static/thumbnail.png, synced into
// public/presenting-templates/ by scripts/sync-presenting-template-thumbnails.mjs.
const PRESET_TEMPLATES = [
	{ id: "general", name: "General" },
	{ id: "modern", name: "Modern" },
	{ id: "standard", name: "Standard" },
	{ id: "executive", name: "Executive" },
	{ id: "editorial", name: "Editorial" },
	{ id: "momentum", name: "Momentum" },
	{ id: "dynamic", name: "Dynamic" },
	{ id: "swift", name: "Swift" },
] as const;

type Stage =
	| "boot"
	| "entry"
	| "configure"
	| "parsing"
	| "generating"
	| "editor"
	| "exporting"
	| "error";

export interface PresentingPanelProps {
	provider?: string;
	model?: string;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function slideFingerprint(slide: PresentingSlide | undefined): string {
	if (!slide) return "";
	return `${slide.html_content ?? ""} ${JSON.stringify(slide.content ?? null)} ${JSON.stringify(slide.ui ?? null)}`;
}

/** Which slide indices actually changed between two decks of the same slide count — same-count edits only (v1 scope, mirrors presenton's own per-tool-call slide tracking but computed as a before/after diff instead of live tool tracing, since chatEdit here is a single blocking call). */
function diffSlideIndices(before: PresentingSlide[], after: PresentingSlide[]): number[] {
	const changed: number[] = [];
	const count = Math.min(before.length, after.length);
	for (let i = 0; i < count; i++) {
		if (slideFingerprint(before[i]) !== slideFingerprint(after[i])) changed.push(i);
	}
	return changed;
}

function MiniSlidePreview({ slide, presentationId }: { slide: PresentingSlide; presentationId: string }) {
	return (
		<div className="aspect-video w-full overflow-hidden rounded border border-border bg-white">
			<ScaledSlideStage>
				{slide.html_content ? (
					<SmartSlideRenderer html={slide.html_content} />
				) : slide.ui ? (
					<TemplateV2KonvaSlide
						layout={slide.ui as never}
						isEditMode={false}
						slideId={slide.id}
						presentationId={presentationId}
						slideIndex={slide.index}
						isSelected={false}
					/>
				) : (
					<div className="h-full w-full overflow-hidden p-2 text-[6px] leading-tight text-slate-700">
						{slideText(slide.content).slice(0, 180)}
					</div>
				)}
			</ScaledSlideStage>
		</div>
	);
}

function slideText(content: Record<string, unknown>): string {
	const values: string[] = [];
	const visit = (value: unknown) => {
		if (typeof value === "string") values.push(value);
		else if (Array.isArray(value)) value.forEach(visit);
		else if (value && typeof value === "object") Object.values(value).forEach(visit);
	};
	visit(content);
	return values.filter(Boolean).join("\n");
}

function PresentingPanelContent({ provider, model }: PresentingPanelProps) {
	const [stage, setStage] = useState<Stage>("boot");
	const [error, setError] = useState<string | null>(null);
	const [template, setTemplate] = useState("general");
	const [prompt, setPrompt] = useState("");
	const [slideCount, setSlideCount] = useState(8);
	const [documentText, setDocumentText] = useState<string | null>(null);
	const [documentName, setDocumentName] = useState<string | null>(null);
	const [deck, setDeck] = useState<PresentingDeck | null>(null);
	const [selectedSlide, setSelectedSlide] = useState(0);
	const [chatMessage, setChatMessage] = useState("");
	const [chatBusy, setChatBusy] = useState(false);
	const [exportPath, setExportPath] = useState<string | null>(null);
	const [selectedElement, setSelectedElement] = useState<{
		slideIndex: number;
		label: string;
	} | null>(null);
	const [historyCommand, setHistoryCommand] = useState<{
		action: "undo" | "redo";
		token: number;
	} | null>(null);
	const [historyAvailability, setHistoryAvailability] = useState({
		canUndo: false,
		canRedo: false,
	});
	const [lastReply, setLastReply] = useState<{ text: string; editsMade: boolean } | null>(null);
	const [editPreview, setEditPreview] = useState<{
		changedIndices: number[];
		before: PresentingSlide[];
		after: PresentingSlide[];
		selected: "original" | "modified";
	} | null>(null);
	const [previewBusy, setPreviewBusy] = useState(false);

	useEffect(() => {
		let active = true;
		enginePing()
			.then(() => {
				if (active) setStage("entry");
			})
			.catch((cause) => {
				if (!active) return;
				setError(`The presentation engine could not start: ${errorMessage(cause)}`);
				setStage("error");
			});
		return () => {
			active = false;
		};
	}, []);

	const selected = deck?.slides[selectedSlide] ?? null;
	const canGenerate = Boolean(prompt.trim() || documentText) && Boolean(provider && model);
	const [conversationId, setConversationId] = useState(() => crypto.randomUUID());

	// TemplateV2KonvaSlide dispatches this on every selection change inside
	// the editor canvas (component/element click, or deselect on empty-canvas
	// click) — reusing it to scope the next chat-edit request to whatever the
	// user has selected, same as presenton's chatHtmlSelection/
	// selectedTemplateV2Target flow (never wired into this panel before).
	useEffect(() => {
		const handler = (event: Event) => {
			const detail = (event as CustomEvent<TemplateV2SurfaceSelectedDetail>).detail;
			if (!detail?.selection) {
				setSelectedElement(null);
				return;
			}
			setSelectedElement({
				slideIndex: detail.slideIndex ?? selectedSlide,
				label: selectionLabel(detail.selection),
			});
		};
		window.addEventListener(TEMPLATE_V2_SURFACE_SELECTED_EVENT, handler);
		return () => window.removeEventListener(TEMPLATE_V2_SURFACE_SELECTED_EVENT, handler);
	}, [selectedSlide]);

	// A selection on one slide shouldn't silently scope an edit on another.
	// Undo/redo availability is per-slide history too — avoid a stale-enabled
	// button flash before TemplateV2KonvaSlide reports the new slide's state.
	useEffect(() => {
		setSelectedElement(null);
		setHistoryAvailability({ canUndo: false, canRedo: false });
	}, [selectedSlide]);

	const reset = () => {
		setError(null);
		setDeck(null);
		setPrompt("");
		setDocumentText(null);
		setDocumentName(null);
		setSelectedSlide(0);
		setExportPath(null);
		setStage("entry");
	};

	const chooseDocument = async () => {
		try {
			const path = await open({
				multiple: false,
				filters: [
					{ name: "Documents", extensions: ["pdf", "ppt", "pptx", "doc", "docx", "txt", "md"] },
				],
			});
			if (typeof path !== "string") return;
			setStage("parsing");
			const parsed = await parseDocument(path);
			setDocumentText(parsed.text);
			setDocumentName(parsed.name);
			setPrompt(`Create a presentation from ${parsed.name}`);
			setStage("configure");
		} catch (cause) {
			setError(`Could not parse that document: ${errorMessage(cause)}`);
			setStage("error");
		}
	};

	const generate = async () => {
		if (!provider || !model) {
			setError("Select an AI model in Cowork before generating a presentation.");
			return;
		}
		setError(null);
		setStage("generating");
		try {
			const generated = await startGeneration({
				content:
					prompt.trim() || `Create a presentation from ${documentName ?? "the uploaded document"}.`,
				template,
				provider,
				model,
				n_slides: slideCount,
				document_text: documentText ?? undefined,
				document_name: documentName ?? undefined,
				include_title_slide: true,
			});
			setDeck(generated);
			setSelectedSlide(0);
			setStage("editor");
		} catch (cause) {
			setError(`Generation failed: ${errorMessage(cause)}`);
			setStage("error");
		}
	};

	const sendChat = async () => {
		if (!deck || !provider || !model || !chatMessage.trim()) return;
		setChatBusy(true);
		setError(null);
		// Inline any active selection as context ahead of the user's message —
		// same text-injection approach presenton's Chat.tsx uses (no separate
		// wire-protocol field for "scope"; the backend only ever sees `message`).
		const contextLines: string[] = [`UI context: this edit applies to slide ${selectedSlide + 1}.`];
		if (selectedElement && selectedElement.slideIndex === selectedSlide) {
			contextLines.push(
				`The user selected "${selectedElement.label}" on this slide — edit that element/component specifically; preserve unrelated elements.`,
			);
		}
		const composedMessage = [...contextLines, `User message: ${chatMessage.trim()}`].join("\n");
		const beforeSlides = deck.slides;
		try {
			const result = await chatEdit({
				presentation_id: deck.presentation_id,
				conversation_id: conversationId,
				message: composedMessage,
				provider,
				model,
				presentation_type: deck.generation_mode,
			});
			// The model can reply with only text and zero tool calls — e.g.
			// explaining why it didn't make a change. Previously this result was
			// discarded entirely: the deck would silently reload unchanged and
			// the textbox would clear, with no way to tell "no-op" from "broken."
			setLastReply({ text: result.response, editsMade: result.tool_calls.length > 0 });
			const refreshed = await getPresentation(deck.presentation_id);
			setDeck(refreshed);
			// Snapshot-diff before/after to power the "keep original / keep edit"
			// comparison — chatEdit here is one blocking call (no per-tool-call
			// streaming to hook into like presenton's own live tool tracing), so
			// this reconstructs the same before/after picture from a single diff
			// once the whole turn is done, rather than progressively.
			const changedIndices = diffSlideIndices(beforeSlides, refreshed.slides);
			setEditPreview(
				changedIndices.length
					? { changedIndices, before: beforeSlides, after: refreshed.slides, selected: "modified" }
					: null,
			);
			setChatMessage("");
			setSelectedElement(null);
		} catch (cause) {
			setError(`Edit failed: ${errorMessage(cause)}`);
		} finally {
			setChatBusy(false);
		}
	};

	const chooseEditPreviewVersion = async (version: "original" | "modified") => {
		if (!deck || !editPreview || previewBusy) return;
		setEditPreview({ ...editPreview, selected: version });
		if (version === "modified") return; // already the live deck state
		setPreviewBusy(true);
		try {
			for (const index of editPreview.changedIndices) {
				const original = editPreview.before[index];
				if (!original) continue;
				await restoreSlide(deck.presentation_id, index, {
					htmlContent: original.html_content,
					content: original.content,
					ui: original.ui,
					speakerNote: original.speaker_note,
				});
			}
			setDeck(await getPresentation(deck.presentation_id));
		} catch (cause) {
			setError(`Could not restore the original slide(s): ${errorMessage(cause)}`);
		} finally {
			setPreviewBusy(false);
		}
	};

	const startNewChat = () => {
		setConversationId(crypto.randomUUID());
		setChatMessage("");
		setSelectedElement(null);
		setLastReply(null);
		setEditPreview(null);
	};

	const exportDeck = async () => {
		if (!deck) return;
		const path = await save({
			defaultPath: `${deck.title || "presentation"}.pptx`,
			filters: [{ name: "PowerPoint", extensions: ["pptx"] }],
		});
		if (!path) return;
		setStage("exporting");
		try {
			await exportPresentation({ presentation_id: deck.presentation_id, output_path: path });
			setExportPath(path);
			setStage("editor");
		} catch (cause) {
			setError(`Export failed: ${errorMessage(cause)}`);
			setStage("error");
		}
	};

	if (stage === "boot" || stage === "parsing" || stage === "generating" || stage === "exporting") {
		const label =
			stage === "boot"
				? "Starting presentation engine…"
				: stage === "parsing"
					? "Reading your document…"
					: stage === "generating"
						? "Building your presentation…"
						: "Exporting PowerPoint…";
		return (
			<div className="flex h-full items-center justify-center">
				<div className="text-center">
					<Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-muted-foreground" />
					<p className="text-sm font-medium">{label}</p>
					<p className="mt-1 text-xs text-muted-foreground">This may take a few minutes.</p>
				</div>
			</div>
		);
	}

	if (stage === "error") {
		return (
			<div className="flex h-full items-center justify-center p-8">
				<div className="max-w-lg rounded-2xl border border-destructive/25 bg-card p-6 text-center">
					<h2 className="text-lg font-semibold">PowerPoint Builder needs attention</h2>
					<p className="mt-2 text-sm text-muted-foreground">{error}</p>
					<button
						type="button"
						onClick={reset}
						className="mt-5 rounded-lg bg-foreground px-4 py-2 text-sm text-background"
					>
						Back to start
					</button>
				</div>
			</div>
		);
	}

	if (stage === "editor" && deck) {
		return (
			<section className="flex h-full min-h-0 flex-1 flex-col">
				<header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border px-5">
					<div className="flex min-w-0 items-center gap-3">
						<button
							type="button"
							onClick={reset}
							className="shrink-0 rounded-md p-1.5 hover:bg-muted"
							aria-label="Back"
						>
							<ArrowLeft className="h-4 w-4" />
						</button>
						<div className="min-w-0">
							<h1 className="truncate text-sm font-semibold">
								{deck.title || "Untitled presentation"}
							</h1>
							<p className="text-[11px] text-muted-foreground">{deck.slides.length} slides</p>
						</div>
					</div>
					<div className="flex shrink-0 items-center gap-2.5">
						<div className="flex h-[38px] items-center gap-2 rounded-full border border-border bg-muted/40 px-3.5">
							<button
								type="button"
								disabled={!historyAvailability.canUndo}
								onClick={() => setHistoryCommand({ action: "undo", token: Date.now() })}
								className="text-muted-foreground transition-colors hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
								aria-label="Undo"
								title="Undo"
							>
								<Undo2 className="h-3.5 w-3.5" />
							</button>
							<span className="h-4 w-px bg-border" />
							<button
								type="button"
								disabled={!historyAvailability.canRedo}
								onClick={() => setHistoryCommand({ action: "redo", token: Date.now() })}
								className="text-muted-foreground transition-colors hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
								aria-label="Redo"
								title="Redo"
							>
								<Redo2 className="h-3.5 w-3.5" />
							</button>
						</div>
						<button
							type="button"
							onClick={exportDeck}
							className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
						>
							Export
							<ArrowUpRight className="h-3.5 w-3.5" />
						</button>
					</div>
				</header>
				{exportPath && (
					<div className="flex items-center gap-2 border-b border-border bg-emerald-500/10 px-5 py-2 text-xs text-emerald-700">
						<CheckCircle2 className="h-3.5 w-3.5" /> Saved to {exportPath}
					</div>
				)}
				{error && (
					<div className="border-b border-destructive/20 bg-destructive/10 px-5 py-2 text-xs text-destructive">
						{error}
					</div>
				)}
				<div className="flex min-h-0 flex-1">
					<aside className="w-[150px] shrink-0 overflow-y-auto bg-muted/20 px-4 py-5">
						<div className="space-y-[15px]">
							{deck.slides.map((slide, index) => (
								<button
									key={slide.id || index}
									type="button"
									onClick={() => setSelectedSlide(index)}
									className="flex h-[62px] w-full items-start justify-between gap-1.5 text-left"
								>
									<p
										className={`shrink-0 text-[12px] leading-normal ${selectedSlide === index ? "font-semibold text-primary" : "font-normal text-muted-foreground"}`}
									>
										{index + 1}
									</p>
									<div
										className={`relative h-[62px] w-[110px] shrink-0 overflow-hidden rounded bg-white transition-[border-color,box-shadow] duration-200 ${
											selectedSlide === index
												? "border-2 border-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.16)]"
												: "border border-border"
										}`}
									>
										{slide.html_content ? (
											<ScaledSlideStage>
												<SmartSlideRenderer html={slide.html_content} />
											</ScaledSlideStage>
										) : slide.ui ? (
											<ScaledSlideStage>
												<TemplateV2KonvaSlide
													layout={slide.ui as never}
													isEditMode={false}
													slideId={slide.id}
													presentationId={deck.presentation_id}
													slideIndex={index}
													isSelected={selectedSlide === index}
												/>
											</ScaledSlideStage>
										) : (
											<div className="h-full w-full overflow-hidden p-2 text-[6px] leading-tight text-slate-700">
												{slideText(slide.content).slice(0, 180)}
											</div>
										)}
									</div>
								</button>
							))}
						</div>
					</aside>
					<main className="flex min-w-0 flex-1 overflow-hidden bg-muted/30 p-5">
						{selected?.html_content ? (
							<ScaledSlideStage stageClassName="rounded-lg bg-white text-slate-900 shadow-xl">
								<SmartSlideRenderer
								html={selected.html_content}
								interactive
								onElementSelect={(label) =>
									setSelectedElement(label ? { slideIndex: selectedSlide, label } : null)
								}
							/>
							</ScaledSlideStage>
						) : selected?.ui ? (
							<ScaledSlideStage stageClassName="rounded-lg bg-white text-slate-900 shadow-xl">
								<TemplateV2KonvaSlide
									layout={selected.ui as never}
									isEditMode
									slideId={selected.id}
									presentationId={deck.presentation_id}
									slideIndex={selectedSlide}
									isSelected
									historyCommand={historyCommand}
									onHistoryAvailabilityChange={setHistoryAvailability}
									onLayoutChange={(layout) => {
										setDeck((current) =>
											current
												? {
														...current,
														slides: current.slides.map((slide, index) =>
															index === selectedSlide ? { ...slide, ui: layout as never } : slide,
														),
													}
												: current,
										);
									}}
								/>
							</ScaledSlideStage>
						) : selected ? (
							<div className="mx-auto flex aspect-video w-full max-w-4xl items-center overflow-auto rounded-lg bg-white p-12 text-slate-900 shadow-xl">
								<pre className="whitespace-pre-wrap font-sans text-base leading-relaxed">
									{slideText(selected.content)}
								</pre>
							</div>
						) : null}
					</main>
					<aside className="flex w-[360px] shrink-0 flex-col border-l border-border bg-background">
						<div className="flex h-12 shrink-0 items-center justify-end border-b border-border px-3">
							<button
								type="button"
								onClick={startNewChat}
								disabled={chatBusy}
								className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
							>
								<Plus className="h-3.5 w-3.5" />
								New chat
							</button>
						</div>
						<div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-6 py-6">
							{chatBusy ? (
								<div className="flex items-center gap-2 text-sm text-muted-foreground">
									<Loader2 className="h-3.5 w-3.5 animate-spin" />
									Thinking…
								</div>
							) : lastReply ? (
								<div className="w-full">
									{!lastReply.editsMade && (
										<p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-amber-600">
											No changes were made
										</p>
									)}
									<p className="whitespace-pre-wrap text-sm text-foreground">
										{lastReply.text || "(empty response)"}
									</p>
									{editPreview && deck && (
										<div className="mt-4 flex flex-col gap-2">
											<div className="flex items-center gap-1 text-[13px]">
												<span className="font-semibold text-foreground">Select edits</span>
												<span className="ml-auto text-[11px] font-medium text-primary">
													{editPreview.changedIndices.length}{" "}
													{editPreview.changedIndices.length === 1 ? "Change" : "Changes"}
												</span>
											</div>
											<div className="grid grid-cols-2 gap-1.5">
												{(
													[
														{ label: "Original", slides: editPreview.before, version: "original" as const },
														{ label: "Modified", slides: editPreview.after, version: "modified" as const },
													] as const
												).map((card) => (
													<button
														key={card.label}
														type="button"
														disabled={previewBusy}
														onClick={() => chooseEditPreviewVersion(card.version)}
														className={`min-w-0 rounded-md border px-1.5 py-2 text-left transition-colors disabled:cursor-wait disabled:opacity-70 ${
															editPreview.selected === card.version
																? "border-primary bg-primary/5"
																: "border-border hover:border-primary/40"
														}`}
													>
														<span className="mb-1.5 flex items-center justify-center gap-1 text-center text-xs font-medium">
															{previewBusy && editPreview.selected === card.version && (
																<Loader2 className="h-3 w-3 animate-spin text-primary" />
															)}
															{card.label}
														</span>
														<span className="flex flex-col gap-1">
															{editPreview.changedIndices.slice(0, 2).map((index) => (
																<MiniSlidePreview
																	key={index}
																	slide={card.slides[index]}
																	presentationId={deck.presentation_id}
																/>
															))}
														</span>
													</button>
												))}
											</div>
										</div>
									)}
								</div>
							) : (
								<h3 className="-translate-y-2 text-center text-[22px] font-normal leading-[1.12] tracking-[-0.02em] text-muted-foreground">
									What can I do
									<br />
									for your deck today?
								</h3>
							)}
						</div>
						<div className="flex shrink-0 flex-col gap-2.5 px-3 pb-3.5">
							<div
								className="rounded-lg border border-border bg-card px-2.5 py-3"
								style={{ boxShadow: "0 4px 14px 0 rgba(0,0,0,0.04)" }}
							>
								<div className="mb-2 flex max-w-full items-center gap-1.5 overflow-hidden">
									<span className="inline-flex h-7 max-w-[100px] shrink-0 items-center gap-1 rounded-full border border-primary/25 bg-primary/5 pl-2.5 pr-1 text-[11px] font-semibold text-primary">
										<span className="truncate">Slide {selectedSlide + 1}</span>
									</span>
									{selectedElement && selectedElement.slideIndex === selectedSlide && (
										<span className="inline-flex h-7 min-w-0 max-w-[180px] items-center gap-1 rounded-full border border-primary/30 bg-primary/10 pl-2.5 pr-1 text-[11px] font-semibold text-primary">
											<span className="truncate">
												Slide {selectedSlide + 1}: {selectedElement.label}
											</span>
											<button
												type="button"
												onClick={() => setSelectedElement(null)}
												className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-primary/70 transition-colors hover:bg-primary/15 hover:text-primary"
												aria-label="Remove selected element from context"
												title="Remove selected element from context"
											>
												<X className="h-3 w-3" />
											</button>
										</span>
									)}
								</div>
								<textarea
									value={chatMessage}
									onChange={(event) => setChatMessage(event.target.value)}
									placeholder="Ask anything."
									rows={3}
									className="min-h-[80px] w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
								/>
								<div className="mt-2 flex items-center justify-end">
									<button
										type="button"
										disabled={chatBusy || !chatMessage.trim()}
										onClick={sendChat}
										className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
										aria-label="Send prompt"
									>
										{chatBusy ? (
											<Loader2 className="h-4 w-4 animate-spin" />
										) : (
											<ArrowUp className="h-4 w-4" />
										)}
									</button>
								</div>
							</div>
							<div className="hide-scrollbar flex gap-2 overflow-x-auto">
								{QUICK_PROMPTS.map((qp) => (
									<button
										key={qp}
										type="button"
										onClick={() => setChatMessage(qp)}
										className="shrink-0 rounded-full border border-border bg-background px-3 py-1.5 text-[11px] font-normal text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5"
									>
										{qp}
									</button>
								))}
							</div>
						</div>
					</aside>
				</div>
			</section>
		);
	}

	return (
		<section className="flex h-full min-h-0 flex-1 flex-col overflow-auto px-6 py-7 md:px-10">
			<div className="mx-auto w-full max-w-5xl">
				<header className="mb-8">
					<div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
						<Presentation className="h-4 w-4" /> PowerPoint Builder
					</div>
					<h1 className="text-3xl font-semibold tracking-tight">Build a presentation</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						Start from a visual preset or upload a document that should shape the deck.
					</p>
				</header>
				<button
					type="button"
					onClick={() => {
						setTemplate("smart");
						setStage("configure");
					}}
					className={`group mb-6 flex w-full items-center gap-4 overflow-hidden rounded-xl border bg-card p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${template === "smart" ? "border-primary" : "border-border"}`}
				>
					<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
						<Sparkles className="h-6 w-6 text-primary" />
					</div>
					<div className="min-w-0">
						<div className="text-sm font-semibold">Smart Generation</div>
						<p className="mt-0.5 text-xs text-muted-foreground">
							The AI designs each slide's HTML and layout freely — real Chart.js charts, no fixed
							template. Requires internet access.
						</p>
					</div>
				</button>
				<div className="mb-4 flex items-center gap-2">
					<Sparkles className="h-4 w-4 text-muted-foreground" />
					<h2 className="text-sm font-medium">Choose a preset template</h2>
				</div>
				<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
					{PRESET_TEMPLATES.map((item) => (
						<button
							key={item.id}
							type="button"
							onClick={() => {
								setTemplate(item.id);
								setStage("configure");
							}}
							className={`group overflow-hidden rounded-xl border bg-card text-left transition hover:-translate-y-0.5 hover:shadow-md ${template === item.id ? "border-primary" : "border-border"}`}
						>
							<div className="aspect-video bg-muted overflow-hidden">
								<img
									src={`/presenting-templates/${item.id}.png`}
									alt={`${item.name} template preview`}
									className="h-full w-full object-cover"
									loading="lazy"
								/>
							</div>
							<div className="px-3 py-2.5 text-xs font-medium">{item.name}</div>
						</button>
					))}
				</div>
				<ImportedTemplates
					provider={provider}
					model={model}
					selectedTemplateId={template}
					onSelect={(templateId) => {
						setTemplate(templateId);
						setStage("configure");
					}}
				/>
				<div className="my-6 flex items-center gap-3 text-[11px] uppercase tracking-widest text-muted-foreground">
					<span className="h-px flex-1 bg-border" />
					or
					<span className="h-px flex-1 bg-border" />
				</div>
				<button
					type="button"
					onClick={chooseDocument}
					className="flex w-full items-center justify-between rounded-xl border border-dashed border-border bg-card/50 p-5 text-left hover:bg-card"
				>
					<div className="flex items-center gap-3">
						<span className="rounded-lg bg-muted p-2">
							<FileUp className="h-5 w-5" />
						</span>
						<span>
							<span className="block text-sm font-medium">Upload a document template</span>
							<span className="text-xs text-muted-foreground">PDF, PowerPoint, Word, or text</span>
						</span>
					</div>
					<span className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium">
						Choose file
					</span>
				</button>
				{stage === "configure" && (
					<div className="mt-6 rounded-xl border border-border bg-card p-5">
						<label htmlFor="presenting-prompt" className="text-xs font-medium">
							What should this presentation cover?
						</label>
						<textarea
							id="presenting-prompt"
							value={prompt}
							onChange={(event) => setPrompt(event.target.value)}
							className="mt-2 h-28 w-full resize-none rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-primary"
							placeholder="Describe the audience, goal, and key points…"
						/>
						<div className="mt-3 flex items-end justify-between gap-4">
							<label className="text-xs font-medium">
								Slides
								<input
									type="number"
									min={1}
									max={50}
									value={slideCount}
									onChange={(event) =>
										setSlideCount(Math.max(1, Math.min(50, Number(event.target.value))))
									}
									className="ml-2 w-16 rounded-md border border-border bg-background px-2 py-1"
								/>
							</label>
							<button
								type="button"
								disabled={!canGenerate}
								onClick={generate}
								className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-40"
							>
								Generate presentation
							</button>
						</div>
						{!provider || !model ? (
							<p className="mt-3 text-xs text-amber-600">
								Select a Cowork model before generating.
							</p>
						) : null}
					</div>
				)}
			</div>
		</section>
	);
}

export function PresentingPanel(props: PresentingPanelProps) {
	return (
		<PresentingProvider>
			<PresentingPanelContent {...props} />
		</PresentingProvider>
	);
}
