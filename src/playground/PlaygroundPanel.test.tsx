import type { PlaygroundArtifact } from "@/types/playground";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { PlaygroundPanel } from "./PlaygroundPanel";

/** The tab label and its content-panel header often show the same text
 * (both are `artifact.title`) — scope assertions to the content panel so
 * they don't collide with the tab strip. */
function content() {
	return within(screen.getByTestId("playground-content"));
}

/** PlaygroundPanel's selection is a controlled prop (the parent — App.tsx —
 * owns it so a click on an artifact chip elsewhere in the tree can select a
 * tab even while the panel is closed). Most tests here only care about the
 * panel's own default behavior (auto-follow newest, click-to-pin), so this
 * wrapper manages that state locally, standing in for App.tsx. */
function Controlled({
	artifacts,
	onClose,
}: {
	artifacts: Record<string, PlaygroundArtifact>;
	onClose: () => void;
}) {
	const [selectedId, setSelectedId] = useState<string | null>(null);
	return (
		<PlaygroundPanel
			artifacts={artifacts}
			onClose={onClose}
			selectedId={selectedId}
			onSelectId={setSelectedId}
		/>
	);
}

function diff(id: string, updatedAt: number, title = id): PlaygroundArtifact {
	return {
		id,
		type: "diff",
		title,
		content: "@@ -1 +1 @@\n-old\n+new",
		updatedAt,
	};
}

function code(id: string, updatedAt: number): PlaygroundArtifact {
	return {
		id,
		type: "code",
		title: `${id}.ts`,
		content: `const ${id} = 1;`,
		language: "typescript",
		updatedAt,
	};
}

function html(id: string, updatedAt: number): PlaygroundArtifact {
	return {
		id,
		type: "html",
		title: `${id}.html`,
		content: `<h1>${id}</h1>`,
		updatedAt,
	};
}

