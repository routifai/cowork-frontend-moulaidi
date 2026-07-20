import type { PlaygroundArtifact } from "@/types/playground";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PlaygroundReopenTab } from "./PlaygroundPanel";

const artifact: PlaygroundArtifact = {
	id: "a",
	type: "diff",
	title: "a.ts",
	content: "d",
	updatedAt: 1,
};

describe("PlaygroundReopenTab", () => {
	it("renders nothing when there are no artifacts", () => {
		const { container } = render(<PlaygroundReopenTab artifacts={{}} onOpen={vi.fn()} />);
		expect(container).toBeEmptyDOMElement();
	});

	it("shows the artifact count", () => {
		render(
			<PlaygroundReopenTab
				artifacts={{ a: artifact, b: { ...artifact, id: "b" } }}
				onOpen={vi.fn()}
			/>,
		);
		expect(screen.getByText("2")).toBeInTheDocument();
	});

	it("calls onOpen when clicked", () => {
		const onOpen = vi.fn();
		render(<PlaygroundReopenTab artifacts={{ a: artifact }} onOpen={onOpen} />);
		fireEvent.click(screen.getByLabelText("Show playground"));
		expect(onOpen).toHaveBeenCalledOnce();
	});
});
