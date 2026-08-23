/**
 * Blank slide helpers — ported from Presenton's `_shared/blank-slide.ts`.
 */
import type { Slide } from "@/presenting/types/slide";

export const BLANK_SLIDE_LAYOUT_ID = "__blank_slide__";

export function isTemplateV2Slide(slide: unknown): boolean {
	if (!slide || typeof slide !== "object") return false;
	const s = slide as Record<string, unknown>;
	return !!s.ui && typeof s.layout === "string";
}

export function isBlankSlide(slide: unknown): boolean {
	if (!slide || typeof slide !== "object") return false;
	return (slide as Record<string, unknown>).layout === BLANK_SLIDE_LAYOUT_ID;
}

export function isTemplateFreePresentation(data: unknown): boolean {
	if (!data || typeof data !== "object") return false;
	const d = data as Record<string, unknown>;
	return !d.layout || (typeof d.layout === "string" && d.layout === "");
}

export function createBlankPresentationSlide(index: number): Partial<Slide> {
	return {
		id: null,
		index,
		type: 0,
		design_index: null,
		images: null,
		icons: null,
		graph_id: null,
		properties: null,
		layout: BLANK_SLIDE_LAYOUT_ID,
		content: { title: "", body: "" },
	};
}
