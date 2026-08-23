/**
 * Tests for PresentingProvider and hooks — uses jsdom + React Testing Library.
 */

import {
	PresentingProvider,
	usePresentingDispatch,
	usePresentingSelector,
	usePresentingStore,
} from "@/presenting/state/PresentingProvider";
import { setLoading } from "@/presenting/state/slices/presentationGeneration";
import { addToHistory, undo } from "@/presenting/state/slices/undoRedoSlice";
import { PresentingStore } from "@/presenting/state/store";
import type { Slide } from "@/presenting/types/slide";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSlides(n: number): Slide[] {
	return Array.from({ length: n }, (_, i) => ({
		id: `s${i}`,
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

function TestConsumer() {
	const { state, dispatch } = usePresentingStore();
	return (
		<div>
			<span data-testid="loading">{String(state.generation.isLoading)}</span>
			<button type="button" onClick={() => dispatch(setLoading(true))}>
				load
			</button>
		</div>
	);
}

function SelectorConsumer() {
	const isLoading = usePresentingSelector((s) => s.generation.isLoading);
	return <span data-testid="sel-loading">{String(isLoading)}</span>;
}

function DispatchConsumer() {
	const dispatch = usePresentingDispatch();
	return (
		<button type="button" onClick={() => dispatch(setLoading(true))} data-testid="disp-btn">
			go
		</button>
	);
}

// ---------------------------------------------------------------------------
// Basic rendering
// ---------------------------------------------------------------------------

describe("PresentingProvider — rendering", () => {
	it("renders children", () => {
		render(
			<PresentingProvider>
				<span>child</span>
			</PresentingProvider>,
		);
		expect(screen.getByText("child")).toBeTruthy();
	});

	it("throws when hooks used outside provider", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		expect(() => render(<TestConsumer />)).toThrow();
		spy.mockRestore();
	});
});

// ---------------------------------------------------------------------------
// usePresentingStore
// ---------------------------------------------------------------------------

describe("usePresentingStore", () => {
	it("returns initial state", () => {
		render(
			<PresentingProvider>
				<TestConsumer />
			</PresentingProvider>,
		);
		expect(screen.getByTestId("loading").textContent).toBe("false");
	});

	it("reflects dispatch", async () => {
		render(
			<PresentingProvider>
				<TestConsumer />
			</PresentingProvider>,
		);
		await act(async () => {
			screen.getByText("load").click();
		});
		expect(screen.getByTestId("loading").textContent).toBe("true");
	});
});

// ---------------------------------------------------------------------------
// usePresentingSelector
// ---------------------------------------------------------------------------

describe("usePresentingSelector", () => {
	it("returns selected slice", () => {
		render(
			<PresentingProvider>
				<SelectorConsumer />
			</PresentingProvider>,
		);
		expect(screen.getByTestId("sel-loading").textContent).toBe("false");
	});
});

// ---------------------------------------------------------------------------
// usePresentingDispatch
// ---------------------------------------------------------------------------

describe("usePresentingDispatch", () => {
	it("dispatches actions that update state", async () => {
		render(
			<PresentingProvider>
				<DispatchConsumer />
				<SelectorConsumer />
			</PresentingProvider>,
		);
		await act(async () => {
			screen.getByTestId("disp-btn").click();
		});
		expect(screen.getByTestId("sel-loading").textContent).toBe("true");
	});
});

// ---------------------------------------------------------------------------
// Injected store
// ---------------------------------------------------------------------------

describe("PresentingProvider — injected store", () => {
	it("accepts a pre-built store", () => {
		const store = new PresentingStore();
		store.dispatch(setLoading(true));
		render(
			<PresentingProvider store={store}>
				<TestConsumer />
			</PresentingProvider>,
		);
		expect(screen.getByTestId("loading").textContent).toBe("true");
	});
});

// ---------------------------------------------------------------------------
// Undo/redo integration via context
// ---------------------------------------------------------------------------

function UndoConsumer() {
	const { state, dispatch } = usePresentingStore();
	const slides = state.undoRedo.present?.slides ?? [];
	return (
		<div>
			<span data-testid="slide-count">{slides.length}</span>
			<button
				type="button"
				onClick={() => dispatch(addToHistory({ slides: makeSlides(2), actionType: "a" }))}
			>
				push 2
			</button>
			<button
				type="button"
				onClick={() => dispatch(addToHistory({ slides: makeSlides(3), actionType: "b" }))}
			>
				push 3
			</button>
			<button type="button" onClick={() => dispatch(undo())}>
				undo
			</button>
		</div>
	);
}

describe("PresentingProvider — undo/redo through context", () => {
	it("push and undo round-trip", async () => {
		render(
			<PresentingProvider>
				<UndoConsumer />
			</PresentingProvider>,
		);
		await act(async () => screen.getByText("push 2").click());
		await act(async () => screen.getByText("push 3").click());
		expect(screen.getByTestId("slide-count").textContent).toBe("3");

		await act(async () => screen.getByText("undo").click());
		expect(screen.getByTestId("slide-count").textContent).toBe("2");
	});
});
