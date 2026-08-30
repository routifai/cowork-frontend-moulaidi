import { markdownComponents } from "@/components/MarkdownComponents";
import { FileText, Loader2, Square, Trash, X } from "lucide-react";
import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Meeting } from "./api/meetingsApi";
import { MOCK_LIVE_MEETING, MOCK_UPCOMING_MEETINGS } from "./mockAgenda";
import { SUMMARY_TEMPLATES, summaryTemplateName } from "./summaryTemplates";
import type { MeetingRecording } from "./useMeetingRecording";

const PROVIDER_LABEL: Record<string, string> = {
	openai: "OpenAI Whisper",
	aws: "AWS Transcribe",
};

const LYRIC_VISIBLE = 4;
const LYRIC_ENTER_STYLE: React.CSSProperties = {
	transform: "translate(-50%, calc(-50% + 44px)) scale(0.82)",
	opacity: 0,
};
// Position (from newest = 0) once a line has settled: current, prev-1,
// prev-2, then a fully-invisible buffer slot so removal never pops.
const LYRIC_SETTLED_STYLES: React.CSSProperties[] = [
	{ transform: "translate(-50%, -50%) scale(1)", opacity: 1 },
	{ transform: "translate(-50%, calc(-50% - 62px)) scale(0.8)", opacity: 0.5 },
	{ transform: "translate(-50%, calc(-50% - 118px)) scale(0.68)", opacity: 0.18 },
	{ transform: "translate(-50%, calc(-50% - 118px)) scale(0.68)", opacity: 0 },
];

// Static, decorative bar timings — not wired to real per-channel amplitude
// (that needs the Rust capture loop to emit mic/speaker levels).
const MIC_BAR_TIMING = [
	[-0.9, 1.0],
	[-0.2, 1.3],
	[-0.6, 0.9],
	[-1.1, 1.2],
	[-0.4, 1.05],
	[-0.8, 1.15],
	[-0.1, 0.95],
];
const SPEAKER_BAR_TIMING = [
	[-0.3, 1.1],
	[-0.7, 0.85],
	[-1.0, 1.25],
	[-0.15, 1.0],
	[-0.55, 1.1],
	[-0.95, 0.9],
	[-0.35, 1.2],
];

export function formatElapsed(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = seconds % 60;
	return `${m}:${String(s).padStart(2, "0")}`;
}

// Segments were joined with a single space on save (see useMeetingRecording's
// handleStop) — split back into sentence-ish lines for a readable transcript
// instead of one unbroken wall of text.
function splitTranscriptLines(transcript: string): string[] {
	const parts = transcript.match(/[^.!?]+[.!?]*(\s+|$)/g);
	return (parts ?? [transcript]).map((p) => p.trim()).filter(Boolean);
}

interface MeetingsPanelProps extends MeetingRecording {
	/** Closes the Meetings view (back to chat). Stops any in-progress recording first. */
	onClose?: () => void;
}

/**
 * Record Meeting — an agenda-first flow: today's calendar-sourced meetings
 * (mock data for now — see mockAgenda.ts — until a real calendar connector
 * feeds this), the live one you can start recording, and past meetings you
 * can review. Ending a recording drops straight into a summary-template
 * picker (no separate manual save step) and then the meeting's detail view
 * (summary + transcript).
 *
 * Purely presentational: all recording state and its effects (including the
 * elapsed timer) live in `useMeetingRecording()`, called once at the
 * App.tsx level so they survive this component unmounting when the user
 * navigates to a chat session and back — see that hook's doc comment.
 *
 * While recording, the transcript floats in "Spotify lyrics" style — the
 * newest line centered and bold, older lines drifting up and fading.
 * Design concept: https://claude.ai/code/artifact/bfbc8883-8b61-4149-8eee-47145aa9a978
 */
