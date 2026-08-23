/**
 * React-Redux compat shim for the presenting sub-tree.
 *
 * Files ported from Presenton's Next.js frontend used `useDispatch` and
 * `useSelector` from `react-redux`. This module re-exports context-aware
 * replacements so ported files can be mechanically migrated with minimal
 * diff:
 *
 *   - Replace `import { useDispatch, useSelector } from "react-redux"` →
 *     `import { useDispatch, useSelector } from "@/presenting/compat/redux"`.
 *   - Replace `useSelector((state: RootState) => state.presentationGeneration.X)` →
 *     `useSelector((state) => state.generation.X)` (field rename only).
 *   - Remove `AppDispatch` / `RootState` type imports from `@/store/store`.
 */

import { usePresentingDispatch, usePresentingSelector } from "../state/PresentingProvider";
import { usePresentingGetState } from "../state/PresentingProvider";
import type { PresentingStoreState } from "../state/store";

export type RootState = PresentingStoreState;
/** `AppDispatch` is the same as the dispatch fn type in this context. */
export type AppDispatch = (action: { type: string; payload?: any }) => void;

/** Drop-in for `react-redux`'s `useDispatch`. */
export const useDispatch = usePresentingDispatch;

/** Drop-in for `react-redux`'s `useSelector`. */
export function useSelector<T>(selector: (state: PresentingStoreState) => T): T {
	return usePresentingSelector(selector);
}

/** Drop-in for `react-redux`'s `useStore` (imperative access pattern). */
export function useStore() {
	const getState = usePresentingGetState();
	const dispatch = usePresentingDispatch();
	return { getState, dispatch };
}
