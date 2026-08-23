import type { Slide } from "@/presenting/types/slide";
import type { Theme } from "@/presenting/types/theme";
import { MAX_NUMBER_OF_SLIDES, limitOutlines } from "@/presenting/utils/presentationLimits";

export interface PresentationData {
	id: string;

	language: string;
	layout: any;
	n_slides: number;
	title: string;
	slides: any;
	theme: Theme | null;
	version?: string;
	generation_mode?: "standard" | "smart";
	type?: "standard" | "smart";
	community_design_ids?: number[] | null;
	components?: any;
	fonts?: any;
	structure?: any;
}

export interface ChatHtmlSelection {
	slideId?: string | null;
	slideIndex: number;
	slideNumber: number;
	html: string;
	elementTag?: string | null;
	selectedText?: string;
	selectedAt: number;
}

export interface PresentationGenerationState {
	presentation_id: string | null;
	isLoading: boolean;
	isStreaming: boolean | null;
	outlines: { content: string }[];
	error: string | null;
	presentationData: PresentationData | null;
	isSlidesRendered: boolean;
	isLayoutLoading: boolean;
	enableHtmlSelector: boolean;
	chatHtmlSelection: ChatHtmlSelection | null;
}

export const presentationGenerationInitialState: PresentationGenerationState = {
	presentation_id: null,
	outlines: [],
	isSlidesRendered: false,
	isLayoutLoading: false,
	isLoading: false,
	isStreaming: null,
	error: null,
	presentationData: null,
	enableHtmlSelector: false,
	chatHtmlSelection: null,
};

function reindex(slides: any[]): any[] {
	return slides.map((slide, idx) => ({ ...slide, index: idx }));
}

function setNestedValue(obj: any, path: string, value: string) {
	const keys = path.split(/[.[\]]+/).filter(Boolean);
	let current = obj;
	for (let i = 0; i < keys.length - 1; i++) {
		const key = keys[i];
		if (Number.isNaN(Number(key))) {
			if (!current[key]) current[key] = {};
			current = current[key];
		} else {
			const index = Number(key);
			if (!current[index]) current[index] = {};
			current = current[index];
		}
	}
	const finalKey = keys[keys.length - 1];
	if (Number.isNaN(Number(finalKey))) {
		current[finalKey] = value;
	} else {
		current[Number(finalKey)] = value;
	}
}

function setNestedImageValue(obj: any, path: string, url: string, promptText?: string) {
	const keys = path.split(/[.[\]]+/).filter(Boolean);
	let current = obj;
	for (let i = 0; i < keys.length - 1; i++) {
		const key = keys[i];
		if (Number.isNaN(Number(key))) {
			if (!current[key]) current[key] = {};
			current = current[key];
		} else {
			const index = Number(key);
			if (!current[index]) current[index] = {};
			current = current[index];
		}
	}
	const finalKey = keys[keys.length - 1];
	const target = Number.isNaN(Number(finalKey)) ? current[finalKey] : current[Number(finalKey)];
	const updatedValue = {
		...(target && typeof target === "object" ? target : {}),
		__image_url__: url,
		__image_prompt__: promptText || target?.__image_prompt__ || "",
	};
	if (Number.isNaN(Number(finalKey))) {
		current[finalKey] = updatedValue;
	} else {
		current[Number(finalKey)] = updatedValue;
	}
}

function setNestedIconValue(obj: any, path: string, url: string, queryText?: string) {
	const keys = path.split(/[.[\]]+/).filter(Boolean);
	let current = obj;
	for (let i = 0; i < keys.length - 1; i++) {
		const key = keys[i];
		if (Number.isNaN(Number(key))) {
			if (!current[key]) current[key] = {};
			current = current[key];
		} else {
			const index = Number(key);
			if (!current[index]) current[index] = {};
			current = current[index];
		}
	}
	const finalKey = keys[keys.length - 1];
	const target = Number.isNaN(Number(finalKey)) ? current[finalKey] : current[Number(finalKey)];
	const updatedValue = {
		...(target && typeof target === "object" ? target : {}),
		__icon_url__: url,
		__icon_query__: queryText || target?.__icon_query__ || "",
	};
	if (Number.isNaN(Number(finalKey))) {
		current[finalKey] = updatedValue;
	} else {
		current[Number(finalKey)] = updatedValue;
	}
}

