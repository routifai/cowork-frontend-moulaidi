/**
 * Typed Tauri wrappers for the Presenting Engine commands.
 *
 * Every wrapper is a thin `invoke()` call with fully typed arguments and
 * return values. Callers import from here — never directly from
 * `@tauri-apps/api/core` — so the transport can be swapped (e.g. to an
 * EngineAdapter) without touching panel code.
 *
 * The shapes defined here mirror the Python command TypedDicts exactly.
 * `Result<T>` means the Rust command returns `Result<Value, String>` which
 * Tauri serialises as `Promise<T>` (success) or rejects with the error string.
 */

import { invoke } from "@tauri-apps/api/core";

// ---------------------------------------------------------------------------
// Response shapes  (mirrors Python handlers' `data` payloads)
// ---------------------------------------------------------------------------

/** Wire-format slide as returned by get_presentation / start_generation. */
export interface PresentingSlide {
	id: string;
	index: number;
	layout: string;
	layout_group: string;
	content: Record<string, unknown>;
	ui: Record<string, unknown> | null;
	html_content: string | null;
	properties: Record<string, unknown> | null;
	speaker_note: string | null;
}

/**
 * Full presentation as returned by `presenting_get_presentation` and
 * `presenting_start_generation`. Same shape used to hydrate state via
 * `setPresentationData`.
 */
export interface PresentingDeck {
	id: string;
	presentation_id: string;
	title: string;
	template: string;
	language: string;
	n_slides: number;
	layout: Record<string, unknown> | null;
	theme: Record<string, unknown> | null;
	fonts: Record<string, unknown> | null;
	generation_mode: "smart";
	version: string;
	slides: PresentingSlide[];
}

export interface ParseDocumentResult {
	/** Extracted plain text from the document. */
	text: string;
	/** Original filename. */
	name: string;
	/** Optional metadata (page count, language hint, etc.). */
	meta?: Record<string, unknown>;
}

export interface StartGenerationParams {
	content: string;
	/** Always "smart" — Smart Generation is the only mode. */
	template: string;
	provider: string;
	model: string;
	n_slides?: number;
	language?: string;
	tone?: string;
	verbosity?: string;
	instructions?: string;
	include_title_slide?: boolean;
	include_table_of_contents?: boolean;
	web_search?: boolean;
	web_search_provider?: string;
	/** Extracted source-document text, forwarded to the engine as generation content. */
	document_text?: string;
	/** Original filename (for the prompt label). */
	document_name?: string;
	/** A bundled community example's id (see listSmartExamples) — used as an optional style-only design reference. */
	design_reference_id?: string;
}

/** A bundled community Smart deck usable as an optional design-reference style anchor. */
export interface SmartExampleSummary {
	id: string;
	title: string;
	slideCount: number;
	/** Static PNG served from public/, e.g. "/smart-example-previews/<id>.png". */
	previewUrl: string;
}

export interface ChatEditParams {
	presentation_id: string;
	conversation_id: string;
	message: string;
	html_selection?: string | null;
	provider: string;
	model: string;
	attachments?: Array<{ name?: string; filePath: string }>;
	presentation_type?: string;
}

export interface ChatEditResult {
	conversation_id: string;
	/** The model's text reply. Can be non-empty even when tool_calls is empty — e.g. the model explaining why it didn't make a change. */
	response: string;
	/** Names of the editing tools the model actually invoked. Empty means no edit was made, regardless of what `response` says. */
	tool_calls: string[];
}

export interface ExportPresentationParams {
	presentation_id: string;
	output_path: string;
}

export interface ExportPresentationResult {
	output_path: string;
}

// ---------------------------------------------------------------------------
// Engine readiness
// ---------------------------------------------------------------------------

/** Confirm the engine process is alive and the stdio protocol round-trips. */
export async function enginePing(): Promise<{ pong: boolean }> {
	return invoke<{ pong: boolean }>("presenting_ping");
}

// ---------------------------------------------------------------------------
// Document parsing (source-document content entry path)
// ---------------------------------------------------------------------------

/**
 * Ask the engine to extract text from a local document file. Returns the
 * extracted text, which is then passed as `document_text` to
 * `startGeneration`.
 */
export async function parseDocument(
	filePath: string,
	language?: string,
): Promise<ParseDocumentResult> {
	return invoke<ParseDocumentResult>("presenting_parse_document", {
		filePath,
		language: language ?? null,
	});
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

/**
 * Start a new presentation generation run. Blocking — resolves with the full
 * deck once generation is complete, including the new `presentation_id` for
 * subsequent editing commands.
 */
export async function startGeneration(params: StartGenerationParams): Promise<PresentingDeck> {
	return invoke<PresentingDeck>("presenting_start_generation", {
		content: params.content,
		template: params.template,
		provider: params.provider,
		model: params.model,
		nSlides: params.n_slides,
		language: params.language,
		tone: params.tone,
		verbosity: params.verbosity,
		instructions: params.instructions,
		includeTitleSlide: params.include_title_slide,
		includeTableOfContents: params.include_table_of_contents,
		webSearch: params.web_search,
		webSearchProvider: params.web_search_provider,
		documentText: params.document_text,
		documentName: params.document_name,
		designReferenceId: params.design_reference_id,
	});
}

/** List bundled community Smart decks (real HTML slides) usable as an optional design-reference style anchor. */
export async function listSmartExamples(): Promise<SmartExampleSummary[]> {
	const result = await invoke<{ examples: SmartExampleSummary[] }>("presenting_list_smart_examples");
	return result.examples;
}

// ---------------------------------------------------------------------------
// Deck retrieval
// ---------------------------------------------------------------------------

/**
 * Retrieve the full current deck from ephemeral SQLite. Must be called after
 * every `chatEdit` to rehydrate the editor — `chatEdit` only returns a status,
 * not the mutated slides.
 */
export async function getPresentation(presentationId: string): Promise<PresentingDeck> {
	return invoke<PresentingDeck>("presenting_get_presentation", {
		presentationId,
	});
}

// ---------------------------------------------------------------------------
// Chat editing
// ---------------------------------------------------------------------------

/**
 * Send a user chat message that may mutate slides. After the call resolves
 * successfully, call `getPresentation` to rehydrate the editor.
 */
export async function chatEdit(params: ChatEditParams): Promise<ChatEditResult> {
	return invoke<ChatEditResult>("presenting_chat_edit", {
		presentationId: params.presentation_id,
		conversationId: params.conversation_id,
		message: params.message,
		provider: params.provider,
		model: params.model,
		attachments: params.attachments,
		presentationType: params.presentation_type,
	});
}

export interface SlideSnapshot {
	htmlContent: string | null;
	content: Record<string, unknown> | null;
	ui: unknown | null;
	speakerNote: string | null;
}

/** Restores one slide to a previously-captured snapshot — direct DB write, no LLM. Used by the chat panel's "keep original / keep edit" comparison. */
export async function restoreSlide(
	presentationId: string,
	index: number,
	snapshot: SlideSnapshot,
): Promise<boolean> {
	const result = await invoke<{ restored: boolean }>("presenting_restore_slide", {
		presentationId,
		index,
		snapshot,
	});
	return result.restored;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/** Export the current deck to a .pptx file at the given path. */
export async function exportPresentation(
	params: ExportPresentationParams,
): Promise<ExportPresentationResult> {
	return invoke<ExportPresentationResult>("presenting_export_presentation", {
		presentationId: params.presentation_id,
		outputPath: params.output_path,
	});
}
