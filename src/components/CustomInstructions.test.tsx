import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomInstructions } from "./CustomInstructions";

// Polyfill window.matchMedia for jsdom (getThemeMode reads it).
if (typeof window.matchMedia !== "function") {
	Object.defineProperty(window, "matchMedia", {
		writable: true,
		value: (query: string) => ({
			matches: false,
			media: query,
			onchange: null,
			addEventListener: () => {},
			removeEventListener: () => {},
			addListener: () => {},
			removeListener: () => {},
			dispatchEvent: () => false,
		}),
	});
}

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
	invoke: (...args: unknown[]) => mockInvoke(...args),
}));

// MDEditor pulls in CodeMirror-style DOM that is noisy under jsdom. Mock it with
// a plain textarea that mirrors the real value/onChange contract so the
// component's load/save logic is exercised deterministically.
vi.mock("@uiw/react-md-editor", () => ({
	default: ({
		value,
		onChange,
		textareaProps,
	}: {
		value?: string;
		onChange?: (v?: string) => void;
		textareaProps?: { placeholder?: string; disabled?: boolean };
	}) => (
		<textarea
			aria-label="Custom instructions"
			placeholder={textareaProps?.placeholder}
			disabled={textareaProps?.disabled}
			value={value ?? ""}
			onChange={(e) => onChange?.(e.target.value)}
		/>
	),
}));
vi.mock("@uiw/react-md-editor/markdown-editor.css", () => ({}));

const PLACEHOLDER =
	"e.g. You are a senior developer who prefers TypeScript. Always explain trade-offs and keep changes minimal.";

describe("CustomInstructions", () => {
	beforeEach(() => {
		mockInvoke.mockReset();
		mockInvoke.mockImplementation(async (cmd: string) => {
			if (cmd === "get_instructions") return "";
			if (cmd === "save_instructions") return { success: true };
			return null;
		});
	});

	it("renders the markdown editor", () => {
		render(<CustomInstructions />);
		expect(screen.getByPlaceholderText(PLACEHOLDER)).toBeDefined();
	});

	it("loads saved instructions via get_instructions on mount", async () => {
		mockInvoke.mockImplementation(async (cmd: string) => {
			if (cmd === "get_instructions") return "Always use tabs for indentation.";
			return { success: true };
		});
		render(<CustomInstructions />);
		await vi.waitFor(() => {
			const el = screen.getByLabelText("Custom instructions") as HTMLTextAreaElement;
			expect(el.value).toBe("Always use tabs for indentation.");
		});
	});

	it("saves instructions via save_instructions with a Save button", async () => {
		render(<CustomInstructions />);
		await vi.waitFor(() => {
			expect(screen.getByText("Save")).not.toBeDisabled();
		});
		const editor = screen.getByLabelText("Custom instructions") as HTMLTextAreaElement;
		fireEvent.change(editor, { target: { value: "Write concise code." } });
		fireEvent.click(screen.getByText("Save"));
		await vi.waitFor(() => {
			expect(mockInvoke).toHaveBeenCalledWith("save_instructions", {
				content: "Write concise code.",
			});
		});
	});

	it("shows a saved confirmation after saving", async () => {
		render(<CustomInstructions />);
		await vi.waitFor(() => {
			expect(screen.getByText("Save")).not.toBeDisabled();
		});
		const editor = screen.getByLabelText("Custom instructions") as HTMLTextAreaElement;
		fireEvent.change(editor, { target: { value: "Be helpful." } });
		fireEvent.click(screen.getByText("Save"));
		await vi.waitFor(() => {
			expect(screen.getByText(/Saved!/)).toBeDefined();
		});
	});

	it("handles a load failure gracefully", () => {
		mockInvoke.mockImplementation(async () => {
			throw new Error("instructions not available");
		});
		render(<CustomInstructions />);
		const editor = screen.getByLabelText("Custom instructions") as HTMLTextAreaElement;
		expect(editor.value).toBe("");
	});
});