// Action creators — same shape Redux Toolkit's createSlice generates
// ({type, payload}), so every ported call site (`dispatch(setLoading(true))`)
// works unchanged against the hand-rolled store in ../store.ts.
const ns = "presentationGeneration/";
export const setStreaming = (payload: boolean) => ({ type: ns + "setStreaming", payload });
export const setLoading = (payload: boolean) => ({ type: ns + "setLoading", payload });
export const setLayoutLoading = (payload: boolean) => ({ type: ns + "setLayoutLoading", payload });
export const setPresentationId = (payload: string) => ({ type: ns + "setPresentationId", payload });
export const setSlidesRendered = (payload: boolean) => ({
	type: ns + "setSlidesRendered",
	payload,
});
export const setError = (payload: string) => ({ type: ns + "setError", payload });
export const clearPresentationData = () => ({ type: ns + "clearPresentationData" });
export const clearOutlines = () => ({ type: ns + "clearOutlines" });
export const setOutlines = (payload: { content: string }[]) => ({
	type: ns + "setOutlines",
	payload,
});
export const setPresentationData = (payload: PresentationData) => ({
	type: ns + "setPresentationData",
	payload,
});
export const setEnableHtmlSelector = (payload: boolean) => ({
	type: ns + "setEnableHtmlSelector",
	payload,
});
export const setChatHtmlSelection = (payload: ChatHtmlSelection) => ({
	type: ns + "setChatHtmlSelection",
	payload,
});
export const clearChatHtmlSelection = () => ({ type: ns + "clearChatHtmlSelection" });
export const updateTitle = (payload: string) => ({ type: ns + "updateTitle", payload });
export const deleteSlideOutline = (payload: { index: number }) => ({
	type: ns + "deleteSlideOutline",
	payload,
});
export const addSlide = (payload: { slide: Slide; index: number }) => ({
	type: ns + "addSlide",
	payload,
});
export const deletePresentationSlide = (payload: number) => ({
	type: ns + "deletePresentationSlide",
	payload,
});
export const replaceSlidesWithBlankFallback = (payload: { slideData: any }) => ({
	type: ns + "replaceSlidesWithBlankFallback",
	payload,
});
export const duplicatePresentationSlide = (payload: { index: number; slideId: string }) => ({
	type: ns + "duplicatePresentationSlide",
	payload,
});
export const movePresentationSlide = (payload: { fromIndex: number; toIndex: number }) => ({
	type: ns + "movePresentationSlide",
	payload,
});
export const updateSlide = (payload: { index: number; slide: Slide }) => ({
	type: ns + "updateSlide",
	payload,
});
export const updateSlideHtmlContent = (payload: {
	slideIndex: number;
	html: string;
	slideId?: string | null;
}) => ({ type: ns + "updateSlideHtmlContent", payload });
export const updateSlideUi = (payload: { index: number; ui: Record<string, unknown> | null }) => ({
	type: ns + "updateSlideUi",
	payload,
});
export const updateSlideContent = (payload: {
	slideIndex: number;
	dataPath: string;
	content: string;
}) => ({
	type: ns + "updateSlideContent",
	payload,
});
export const addNewSlide = (payload: { slideData: any; index: number }) => ({
	type: ns + "addNewSlide",
	payload,
});
export const updateSlideImage = (payload: {
	slideIndex: number;
	dataPath: string;
	imageUrl: string;
	prompt?: string;
}) => ({ type: ns + "updateSlideImage", payload });
export const updateImageProperties = (payload: {
	slideIndex: number;
	itemIndex: number;
	properties: any;
}) => ({
	type: ns + "updateImageProperties",
	payload,
});
export const updateSlideIcon = (payload: {
	slideIndex: number;
	dataPath: string;
	iconUrl: string;
	query?: string;
}) => ({ type: ns + "updateSlideIcon", payload });
export const updateTheme = (payload: Theme | null) => ({ type: ns + "updateTheme", payload });

