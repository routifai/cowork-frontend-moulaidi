/** Stub — keyboard shortcut hook for the panel. */
import { useEffect, useCallback } from "react";

export function useKeyboardShortcut(
	_shortcut: string | string[],
	callback: (e: KeyboardEvent) => void,
	_deps?: unknown[],
): void {
	// eslint-disable-next-line react-hooks/exhaustive-deps
	const stableCallback = useCallback(callback, _deps ?? [callback]);
	useEffect(() => {
		document.addEventListener("keydown", stableCallback);
		return () => document.removeEventListener("keydown", stableCallback);
	}, [stableCallback]);
}
