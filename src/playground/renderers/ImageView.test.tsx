import type { PlaygroundArtifact } from "@/types/playground";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ImageView } from "./ImageView";

const base: PlaygroundArtifact = {
	id: "demo",
	type: "image",
	title: "screenshot.png",
	content: "data:image/png;base64,iVBORw0KGgo=",
	updatedAt: 1,
};

describe("ImageView", () => {
	it("renders an img tag for a data: URI", () => {
		render(<ImageView artifact={base} />);
		const img = screen.getByAltText("screenshot.png");
		expect(img).toHaveAttribute("src", base.content);
	});

	it("shows a not-yet-supported message for a non-data-URI (file path) — v1 scope limitation", () => {
		render(<ImageView artifact={{ ...base, content: "/Users/simo/photo.png" }} />);
		expect(screen.queryByAltText("screenshot.png")).not.toBeInTheDocument();
		expect(screen.getByText(/aren't supported yet/)).toBeInTheDocument();
	});
});