export function MeetingsPanel({
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
	onClose,
}: MeetingsPanelProps) {
	async function handleClose() {
		if (recording) await handleStop();
		onClose?.();
	}

	const nameInputRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (screen === "name") nameInputRef.current?.focus();
	}, [screen]);

	async function handleDeleteRow(e: React.MouseEvent, meeting: Meeting) {
		e.stopPropagation();
		await handleDelete(meeting);
	}

	const providerLabel = provider ? (PROVIDER_LABEL[provider] ?? provider) : null;

	const lyricStart = Math.max(0, liveSegments.length - LYRIC_VISIBLE);
	const visibleLyrics = liveSegments.slice(lyricStart);

	const todayLabel = new Date().toLocaleDateString(undefined, {
		weekday: "long",
		month: "long",
		day: "numeric",
	});

	return (
		<div className="flex-1 flex min-h-0 p-3.5">
			<main className="meetings-main panel-raised w-full">
				{(screen === "list" || screen === "recording") && (
					<div className="meetings-main-head">
						<div>
							<div className="meetings-main-title">
								{screen === "recording" ? "Recording" : "Meetings"}
							</div>
							<div className="meetings-main-sub">
								{screen === "recording" ? `Elapsed ${formatElapsed(elapsed)}` : todayLabel}
							</div>
						</div>
						<div className="meetings-main-head-right">
							{screen === "list" && (
								<button type="button" className="btn-adhoc" onClick={goName}>
									<MicIcon />
									Record now
								</button>
							)}
							{providerLabel && <span className="provider-chip">{providerLabel}</span>}
							<button
								type="button"
								onClick={handleClose}
								className="btn-close"
								aria-label="Close meeting"
							>
								<X className="w-3.5 h-3.5" />
							</button>
						</div>
					</div>
				)}
				{(screen === "name" || screen === "template" || screen === "detail") && (
					<div className="meetings-main-head">
						<button
							type="button"
							onClick={screen === "name" ? cancelName : goList}
							className="back-link"
						>
							<ArrowLeftIcon />
							Meetings
						</button>
					</div>
				)}

				{screen === "list" && (
					<div className="agenda-scroll">
						<div className="agenda-section">
							<div className="agenda-section-label">Happening now</div>
							<button
								type="button"
								className="live-card"
								onClick={handleRecord}
								disabled={starting}
							>
								<div className="live-card-left">
									<span className="live-dot" />
									<div>
										<div className="live-card-title">{MOCK_LIVE_MEETING.title}</div>
										<div className="live-card-meta">
											{MOCK_LIVE_MEETING.time} · {MOCK_LIVE_MEETING.attendeesLabel}
										</div>
									</div>
								</div>
								<span className="record-pill">
									{starting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MicIcon />}
									{starting ? "Starting…" : "Record"}
								</span>
							</button>
							{captureError && <p className="text-[11px] text-destructive mt-2">{captureError}</p>}
						</div>

						<div className="agenda-section">
							<div className="agenda-section-label">Later today</div>
							{MOCK_UPCOMING_MEETINGS.map((m) => (
								<div key={m.title} className="upcoming-row">
									<div className="upcoming-time">{m.time}</div>
									<div className="upcoming-title">{m.title}</div>
									<div className="upcoming-meta">{m.attendeesLabel}</div>
									<div className="upcoming-badge">Not started</div>
								</div>
							))}
						</div>

						<div className="agenda-section">
							<div className="agenda-section-label">Past meetings</div>
							{meetings.length === 0 ? (
								<p className="agenda-empty">No meetings recorded yet.</p>
							) : (
								meetings.map((m) => (
									<button
										key={m.id}
										type="button"
										className="past-row"
										onClick={() => handleSelectPast(m)}
									>
										<div>
											<div className="past-row-title">{m.title}</div>
											<div className="past-row-meta">
												{m.summary ? "Summarized" : "Needs summary"}
											</div>
										</div>
										<div className="past-row-right">
											{m.summary && (
												<span className="template-badge">
													{summaryTemplateName(m.summaryTemplate)}
												</span>
											)}
											<span
												onClick={(e) => handleDeleteRow(e, m)}
												onKeyDown={(e) => {
													if (e.key === "Enter" || e.key === " ")
														handleDeleteRow(e as unknown as React.MouseEvent, m);
												}}
												role="button"
												tabIndex={0}
												className="p-1 rounded hover:bg-destructive/10 hover:text-destructive"
											>
												<Trash className="w-3 h-3" />
											</span>
											<ChevronRightIcon />
										</div>
									</button>
								))
							)}
						</div>
					</div>
				)}

				{screen === "name" && (
					<div className="name-body">
						<div className="glass name-card">
							<div className="meetings-main-title">New meeting</div>
							<p className="template-intro" style={{ marginTop: 4 }}>
								Not on your calendar? Give it a name so you can find it later.
							</p>
							<input
								ref={nameInputRef}
								type="text"
								className="name-input"
								placeholder="e.g. Hallway sync with Marcus"
								value={adHocTitle}
								onChange={(e) => setAdHocTitle(e.target.value)}
							/>
							{captureError && <p className="text-[11px] text-destructive mt-2">{captureError}</p>}
							<div className="name-actions">
								<button type="button" className="btn-text" onClick={cancelName}>
									Cancel
								</button>
								<button
									type="button"
									className="btn-record"
									onClick={handleRecordAdHoc}
									disabled={starting}
								>
									{starting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MicIcon />}
									{starting ? "Starting…" : "Start Recording"}
								</button>
							</div>
						</div>
					</div>
				)}

				{screen === "recording" && (
					<div className="meetings-hero is-listening">
						<div className="orb-wrap">
							<div className="orb-glow" />
							<div className="orb-ring r1" />
							<div className="orb-ring r2" />
							<div className="orb-ring r3" />
							<div className="orb" />
						</div>

						<div className="meetings-state-label">
							<span className="meetings-state-dot" />
							{`Recording — ${formatElapsed(elapsed)}`}
						</div>

						<div className="waveform-row">
							<div className="waveform-group mic">
								<div className="waveform-label">You</div>
								<div className="waveform-bars">
									{MIC_BAR_TIMING.map(([delay, duration], i) => (
										<span
											// biome-ignore lint/suspicious/noArrayIndexKey: fixed-length decorative bars, never reordered
											key={i}
											className="wave-bar"
											style={{ animationDelay: `${delay}s`, animationDuration: `${duration}s` }}
										/>
									))}
								</div>
							</div>
							<div className="waveform-group speaker">
								<div className="waveform-label">Them</div>
								<div className="waveform-bars">
									{SPEAKER_BAR_TIMING.map(([delay, duration], i) => (
										<span
											// biome-ignore lint/suspicious/noArrayIndexKey: fixed-length decorative bars, never reordered
											key={i}
											className="wave-bar"
											style={{ animationDelay: `${delay}s`, animationDuration: `${duration}s` }}
										/>
									))}
								</div>
							</div>
						</div>

						<div className="lyrics-stack">
							{visibleLyrics.length === 0 ? (
								<div className="lyrics-empty">Listening for speech…</div>
							) : (
								visibleLyrics.map((text, i) => {
									const globalIndex = lyricStart + i;
									const distFromEnd = visibleLyrics.length - 1 - i;
									const settled = globalIndex < settledCount;
									const style = settled
										? LYRIC_SETTLED_STYLES[Math.min(distFromEnd, 3)]
										: LYRIC_ENTER_STYLE;
									return (
										<div key={globalIndex} className="lyric-line" style={style}>
											{text}
										</div>
									);
								})
							)}
						</div>

						<div className="meetings-controls">
							<button type="button" onClick={handleStop} className="btn-end" disabled={saving}>
								{saving ? (
									<Loader2 className="w-3.5 h-3.5 animate-spin" />
								) : (
									<Square className="w-3.5 h-3.5" fill="currentColor" />
								)}
								{saving ? "Saving…" : "End Meeting"}
							</button>
						</div>
					</div>
				)}

				{screen === "template" && (
					<div className="template-body">
						<div>
							<div className="meetings-main-title">Meeting ended</div>
							<div className="meetings-main-sub">{`${formatElapsed(elapsed)} recorded`}</div>
						</div>
						<div className="template-intro">Choose how you'd like this summarized.</div>
						<div className="template-grid">
							{SUMMARY_TEMPLATES.map((t) => (
								<button
									key={t.id}
									type="button"
									className={`template-card ${t.id === selectedTemplate ? "is-selected" : ""}`}
									onClick={() => setSelectedTemplate(t.id)}
								>
									<div className="template-card-name">{t.name}</div>
									<div className="template-card-desc">{t.desc}</div>
									{t.id === selectedTemplate && (
										<span className="template-card-check">
											<CheckIcon />
										</span>
									)}
								</button>
							))}
						</div>
						{captureError && <p className="text-[11px] text-destructive">{captureError}</p>}
						<button
							type="button"
							className="btn-generate"
							onClick={handleGenerateSummary}
							disabled={summarizing}
						>
							{summarizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircleIcon />}
							{summarizing
								? "Summarizing…"
								: `Generate ${summaryTemplateName(selectedTemplate)} Summary`}
						</button>
					</div>
				)}

				{screen === "detail" && selected && (
					<div className="detail-scroll">
						<div className="detail-title-row">
							<div>
								<div className="detail-title">{selected.title}</div>
								<div className="detail-meta">{new Date(selected.createdAt).toLocaleString()}</div>
							</div>
							{selected.summary && (
								<span className="template-badge lg">
									{summaryTemplateName(selected.summaryTemplate)}
								</span>
							)}
						</div>

						<div className="glass detail-card">
							<div className="detail-card-label">Summary</div>
							{selected.summary ? (
								<div className="chat-markdown">
									<ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
										{selected.summary}
									</ReactMarkdown>
								</div>
							) : (
								<>
									<p className="detail-summary-empty">This meeting hasn't been summarized yet.</p>
									<div className="template-grid" style={{ marginTop: 14, width: "100%" }}>
										{SUMMARY_TEMPLATES.map((t) => (
											<button
												key={t.id}
												type="button"
												className={`template-card ${t.id === selectedTemplate ? "is-selected" : ""}`}
												onClick={() => setSelectedTemplate(t.id)}
											>
												<div className="template-card-name">{t.name}</div>
												<div className="template-card-desc">{t.desc}</div>
												{t.id === selectedTemplate && (
													<span className="template-card-check">
														<CheckIcon />
													</span>
												)}
											</button>
										))}
									</div>
									<button
										type="button"
										className="btn-generate"
										style={{ marginTop: 14 }}
										onClick={handleGenerateSummary}
										disabled={summarizing}
									>
										{summarizing ? (
											<Loader2 className="w-3.5 h-3.5 animate-spin" />
										) : (
											<FileText className="w-3.5 h-3.5" />
										)}
										{summarizing ? "Summarizing…" : "Generate Summary"}
									</button>
								</>
							)}
						</div>

						<div className="glass detail-card">
							<div className="detail-card-label">Transcript</div>
							<div className="transcript-lines">
								{splitTranscriptLines(selected.transcript).map((line, i) => (
									// biome-ignore lint/suspicious/noArrayIndexKey: transcript lines are a static split of one saved string, never reordered
									<p key={i} className="transcript-line">
										{line}
									</p>
								))}
							</div>
						</div>
					</div>
				)}
			</main>
		</div>
	);
}

function MicIcon() {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={2}
			className="w-3.5 h-3.5"
			aria-hidden="true"
		>
			<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
			<path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
		</svg>
	);
}

function ArrowLeftIcon() {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={2}
			style={{ width: 13, height: 13 }}
			aria-hidden="true"
		>
			<path d="m12 19-7-7 7-7" />
			<path d="M19 12H5" />
		</svg>
	);
}

function ChevronRightIcon() {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={2}
			style={{ width: 14, height: 14 }}
			aria-hidden="true"
		>
			<path d="m9 18 6-6-6-6" />
		</svg>
	);
}

function CheckIcon() {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={3}
			style={{ width: 10, height: 10 }}
			aria-hidden="true"
		>
			<path d="M20 6 9 17l-5-5" />
		</svg>
	);
}

function CheckCircleIcon() {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={2}
			className="w-3.5 h-3.5"
			aria-hidden="true"
		>
			<circle cx="12" cy="12" r="10" />
			<path d="m9 12 2 2 4-4" />
		</svg>
	);
}
