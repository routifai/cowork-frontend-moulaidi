import type { PlaygroundArtifact } from "@/types/playground";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CodeView } from "./CodeView";

const artifact: PlaygroundArtifact = {
	id: "demo",
	type: "code",
	title: "demo.ts",
	content: "const x = 1;",
	language: "typescript",
	updatedAt: 1,
};

describe("CodeView", () => {
	it("renders the full content and the language label", () => {
		const { container } = render(<CodeView artifact={artifact} />);
		// Highlighting splits the line into multiple token <span>s, so assert on
		// the full text content rather than one exact text node.
		expect(container.textContent).toContain("const x = 1;");
		expect(screen.getByText("typescript")).toBeInTheDocument();
	});

	it("actually tokenizes the code (multiple spans, not one plain text node) — that's the whole point of 'editor style'", () => {
		const { container } = render(<CodeView artifact={artifact} />);
		const tokenSpans = container.querySelectorAll("pre span span");
		expect(tokenSpans.length).toBeGreaterThan(1);
	});

	it("renders a line number for each line", () => {
		const multiline = { ...artifact, content: "const x = 1;\nconst y = 2;\nconst z = 3;" };
		render(<CodeView artifact={multiline} />);
		const lineNumbers = screen.getAllByTestId("code-line-number").map((el) => el.textContent);
		expect(lineNumbers).toEqual(["1", "2", "3"]);
	});

	it("omits the language label when none is given, but still renders content", () => {
		const { container } = render(<CodeView artifact={{ ...artifact, language: undefined }} />);
		expect(screen.queryByText("typescript")).not.toBeInTheDocument();
		expect(container.textContent).toContain("const x = 1;");
	});
});
