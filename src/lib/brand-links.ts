/**
 * Canonical Hypatia Cowork outbound links.
 *
 * Centralized so the About page, feedback flows and anywhere else that
 * points users at the product share one source of truth. All of these are
 * external URLs and open in the system browser via the global
 * external-link handler (see `external-links.ts`).
 */
export const BRAND_LINKS = {
	/** Marketing site / landing page. */
	website: "https://hypatia.ai",
	/** Product repository (issue tracking). */
	repo: "https://github.com/hypatiai/hypatia-cowork",
	/** All issues (search before filing). */
	issues: "https://github.com/hypatiai/hypatia-cowork/issues",
	/** New issue with template picker (bug / feature). */
	newIssue: "https://github.com/hypatiai/hypatia-cowork/issues/new/choose",
	/** Latest published release + changelog. */
	releases: "https://github.com/hypatiai/hypatia-cowork/releases/latest",
	/** Community chat. */
	discord: "https://discord.com/invite/HQcyTD5jHA",
	/** Showcase gallery. */
	gallery: "https://www.hypatia.ai/hypatia-cowork/gallery",
	/** The pi engine Hypatia Cowork is built on. */
	pi: "https://github.com/earendil-works/pi-coding-agent",
} as const;

export type BrandLink = keyof typeof BRAND_LINKS;
