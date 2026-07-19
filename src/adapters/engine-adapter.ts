/**
 * Transport-agnostic interface between the Hypatia UI and the Hypatia engine.
 *
 * The current monorepo uses Tauri `invoke()` and `listen()`. When the engine
 * moves to a standalone HTTP server, the UI will switch to an HttpAdapter that
 * sends commands via POST and receives events via SSE — without changing the
 * callers.
 */

export interface EngineInvokeOptions {
	/** Request timeout in milliseconds. */
	timeoutMs?: number;
}

export type EngineListener<T = unknown> = (event: T) => void;

export interface EngineAdapter {
	/** True if this adapter is currently connected to an engine. */
	readonly connected: boolean;

	/**
	 * Send a command and wait for a result envelope.
	 * Mirrors the old Tauri `invoke("command", payload)` shape.
	 */
	invoke<T = unknown>(command: string, payload?: Record<string, unknown>, options?: EngineInvokeOptions): Promise<T>;

	/**
	 * Subscribe to a global engine event (e.g. "ready", "queue_update").
	 * Returns an unsubscribe function.
	 */
	listen<T = unknown>(event: string, handler: EngineListener<T>): () => void;

	/**
	 * Send a streaming prompt command. The stream emits events through the
	 * normal `listen` mechanism under the given prompt id.
	 */
	stream(command: string, payload?: Record<string, unknown>): Promise<string>;
}

/** Placeholder for environments where no engine is present (storybook, unit tests). */
export const noopAdapter: EngineAdapter = {
	connected: false,
	invoke: async () => {
		throw new Error("No engine adapter configured");
	},
	listen: () => () => {},
	stream: async () => {
		throw new Error("No engine adapter configured");
	},
};

let globalAdapter: EngineAdapter = noopAdapter;

export function setEngineAdapter(adapter: EngineAdapter): void {
	globalAdapter = adapter;
}

export function getEngineAdapter(): EngineAdapter {
	return globalAdapter;
}
