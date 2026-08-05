import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PlanModeQuestionCard } from "./PlanModeQuestionCard";

describe("PlanModeQuestionCard — select", () => {
	it("renders each option as a clickable button and responds with its exact string", async () => {
		const onRespond = vi.fn();
		const user = userEvent.setup();
		render(
			<PlanModeQuestionCard
				request={{
					kind: "ui_request",
					id: "1",
					method: "select",
					title: "Timeline: How soon do you need this?",
					options: [
						"1. This week — fastest, less polish",
						"2. Next sprint",
						"3. Other (free-form)",
					],
				}}
				onRespond={onRespond}
			/>,
		);

		expect(screen.getByText("Timeline: How soon do you need this?")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: /this week/i }));
		expect(onRespond).toHaveBeenCalledWith({
			value: "1. This week — fastest, less polish",
		});
	});
});

describe("PlanModeQuestionCard — editor (the 'Other (free-form)' follow-up)", () => {
	it("submits typed free-form text", async () => {
		const onRespond = vi.fn();
		const user = userEvent.setup();
		render(
			<PlanModeQuestionCard
				request={{
					kind: "ui_request",
					id: "2",
					method: "editor",
					title: "Timeline: How soon do you need this?",
				}}
				onRespond={onRespond}
			/>,
		);

		await user.type(screen.getByPlaceholderText(/type your answer/i), "By end of month");
		await user.click(screen.getByRole("button", { name: /submit/i }));
		expect(onRespond).toHaveBeenCalledWith({ value: "By end of month" });
	});

	it("disables Submit until text is entered", () => {
		render(
			<PlanModeQuestionCard
				request={{ kind: "ui_request", id: "3", method: "editor" }}
				onRespond={vi.fn()}
			/>,
		);
		expect(screen.getByRole("button", { name: /submit/i })).toBeDisabled();
	});

	it("cancels without a value on Cancel", async () => {
		const onRespond = vi.fn();
		const user = userEvent.setup();
		render(
			<PlanModeQuestionCard
				request={{ kind: "ui_request", id: "4", method: "editor" }}
				onRespond={onRespond}
			/>,
		);
		await user.click(screen.getByRole("button", { name: /cancel/i }));
		expect(onRespond).toHaveBeenCalledWith({ cancelled: true });
	});
});
