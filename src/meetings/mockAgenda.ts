/**
 * Placeholder "today's calendar" data for the Meetings agenda screen.
 *
 * There is no real calendar integration yet — this stands in for meetings
 * that would otherwise be pulled from the user's connected calendar (see
 * the "My Connectors" MCP feature, a natural fit for that later). Times are
 * computed relative to now so the agenda always looks plausible instead of
 * showing a fixed clock time that's immediately in the past.
 */

export interface AgendaMeeting {
	title: string;
	time: string;
	attendeesLabel: string;
}

function offsetTime(minutesFromNow: number): string {
	const d = new Date(Date.now() + minutesFromNow * 60_000);
	return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export const MOCK_LIVE_MEETING: AgendaMeeting = {
	title: "Weekly Sync — Growth Team",
	time: `${offsetTime(-15)} – ${offsetTime(15)}`,
	attendeesLabel: "4 attendees",
};

export const MOCK_UPCOMING_MEETINGS: AgendaMeeting[] = [
	{ title: "Design Review: Onboarding Flow", time: offsetTime(60), attendeesLabel: "4 attendees" },
	{ title: "1:1 with Priya", time: offsetTime(150), attendeesLabel: "2 attendees" },
];
