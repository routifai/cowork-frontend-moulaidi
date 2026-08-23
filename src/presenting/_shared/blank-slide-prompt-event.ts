/**
 * Custom DOM event fired by the editor when a blank-slide action requests a
 * chat prompt. Ported from Presenton.
 */
export const PRESENTON_BLANK_SLIDE_PROMPT_EVENT = "presenton:blank-slide-prompt";

export interface BlankSlidePromptEventDetail {
	prompt?: string;
	slideIndex?: number;
	layoutId?: string;
	layout?: string;
	promptKind?: string;
}
