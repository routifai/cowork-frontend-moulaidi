import { open } from "@tauri-apps/plugin-dialog";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PresentingPanel } from "./PresentingPanel";
import * as api from "./api/presentingApi";

vi.mock("@tauri-apps/plugin-dialog", () => ({
	open: vi.fn(),
	save: vi.fn(),
}));

vi.mock("./api/presentingApi", () => ({
	enginePing: vi.fn(),
	parseDocument: vi.fn(),
	startGeneration: vi.fn(),
	chatEdit: vi.fn(),
	getPresentation: vi.fn(),
	exportPresentation: vi.fn(),
	importTemplate: vi.fn(),
	listImportedTemplates: vi.fn().mockResolvedValue([]),
	deleteImportedTemplate: vi.fn(),
}));

const deck = {
	id: "deck-1",
	presentation_id: "deck-1",
	title: "Test deck",
	template: "general",
	language: "English",
	n_slides: 1,
	layout: {},
	theme: null,
	fonts: null,
	generation_mode: "standard" as const,
	version: "v2-standard",
	slides: [
		{
			id: "slide-1",
			index: 0,
			layout: "title",
			layout_group: "general",
			content: { title: "Hello world" },
			ui: null,
			html_content: null,
			properties: null,
			speaker_note: null,
		},
	],
};

describe("PresentingPanel", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(api.enginePing).mockResolvedValue({ pong: true });
		vi.mocked(api.startGeneration).mockResolvedValue(deck);
	});

	it("boots into both entry paths", async () => {
		render(<PresentingPanel provider="anthropic" model="claude" />);
		expect(await screen.findByText("Choose a preset template")).toBeInTheDocument();
		expect(screen.getByText("Upload a document template")).toBeInTheDocument();
		expect(screen.getAllByRole("button", { name: /General/i })).toHaveLength(1);
	});

	it("generates from a preset and hydrates the editor", async () => {
		render(<PresentingPanel provider="anthropic" model="claude" />);
		fireEvent.click(await screen.findByRole("button", { name: /General/i }));
		fireEvent.change(screen.getByPlaceholderText(/Describe the audience/i), {
			target: { value: "A deck about renewable energy" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Generate presentation" }));
		expect(await screen.findByText("Test deck")).toBeInTheDocument();
		expect(screen.getAllByText("Hello world")).toHaveLength(2);
		expect(api.startGeneration).toHaveBeenCalledWith(
			expect.objectContaining({ template: "general", provider: "anthropic", model: "claude" }),
		);
	});

	it("parses an uploaded document before generation", async () => {
		vi.mocked(open).mockResolvedValue("/tmp/report.pdf");
		vi.mocked(api.parseDocument).mockResolvedValue({ text: "# Intro\nFacts", name: "report.pdf" });
		render(<PresentingPanel provider="anthropic" model="claude" />);
		fireEvent.click(await screen.findByText("Upload a document template"));
		await screen.findByDisplayValue("Create a presentation from report.pdf");
		fireEvent.click(screen.getByRole("button", { name: "Generate presentation" }));
		await waitFor(() =>
			expect(api.startGeneration).toHaveBeenCalledWith(
				expect.objectContaining({ document_text: "# Intro\nFacts", document_name: "report.pdf" }),
			),
		);
	});

	it("shows a recoverable engine boot error", async () => {
		vi.mocked(api.enginePing).mockRejectedValue(new Error("offline"));
		render(<PresentingPanel provider="anthropic" model="claude" />);
		expect(await screen.findByText("PowerPoint Builder needs attention")).toBeInTheDocument();
		expect(screen.getByText(/offline/)).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Back to start" }));
		expect(await screen.findByText("Build a presentation")).toBeInTheDocument();
	});
});
