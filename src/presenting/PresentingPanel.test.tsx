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
	restoreSlide: vi.fn(),
	listSmartExamples: vi.fn().mockResolvedValue([]),
	saveSlideHtml: vi.fn(),
	onGenerationProgress: vi.fn().mockResolvedValue(() => {}),
}));

const deck = {
	id: "deck-1",
	presentation_id: "deck-1",
	title: "Test deck",
	template: "smart",
	language: "English",
	n_slides: 1,
	layout: null,
	theme: null,
	fonts: null,
	generation_mode: "smart" as const,
	version: "v2-smart",
	slides: [
		{
			id: "slide-1",
			index: 0,
			layout: "title",
			layout_group: "smart",
			content: {},
			ui: null,
			html_content:
				'<section data-slide-type="title" class="relative h-[720px] w-[1280px] overflow-hidden bg-white"><h1>Hello world</h1></section>',
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

	it("boots into the start screen", async () => {
		render(<PresentingPanel provider="anthropic" model="claude" />);
		expect(await screen.findByText("Build a presentation")).toBeInTheDocument();
		expect(screen.getByText("Upload a source document")).toBeInTheDocument();
	});

	it("generates from a prompt and hydrates the editor", async () => {
		render(<PresentingPanel provider="anthropic" model="claude" />);
		await screen.findByText("Build a presentation");
		fireEvent.change(screen.getByPlaceholderText(/Describe the audience/i), {
			target: { value: "A deck about renewable energy" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Generate presentation" }));
		expect(await screen.findByText("Test deck")).toBeInTheDocument();
		expect(api.startGeneration).toHaveBeenCalledWith(
			expect.objectContaining({ template: "smart", provider: "anthropic", model: "claude" }),
		);
	});

	it("parses an uploaded document before generation", async () => {
		vi.mocked(open).mockResolvedValue("/tmp/report.pdf");
		vi.mocked(api.parseDocument).mockResolvedValue({ text: "# Intro\nFacts", name: "report.pdf" });
		render(<PresentingPanel provider="anthropic" model="claude" />);
		fireEvent.click(await screen.findByText("Upload a source document"));
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
