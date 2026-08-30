/**
 * Summary styles offered on the post-recording template picker. Ids must
 * match the backend's SUMMARY_TEMPLATES keys in
 * hypatia-backend/src/commands/handlers/meetings.ts — the id is sent as
 * `summarize_meeting`'s `template` arg and echoed back on the saved
 * `Meeting.summaryTemplate`.
 */
export interface SummaryTemplate {
	id: string;
	name: string;
	desc: string;
}

export const SUMMARY_TEMPLATES: SummaryTemplate[] = [
	{
		id: "general",
		name: "General Notes",
		desc: "A clear recap of what was discussed, in plain language.",
	},
	{
		id: "action",
		name: "Action Items",
		desc: "Tasks, owners and deadlines pulled from the conversation.",
	},
	{
		id: "decision",
		name: "Decision Log",
		desc: "Decisions made, and the reasoning behind each one.",
	},
	{ id: "sales", name: "Sales Call", desc: "Pain points, objections and agreed next steps." },
];

export const DEFAULT_SUMMARY_TEMPLATE = "general";

export function summaryTemplateName(id: string | undefined): string {
	return SUMMARY_TEMPLATES.find((t) => t.id === id)?.name ?? "General Notes";
}
