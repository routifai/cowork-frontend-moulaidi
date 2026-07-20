import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemorySettings } from "./MemorySettings";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

describe("MemorySettings", () => {
	beforeEach(() => {
		invoke.mockReset();
	});

	it("renders the panel with no memories recorded yet", async () => {
		invoke.mockImplementation(async (cmd: string) => {
			if (cmd === "get_memory_index") return { entries: [] };
			return null;
		});

		render(<MemorySettings />);
		expect(screen.getByText("Project Memory")).toBeInTheDocument();
		await waitFor(() => expect(invoke).toHaveBeenCalledWith("get_memory_index"));
	});

	it("lists a topic from the index and expands it to show its note", async () => {
		invoke.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
			if (cmd === "get_memory_index") {
				return {
					entries: [
						{
							topic: "stack",
							summary: "Uses Tauri + React",
							type: "project",
							updatedAt: "2026-01-01T00:00:00.000Z",
						},
					],
				};
			}
			if (cmd === "get_memory_note" && args?.topic === "stack") {
				return { content: "Full detail about the stack." };
			}
			return null;
		});

		render(<MemorySettings />);
		// "stack" itself also appears in the read-only index preview above, so
		// scope on the row's summary text (unique) to find and click the topic row.
		const summary = await screen.findByText("Uses Tauri + React");
		fireEvent.click(summary);
		expect(await screen.findByLabelText("stack detail note")).toBeInTheDocument();
	});

	it("saves a note and calls save_memory_note with memoryType (not type)", async () => {
		invoke.mockImplementation(async (cmd: string) => {
			if (cmd === "get_memory_index") {
				return {
					entries: [
						{
							topic: "stack",
							summary: "Uses Tauri + React",
							type: "project",
							updatedAt: "2026-01-01T00:00:00.000Z",
						},
					],
				};
			}
			if (cmd === "get_memory_note") return { content: "Full detail about the stack." };
			if (cmd === "save_memory_note") return { success: true };
			return null;
		});

		render(<MemorySettings />);
		fireEvent.click(await screen.findByText("Uses Tauri + React"));
		await screen.findByLabelText("stack detail note");

		fireEvent.click(screen.getByRole("button", { name: "Save note" }));

		await waitFor(() =>
			expect(invoke).toHaveBeenCalledWith("save_memory_note", {
				topic: "stack",
				summary: "Uses Tauri + React",
				memoryType: "project",
				noteContent: "Full detail about the stack.",
			}),
		);
	});

	it("deletes a topic and removes it from the index list", async () => {
		invoke.mockImplementation(async (cmd: string) => {
			if (cmd === "get_memory_index") {
				return {
					entries: [
						{
							topic: "stack",
							summary: "Uses Tauri + React",
							type: "project",
							updatedAt: "2026-01-01T00:00:00.000Z",
						},
					],
				};
			}
			if (cmd === "delete_memory_topic") return { removed: true };
			return null;
		});

		render(<MemorySettings />);
		await screen.findByText("Uses Tauri + React");

		fireEvent.click(screen.getByTitle("Delete topic"));

		await waitFor(() =>
			expect(invoke).toHaveBeenCalledWith("delete_memory_topic", { topic: "stack" }),
		);
		await waitFor(() => expect(screen.queryByText("Uses Tauri + React")).not.toBeInTheDocument());
	});
});
