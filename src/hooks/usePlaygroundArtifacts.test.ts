import type { PlaygroundArtifactPayload } from "@/types/playground";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePlaygroundArtifacts } from "./usePlaygroundArtifacts";

const payload = (
	overrides: Partial<PlaygroundArtifactPayload> = {},
): PlaygroundArtifactPayload => ({
	id: "demo",
	type: "html",
	title: "Demo",
	content: "<h1>hi</h1>",
	...overrides,
});

describe("usePlaygroundArtifacts", () => {
	it("starts with an empty map", () => {
		const { result } = renderHook(() => usePlaygroundArtifacts());
		expect(result.current.artifacts).toEqual({});
	});

	it("upsert adds a new artifact keyed by id", () => {
		const { result } = renderHook(() => usePlaygroundArtifacts());
		act(() => result.current.upsert(payload()));
		expect(Object.keys(result.current.artifacts)).toEqual(["demo"]);
		expect(result.current.artifacts.demo).toMatchObject(payload());
	});

	it("upsert with the same id replaces the entry, not appends a second one", () => {
		const { result } = renderHook(() => usePlaygroundArtifacts());
		act(() => result.current.upsert(payload({ content: "v1" })));
		act(() => result.current.upsert(payload({ content: "v2" })));
		expect(Object.keys(result.current.artifacts)).toHaveLength(1);
		expect(result.current.artifacts.demo.content).toBe("v2");
	});

	it("distinct ids produce distinct entries", () => {
		const { result } = renderHook(() => usePlaygroundArtifacts());
		act(() => {
			result.current.upsert(payload({ id: "a" }));
			result.current.upsert(payload({ id: "b" }));
		});
		expect(Object.keys(result.current.artifacts).sort()).toEqual(["a", "b"]);
	});

	it("seed replaces the whole map (session reload is a fresh start, not a merge)", () => {
		const { result } = renderHook(() => usePlaygroundArtifacts());
		act(() => result.current.upsert(payload({ id: "stale" })));
		act(() => result.current.seed([payload({ id: "a" }), payload({ id: "b" })]));
		expect(Object.keys(result.current.artifacts).sort()).toEqual(["a", "b"]);
	});

	it("seed with an empty array clears the map", () => {
		const { result } = renderHook(() => usePlaygroundArtifacts());
		act(() => result.current.upsert(payload()));
		act(() => result.current.seed([]));
		expect(result.current.artifacts).toEqual({});
	});

	it("clear resets to an empty map", () => {
		const { result } = renderHook(() => usePlaygroundArtifacts());
		act(() => result.current.upsert(payload()));
		act(() => result.current.clear());
		expect(result.current.artifacts).toEqual({});
	});
});
