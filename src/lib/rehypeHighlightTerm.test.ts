import type { Element, Root } from "hast";
import { describe, expect, it } from "vitest";
import { rehypeHighlightTerm } from "./rehypeHighlightTerm";

/** Build a minimal hast tree: a single <p> wrapping the given text. */
function para(text: string): Root {
	return {
		type: "root",
		children: [
			{
				type: "element",
				tagName: "p",
				properties: {},
				children: [{ type: "text", value: text }],
			},
		],
	};
}

/** Collect every <mark> element in a tree. */
function marks(tree: Root): Element[] {
	const out: Element[] = [];
	function walk(node: { type: string; children?: unknown[]; tagName?: string }) {
		if (node.type === "element" && node.tagName === "mark") out.push(node as Element);
		if (Array.isArray(node.children)) {
			for (const c of node.children) walk(c as { type: string; children?: unknown[] });
		}
	}
	walk(tree as unknown as { type: string; children?: unknown[] });
	return out;
}

function markText(m: Element): string {
	const first = m.children[0];
	return first && first.type === "text" ? first.value : "";
}

describe("rehypeHighlightTerm", () => {
	it("is a no-op for an empty term", () => {
		const tree = para("the quick brown fox");
		rehypeHighlightTerm({ term: "" })(tree);
		expect(marks(tree)).toHaveLength(0);
	});

	it("wraps every case-insensitive occurrence in a <mark>", () => {
		const tree = para("Foo foo FOO bar");
		rehypeHighlightTerm({ term: "foo" })(tree);
		const m = marks(tree);
		expect(m).toHaveLength(3);
		// Original casing is preserved in the highlighted text.
		expect(m.map(markText)).toEqual(["Foo", "foo", "FOO"]);
	});

	it("marks the active occurrence with data-find-active", () => {
		const tree = para("alpha beta alpha beta alpha");
		rehypeHighlightTerm({ term: "alpha", activeIndex: 1 })(tree);
		const m = marks(tree);
		expect(m).toHaveLength(3);
		const active = m.filter((el) => el.properties?.["data-find-active"] === "true");
		expect(active).toHaveLength(1);
		// The active class is present on exactly the 2nd occurrence (index 1).
		expect(active[0]).toBe(m[1]);
		expect(active[0].properties?.className).toContain("find-highlight-active");
	});

	it("does not highlight inside code elements", () => {
		const tree: Root = {
			type: "root",
			children: [
				{
					type: "element",
					tagName: "code",
					properties: {},
					children: [{ type: "text", value: "foo foo" }],
				},
			],
		};
		rehypeHighlightTerm({ term: "foo" })(tree);
		expect(marks(tree)).toHaveLength(0);
	});

	it("splits surrounding text correctly", () => {
		const tree = para("xxFOOyy");
		rehypeHighlightTerm({ term: "foo" })(tree);
		const p = tree.children[0] as Element;
		// Expect: text("xx"), mark("FOO"), text("yy")
		expect(p.children).toHaveLength(3);
		expect(p.children[0]).toMatchObject({ type: "text", value: "xx" });
		expect((p.children[1] as Element).tagName).toBe("mark");
		expect(p.children[2]).toMatchObject({ type: "text", value: "yy" });
	});
});
