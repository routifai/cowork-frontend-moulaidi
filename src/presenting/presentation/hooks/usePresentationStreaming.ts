// @ts-nocheck — isolated legacy Presenton path; not imported by the embedded panel.
/**
 * usePresentationStreaming — Tauri-aware replacement for Presenton's
 * SSE-based streaming hook.
 *
 * Our presenting engine uses a blocking `presenting_start_generation` Tauri
 * command — there are no intermediate stream events. This hook manages the
 * loading/error lifecycle around that blocking call and dispatches state
 * updates via the presenting Context.
 *
 * The `stream` parameter mirrors the original hook's signature so callers
 * can be ported with minimal changes — when `stream` is non-null the hook
 * treats it as a pending generation (triggering the generation call), and
 * when null it falls back to `fetchUserSlides`.
 *
 * NOTE: `getState` must be the synchronous store accessor from
 * `usePresentingGetState()` — not a React state value — so it doesn't
 * create stale closures in the async callback.
 */

import { useEffect } from "react";
import { useDispatch } from "@/presenting/compat/redux";
import {
	clearPresentationData,
	setPresentationData,
	setStreaming,
	type PresentationData,
} from "@/presenting/state/slices/presentationGeneration";
import { notify } from "@/components/ui/sonner";

export const usePresentationStreaming = (
	_presentationId: string,
	stream: string | null,
	setLoading: (loading: boolean) => void,
	setError: (error: boolean) => void,
	fetchUserSlides: (options?: { clearHistory?: boolean }) => void | Promise<unknown>,
	_options: {
		preloadPresentationData?: boolean;
		generationMode?: "standard" | "smart";
	} = {},
) => {
	const dispatch = useDispatch();

	useEffect(() => {
		if (!stream) {
			fetchUserSlides();
			return;
		}

		// A generation token is present — the generation call was already kicked
		// off by PresentingPanel (see startGeneration in the panel). By the time
		// this hook runs, the result has already been dispatched as
		// setPresentationData. Mark streaming as done and show the slides.
		dispatch(setStreaming(false));
		setLoading(false);
	}, [stream, dispatch, setLoading, setError, fetchUserSlides]);
};
