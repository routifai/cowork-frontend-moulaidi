import type { PlaygroundArtifact } from "@/types/playground";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownView } from "./MarkdownView";

const artifact: PlaygroundArtifact = {
	id: "demo",
	type: "markdown",
	title: "Demo",
	content: "# Hello\n\nSome **bold** text.",
	updatedAt: 1,
};

describe("MarkdownView", () => {
	it("renders markdown as formatted HTML, not raw text", () => {
		render(<MarkdownView artifact={artifact} />);
		expect(screen.getByRole("heading", { name: "Hello" })).toBeInTheDocument();
		expect(screen.getByText("bold").tagName).toBe("STRONG");
	});
});
