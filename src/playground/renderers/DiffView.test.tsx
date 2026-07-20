import type { PlaygroundArtifact } from "@/types/playground";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DiffView, UnrecognizedArtifact } from "./DiffView";

const base: PlaygroundArtifact = {
	id: "demo",
	type: "diff",
	title: "/a.ts",
	content: "@@ -1 +1 @@\n-old\n+new",
	updatedAt: 1,
};

describe("DiffView", () => {
	it("renders the title and a diff", () => {
		const { container } = render(<DiffView artifact={base} />);
		expect(screen.getByText("/a.ts")).toBeInTheDocument();
		expect(container.textContent).toContain("old");
		expect(container.textContent).toContain("new");
	});

	it("shows a fallback message when content is empty", () => {
		render(<DiffView artifact={{ ...base, content: "" }} />);
		expect(screen.getByText("No diff content.")).toBeInTheDocument();
	});
});

describe("UnrecognizedArtifact", () => {
	it("shows the type, title, and raw content so nothing silently disappears", () => {
		const artifact = {
			...base,
			type: "pdf" as PlaygroundArtifact["type"],
			content: "raw bytes here",
		};
		render(<UnrecognizedArtifact artifact={artifact} />);
		expect(screen.getByText(/pdf/)).toBeInTheDocument();
		expect(screen.getByText("raw bytes here")).toBeInTheDocument();
	});
});
