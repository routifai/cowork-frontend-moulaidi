/**
 * usePresence — mounts the PulsePresence WebGL avatar for the lifetime of the
 * calling component and exposes its imperative API.
 *
 * Fails soft: in environments without WebGL (jsdom tests, headless CI) the
 * constructor throws, the hook logs once and every API call becomes a no-op,
 * so the chat works identically with or without a presence.
 */
import type { PresenceMode, PulsePresence } from "@/lib/presence/PulsePresence";
import { useEffect, useRef } from "react";

export interface PresenceApi {
	setAnchor: (el: HTMLElement | null, boost?: number) => void;
	setMode: (mode: PresenceMode) => void;
	glitch: (strength?: number) => void;
	ripple: () => void;
	snapToAnchor: () => void;
}

export function usePresence(enabled = true): PresenceApi {
	const instanceRef = useRef<PulsePresence | null>(null);
	// Last requested state, replayed when the async chunk finishes loading so
	// calls made before the module arrives aren't lost.
	const pendingRef = useRef<{ anchor: HTMLElement | null; boost: number; mode: PresenceMode }>({
		anchor: null,
		boost: 1,
		mode: "rest",
	});
	// Stable API object so consumers can safely list it in effect deps.
	const apiRef = useRef<PresenceApi>({
		setAnchor: (el, boost = 1) => {
			if (!el) return;
			pendingRef.current.anchor = el;
			pendingRef.current.boost = boost;
			instanceRef.current?.setAnchor(el, boost);
		},
		setMode: (mode) => {
			pendingRef.current.mode = mode;
			instanceRef.current?.setMode(mode);
		},
		glitch: (strength) => instanceRef.current?.glitch(strength),
		ripple: () => instanceRef.current?.ripple(),
		snapToAnchor: () => instanceRef.current?.snapToAnchor(),
	});

	useEffect(() => {
		if (!enabled) return;
		let disposed = false;
		let presence: PulsePresence | null = null;
		// Dynamic import keeps three/gsap out of the main bundle.
		import("@/lib/presence/PulsePresence")
			.then(({ PulsePresence: Presence }) => {
				if (disposed) return;
				presence = new Presence();
				document.body.appendChild(presence.canvas);
				presence.start();
				instanceRef.current = presence;
				// Replay whatever the component asked for while we were loading.
				const pending = pendingRef.current;
				presence.setMode(pending.mode);
				if (pending.anchor?.isConnected) {
					presence.setAnchor(pending.anchor, pending.boost);
					presence.snapToAnchor();
				}
			})
			.catch((err) => {
				console.warn("[presence] WebGL unavailable — presence disabled", err);
			});
		return () => {
			disposed = true;
			instanceRef.current = null;
			presence?.dispose();
		};
	}, [enabled]);

	return apiRef.current;
}
