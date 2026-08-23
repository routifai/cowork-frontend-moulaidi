/** Stub — font loading hook for the panel. */
import { useCallback } from "react";

export function useFontLoader() {
	const loadFonts = useCallback((_fonts?: unknown) => Promise.resolve(), []);
	return { loadFonts };
}

export function applyFonts(_fonts?: unknown): void {}
