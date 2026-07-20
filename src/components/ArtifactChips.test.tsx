import type { ToolCallInfo } from "@/types";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ArtifactChips } from "./ArtifactChips";

function showArtifact(id: string, title: string, type = "html"): ToolCallInfo {
	return {
		id: `tc-${id}`,
		name: "show_artifact",
		args: { id, title, type, content: "..." },
		status: "completed",
	};
}

describe("ArtifactChips", () => {
	it("renders nothing when there are no tool calls", () => {
		const { container } = render(<ArtifactChips toolCalls={undefined} onOpen={vi.fn()} />);
		expect(container).toBeEmptyDOMElement();
	});

	it("renders nothing when no tool call is show_artifact", () => {
		const toolCalls: ToolCallInfo[] = [
			{ id: "tc-1", name: "write", args: { path: "a.ts" }, status: "completed" },
		];
		const { container } = render(<ArtifactChips toolCalls={toolCalls} onOpen={vi.fn()} />);
		expect(container).toBeEmptyDOMElement();
	});

	it("renders a clickable chip with the artifact's title", () => {
		const onOpen = vi.fn();
		render(<ArtifactChips toolCalls={[showArtifact("demo", "My Page")]} onOpen={onOpen} />);
		fireEvent.click(screen.getByText("My Page"));
		expect(onOpen).toHaveBeenCalledWith("demo");
	});

	it("renders one chip per distinct artifact id", () => {
		const toolCalls = [showArtifact("a", "First"), showArtifact("b", "Second")];
		render(<ArtifactChips toolCalls={toolCalls} onOpen={vi.fn()} />);
		expect(screen.getByText("First")).toBeInTheDocument();
		expect(screen.getByText("Second")).toBeInTheDocument();
	});

	it("dedupes repeated show_artifact calls for the same id, keeping the last one", () => {
		const toolCalls = [showArtifact("demo", "Draft title"), showArtifact("demo", "Final title")];
		render(<ArtifactChips toolCalls={toolCalls} onOpen={vi.fn()} />);
		expect(screen.queryByText("Draft title")).not.toBeInTheDocument();
		expect(screen.getByText("Final title")).toBeInTheDocument();
	});

	it("ignores a show_artifact call with no usable id", () => {
		const toolCalls: ToolCallInfo[] = [
			{ id: "tc-x", name: "show_artifact", args: { title: "No id" }, status: "completed" },
		];
		const { container } = render(<ArtifactChips toolCalls={toolCalls} onOpen={vi.fn()} />);
		expect(container).toBeEmptyDOMElement();
	});
});
