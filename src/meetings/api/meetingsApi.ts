import { invoke } from "@tauri-apps/api/core";

export interface Meeting {
	id: string;
	title: string;
	createdAt: string;
	transcript: string;
	summary?: string;
	/** Which summarization template produced `summary` — see `../summaryTemplates`. */
	summaryTemplate?: string;
}

export const startMeetingRecording = () =>
	invoke<{ success: boolean; provider: string }>("start_meeting_recording");

export const stopMeetingRecording = () => invoke<{ transcript: string }>("stop_meeting_recording");

export const saveMeeting = (args: { title: string; transcript: string; meetingId?: string }) =>
	invoke<{ meeting: Meeting }>("save_meeting", args);

export const summarizeMeeting = (meetingId: string, template?: string) =>
	invoke<{ meeting: Meeting }>("summarize_meeting", { meetingId, template });

export const listMeetings = () => invoke<{ meetings: Meeting[] }>("list_meetings");

export const getMeeting = (meetingId: string) =>
	invoke<{ meeting: Meeting }>("get_meeting", { meetingId });

export const deleteMeeting = (meetingId: string) =>
	invoke<{ deleted: boolean }>("delete_meeting", { meetingId });
