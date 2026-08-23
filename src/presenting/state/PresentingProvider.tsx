/**
 * PresentingContext — provides the scoped store for the Presenting Panel.
 *
 * Usage:
 *   <PresentingProvider>
 *     <YourPanelComponents />
 *   </PresentingProvider>
 *
 * Consumers call:
 *   const { state, dispatch } = usePresentingStore();
 *   const generation = usePresentingSelector(s => s.generation);
 */

import type React from "react";
import { createContext, useCallback, useContext, useRef, useSyncExternalStore } from "react";
import { type PresentingStore, createPresentingStore } from "./store";
import type { Action, PresentingStoreState } from "./store";

// ---------------------------------------------------------------------------
// Context types
// ---------------------------------------------------------------------------

interface PresentingContextValue {
	store: PresentingStore;
}

const PresentingContext = createContext<PresentingContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface PresentingProviderProps {
	children: React.ReactNode;
	/** Inject a custom store for testing. */
	store?: PresentingStore;
}

export function PresentingProvider({ children, store: injected }: PresentingProviderProps) {
	const storeRef = useRef<PresentingStore>(injected ?? createPresentingStore());

	const value: PresentingContextValue = { store: storeRef.current };

	return <PresentingContext.Provider value={value}>{children}</PresentingContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

function usePresentingContext(): PresentingContextValue {
	const ctx = useContext(PresentingContext);
	if (!ctx) {
		throw new Error("usePresentingStore must be used inside <PresentingProvider>");
	}
	return ctx;
}

/**
 * Returns `{ state, dispatch }` — re-renders whenever any slice changes.
 * Prefer `usePresentingSelector` for components that only need a slice.
 */
export function usePresentingStore(): {
	state: PresentingStoreState;
	dispatch: (action: Action) => void;
} {
	const { store } = usePresentingContext();
	const state = useSyncExternalStore(
		useCallback((cb) => store.subscribe(cb), [store]),
		() => store.getState(),
		() => store.getState(),
	);
	const dispatch = useCallback((action: Action) => store.dispatch(action), [store]);
	return { state, dispatch };
}

/**
 * Selector hook — re-renders only when the selected slice changes (by
 * reference equality, same guarantee as useSyncExternalStore).
 */
export function usePresentingSelector<T>(selector: (s: PresentingStoreState) => T): T {
	const { store } = usePresentingContext();
	return useSyncExternalStore(
		useCallback((cb) => store.subscribe(cb), [store]),
		() => selector(store.getState()),
		() => selector(store.getState()),
	);
}

/**
 * Returns the dispatch function — stable across renders, safe to use in
 * callbacks.
 */
export function usePresentingDispatch(): (action: Action) => void {
	const { store } = usePresentingContext();
	return useCallback((action: Action) => store.dispatch(action), [store]);
}

/**
 * Returns a synchronous `getState()` function — for imperative sites that
 * cannot use hooks (e.g. inside streaming callbacks).
 */
export function usePresentingGetState(): () => PresentingStoreState {
	const { store } = usePresentingContext();
	return useCallback(() => store.getState(), [store]);
}
