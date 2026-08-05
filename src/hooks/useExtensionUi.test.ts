import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

type Listener = (event: { payload: unknown }) => void;
const listeners = new Map<string, Listener>();

const mockListen = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/event", () => ({
	listen: mockListen,
}));
vi.mock("@tauri-apps/api/core", () => ({
	invoke: vi.fn(),
}));

import { useExtensionUi } from "./useExtensionUi";

function emit(eventName: string, payload: unknown) {
	listeners.get(eventName)?.({ payload });
}

describe("useExtensionUi statuses", () => {
	afterEach(() => {
		listeners.clear();
		vi.clearAllMocks();
	});

	mockListen.mockImplementation((eventName: string, cb: Listener) => {
		listeners.set(eventName, cb);
		return Promise.resolve(() => listeners.delete(eventName));
	});

	it("starts with no statuses recorded", () => {
		const { result } = renderHook(() => useExtensionUi());
		expect(result.current.statuses).toEqual({});
	});

	it("records a setStatus fire-and-forget event under its statusKey", async () => {
		const { result } = renderHook(() => useExtensionUi());
		await waitFor(() => expect(listeners.has("ui_request")).toBe(true));

		act(() => {
			emit("ui_request", {
				id: "1",
				method: "setStatus",
				statusKey: "plan-mode",
				statusText: "plan active",
			});
		});

		await waitFor(() => expect(result.current.statuses["plan-mode"]).toBe("plan active"));
	});

	it("does not queue setStatus as a dialog", async () => {
		const { result } = renderHook(() => useExtensionUi());
		await waitFor(() => expect(listeners.has("ui_request")).toBe(true));

		act(() => {
			emit("ui_request", {
				id: "2",
				method: "setStatus",
				statusKey: "plan-mode",
				statusText: "plan ready",
			});
		});

		await waitFor(() => expect(result.current.statuses["plan-mode"]).toBe("plan ready"));
		expect(result.current.current).toBeNull();
	});

	it("clears a status when statusText is undefined", async () => {
		const { result } = renderHook(() => useExtensionUi());
		await waitFor(() => expect(listeners.has("ui_request")).toBe(true));

		act(() => {
			emit("ui_request", {
				id: "3",
				method: "setStatus",
				statusKey: "plan-mode",
				statusText: "plan active",
			});
		});
		await waitFor(() => expect(result.current.statuses["plan-mode"]).toBe("plan active"));

		act(() => {
			emit("ui_request", {
				id: "4",
				method: "setStatus",
				statusKey: "plan-mode",
				statusText: undefined,
			});
		});
		await waitFor(() => expect(result.current.statuses["plan-mode"]).toBeUndefined());
	});
});
