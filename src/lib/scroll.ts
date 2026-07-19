/**
 * Scroll helpers for "stick to bottom" chat/log UX (#300).
 *
 * The pattern: a streaming view auto-scrolls to the latest content as it
 * arrives — but ONLY while the user is already at (or near) the bottom. If the
 * user scrolls up to read earlier content, auto-scroll pauses. When they scroll
 * back down to the bottom, sticking resumes.
 *
 * This module holds the pure decision so it can be unit-tested without a DOM.
 */

export interface ScrollMetrics {
	scrollTop: number;
	scrollHeight: number;
	clientHeight: number;
}

/**
 * Whether the scroll position is at/near the bottom within `threshold` px.
 * A small threshold absorbs sub-pixel rounding and lets "almost at bottom"
 * still count as sticking. When content is shorter than the viewport there is
 * nothing to scroll, so we treat that as "at bottom".
 */
export function isNearBottom(
	{ scrollTop, scrollHeight, clientHeight }: ScrollMetrics,
	threshold = 48,
): boolean {
	const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
	return distanceFromBottom <= threshold;
}
