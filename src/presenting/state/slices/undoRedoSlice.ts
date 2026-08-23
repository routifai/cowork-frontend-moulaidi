import type { Slide } from "@/presenting/types/slide";

interface HistoryState {
	slides: Slide[];
	timestamp: number;
	actionType: string;
}

export interface UndoRedoState {
	past: HistoryState[];
	present: HistoryState | null;
	future: HistoryState[];
	maxHistorySize: number;
	isUndoRedoInProgress: boolean;
	pendingHistorySkips: number;
}

export const undoRedoInitialState: UndoRedoState = {
	past: [],
	present: null,
	future: [],
	maxHistorySize: 30,
	isUndoRedoInProgress: false,
	pendingHistorySkips: 0,
};

const ns = "undoRedo/";
export const addToHistory = (payload: { slides: Slide[]; actionType: string }) => ({
	type: ns + "addToHistory",
	payload,
});
export const undo = () => ({ type: ns + "undo" });
export const redo = () => ({ type: ns + "redo" });
export const finishUndoRedo = () => ({ type: ns + "finishUndoRedo" });
export const clearHistory = () => ({ type: ns + "clearHistory" });

export function undoRedoReducer(
	state: UndoRedoState = undoRedoInitialState,
	action: { type: string; payload?: any },
): UndoRedoState {
	switch (action.type) {
		case ns + "addToHistory": {
			if (state.pendingHistorySkips > 0) {
				const pendingHistorySkips = state.pendingHistorySkips - 1;
				return {
					...state,
					pendingHistorySkips,
					isUndoRedoInProgress: pendingHistorySkips === 0 ? false : state.isUndoRedoInProgress,
				};
			}
			if (state.isUndoRedoInProgress) return state;

			const newSlides = action.payload.slides;
			// No Immer draft here — state.present is already the real object, so
			// reference equality alone (no `original()` unwrap needed) detects a
			// no-op capture.
			const presentSlides = state.present?.slides ?? null;
			if (presentSlides === newSlides) return state;

			if (!state.present) {
				return {
					...state,
					present: {
						slides: newSlides,
						timestamp: Date.now(),
						actionType: action.payload.actionType,
					},
				};
			}

			let past = [...state.past, state.present];
			if (past.length > state.maxHistorySize) past = past.slice(1);

			return {
				...state,
				past,
				future: [],
				present: {
					slides: newSlides,
					timestamp: Date.now(),
					actionType: action.payload.actionType,
				},
			};
		}
		case ns + "undo": {
			if (state.past.length === 0) return state;
			const future = state.present ? [state.present, ...state.future] : state.future;
			const previous = state.past[state.past.length - 1];
			return {
				...state,
				isUndoRedoInProgress: true,
				pendingHistorySkips: 1,
				future,
				past: state.past.slice(0, -1),
				present: previous,
			};
		}
		case ns + "redo": {
			if (state.future.length === 0) return state;
			const past = state.present ? [...state.past, state.present] : state.past;
			const next = state.future[0];
			return {
				...state,
				isUndoRedoInProgress: true,
				pendingHistorySkips: 1,
				past,
				future: state.future.slice(1),
				present: next,
			};
		}
		case ns + "finishUndoRedo":
			return { ...state, isUndoRedoInProgress: false, pendingHistorySkips: 0 };
		case ns + "clearHistory":
			return {
				...state,
				past: [],
				future: [],
				present: null,
				isUndoRedoInProgress: false,
				pendingHistorySkips: 0,
			};
		default:
			return state;
	}
}
