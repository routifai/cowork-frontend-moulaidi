import { cleanupMocks } from "@/test/mocks";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageInput, planModeButtonConfig } from "./MessageInput";

describe("planModeButtonConfig", () => {
	it("maps undefined (off) to the enable-plan-mode action", () => {
		const config = planModeButtonConfig(undefined);
		expect(config).toMatchObject({
			label: "Plan",
			command: "/plan",
			active: false,
			disabled: false,
		});
	});

	it("maps 'plan active' to a cancel action", () => {
		const config = planModeButtonConfig("plan active");
		expect(config).toMatchObject({ label: "Planning…", command: "/plan exit", active: true });
	});

	it("maps 'plan ready' to the approve-and-implement CTA", () => {
		const config = planModeButtonConfig("plan ready");
		expect(config).toMatchObject({
			label: "Approve Plan",
			command: "/plan implement",
			active: true,
			cta: true,
		});
	});

	it("maps 'plan saved' to a resume-and-implement CTA", () => {
		const config = planModeButtonConfig("plan saved");
		expect(config).toMatchObject({ command: "/plan implement", cta: true });
	});

	it("maps 'plan implementing' to a disabled, non-actionable state", () => {
		const config = planModeButtonConfig("plan implementing");
		expect(config).toMatchObject({ disabled: true, command: "" });
	});
});

describe("MessageInput plan-mode toggle", () => {
	afterEach(() => {
		cleanupMocks();
	});

	it("shows 'Plan' and sends /plan when off", async () => {
		const onSend = vi.fn();
		const user = userEvent.setup();
		render(<MessageInput onSend={onSend} />);

		const button = screen.getByRole("button", { name: /turn on plan mode/i });
		expect(button).toHaveTextContent("Plan");
		await user.click(button);
		expect(onSend).toHaveBeenCalledWith("/plan");
	});

	it("shows 'Planning…' and sends /plan exit while active", async () => {
		const onSend = vi.fn();
		const user = userEvent.setup();
		render(<MessageInput onSend={onSend} planModeStatus="plan active" />);

		const button = screen.getByRole("button", { name: /plan mode is on/i });
		expect(button).toHaveTextContent("Planning…");
		await user.click(button);
		expect(onSend).toHaveBeenCalledWith("/plan exit");
	});

	it("shows 'Approve Plan' and sends /plan implement when ready", async () => {
		const onSend = vi.fn();
		const user = userEvent.setup();
		render(<MessageInput onSend={onSend} planModeStatus="plan ready" />);

		const button = screen.getByRole("button", { name: /plan is ready for review/i });
		expect(button).toHaveTextContent("Approve Plan");
		await user.click(button);
		expect(onSend).toHaveBeenCalledWith("/plan implement");
	});

	it("sends the command via onPlanModeAction, not onSend, when both are provided", async () => {
		const onSend = vi.fn();
		const onPlanModeAction = vi.fn();
		const user = userEvent.setup();
		render(<MessageInput onSend={onSend} onPlanModeAction={onPlanModeAction} />);

		await user.click(screen.getByRole("button", { name: /turn on plan mode/i }));
		expect(onPlanModeAction).toHaveBeenCalledWith("/plan");
		expect(onSend).not.toHaveBeenCalled();
	});

	it("disables the button and does not send while implementing", async () => {
		const onSend = vi.fn();
		const user = userEvent.setup();
		render(<MessageInput onSend={onSend} planModeStatus="plan implementing" />);

		const button = screen.getByRole("button", { name: /implementing the approved plan/i });
		expect(button).toBeDisabled();
		await user.click(button);
		expect(onSend).not.toHaveBeenCalled();
	});
});
