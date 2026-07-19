import { describe, expect, it } from "vitest";
import { isExternalUrl } from "./utils";

describe("isExternalUrl", () => {
	it("accepts known-safe navigable schemes (case-insensitive)", () => {
		expect(isExternalUrl("https://example.com")).toBe(true);
		expect(isExternalUrl("http://example.com")).toBe(true);
		expect(isExternalUrl("HTTPS://EXAMPLE.COM")).toBe(true);
		expect(isExternalUrl("mailto:a@b.com")).toBe(true);
		expect(isExternalUrl("tel:+15551234")).toBe(true);
		expect(isExternalUrl("//cdn.example.com/x")).toBe(true);
	});

	it("rejects dangerous and non-navigable schemes (allowlist, not blocklist)", () => {
		// Security: these must never be force-opened externally.
		expect(isExternalUrl("javascript:alert(1)")).toBe(false);
		expect(isExternalUrl("JavaScript:alert(1)")).toBe(false);
		expect(isExternalUrl("vbscript:msgbox(1)")).toBe(false);
		expect(isExternalUrl("data:text/html,<script>")).toBe(false);
		expect(isExternalUrl("blob:https://x/y")).toBe(false);
	});

	it("rejects in-page anchors and empty values", () => {
		expect(isExternalUrl("#section")).toBe(false);
		expect(isExternalUrl("")).toBe(false);
		expect(isExternalUrl(null)).toBe(false);
		expect(isExternalUrl(undefined)).toBe(false);
		expect(isExternalUrl("   ")).toBe(false);
	});
});
