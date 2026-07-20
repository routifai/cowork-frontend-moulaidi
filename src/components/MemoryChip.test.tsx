import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryChips } from "./MemoryChip";

describe("MemoryChips", () => {
	it("renders nothing when there are no save_memory calls", () => {
		const { container } = render(<MemoryChips toolCalls={[]} onOpen={vi.fn()} />);
		expect(container.firstChild).toBeNull();
	});

	it("renders a chip per save_memory topic", () => {
		render(
			<MemoryChips
				toolCalls={[
					{
						id: "1",
						name: "save_memory",
						status: "completed",
						args: { topic: "Stack", summary: "Use pnpm and Node 22", type: "project" },
					},
				]}
				onOpen={vi.fn()}
			/>,
		);
		expect(screen.getByText("Use pnpm and Node 22")).toBeDefined();
	});

	it("deduplicates by topic, keeping the latest call", () => {
		render(
			<MemoryChips
				toolCalls={[
					{
						id: "1",
						name: "save_memory",
						status: "completed",
						args: { topic: "Stack", summary: "Old summary" },
					},
					{
						id: "2",
						name: "save_memory",
						status: "completed",
						args: { topic: "Stack", summary: "New summary" },
					},
				]}
				onOpen={vi.fn()}
			/>,
		);
		expect(screen.getByText("New summary")).toBeDefined();
		expect(screen.queryByText("Old summary")).toBeNull();
	});

	it("calls onOpen when clicked", () => {
		const onOpen = vi.fn();
		render(
			<MemoryChips
				toolCalls={[
					{
						id: "1",
						name: "save_memory",
						status: "completed",
						args: { topic: "Stack", summary: "Use pnpm" },
					},
				]}
				onOpen={onOpen}
			/>,
		);
		screen.getByText("Use pnpm").click();
		expect(onOpen).toHaveBeenCalledTimes(1);
	});
});
