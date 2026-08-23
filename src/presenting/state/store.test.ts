/**
 * Tests for PresentingStore — state management without React.
 */

import {
	clearPresentationData,
	setLoading,
	setPresentationData,
} from "@/presenting/state/slices/presentationGeneration";
import { addToHistory, clearHistory, redo, undo } from "@/presenting/state/slices/undoRedoSlice";
import {
	clearUpload,
	setDocumentParsed,
	setDocumentParsing,
	setParseError,
} from "@/presenting/state/slices/uploadSlice";
import { createPresentingStore } from "@/presenting/state/store";
import type { Slide } from "@/presenting/types/slide";
import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSlides(n: number): Slide[] {
	return Array.from({ length: n }, (_, i) => ({
		id: `slide-${i}`,
		index: i,
		type: 0,
		design_index: null,
		images: null,
		icons: null,
		graph_id: null,
		properties: null,
		content: { title: `Slide ${i}`, body: "" },
	}));
}

// ---------------------------------------------------------------------------
// Store basics
// ---------------------------------------------------------------------------

describe("PresentingStore — basics", () => {
	it("initialises with correct defaults", () => {
		const store = createPresentingStore();
		const { generation, undoRedo, upload } = store.getState();
		expect(generation.isLoading).toBe(false);
		expect(generation.presentationData).toBeNull();
		expect(undoRedo.present).toBeNull();
		expect(upload.documentText).toBeNull();
	});

	it("notifies subscribers on dispatch", () => {
		const store = createPresentingStore();
		const listener = vi.fn();
		store.subscribe(listener);
		store.dispatch(setLoading(true));
		expect(listener).toHaveBeenCalledOnce();
	});

	it("does NOT notify subscribers when state is unchanged (no-op via unknown action)", () => {
		const store = createPresentingStore();
		const listener = vi.fn();
		store.subscribe(listener);
		// An unknown action type hits all reducers' default branches → same references
		store.dispatch({ type: "@@unknown/no-op" });
		expect(listener).not.toHaveBeenCalled();
	});

	it("unsubscribe stops notifications", () => {
		const store = createPresentingStore();
		const listener = vi.fn();
		const unsub = store.subscribe(listener);
		unsub();
		store.dispatch(setLoading(true));
		expect(listener).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// Generation slice
// ---------------------------------------------------------------------------

describe("PresentingStore — generation slice", () => {
	it("setLoading updates isLoading", () => {
		const store = createPresentingStore();
		store.dispatch(setLoading(true));
		expect(store.getState().generation.isLoading).toBe(true);
	});

	it("setPresentationData stores data", () => {
		const store = createPresentingStore();
		const data = {
			id: "pid",
			language: "en",
			layout: {},
			n_slides: 1,
			title: "My Deck",
			slides: [],
			theme: null,
		};
		store.dispatch(setPresentationData(data));
		expect(store.getState().generation.presentationData?.title).toBe("My Deck");
	});

	it("clearPresentationData nullifies presentationData", () => {
		const store = createPresentingStore();
		store.dispatch(
			setPresentationData({
				id: "x",
				language: "en",
				layout: {},
				n_slides: 0,
				title: "X",
				slides: [],
				theme: null,
			}),
		);
		store.dispatch(clearPresentationData());
		expect(store.getState().generation.presentationData).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Undo/Redo slice
// ---------------------------------------------------------------------------

describe("PresentingStore — undoRedo slice", () => {
	it("addToHistory sets present on first call", () => {
		const store = createPresentingStore();
		const slides = makeSlides(2);
		store.dispatch(addToHistory({ slides, actionType: "test" }));
		expect(store.getState().undoRedo.present?.slides).toBe(slides);
		expect(store.getState().undoRedo.past).toHaveLength(0);
	});

	it("second addToHistory pushes first to past", () => {
		const store = createPresentingStore();
		const s1 = makeSlides(2);
		const s2 = makeSlides(3);
		store.dispatch(addToHistory({ slides: s1, actionType: "first" }));
		store.dispatch(addToHistory({ slides: s2, actionType: "second" }));
		expect(store.getState().undoRedo.past).toHaveLength(1);
		expect(store.getState().undoRedo.present?.slides).toBe(s2);
	});

	it("undo reverts to previous state", () => {
		const store = createPresentingStore();
		const s1 = makeSlides(2);
		const s2 = makeSlides(3);
		store.dispatch(addToHistory({ slides: s1, actionType: "first" }));
		store.dispatch(addToHistory({ slides: s2, actionType: "second" }));
		store.dispatch(undo());
		expect(store.getState().undoRedo.present?.slides).toBe(s1);
		expect(store.getState().undoRedo.future).toHaveLength(1);
	});

	it("redo re-applies undone state", () => {
		const store = createPresentingStore();
		const s1 = makeSlides(2);
		const s2 = makeSlides(3);
		store.dispatch(addToHistory({ slides: s1, actionType: "first" }));
		store.dispatch(addToHistory({ slides: s2, actionType: "second" }));
		store.dispatch(undo());
		store.dispatch(redo());
		expect(store.getState().undoRedo.present?.slides).toBe(s2);
		expect(store.getState().undoRedo.future).toHaveLength(0);
	});

	it("clearHistory resets undo/redo", () => {
		const store = createPresentingStore();
		store.dispatch(addToHistory({ slides: makeSlides(2), actionType: "a" }));
		store.dispatch(addToHistory({ slides: makeSlides(3), actionType: "b" }));
		store.dispatch(clearHistory());
		const { past, present, future } = store.getState().undoRedo;
		expect(past).toHaveLength(0);
		expect(present).toBeNull();
		expect(future).toHaveLength(0);
	});

	it("undo is a no-op when past is empty", () => {
		const store = createPresentingStore();
		const s = makeSlides(1);
		store.dispatch(addToHistory({ slides: s, actionType: "a" }));
		store.dispatch(undo());
		// Only one item: undo moves present to future, past is still empty
		expect(store.getState().undoRedo.past).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// Upload slice
// ---------------------------------------------------------------------------

describe("PresentingStore — upload slice", () => {
	it("setDocumentParsing sets isParsing=true", () => {
		const store = createPresentingStore();
		store.dispatch(setDocumentParsing("report.pdf"));
		expect(store.getState().upload.isParsing).toBe(true);
		expect(store.getState().upload.documentName).toBe("report.pdf");
	});

	it("setDocumentParsed stores text and clears parsing flag", () => {
		const store = createPresentingStore();
		store.dispatch(setDocumentParsing("doc.docx"));
		store.dispatch(setDocumentParsed({ documentText: "Extracted text", documentName: "doc.docx" }));
		expect(store.getState().upload.isParsing).toBe(false);
		expect(store.getState().upload.documentText).toBe("Extracted text");
		expect(store.getState().upload.parseError).toBeNull();
	});

	it("setParseError stores error and clears parsing flag", () => {
		const store = createPresentingStore();
		store.dispatch(setDocumentParsing("bad.pdf"));
		store.dispatch(setParseError("File too large"));
		expect(store.getState().upload.isParsing).toBe(false);
		expect(store.getState().upload.parseError).toBe("File too large");
	});

	it("clearUpload resets to initial state", () => {
		const store = createPresentingStore();
		store.dispatch(setDocumentParsed({ documentText: "abc", documentName: "x.pdf" }));
		store.dispatch(clearUpload());
		expect(store.getState().upload.documentText).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Immutability checks
// ---------------------------------------------------------------------------

describe("PresentingStore — immutability", () => {
	it("dispatch does not mutate previous state reference", () => {
		const store = createPresentingStore();
		const before = store.getState();
		store.dispatch(setLoading(true));
		expect(store.getState()).not.toBe(before);
		expect(before.generation.isLoading).toBe(false);
	});

	it("no-op dispatch (unknown action) returns same state reference", () => {
		const store = createPresentingStore();
		const before = store.getState();
		store.dispatch({ type: "@@unknown/no-op" });
		expect(store.getState()).toBe(before);
	});
});
