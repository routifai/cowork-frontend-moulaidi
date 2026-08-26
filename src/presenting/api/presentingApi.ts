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
	generation_mode: "standard" | "smart";
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
	/** Uploaded Template path: extracted document text forwarded to the engine. */
	document_text?: string;
	/** Original filename (for the prompt label). */
	document_name?: string;
}

export interface ChatEditParams {
	presentation_id: string;
	conversation_id: string;
	message: string;
	html_selection?: string | null;
	provider: string;
	model: string;
	attachments?: Array<{ name?: string; filePath: string }>;
	/** "standard" | "smart" — must match the presentation's stored generation_mode or the backend rejects the turn. */
	presentation_type?: string;
}

export interface ChatEditResult {
	conversation_id: string;
	/** The model's text reply. Can be non-empty even when tool_calls is empty — e.g. the model explaining why it didn't make a change. */
	response: string;
	/** Names of the editing tools the model actually invoked. Empty means no edit was made, regardless of what `response` says. */
	tool_calls: string[];
}

export interface EditSlideParams {
	presentation_id: string;
	tool: string;
	args: Record<string, unknown>;
}

export interface ExportPresentationParams {
	presentation_id: string;
	output_path: string;
}

export interface ExportPresentationResult {
	output_path: string;
}

/** An Imported Template — a user-uploaded .pptx whose design was vision/LLM-extracted into a new, workspace-scoped template. Distinct from the 8 built-in Preset Templates and from "Uploaded Template" (a content document). */
export interface ImportedTemplateSummary {
	/** Wire id, always "imported:<uuid>" — pass directly as `template` to startGeneration. */
	id: string;
	name: string;
	/** data:image/png;base64,... */
	thumbnail: string;
	slideCount: number;
	createdAt: string;
}

// ---------------------------------------------------------------------------
// Engine readiness
// ---------------------------------------------------------------------------

/** Confirm the engine process is alive and the stdio protocol round-trips. */
export async function enginePing(): Promise<{ pong: boolean }> {
	return invoke<{ pong: boolean }>("presenting_ping");
}

// ---------------------------------------------------------------------------
// Document parsing (Uploaded Template entry path)
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
	});
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

// ---------------------------------------------------------------------------
// Direct slide editing
// ---------------------------------------------------------------------------

/** Apply a single named editing tool (drag, resize, type, etc.) without an LLM call. */
export async function editSlide(params: EditSlideParams): Promise<unknown> {
	return invoke<unknown>("presenting_edit_slide", {
		presentationId: params.presentation_id,
		tool: params.tool,
		args: params.args,
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

// ---------------------------------------------------------------------------
// Imported Templates (design import — distinct from Uploaded Template's
// content-fill path; see presenting/CONTEXT.md in hypatia-backend)
// ---------------------------------------------------------------------------

/**
 * Import a user-uploaded .pptx as a new Imported Template: the engine
 * vision/LLM-analyzes its design and produces a workspace-scoped template
 * usable exactly like a Preset Template (pass the returned `id` as
 * `template` to `startGeneration`). Blocking — runs one model call per
 * slide plus assembly; no intermediate progress streaming in v1.
 */
export async function importTemplate(
	pptxPath: string,
	name: string | undefined,
	provider: string,
	model: string,
): Promise<ImportedTemplateSummary> {
	return invoke<ImportedTemplateSummary>("presenting_import_template", {
		pptxPath,
		name,
		provider,
		model,
	});
}

/** List every Imported Template saved for the current workspace. */
export async function listImportedTemplates(): Promise<ImportedTemplateSummary[]> {
	const result = await invoke<{ templates: ImportedTemplateSummary[] }>(
		"presenting_list_imported_templates",
	);
	return result.templates;
}

/** Permanently delete an Imported Template. */
export async function deleteImportedTemplate(templateId: string): Promise<boolean> {
	const result = await invoke<{ deleted: boolean }>("presenting_delete_imported_template", {
		templateId,
	});
	return result.deleted;
}
