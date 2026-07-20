/**
 * Stub declarations for the Tauri packages we are removing from the web build.
 * These keep existing modules compiling during the adapter refactor.
 * Once all consumers use EngineAdapter, this file can be deleted.
 */
declare module "@tauri-apps/api/core" {
	export function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
	export function isTauri(): boolean;
	export class Channel<T> {
		constructor();
		onmessage: (msg: T) => void;
		id: string;
	}
}

declare module "@tauri-apps/api/event" {
	export type UnlistenFn = () => void;
	export function listen<T>(
		event: string,
		handler: (event: { payload: T }) => void,
	): Promise<() => void>;
}

declare module "@tauri-apps/api/app" {
	export function getVersion(): Promise<string>;
}

declare module "@tauri-apps/plugin-dialog" {
	export interface DialogFilter {
		name: string;
		extensions: string[];
	}
	export interface OpenOptions {
		multiple?: boolean;
		directory?: boolean;
		filters?: DialogFilter[];
		title?: string;
		defaultPath?: string;
	}
	export interface SaveOptions {
		filters?: DialogFilter[];
		title?: string;
		defaultPath?: string;
	}
	export function open(options?: OpenOptions): Promise<string | string[] | null>;
	export function save(options?: SaveOptions): Promise<string | null>;
}

declare module "@tauri-apps/plugin-fs" {
	export function readTextFile(path: string): Promise<string>;
	export function readFile(path: string): Promise<Uint8Array>;
}

declare module "@tauri-apps/plugin-updater" {
	export interface Update {
		version: string;
		currentVersion: string;
		body?: string;
		downloadAndInstall(
			event?: (event: {
				event: string;
				data?: { contentLength?: number; chunkLength?: number };
			}) => void,
		): Promise<void>;
	}
	export function check(): Promise<Update | null>;
}

declare module "@tauri-apps/plugin-process" {
	export function relaunch(): Promise<void>;
}
