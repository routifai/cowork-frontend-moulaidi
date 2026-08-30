import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	type Meeting,
	deleteMeeting,
	getMeeting,
	listMeetings,
	saveMeeting,
	startMeetingRecording,
	stopMeetingRecording,
	summarizeMeeting,
} from "./api/meetingsApi";
import { DEFAULT_SUMMARY_TEMPLATE } from "./summaryTemplates";

export type MeetingScreen = "list" | "name" | "recording" | "template" | "detail";

/**
 * All "Record Meeting" state and the effects that drive it, lifted out of
 * `MeetingsPanel` so it survives navigating away and back. `MeetingsPanel`
 * only mounts while the Meetings view is showing (App.tsx swaps it out for
 * chat/settings/presenting), but the actual recording — the Rust capture
 * loop and the sidecar's transcriber — keeps running underneath regardless
 * of which view is on screen. Previously the elapsed timer and live
 * transcript lived in `MeetingsPanel`'s own `useState`, so switching to a
 * chat session and back unmounted it and threw all of that away even though
 * recording never actually stopped. Call this hook once, at the App.tsx
 * level (which never unmounts), and pass its return value into
 * `MeetingsPanel` as props.
 *
 * Also owns the agenda → recording → template-picker → detail screen flow:
 * ending a recording auto-saves it (no separate manual Save step) and
 * drops straight into the template picker, matching the flow design.
 */
