import type { ToolCallInfo } from "@/types";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ActivityBlock, ActivityRecap } from "./ActivityBlock";

function tc(
	name: string,
	status: ToolCallInfo["status"] = "completed",
	id = Math.random().toString(36).slice(2),
): ToolCallInfo {
	return { id, name, args: {}, status };
}

describe("ActivityBlock", () => {
	it("renders friendly phrase, not raw tool names", () => {
		render(<ActivityBlock toolCalls={[tc("write", "running")]} active />);
		expect(screen.getByText(/Creating a document/)).toBeInTheDocument();
		expect(screen.queryByText(/write/)).not.toBeInTheDocument();
	});

	it("shows a count when consecutive same-type calls are clubbed", () => {
		render(
			<ActivityBlock
				toolCalls={[tc("read", "running"), tc("read", "running"), tc("read", "running")]}
				active
			/>,
		);
		expect(screen.getByText(/Reading your files \(3\)/)).toBeInTheDocument();
	});

	it("never surfaces shell commands or paths", () => {
		const bash: ToolCallInfo = {
			id: "b1",
			name: "bash",
			args: { command: "rm -rf /tmp/secret" },
			status: "running",
		};
		render(<ActivityBlock toolCalls={[bash]} active />);
		expect(screen.getByText(/Working in your workspace/)).toBeInTheDocument();
		expect(screen.queryByText(/rm -rf/)).not.toBeInTheDocument();
	});

	it("renders nothing with no tool calls", () => {
		const { container } = render(<ActivityBlock toolCalls={[]} />);
		expect(container).toBeEmptyDOMElement();
	});
});

describe("ActivityRecap", () => {
	it("summarizes step count without jargon", () => {
		render(<ActivityRecap toolCalls={[tc("read"), tc("write"), tc("bash")]} />);
		expect(screen.getByText(/Done/)).toBeInTheDocument();
		expect(screen.getByText(/3 steps/)).toBeInTheDocument();
	});

	it("uses singular for one step", () => {
		render(<ActivityRecap toolCalls={[tc("read")]} />);
		expect(screen.getByText(/1 step/)).toBeInTheDocument();
	});

	it("signals issues when a tool errored", () => {
		render(<ActivityRecap toolCalls={[tc("read"), tc("bash", "error")]} />);
		expect(screen.getByText(/Finished with issues/)).toBeInTheDocument();
	});
});
