import type { PlaygroundArtifact, PlaygroundArtifactPayload } from "@/types/playground";
import { useCallback, useState } from "react";

export interface UsePlaygroundArtifactsReturn {
	artifacts: Record<string, PlaygroundArtifact>;
	/** Live upsert — one artifact at a time, keyed by id. */
	upsert: (payload: PlaygroundArtifactPayload) => void;
	/** Bulk-replace the whole map (session reload). */
	seed: (records: (PlaygroundArtifactPayload & { updatedAt?: number })[]) => void;
	/** Full reset (new session / switch session / delete session). */
	clear: () => void;
}

/**
 * Playground artifacts live in their OWN store, independent of the chat-turn
 * reducer (usePiStream's StreamState) — this is the structural fix for a
 * real bug found earlier: bolting artifacts into StreamState meant a
 * turn-lifecycle RESET action could (and did) wipe them out from under a
 * live turn. Living here instead, no chat-turn action can reach this state
 * at all, by construction rather than by convention.
 */
export function usePlaygroundArtifacts(): UsePlaygroundArtifactsReturn {
	const [artifacts, setArtifacts] = useState<Record<string, PlaygroundArtifact>>({});

	const upsert = useCallback((payload: PlaygroundArtifactPayload) => {
		setArtifacts((prev) => ({ ...prev, [payload.id]: { ...payload, updatedAt: Date.now() } }));
	}, []);

	const seed = useCallback((records: (PlaygroundArtifactPayload & { updatedAt?: number })[]) => {
		const next: Record<string, PlaygroundArtifact> = {};
		for (const r of records) next[r.id] = { ...r, updatedAt: r.updatedAt ?? Date.now() };
		setArtifacts(next);
	}, []);

	const clear = useCallback(() => setArtifacts({}), []);

	return { artifacts, upsert, seed, clear };
}