export function presentationGenerationReducer(
	state: PresentationGenerationState = presentationGenerationInitialState,
	action: { type: string; payload?: any },
): PresentationGenerationState {
	switch (action.type) {
		case ns + "setStreaming":
			return { ...state, isStreaming: action.payload };
		case ns + "setLoading":
			return { ...state, isLoading: action.payload };
		case ns + "setLayoutLoading":
			return { ...state, isLayoutLoading: action.payload };
		case ns + "setPresentationId":
			return {
				...state,
				presentation_id: action.payload,
				error: null,
				chatHtmlSelection:
					state.presentation_id !== action.payload ? null : state.chatHtmlSelection,
			};
		case ns + "setSlidesRendered":
			return { ...state, isSlidesRendered: action.payload };
		case ns + "setError":
			return { ...state, error: action.payload, isLoading: false };
		case ns + "clearPresentationData":
			return { ...state, presentationData: null, chatHtmlSelection: null };
		case ns + "clearOutlines":
			return { ...state, outlines: [] };
		case ns + "setOutlines":
			return { ...state, outlines: limitOutlines(action.payload) };
		case ns + "setPresentationData":
			return { ...state, presentationData: action.payload, chatHtmlSelection: null };
		case ns + "setEnableHtmlSelector":
			return {
				...state,
				enableHtmlSelector: action.payload,
				chatHtmlSelection: action.payload ? state.chatHtmlSelection : null,
			};
		case ns + "setChatHtmlSelection":
			return { ...state, chatHtmlSelection: action.payload };
		case ns + "clearChatHtmlSelection":
			return { ...state, chatHtmlSelection: null };
		case ns + "updateTitle":
			return state.presentationData
				? { ...state, presentationData: { ...state.presentationData, title: action.payload } }
				: state;
		case ns + "deleteSlideOutline":
			return {
				...state,
				outlines: state.outlines.filter((_, idx) => idx !== action.payload.index),
			};
		case ns + "addSlide": {
			if (!state.presentationData?.slides) return state;
			if (state.presentationData.slides.length >= MAX_NUMBER_OF_SLIDES) return state;
			const slides = [...state.presentationData.slides];
			slides.splice(action.payload.index, 0, action.payload.slide);
			const reindexed = reindex(slides);
			return {
				...state,
				presentationData: {
					...state.presentationData,
					slides: reindexed,
					n_slides: reindexed.length,
				},
			};
		}
		case ns + "deletePresentationSlide": {
			const slides = state.presentationData?.slides;
			if (!slides) return state;
			const index = action.payload;
			if (slides.length <= 1 || index < 0 || index >= slides.length) return state;
			const next = [...slides];
			next.splice(index, 1);
			const reindexed = reindex(next);
			return {
				...state,
				presentationData: {
					...state.presentationData!,
					slides: reindexed,
					n_slides: reindexed.length,
				},
			};
		}
		case ns + "replaceSlidesWithBlankFallback": {
			if (!state.presentationData) return state;
			const slides = [{ ...action.payload.slideData, index: 0 }];
			return { ...state, presentationData: { ...state.presentationData, slides, n_slides: 1 } };
		}
		case ns + "duplicatePresentationSlide": {
			const slides = state.presentationData?.slides;
			if (!slides) return state;
			if (slides.length >= MAX_NUMBER_OF_SLIDES) return state;
			const sourceSlide = slides[action.payload.index];
			if (!sourceSlide) return state;
			const duplicatedSlide = {
				...JSON.parse(JSON.stringify(sourceSlide)),
				id: action.payload.slideId,
				index: action.payload.index + 1,
			};
			const next = [...slides];
			next.splice(action.payload.index + 1, 0, duplicatedSlide);
			const reindexed = reindex(next);
			return {
				...state,
				presentationData: {
					...state.presentationData!,
					slides: reindexed,
					n_slides: reindexed.length,
				},
			};
		}
		case ns + "movePresentationSlide": {
			const slides = state.presentationData?.slides;
			if (!slides) return state;
			const { fromIndex, toIndex } = action.payload;
			if (
				fromIndex === toIndex ||
				fromIndex < 0 ||
				toIndex < 0 ||
				fromIndex >= slides.length ||
				toIndex >= slides.length
			) {
				return state;
			}
			const next = [...slides];
			const [movedSlide] = next.splice(fromIndex, 1);
			next.splice(toIndex, 0, movedSlide);
			return { ...state, presentationData: { ...state.presentationData!, slides: reindex(next) } };
		}
		case ns + "updateSlide": {
			const slides = state.presentationData?.slides;
			if (!slides?.[action.payload.index]) return state;
			const next = [...slides];
			next[action.payload.index] = action.payload.slide;
			return { ...state, presentationData: { ...state.presentationData!, slides: next } };
		}
		case ns + "updateSlideHtmlContent": {
			const slides = state.presentationData?.slides;
			if (!Array.isArray(slides)) return state;
			const targetIdx = action.payload.slideId
				? slides.findIndex((s: Slide) => s.id === action.payload.slideId)
				: slides.findIndex((s: Slide) => s.index === action.payload.slideIndex);
			const idx = targetIdx >= 0 ? targetIdx : action.payload.slideIndex;
			if (!slides[idx]) return state;
			const next = [...slides];
			next[idx] = { ...next[idx], html_content: action.payload.html };
			return { ...state, presentationData: { ...state.presentationData!, slides: next } };
		}
		case ns + "updateSlideUi": {
			const slides = state.presentationData?.slides;
			if (!slides?.[action.payload.index]) return state;
			const next = [...slides];
			next[action.payload.index] = { ...next[action.payload.index], ui: action.payload.ui };
			return { ...state, presentationData: { ...state.presentationData!, slides: next } };
		}
		case ns + "updateSlideContent": {
			const slides = state.presentationData?.slides;
			if (!slides?.[action.payload.slideIndex]) return state;
			const next = slides.map((s: any) => ({
				...s,
				content: s.content ? { ...s.content } : s.content,
			}));
			const slide = next[action.payload.slideIndex];
			const { dataPath, content } = action.payload;
			if (dataPath && slide.content) setNestedValue(slide.content, dataPath, content);
			return { ...state, presentationData: { ...state.presentationData!, slides: next } };
		}
		case ns + "addNewSlide": {
			if (!state.presentationData?.slides) return state;
			if (state.presentationData.slides.length >= MAX_NUMBER_OF_SLIDES) return state;
			const slides = [...state.presentationData.slides];
			slides.splice(action.payload.index + 1, 0, action.payload.slideData);
			const reindexed = reindex(slides);
			return {
				...state,
				presentationData: {
					...state.presentationData,
					slides: reindexed,
					n_slides: reindexed.length,
				},
			};
		}
		case ns + "updateSlideImage": {
			const slides = state.presentationData?.slides;
			if (!slides?.[action.payload.slideIndex]) return state;
			const next = slides.map((s: any) => ({
				...s,
				content: s.content ? { ...s.content } : s.content,
				images: Array.isArray(s.images) ? [...s.images] : s.images,
			}));
			const slide = next[action.payload.slideIndex];
			const { dataPath, imageUrl, prompt } = action.payload;
			if (dataPath && slide.content) setNestedImageValue(slide.content, dataPath, imageUrl, prompt);
			if (Array.isArray(slide.images)) {
				const imageIndex = Number.parseInt(dataPath.split("[")[1]?.split("]")[0]) || 0;
				if (slide.images[imageIndex] !== undefined) slide.images[imageIndex] = imageUrl;
			}
			return { ...state, presentationData: { ...state.presentationData!, slides: next } };
		}
		case ns + "updateImageProperties": {
			const slides = state.presentationData?.slides;
			if (!slides?.[action.payload.slideIndex]) return state;
			const next = [...slides];
			const slide = next[action.payload.slideIndex];
			next[action.payload.slideIndex] = {
				...slide,
				properties: { ...slide.properties, [action.payload.itemIndex]: action.payload.properties },
			};
			return { ...state, presentationData: { ...state.presentationData!, slides: next } };
		}
		case ns + "updateSlideIcon": {
			const slides = state.presentationData?.slides;
			if (!slides?.[action.payload.slideIndex]) return state;
			const next = slides.map((s: any) => ({
				...s,
				content: s.content ? { ...s.content } : s.content,
				icons: Array.isArray(s.icons) ? [...s.icons] : s.icons,
			}));
			const slide = next[action.payload.slideIndex];
			const { dataPath, iconUrl, query } = action.payload;
			if (dataPath && slide.content) setNestedIconValue(slide.content, dataPath, iconUrl, query);
			if (Array.isArray(slide.icons)) {
				const iconIndex = Number.parseInt(dataPath.split("[")[1]?.split("]")[0]) || 0;
				if (slide.icons[iconIndex] !== undefined) slide.icons[iconIndex] = iconUrl;
			}
			return { ...state, presentationData: { ...state.presentationData!, slides: next } };
		}
		case ns + "updateTheme":
			return state.presentationData
				? { ...state, presentationData: { ...state.presentationData, theme: action.payload } }
				: state;
		default:
			return state;
	}
}
