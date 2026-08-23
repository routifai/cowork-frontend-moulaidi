/** Stub for Presenton's analytics helpers (no-op in Hypatia). */
export function sanitizeAnalyticsError(error: unknown, fallback: string): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	return fallback;
}
export function bucketMessageLength(_msg: string): string { return ""; }
