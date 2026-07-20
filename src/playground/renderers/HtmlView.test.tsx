import type { PlaygroundArtifact } from "@/types/playground";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HtmlView } from "./HtmlView";

const artifact: PlaygroundArtifact = {
	id: "demo",
	type: "html",
	title: "Demo",
	content: "<h1>hi</h1>",
	updatedAt: 1,
};

describe("HtmlView", () => {
	it("renders a sandboxed iframe with the content as srcDoc", () => {
		const { container } = render(<HtmlView artifact={artifact} />);
		const iframe = container.querySelector("iframe");
		expect(iframe).toBeInTheDocument();
		expect(iframe).toHaveAttribute("srcdoc", "<h1>hi</h1>");
		expect(iframe).toHaveAttribute("sandbox", "allow-scripts");
		expect(iframe).toHaveAttribute("title", "Demo");
	});
});
