/**
 * Unified presenting store — combines the three domain slices:
 *   - presentationGenerationReducer  (slides, loading, outlines, chat selection)
 *   - undoRedoReducer                (undo/redo history stack)
 *   - uploadReducer                  (uploaded-template document state)
 *
 * Exposes:
 *   - `dispatch(action)` for state mutations.
 *   - `getState()` — synchronous snapshot used by the two imperative call
 *     sites (usePresentationStreaming, auto-save) that need state outside
 *     React render.
 *   - `subscribe(listener)` — used by the Context to drive re-renders.
 *
 * No Redux Toolkit, no React Redux. Plain useReducer-style logic lifted to a
 * class so it works both inside React (via PresentingProvider) and in tests
 * without a DOM.
 */

import type { PresentationGenerationState } from "./slices/presentationGeneration";
import {
	presentationGenerationInitialState,
	presentationGenerationReducer,
} from "./slices/presentationGeneration";
import type { UndoRedoState } from "./slices/undoRedoSlice";
import { undoRedoInitialState, undoRedoReducer } from "./slices/undoRedoSlice";
import type { UploadState } from "./slices/uploadSlice";
import { uploadInitialState, uploadReducer } from "./slices/uploadSlice";
import type { ImportedTemplateState } from "./slices/importedTemplateSlice";
import { importedTemplateInitialState, importedTemplateReducer } from "./slices/importedTemplateSlice";

export interface PresentingStoreState {
	generation: PresentationGenerationState;
	undoRedo: UndoRedoState;
	upload: UploadState;
	importedTemplate: ImportedTemplateState;
}

const initialState: PresentingStoreState = {
	generation: presentationGenerationInitialState,
	undoRedo: undoRedoInitialState,
	upload: uploadInitialState,
	importedTemplate: importedTemplateInitialState,
};

type Listener = () => void;

export type Action = { type: string; payload?: any };

/**
 * Synchronous store — holds the current state and notifies subscribers on
 * every dispatch. React's `useSyncExternalStore` integration lives in
 * PresentingProvider.tsx so this class stays framework-free.
 */
export class PresentingStore {
	private state: PresentingStoreState;
	private listeners = new Set<Listener>();

	constructor(initial: PresentingStoreState = initialState) {
		this.state = initial;
	}

	getState(): PresentingStoreState {
		return this.state;
	}

	dispatch(action: Action): void {
		const next: PresentingStoreState = {
			generation: presentationGenerationReducer(this.state.generation, action),
			undoRedo: undoRedoReducer(this.state.undoRedo, action),
			upload: uploadReducer(this.state.upload, action),
			importedTemplate: importedTemplateReducer(this.state.importedTemplate, action),
		};
		// Skip notification if nothing changed (pure reducers return `state` as-is)
		if (
			next.generation === this.state.generation &&
			next.undoRedo === this.state.undoRedo &&
			next.upload === this.state.upload &&
			next.importedTemplate === this.state.importedTemplate
		) {
			return;
		}
		this.state = next;
		for (const listener of this.listeners) listener();
	}

	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
}

/** Singleton used by PresentingProvider — replaced in tests via constructor injection. */
export function createPresentingStore(): PresentingStore {
	return new PresentingStore();
}