export function useMeetingRecording() {
	const [screen, setScreen] = useState<MeetingScreen>("list");
	const [recording, setRecording] = useState(false);
	const [starting, setStarting] = useState(false);
	const [provider, setProvider] = useState<string | null>(null);
	const [elapsed, setElapsed] = useState(0);
	const [liveSegments, setLiveSegments] = useState<string[]>([]);
	const [settledCount, setSettledCount] = useState(0);
	const [captureError, setCaptureError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [meetings, setMeetings] = useState<Meeting[]>([]);
	const [selected, setSelected] = useState<Meeting | null>(null);
	const [selectedTemplate, setSelectedTemplate] = useState(DEFAULT_SUMMARY_TEMPLATE);
	const [summarizing, setSummarizing] = useState(false);
	const [adHocTitle, setAdHocTitle] = useState("");
	// Set only for an ad hoc recording (started via the "name" screen) so
	// handleStop can save it under the typed title instead of a timestamp —
	// doesn't need to trigger a re-render.
	const pendingTitle = useRef<string | null>(null);

	const refreshMeetings = useCallback(async () => {
		try {
			const res = await listMeetings();
			setMeetings(res.meetings ?? []);
		} catch {
			// ignore
		}
	}, []);

	useEffect(() => {
		refreshMeetings();
	}, [refreshMeetings]);

	useEffect(() => {
		const unlistenTranscript = listen<{ text: string; isFinal: boolean }>(
			"meeting_transcript",
			(event) => {
				if (event.payload?.isFinal && event.payload.text) {
					setLiveSegments((prev) => [...prev, event.payload.text]);
				}
			},
		);
		const unlistenError = listen<{ error: string }>("meeting_capture_error", (event) => {
			setCaptureError(event.payload?.error ?? "capture failed");
			setRecording(false);
		});
		return () => {
			unlistenTranscript.then((u) => u());
			unlistenError.then((u) => u());
		};
	}, []);

	// Two-phase entrance for the lyrics-style transcript (see MeetingsPanel):
	// a newly-pushed line first paints at the "entering" position, then next
	// frame we bump settledCount so it re-renders at its stacked position —
	// the CSS transition animates that jump.
	useEffect(() => {
		if (liveSegments.length <= settledCount) return;
		const id = requestAnimationFrame(() => setSettledCount(liveSegments.length));
		return () => cancelAnimationFrame(id);
	}, [liveSegments.length, settledCount]);

	// Runs continuously while recording — including while a chat session (or
	// any other view) is showing instead of the Meetings panel, since this
	// hook lives at the App.tsx level, not inside MeetingsPanel.
	useEffect(() => {
		if (!recording) return;
		const id = setInterval(() => setElapsed((s) => s + 1), 1000);
		return () => clearInterval(id);
	}, [recording]);

	// Shared by the scheduled "Happening now" card and the ad hoc "Record
	// now" flow — `titleOverride` is set only for the latter (see goName /
	// handleRecordAdHoc below) so handleStop knows what to save it as.
	async function beginRecording(titleOverride: string | null) {
		setStarting(true);
		setCaptureError(null);
		try {
			const res = await startMeetingRecording();
			pendingTitle.current = titleOverride;
			setProvider(res.provider);
			setLiveSegments([]);
			setSettledCount(0);
			setSelected(null);
			setElapsed(0);
			setRecording(true);
			setScreen("recording");
		} catch (err) {
			setCaptureError(err instanceof Error ? err.message : String(err));
		} finally {
			setStarting(false);
		}
	}

	// "Happening now" — records the scheduled meeting shown on the agenda.
	async function handleRecord() {
		await beginRecording(null);
	}

	// "Record now" → a naming step, for a meeting that isn't on the
	// calendar. Enterprise reality: not every meeting is scheduled.
	function goName() {
		setAdHocTitle("");
		setScreen("name");
	}

	function cancelName() {
		setScreen("list");
	}

	async function handleRecordAdHoc() {
		await beginRecording(adHocTitle.trim() || "Untitled meeting");
	}

	// Ending a recording auto-saves it (no manual Save step) and drops
	// straight into the template picker so the user can summarize directly.
	async function handleStop() {
		setRecording(false);
		let transcript = "";
		try {
			const res = await stopMeetingRecording();
			transcript = res.transcript || liveSegments.join(" ");
		} catch (err) {
			setCaptureError(err instanceof Error ? err.message : String(err));
			return;
		}
		setSaving(true);
		try {
			const title =
				pendingTitle.current ??
				new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
			pendingTitle.current = null;
			const res = await saveMeeting({ title, transcript });
			setSelected(res.meeting);
			setSelectedTemplate(DEFAULT_SUMMARY_TEMPLATE);
			setLiveSegments([]);
			await refreshMeetings();
			setScreen("template");
		} catch (err) {
			setCaptureError(err instanceof Error ? err.message : String(err));
		} finally {
			setSaving(false);
		}
	}

	async function handleSelectPast(meeting: Meeting) {
		try {
			const res = await getMeeting(meeting.id);
			setSelected(res.meeting);
			setScreen("detail");
		} catch {
			// ignore
		}
	}

	async function handleGenerateSummary() {
		if (!selected) return;
		setSummarizing(true);
		try {
			const res = await summarizeMeeting(selected.id, selectedTemplate);
			setSelected(res.meeting);
			await refreshMeetings();
			setScreen("detail");
		} catch (err) {
			setCaptureError(err instanceof Error ? err.message : String(err));
		} finally {
			setSummarizing(false);
		}
	}

	async function handleDelete(meeting: Meeting) {
		try {
			await deleteMeeting(meeting.id);
			if (selected?.id === meeting.id) {
				setSelected(null);
				setScreen("list");
			}
			await refreshMeetings();
		} catch {
			// ignore
		}
	}

	function goList() {
		setScreen("list");
	}

	return {
		screen,
		recording,
		starting,
		provider,
		elapsed,
		liveSegments,
		settledCount,
		captureError,
		saving,
		meetings,
		selected,
		selectedTemplate,
		setSelectedTemplate,
		summarizing,
		adHocTitle,
		setAdHocTitle,
		handleRecord,
		goName,
		cancelName,
		handleRecordAdHoc,
		handleStop,
		handleSelectPast,
		handleGenerateSummary,
		handleDelete,
		goList,
	};
}

export type MeetingRecording = ReturnType<typeof useMeetingRecording>;
