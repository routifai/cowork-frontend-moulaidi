import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";

/**
 * Extension UI bridge (frontend half).
 *
 * pi extensions render to the user through abstract `ctx.ui.*` calls. The
 * sidecar's uiContext bridge emits each interactive call as a global
 * `ui_request` Tauri event ({ kind, method, id, ... }); dialog methods then
 * wait for a `ui_response` we send back via the `send_ui_response` command.
 *
 * This hook listens for `ui_request`, queues the interactive ones (select /
 * confirm / input / editor) so they show one at a time, and exposes a
 * `respond()` callback that resolves the active request. Fire-and-forget
 * methods (notify / setStatus / setWidget / setTitle / set_editor_text) are
 * acknowledged here but not rendered (no response is expected for them).
 */

export type ExtensionUiMethod = "select" | "confirm" | "input" | "editor";

export interface ExtensionUiRequest {
	kind: "ui_request";
	id: string;
	method: ExtensionUiMethod | string;
	title?: string;
	message?: string;
	options?: string[];
	placeholder?: string;
	prefill?: string;
	timeout?: number;
	notifyType?: "info" | "warning" | "error";
}

export interface ExtensionUiResponse {
	value?: string;
	confirmed?: boolean;
	cancelled?: boolean;
}

const DIALOG_METHODS = new Set<string>(["select", "confirm", "input", "editor"]);

function isDialogRequest(req: ExtensionUiRequest): boolean {
	return DIALOG_METHODS.has(req.method);
}

export function useExtensionUi() {
	// FIFO queue of pending interactive dialogs. The head is the one shown.
	const [queue, setQueue] = useState<ExtensionUiRequest[]>([]);

	// Drop a request from the queue by id (used by ui_cancel and by respond()).
	const removeFromQueue = useCallback((id: string) => {
		setQueue((prev) => prev.filter((r) => r.id !== id));
	}, []);

	useEffect(() => {
		let mounted = true;
		const unlisteners: Array<() => void> = [];

		(async () => {
			const uRequest = await listen<ExtensionUiRequest>("ui_request", (event) => {
				const req = event.payload;
				if (!req || typeof req.id !== "string") return;
				if (isDialogRequest(req)) {
					setQueue((prev) => [...prev, req]);
				}
				// Fire-and-forget methods (notify, setStatus, setWidget, …) carry
				// no dialog and expect no response — nothing to render.
			});
			// The sidecar resolved a dialog itself (timeout/abort) → dismiss it.
			const uCancel = await listen<{ id?: string }>("ui_cancel", (event) => {
				const id = event.payload?.id;
				if (typeof id === "string") removeFromQueue(id);
			});
			if (!mounted) {
				uRequest();
				uCancel();
				return;
			}
			unlisteners.push(uRequest, uCancel);
		})();

		return () => {
			mounted = false;
			for (const u of unlisteners) u();
		};
	}, [removeFromQueue]);

	const current = queue[0] ?? null;

	const respond = useCallback(
		(response: ExtensionUiResponse) => {
			if (!current) return;
			const id = current.id;
			// Pop the head first so the next queued dialog (if any) renders even
			// if the IPC call is slow or rejects.
			setQueue((prev) => prev.slice(1));
			void invoke("send_ui_response", {
				id,
				value: response.value,
				confirmed: response.confirmed,
				cancelled: response.cancelled,
			}).catch(() => {
				// Sidecar may have moved on (timeout/abort) — the pending promise
				// there is already resolved, so a dropped response is harmless.
			});
		},
		[current],
	);

	return { current, respond };
}
