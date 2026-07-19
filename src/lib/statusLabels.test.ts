import type { ToolCallInfo } from "@/types";
import { describe, expect, it } from "vitest";
import { clubActivities, friendlyToolPhrase, headlineActivity } from "./statusLabels";

function tc(
	name: string,
	status: ToolCallInfo["status"] = "completed",
	id = Math.random().toString(36).slice(2),
): ToolCallInfo {
	return { id, name, args: {}, status };
}

describe("friendlyToolPhrase", () => {
	it("maps known tools to friendly phrases", () => {
		expect(friendlyToolPhrase("write")).toBe("Creating a document");
		expect(friendlyToolPhrase("edit")).toBe("Updating a document");
		expect(friendlyToolPhrase("read")).toBe("Reading your files");
		expect(friendlyToolPhrase("bash")).toBe("Working in your workspace");
		expect(friendlyToolPhrase("web_search")).toBe("Searching the web");
	});

	it("groups file-search tools under one phrase", () => {
		expect(friendlyToolPhrase("ls")).toBe("Looking through files");
		expect(friendlyToolPhrase("find")).toBe("Looking through files");
		expect(friendlyToolPhrase("grep")).toBe("Looking through files");
	});

	it("normalizes provider-namespaced tools by prefix", () => {
		expect(friendlyToolPhrase("google_docs_create")).toBe("Working on your document");
		expect(friendlyToolPhrase("google_sheets_update_values")).toBe("Working on your spreadsheet");
		expect(friendlyToolPhrase("google_slides_read")).toBe("Working on your slides");
	});

	it("is case-insensitive", () => {
		expect(friendlyToolPhrase("WRITE")).toBe("Creating a document");
	});

	it("falls back for unknown tools", () => {
		expect(friendlyToolPhrase("some_mystery_tool")).toBe("Working on it");
	});
});

describe("clubActivities", () => {
	it("merges consecutive same-phrase calls with counts", () => {
		const activities = clubActivities([tc("read"), tc("read"), tc("read")]);
		expect(activities).toHaveLength(1);
		expect(activities[0].phrase).toBe("Reading your files");
		expect(activities[0].count).toBe(3);
	});

	it("clubs file-search tools (ls/find/grep) together", () => {
		const activities = clubActivities([tc("ls"), tc("grep"), tc("find")]);
		expect(activities).toHaveLength(1);
		expect(activities[0].count).toBe(3);
		expect(activities[0].phrase).toBe("Looking through files");
	});

	it("keeps distinct phrases as separate ordered activities", () => {
		const activities = clubActivities([tc("read"), tc("read"), tc("write"), tc("read")]);
		expect(activities.map((a) => a.phrase)).toEqual([
			"Reading your files",
			"Creating a document",
			"Reading your files",
		]);
		expect(activities[0].count).toBe(2);
		expect(activities[2].count).toBe(1);
	});

	it("aggregates status: error wins, then running, then completed", () => {
		expect(clubActivities([tc("read", "completed"), tc("read", "error")])[0].status).toBe("error");
		expect(clubActivities([tc("read", "completed"), tc("read", "running")])[0].status).toBe(
			"running",
		);
		expect(clubActivities([tc("read", "completed"), tc("read", "completed")])[0].status).toBe(
			"completed",
		);
	});

	it("returns empty array for no tool calls", () => {
		expect(clubActivities([])).toEqual([]);
	});

	it("produces stable unique keys", () => {
		const activities = clubActivities([tc("read"), tc("write"), tc("read")]);
		const keys = activities.map((a) => a.key);
		expect(new Set(keys).size).toBe(keys.length);
	});
});

describe("headlineActivity", () => {
	it("returns null when no tools", () => {
		expect(headlineActivity([])).toBeNull();
	});

	it("prefers the running activity", () => {
		const headline = headlineActivity([tc("read", "completed"), tc("web_search", "running")]);
		expect(headline?.phrase).toBe("Searching the web");
		expect(headline?.status).toBe("running");
	});

	it("falls back to the most recent activity when nothing is running", () => {
		const headline = headlineActivity([tc("read", "completed"), tc("write", "completed")]);
		expect(headline?.phrase).toBe("Creating a document");
	});
});
