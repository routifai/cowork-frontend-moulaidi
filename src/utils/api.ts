/**
 * Stub for Presenton's API utility helpers.
 * In Hypatia, there is no HTTP backend URL — all commands go through Tauri.
 */
export function getApiUrl(_path: string): string {
	return _path;
}
export function normalizeBackendAssetUrls<T>(data: T): T {
	return data;
}
export function resolveBackendAssetSource(url: string): string {
	return url;
}