describe("PlaygroundPanel", () => {
	it("renders nothing when there are no artifacts", () => {
		const { container } = render(<Controlled artifacts={{}} onClose={vi.fn()} />);
		expect(container).toBeEmptyDOMElement();
	});

	it("auto-selects the most recently updated artifact", () => {
		const artifacts = {
			a: diff("a", 100, "/a.ts"),
			b: diff("b", 200, "/b.ts"),
		};
		render(<Controlled artifacts={artifacts} onClose={vi.fn()} />);
		// /b.ts is newer (200 > 100), so its content should be showing.
		expect(content().getByText("/b.ts")).toBeInTheDocument();
	});

	it("renders a tab per artifact", () => {
		const artifacts = {
			a: diff("a", 100, "file-a"),
			b: code("b", 200),
		};
		render(<Controlled artifacts={artifacts} onClose={vi.fn()} />);
		expect(screen.getByTitle("file-a")).toBeInTheDocument();
		expect(screen.getByTitle("b.ts")).toBeInTheDocument();
	});

	it("clicking a tab pins it, ignoring which one is most recent", () => {
		const artifacts = {
			a: diff("a", 100, "file-a"),
			b: diff("b", 200, "file-b"),
		};
		render(<Controlled artifacts={artifacts} onClose={vi.fn()} />);
		// b is newest, showing by default.
		expect(content().getByText("file-b")).toBeInTheDocument();
		// User clicks the older tab.
		fireEvent.click(screen.getByTitle("file-a"));
		expect(content().getByText("file-a")).toBeInTheDocument();
	});

	it("a pinned tab stays selected even when a newer artifact arrives", () => {
		const artifacts = { a: diff("a", 100, "file-a") };
		const { rerender } = render(<Controlled artifacts={artifacts} onClose={vi.fn()} />);
		fireEvent.click(screen.getByTitle("file-a"));
		expect(content().getByText("file-a")).toBeInTheDocument();

		// A newer artifact arrives (e.g. a later show_artifact call).
		rerender(
			<Controlled artifacts={{ ...artifacts, b: diff("b", 200, "file-b") }} onClose={vi.fn()} />,
		);
		// Still showing the pinned tab, not auto-jumping to the newest.
		expect(content().getByText("file-a")).toBeInTheDocument();
	});

	it("selectedId prop from the parent selects a tab, even before any click inside the panel", () => {
		const artifacts = {
			a: diff("a", 100, "file-a"),
			b: diff("b", 200, "file-b"),
		};
		// b is newest, would auto-select by default — but the parent has
		// already chosen "a" (e.g. the user clicked its chip in chat).
		render(
			<PlaygroundPanel
				artifacts={artifacts}
				onClose={vi.fn()}
				selectedId="a"
				onSelectId={vi.fn()}
			/>,
		);
		expect(content().getByText("file-a")).toBeInTheDocument();
	});

	it("falls back to raw content for an artifact type with no renderer", () => {
		const artifacts = {
			weird: {
				id: "weird",
				// Cast past the type union: a type value nothing in this frontend
				// has a renderer for (e.g. frontend lagging a backend deploy that
				// adds a new type) must still show something, not vanish.
				type: "pdf" as PlaygroundArtifact["type"],
				title: "report.pdf",
				content: "raw content here",
				updatedAt: 100,
			},
		};
		render(<Controlled artifacts={artifacts} onClose={vi.fn()} />);
		expect(content().getByText("raw content here")).toBeInTheDocument();
	});

	it("calls onClose when the close button is clicked", () => {
		const onClose = vi.fn();
		render(<Controlled artifacts={{ a: diff("a", 100) }} onClose={onClose} />);
		fireEvent.click(screen.getByLabelText("Close playground panel"));
		expect(onClose).toHaveBeenCalledOnce();
	});

	describe("code/preview toggle", () => {
		it("shows the toggle for a renderable type (html) and defaults to preview", () => {
			const { container } = render(
				<Controlled artifacts={{ a: html("a", 100) }} onClose={vi.fn()} />,
			);
			expect(screen.getByLabelText("View code")).toBeInTheDocument();
			expect(container.querySelector("iframe")).toBeInTheDocument();
		});

		it("clicking the toggle switches from preview to raw code, and back", () => {
			const { container } = render(
				<Controlled artifacts={{ a: html("a", 100) }} onClose={vi.fn()} />,
			);
			fireEvent.click(screen.getByLabelText("View code"));
			expect(container.querySelector("iframe")).not.toBeInTheDocument();
			expect(content().getByText("<h1>a</h1>")).toBeInTheDocument();

			fireEvent.click(screen.getByLabelText("View preview"));
			expect(container.querySelector("iframe")).toBeInTheDocument();
		});

		it("hides the toggle entirely for non-renderable types (code, diff) — nothing to toggle", () => {
			render(<Controlled artifacts={{ a: diff("a", 100) }} onClose={vi.fn()} />);
			expect(screen.queryByLabelText("View code")).not.toBeInTheDocument();

			const { unmount } = render(
				<Controlled artifacts={{ b: code("b", 100) }} onClose={vi.fn()} />,
			);
			expect(screen.queryAllByLabelText("View code")).toHaveLength(0);
			unmount();
		});

		it("renders diff artifacts through the real diff view, not a plain <pre> dump — a real bug found in review: the toggle logic used to force CodeView for non-togglable types even in preview mode", () => {
			const { container } = render(
				<Controlled artifacts={{ a: diff("a", 100, "a-diff") }} onClose={vi.fn()} />,
			);
			// The side-by-side diff view renders a two-column grid with "old"/"new"
			// headers; a plain CodeView <pre> dump would not.
			expect(container.querySelector('[class*="grid-cols"], .grid')).toBeInTheDocument();
			expect(content().getAllByText("old").length).toBeGreaterThan(0);
			expect(content().getAllByText("new").length).toBeGreaterThan(0);
		});
	});

	describe("resize", () => {
		it("starts at the default width", () => {
			const { container } = render(
				<Controlled artifacts={{ a: diff("a", 100) }} onClose={vi.fn()} />,
			);
			const panel = container.firstElementChild as HTMLElement;
			expect(panel.style.width).toBe("420px");
		});

		it("dragging the handle left grows the panel width", () => {
			const { container } = render(
				<Controlled artifacts={{ a: diff("a", 100) }} onClose={vi.fn()} />,
			);
			const handle = screen.getByLabelText("Resize playground panel");
			const panel = container.firstElementChild as HTMLElement;

			// Events fire on the handle itself (Pointer Capture), not window —
			// this is what keeps the drag tracking correctly even if the cursor
			// crosses an <iframe> preview, which a window-level listener can't do.
			fireEvent.pointerDown(handle, { clientX: 500 });
			fireEvent.pointerMove(handle, { clientX: 400 }); // moved 100px left
			expect(panel.style.width).toBe("520px");
			fireEvent.pointerUp(handle);
		});

		it("dragging right shrinks the panel, clamped at the minimum width", () => {
			const { container } = render(
				<Controlled artifacts={{ a: diff("a", 100) }} onClose={vi.fn()} />,
			);
			const handle = screen.getByLabelText("Resize playground panel");
			const panel = container.firstElementChild as HTMLElement;

			fireEvent.pointerDown(handle, { clientX: 500 });
			fireEvent.pointerMove(handle, { clientX: 900 }); // moved 400px right — past the 320px floor
			expect(panel.style.width).toBe("320px");
			fireEvent.pointerUp(handle);
		});

		it("dragging left is clamped at the maximum width", () => {
			const { container } = render(
				<Controlled artifacts={{ a: diff("a", 100) }} onClose={vi.fn()} />,
			);
			const handle = screen.getByLabelText("Resize playground panel");
			const panel = container.firstElementChild as HTMLElement;

			fireEvent.pointerDown(handle, { clientX: 500 });
			fireEvent.pointerMove(handle, { clientX: -500 }); // moved 1000px left — past the 800px ceiling
			expect(panel.style.width).toBe("800px");
			fireEvent.pointerUp(handle);
		});

		it("stops resizing after pointerup", () => {
			const { container } = render(
				<Controlled artifacts={{ a: diff("a", 100) }} onClose={vi.fn()} />,
			);
			const handle = screen.getByLabelText("Resize playground panel");
			const panel = container.firstElementChild as HTMLElement;

			fireEvent.pointerDown(handle, { clientX: 500 });
			fireEvent.pointerMove(handle, { clientX: 400 });
			expect(panel.style.width).toBe("520px");
			fireEvent.pointerUp(handle);

			// Further pointer movement (no new pointerdown) must not resize.
			fireEvent.pointerMove(handle, { clientX: 100 });
			expect(panel.style.width).toBe("520px");
		});

		it("degrades gracefully when the browser doesn't support Pointer Capture (e.g. jsdom, some older WebViews) — the drag still works", () => {
			const { container } = render(
				<Controlled artifacts={{ a: diff("a", 100) }} onClose={vi.fn()} />,
			);
			const handle = screen.getByLabelText("Resize playground panel");
			const panel = container.firstElementChild as HTMLElement;

			expect((handle as HTMLButtonElement).setPointerCapture).toBeUndefined();
			fireEvent.pointerDown(handle, { clientX: 500 });
			fireEvent.pointerMove(handle, { clientX: 400 });
			expect(panel.style.width).toBe("520px");
		});
	});
});
