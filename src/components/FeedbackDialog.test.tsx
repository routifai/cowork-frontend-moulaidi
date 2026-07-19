import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FeedbackDialog } from "./FeedbackDialog";

const mockTrackEvent = vi.fn();
vi.mock("@/lib/telemetry", () => ({
	trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

const MESSAGE_PLACEHOLDER = "Tell us what's on your mind...";
const EMAIL_PLACEHOLDER = "Email (optional, for follow-up)";

describe("FeedbackDialog", () => {
	it("renders when open", () => {
		render(<FeedbackDialog open={true} onClose={() => {}} />);
		expect(screen.getByText("Send feedback")).toBeDefined();
	});

	it("does not render when closed", () => {
		render(<FeedbackDialog open={false} onClose={() => {}} />);
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("renders category selector", () => {
		render(<FeedbackDialog open={true} onClose={() => {}} />);
		expect(screen.getByText("Bug")).toBeDefined();
		expect(screen.getByText("Feature")).toBeDefined();
		expect(screen.getByText("General")).toBeDefined();
	});

	it("renders message textarea", () => {
		render(<FeedbackDialog open={true} onClose={() => {}} />);
		expect(screen.getByPlaceholderText(MESSAGE_PLACEHOLDER)).toBeDefined();
	});

	it("renders optional email input", () => {
		render(<FeedbackDialog open={true} onClose={() => {}} />);
		expect(screen.getByPlaceholderText(EMAIL_PLACEHOLDER)).toBeDefined();
	});

	it("submit button is disabled when message is empty", () => {
		render(<FeedbackDialog open={true} onClose={() => {}} />);
		const submitBtn = screen.getByText("Submit").closest("button") as HTMLButtonElement;
		expect(submitBtn).toBeDisabled();
	});

	it("submit button is enabled when message is filled", () => {
		render(<FeedbackDialog open={true} onClose={() => {}} />);
		const textarea = screen.getByPlaceholderText(MESSAGE_PLACEHOLDER);
		fireEvent.change(textarea, { target: { value: "Great app!" } });
		const submitBtn = screen.getByText("Submit").closest("button") as HTMLButtonElement;
		expect(submitBtn).not.toBeDisabled();
	});

	it("calls trackEvent on submit", () => {
		render(<FeedbackDialog open={true} onClose={vi.fn()} />);
		const textarea = screen.getByPlaceholderText(MESSAGE_PLACEHOLDER);
		fireEvent.change(textarea, { target: { value: "Love this app" } });
		fireEvent.click(screen.getByText("Submit").closest("button") as HTMLButtonElement);
		expect(mockTrackEvent).toHaveBeenCalledWith("app_feedback", {
			category: "general",
			message: "Love this app",
		});
	});

	it("includes category in telemetry", () => {
		render(<FeedbackDialog open={true} onClose={() => {}} />);
		const textarea = screen.getByPlaceholderText(MESSAGE_PLACEHOLDER);
		fireEvent.change(textarea, { target: { value: "Button misaligned" } });
		fireEvent.click(screen.getByText("Bug"));
		fireEvent.click(screen.getByText("Submit").closest("button") as HTMLButtonElement);
		expect(mockTrackEvent).toHaveBeenCalledWith("app_feedback", {
			category: "bug",
			message: "Button misaligned",
		});
	});

	it("resets form when reopened", async () => {
		const { rerender } = render(<FeedbackDialog open={true} onClose={() => {}} />);
		const textarea = screen.getByPlaceholderText(MESSAGE_PLACEHOLDER);
		fireEvent.change(textarea, { target: { value: "Feedback text" } });

		// Close the dialog (AnimatePresence keeps it briefly mounted during exit)
		rerender(<FeedbackDialog open={false} onClose={() => {}} />);
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

		// Re-open
		rerender(<FeedbackDialog open={true} onClose={() => {}} />);
		expect((screen.getByPlaceholderText(MESSAGE_PLACEHOLDER) as HTMLTextAreaElement).value).toBe(
			"",
		);
	});
});
