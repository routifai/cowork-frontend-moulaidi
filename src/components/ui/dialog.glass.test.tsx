import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Dialog } from "./dialog";

/**
 * Brand-blue glass theme (#190): every modal is built on the Dialog
 * primitive, so the primitive's panel must use the elevated-glass surface
 * (`panel-raised`) rather than a flat `bg-card`. This guarantees a
 * consistent floating-glass look across ConfirmDialog, FeedbackDialog,
 * TelemetryConsentDialog and any future modal.
 */
describe("Dialog primitive — elevated glass surface", () => {
	it("renders the panel with the elevated-glass class", () => {
		const { getByRole } = render(
			<Dialog open onClose={() => {}}>
				<div>content</div>
			</Dialog>,
		);
		const panel = getByRole("dialog");
		expect(panel.className).toContain("panel-raised");
	});

	it("does not use the flat bg-card surface on the panel", () => {
		const { getByRole } = render(
			<Dialog open onClose={() => {}}>
				<div>content</div>
			</Dialog>,
		);
		const panel = getByRole("dialog");
		expect(panel.className).not.toContain("bg-card");
	});
});
