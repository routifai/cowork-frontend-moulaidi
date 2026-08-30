import { ChatView } from "@/chat/ChatView";
import { AuthGate, shouldShowAuthGate } from "@/components/AuthGate";
import { ExtensionUiDialog } from "@/components/ExtensionUiDialog";
import { HelpDialog } from "@/components/HelpDialog";
import { SettingsPage } from "@/components/SettingsPage";
import { Sidebar } from "@/components/Sidebar";
import { SplashScreen } from "@/components/SplashScreen";
import { UpdateBanner } from "@/components/UpdateBanner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { RenameDialog } from "@/components/ui/rename-dialog";
import { useUpdate } from "@/contexts/UpdateProvider";
import { useExtensionUi } from "@/hooks/useExtensionUi";
import { INITIAL_STATE, usePiStream } from "@/hooks/usePiStream";
import { usePlaygroundArtifacts } from "@/hooks/usePlaygroundArtifacts";
import { useProviders } from "@/hooks/useProviders";
import { useTelemetry } from "@/hooks/useTelemetry";
import {
	BUILTIN_COMMANDS,
	type CommandContext,
	findBuiltinCommand,
	runBuiltinCommand,
} from "@/lib/builtinCommands";
import { findModel, modelKey } from "@/lib/model-key";
import { trackEvent } from "@/lib/telemetry";
import { MeetingsPanel } from "@/meetings/MeetingsPanel";
import { useMeetingRecording } from "@/meetings/useMeetingRecording";
import { PlaygroundPanel, PlaygroundReopenTab } from "@/playground/PlaygroundPanel";
import { PresentingPanel } from "@/presenting/PresentingPanel";
import type { ChatMessage } from "@/types";
import type { Command } from "@/types/commands";
import type { PlaygroundArtifactPayload } from "@/types/playground";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useRef, useState } from "react";
import { log } from "./lib/log";

interface SessionEntry {
	file: string;
	title: string;
	model?: string;
	provider?: string;
	/** Workspace folder this session ran in (for folder-grouped sidebar). */
	cwd?: string;
	messageCount: number;
	createdAt: number;
	lastActivity: number;
	/** Pinned sessions float to the top of the sidebar list. */
	pinned?: boolean;
	/** Whether the title was manually renamed (auto-titles won't overwrite). */
	titleLocked?: boolean;
	/** One-line preview of the latest message (real content, for the sidebar). */
	preview?: string;
}

function App() {
	// V3 dummy auth gate (once per session; skipped in tests).
	const [showAuthGate, setShowAuthGate] = useState(shouldShowAuthGate);
	const appUpdate = useUpdate();
	const playground = usePlaygroundArtifacts();
	const {
		streams,
		startStream,
		abortStream,
		steerStream,
		followUpStream,
		clearQueue,
		forgetSession,
		toolPhases,
	} = usePiStream({ onShowArtifact: playground.upsert });

	// Custom instructions are no longer prepended to messages here. They live in
	// INSTRUCTIONS.md and the sidecar injects them into the system prompt as
	// always-on context (see CustomInstructions / save_instructions).

	// Remove right-click prevention — users need copy/paste/inspect.
	// The desktop app is a serious tool, not a locked-down kiosk.
	// (Context menu prevention removed intentionally.)
	const { models } = useProviders();
	useTelemetry(); // initialize telemetry consent from settings
	// Renders whatever pi extension confirm/select/input/editor prompt is
	// pending (e.g. a permission gate around bash/edit/write) — without this,
	// the extension's ui.* call never resolves and the tool call hangs forever.
	const {
		current: extensionUiRequest,
		respond: respondExtensionUi,
		statuses: extensionStatuses,
	} = useExtensionUi();
	// pi-plan-mode's own status key — see useExtensionUi.ts's doc comment.
	const planModeStatus = extensionStatuses["plan-mode"];
	// Whether the agent sidecar has finished booting. Auth is handled invisibly
	// (an embedded API key, no user-facing onboarding) — this splash purely
	// reflects sidecar readiness. In remote/browser mode (no Tauri) the server
	// is already up at page load and the native `ready` event never fires, so
	// we start ready there.
	const [sidecarReady, setSidecarReady] = useState(() => !isTauri());
	const [, setSidebarView] = useState("chats");
	const handleChangeView = useCallback((view: string) => {
		setSidebarView(view);
		setShowSettings(view === "settings");
		setShowPresenting(view === "presenting");
		setShowMeetings(view === "meetings");
	}, []);
	const [showSettings, setShowSettings] = useState(false);
	const [showPresenting, setShowPresenting] = useState(false);
	const [showMeetings, setShowMeetings] = useState(false);
	// Lifted here (not inside MeetingsPanel) so recording survives switching to
	// a chat session and back — see useMeetingRecording's doc comment.
	const meetingRecording = useMeetingRecording();
	const [showModelSelector, setShowModelSelector] = useState(false);
	const [showHelp, setShowHelp] = useState(false);
	// Playground panel: user can dismiss it, but each new turn gets a fresh
	// chance to auto-open (reset to false in handleSend, right before
	// startStream) if that turn produces its own artifacts.
	const [playgroundClosed, setPlaygroundClosed] = useState(false);
	// Which artifact tab is active in the playground panel. Null means
	// "auto-follow the most recently updated artifact." Lives here (not
	// inside PlaygroundPanel) so clicking a show_artifact chip in the chat
	// transcript can select a tab even while the panel is closed.
	const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
	const handleOpenArtifact = useCallback((id: string) => {
		setPlaygroundClosed(false);
		setSelectedArtifactId(id);
	}, []);

	// Session management
	const [sessionEntries, setSessionEntries] = useState<SessionEntry[]>([]);
	const [activeSessionFile, setActiveSessionFile] = useState<string | null>(null);
	// The DISPLAYED session's stream state, derived from the multi-session
	// `streams` map — switching which session is displayed never resets or
	// otherwise touches any session's entry in that map (see
	// docs/plans/multi-session-concurrency.md), so a backgrounded session's
	// live progress survives being navigated away from and back to.
	const streamState = (activeSessionFile && streams[activeSessionFile]) || INITIAL_STATE;
	// A pending select/editor dialog belongs to pi-plan-mode's own
	// `plan_mode_question` tool iff that's the tool `toolPhases` says is
	// currently calling/executing for this session — see
	// `PlanModeQuestionCard.tsx`'s doc comment for why this is a heuristic
	// (no explicit "which extension" tag exists on the wire) and why it's
	// reliable in practice (one dialog pending at a time, FIFO).
	const activeToolPhase = activeSessionFile ? toolPhases[activeSessionFile] : undefined;
	const isPlanModeQuestionPending =
		activeToolPhase?.toolName === "plan_mode_question" &&
		(activeToolPhase.type === "calling" || activeToolPhase.type === "executing") &&
		(extensionUiRequest?.method === "select" || extensionUiRequest?.method === "editor");
	const planQuestionRequest = isPlanModeQuestionPending ? extensionUiRequest : undefined;
	// Draft prompt pushed into the composer (e.g. when a template is clicked).
	// The bumping `nonce` lets the same prompt be re-applied on repeated clicks.
	const [composerDraft, setComposerDraft] = useState<{ text: string; nonce: number }>();
	// The agent's current workspace folder (where file/bash tools read & write).
	const [workspaceCwd, setWorkspaceCwd] = useState<string | null>(null);
	// The user's home dir (sidecar's default workspace) — used to label the
	// "Home" folder group in the sidebar.
	const [homeDir, setHomeDir] = useState<string | null>(null);
	/** Messages loaded from a saved session file — merged with stream messages */
	const [loadedSessionMessages, setLoadedSessionMessages] = useState<ChatMessage[] | null>(null);
	const [loadingSession, setLoadingSession] = useState(false);

	// ── Sidecar readiness: drives the startup splash (#169) ──
	// Listen for the Tauri `ready` event, plus a timeout fallback so the
	// splash never hangs forever if the sidecar fails to start.
	useEffect(() => {
		if (!isTauri()) return;
		let mounted = true;
		let unlisten: (() => void) | undefined;
		(async () => {
			const u = await listen("ready", () => {
				if (mounted) setSidecarReady(true);
			});
			if (!mounted) {
				u();
				return;
			}
			unlisten = u;
		})();
		// Fallback: stop waiting after 20s and let the normal UI take over.
		const timeout = setTimeout(() => {
			if (mounted) setSidecarReady(true);
		}, 20_000);
		return () => {
			mounted = false;
			clearTimeout(timeout);
			unlisten?.();
		};
	}, []);

	// Splash reflects sidecar-boot readiness only — auth is invisible.
	const initializing = !sidecarReady;

	// Settings persistence
	const settingsLoadedRef = useRef(false);

	// Model management
	const [activeModelId, setActiveModelId] = useState<string | undefined>();

	// ── Startup: restore model from settings and load session list ──
	useEffect(() => {
		if (models.length > 0 && !settingsLoadedRef.current) {
			settingsLoadedRef.current = true;
			(async () => {
				let data: { defaultModel?: string; defaultProvider?: string } = {};
				try {
					data = (await invoke("get_settings")) as typeof data;
					log.debug("[settings] loaded:", data);
				} catch (err) {
					log.warn("[settings] load failed:", err);
				}

				// 1. Honour the user's explicitly-saved model and push it to the
				//    engine so it actually takes effect. Match on provider+id: ids
				//    are NOT unique across providers, so matching by id alone could
				//    bind the wrong provider (e.g. zai/glm vs opencode-go/glm).
				if (data.defaultModel) {
					const match =
						models.find((m) => m.id === data.defaultModel && m.provider === data.defaultProvider) ??
						models.find((m) => m.id === data.defaultModel);
					if (match) {
						log.debug("[settings] restoring model:", match.provider, match.id);
						setActiveModelId(modelKey(match.provider, match.id));
						invoke("set_active_model", {
							provider: match.provider,
							model: match.id,
						}).catch(() => {});
						return;
					}
				}

				// 2. No saved preference: MIRROR the engine's actual model so the
				//    selector matches the model that will really answer (the
				//    per-message usage label). No push needed — it's already active.
				try {
					const engine = (await invoke("get_active_model")) as {
						provider?: string;
						id?: string;
					} | null;
					const key = engine?.id ? modelKey(engine.provider, engine.id) : undefined;
					if (key && findModel(models, key)) {
						log.debug("[settings] mirroring engine model:", key);
						setActiveModelId(key);
						return;
					}
				} catch (err) {
					log.warn("[settings] get_active_model failed:", err);
				}

				// 3. Last resort: pick the first model AND push it so the UI and
				//    engine still agree even if the mirror query failed.
				const fallback = models[0];
				setActiveModelId(modelKey(fallback.provider, fallback.id));
				invoke("set_active_model", {
					provider: fallback.provider,
					model: fallback.id,
				}).catch(() => {});
			})();
		} else if (models.length > 0 && !activeModelId) {
			setActiveModelId(modelKey(models[0].provider, models[0].id));
		}
	}, [models, activeModelId]);

	useEffect(() => {
		// Initial load (also re-runs once the sidecar is ready).
		loadSessionList().catch(() => {});
		if (!isTauri()) return;
		// The first load races the sidecar spawn: `list_sessions` rejects before
		// the sidecar is ready and the `.catch` swallows it, leaving an empty
		// list that never refills. Re-load on every `ready` event — the initial
		// spawn AND every restart after `sidecar_lost` — so saved sessions
		// reappear instead of silently vanishing.
		let mounted = true;
		let unlisten: (() => void) | undefined;
		listen("ready", () => loadSessionList().catch(() => {})).then((u) => {
			if (!mounted) {
				u();
				return;
			}
			unlisten = u;
		});
		return () => {
			mounted = false;
			unlisten?.();
		};
	}, []);

	async function loadSessionList() {
		try {
			// Always fetch every session across every folder — scoping to the
			// active workspace is a display concern (folder-grouped sidebar),
			// never a fetch concern. Fetching a subset here is what caused
			// sessions to silently vanish when the active folder changed.
			const result = await invoke("list_sessions", { allFolders: true });
			const data = result as { sessions?: SessionEntry[] };
			setSessionEntries(data.sessions || []);
		} catch (err) {
			log.error("Failed to load sessions:", err);
		}
	}

	// ── When stream completes, merge into loaded messages and save to disk ──
	// `activeSessionFile` is a dependency (not just streamState.isRunning) so
	// this ALSO fires when switching TO a session that finished streaming
	// while it was backgrounded — otherwise its already-completed turn would
	// stay stuck in `streams[sid]` and never fold into `loadedSessionMessages`,
	// which `handleSessionSelect`'s fresh `load_session` fetch is about to
	// (re)populate from disk anyway. A harmless, brief intermediate state is
	// possible here (this effect can run before that fetch resolves, briefly
	// showing only the just-finished turn) — the fetch's result supersedes it
	// moments later. See docs/plans/multi-session-concurrency.md Phase 3.
	// biome-ignore lint/correctness/useExhaustiveDependencies: Only trigger on stream completion or session switch, not on every dep change
	useEffect(() => {
		if (!streamState.isRunning && streamState.messages.length > 0) {
			const sid = activeSessionFile;
			if (!sid) return;

			// Merge: loaded history + new stream messages
			const merged = loadedSessionMessages
				? [...loadedSessionMessages, ...streamState.messages]
				: streamState.messages;

			if (merged.length === 0) return;

			const firstMsg = merged[0];
			const title = typeof firstMsg.content === "string" ? firstMsg.content.slice(0, 80) : "Chat";

			// Update loaded messages so the display shows full history
			setLoadedSessionMessages(merged);

			// Forget this session's transient stream state now that it's been
			// folded into loadedSessionMessages — prevents double-rendering it
			// on the next prompt (START_STREAM resets streams[sid] to a blank
			// slate) or on a future switch back to this session. Only this
			// SPECIFIC session's entry is touched — never another session's.
			forgetSession(sid);

			// pi auto-persists during the agent loop — no manual save. Just
			// reconcile the sidebar with disk truth (title/preview/count).
			loadSessionList().catch((err) => log.error("Failed to refresh sessions:", err));

			// Optimistic sidebar entry (folder = active workspace). A user-renamed
			// (locked) title must not be clobbered by the auto-derived one, and the
			// pin state is preserved across the optimistic update.
			setSessionEntries((prev) => {
				const existing = prev.find((s) => s.file === sid);
				const filtered = prev.filter((s) => s.file !== sid);
				return [
					{
						file: sid,
						title: existing?.titleLocked ? existing.title : title,
						cwd: workspaceCwd ?? undefined,
						messageCount: merged.length,
						createdAt: existing?.createdAt || Date.now(),
						lastActivity: Date.now(),
						pinned: existing?.pinned,
						titleLocked: existing?.titleLocked,
						preview:
							typeof merged[merged.length - 1]?.content === "string"
								? (merged[merged.length - 1].content as string)
										.replace(/\s+/g, " ")
										.trim()
										.slice(0, 120)
								: existing?.preview,
					},
					...filtered,
				];
			});
		}
	}, [streamState.isRunning, activeSessionFile]);

	// ── Send a new prompt ──
	const handleSend = useCallback(
		async (text: string) => {
			let sessionFile = activeSessionFile;
			const isNewSession = !sessionFile;
			if (!sessionFile) {
				// pi owns persistence: spin up a real session file and adopt its
				// path as our identity (no more client-invented ids).
				try {
					const res = await invoke<{ file?: string; cwd?: string }>("new_session", {});
					if (res && typeof res.cwd === "string") setWorkspaceCwd(res.cwd);
					sessionFile = res?.file ?? `session-${Date.now()}.jsonl`;
				} catch {
					sessionFile = `session-${Date.now()}.jsonl`;
				}
				setActiveSessionFile(sessionFile);
			}

			// Immediately show session in sidebar with title from first message
			if (isNewSession) {
				const title = text.length > 80 ? `${text.slice(0, 77)}...` : text;
				setSessionEntries((prev) => [
					{
						file: sessionFile,
						title,
						cwd: workspaceCwd ?? undefined,
						messageCount: 1,
						createdAt: Date.now(),
						lastActivity: Date.now(),
					},
					...prev,
				]);
				trackEvent("session_created");
			}

			// Track message with provider/model info
			const activeModel = findModel(models, activeModelId);
			trackEvent("message_sent", {
				provider: activeModel?.provider?.split("-")[0] ?? "unknown",
				model: activeModel?.id ?? "unknown",
			});

			// Keep loadedSessionMessages — startStream only produces the new turn.
			// Merging happens in the stream-complete effect above.
			setPlaygroundClosed(false);
			startStream(sessionFile, text);
		},
		[activeSessionFile, startStream, models, activeModelId, workspaceCwd],
	);

	/**
	 * Plan-mode composer toggle (`Plan` / `Planning…` / `Approve Plan`). Sends
	 * the underlying `/plan`, `/plan exit`, or `/plan implement` command
	 * silently — a non-technical user should never see a raw slash command in
	 * the transcript. Any real resulting agent activity (the proposed plan
	 * itself, or the model's work once approved) still streams in normally;
	 * only the command text that triggered it is hidden. Reuses `handleSend`'s
	 * session-bootstrap so the toggle works even before a session exists yet.
	 */
	const handlePlanModeAction = useCallback(
		async (command: string) => {
			let sessionFile = activeSessionFile;
			if (!sessionFile) {
				try {
					const res = await invoke<{ file?: string; cwd?: string }>("new_session", {});
					if (res && typeof res.cwd === "string") setWorkspaceCwd(res.cwd);
					sessionFile = res?.file ?? `session-${Date.now()}.jsonl`;
				} catch {
					sessionFile = `session-${Date.now()}.jsonl`;
				}
				setActiveSessionFile(sessionFile);
			}
			startStream(sessionFile, command, { silent: true });
		},
		[activeSessionFile, startStream],
	);

	/**
	 * Auto-reveal the proposed plan the moment it's ready. `pi-plan-mode`'s
	 * own `onAgentSettled` hook only auto-displays plan text for its legacy
	 * text-marker completion path — the real `plan_mode_complete` TOOL path
	 * (what the model actually calls) instead pops a "ready plan" menu and
	 * only sends the plan text to chat if the user explicitly runs `/plan
	 * show`. Without this, `planModeStatus` flips to "plan ready" (the
	 * composer's "Approve Plan" button appears) but nothing the user can
	 * read ever arrives — exactly the bug reported: the model insisted the
	 * plan was "right there" (it was, in the tool result, which isn't
	 * rendered as a chat message) while the transcript stayed empty. Silently
	 * issuing `/plan show` here forces the SAME `pi.sendMessage(...,
	 * {display:true})` path `/plan show` always uses, which the
	 * `CUSTOM_MESSAGE` reducer case now renders as a real chat bubble.
	 */
	const prevPlanModeStatusRef = useRef<string | undefined>(undefined);
	useEffect(() => {
		const prev = prevPlanModeStatusRef.current;
		prevPlanModeStatusRef.current = planModeStatus;
		if (planModeStatus === "plan ready" && prev !== "plan ready") {
			handlePlanModeAction("/plan show");
		}
	}, [planModeStatus, handlePlanModeAction]);

	/**
	 * Issue #201 PR 3 — Ctrl+↑ in the composer fires this. We atomically
	 * drain the SDK queue (so nothing fires while the user is editing) and
	 * load the drained messages into the composer via the existing
	 * `draft` channel.
	 *
	 * Format: steering items first, follow-up items second, separated by a
	 * blank line. The user can rewrite, reorder, or delete freely. When
	 * they press Enter / Alt+Enter, the whole edited blob re-queues as ONE
	 * message (intentional: simpler than splitting + per-kind round-trip,
	 * and the agent reads the result identically). If they want to drop
	 * the queue entirely they just clear the textarea — nothing fires.
	 */
	const handleEditQueue = useCallback(async () => {
		if (!activeSessionFile) return;
		const drained = await clearQueue(activeSessionFile);
		const all = [...drained.steering, ...drained.followUp];
		if (all.length === 0) return;
		const joined = all.join("\n\n");
		setComposerDraft((prev) => ({
			text: joined,
			nonce: (prev?.nonce ?? 0) + 1,
		}));
	}, [clearQueue, activeSessionFile]);

	const handleModelSelect = useCallback(async (provider: string, modelId: string) => {
		setActiveModelId(modelKey(provider, modelId));
		try {
			log.debug("[settings] saving model:", provider, modelId);
			await invoke("save_settings", {
				settings: {
					defaultModel: modelId,
					defaultProvider: provider,
				},
			});
			// Actually set the model on the sidecar so it takes effect immediately
			await invoke("set_active_model", {
				provider,
				model: modelId,
			});
		} catch (err) {
			log.warn("[settings] save failed:", err);
		}
	}, []);

	// Create a fresh session bound to `cwd` (a chosen folder). The sidecar
	// returns the resolved workspace (it may fall back to home if the path was
	// invalid) — we reflect that. Creating a new session never mutates the
	// previously-active session's folder; each session owns its own cwd.
	const handleNewSession = useCallback(
		async (cwd?: string) => {
			let resolvedCwd: string | undefined;
			let file: string | undefined;
			try {
				const res = await invoke<{ cwd?: string; file?: string }>(
					"new_session",
					cwd ? { cwd } : {},
				);
				if (res && typeof res.cwd === "string") {
					resolvedCwd = res.cwd;
					setWorkspaceCwd(res.cwd);
				}
				if (res && typeof res.file === "string") file = res.file;
			} catch {
				// ignore
			}
			// Deliberately no reset of any stream state here — a genuinely new
			// session has no prior entry in `streams` to reset, and this must
			// never touch whatever a DIFFERENT, still-active session is doing
			// (that was the literal bug: creating a new chat used to abort
			// whatever was running). See docs/plans/multi-session-concurrency.md.
			playground.clear();
			setSelectedArtifactId(null);
			setLoadedSessionMessages(null);
			// pi owns the session file; adopt its path as our identity.
			setActiveSessionFile(file ?? `session-${Date.now()}.jsonl`);
			return resolvedCwd;
		},
		[playground.clear],
	);

	// "New session" ALWAYS asks for a folder first (native picker), then starts
	// a fresh session bound to it — the chosen directory becomes the agent's
	// working dir, so generated files land where the user expects (pi's "open
	// from any folder"). Cancelling the picker is a no-op: we never silently
	// create a session in an unintended folder, and the active session is left
	// untouched.
	const handleNewSessionPrompt = useCallback(async () => {
		let selected: string | null = null;
		try {
			const picked = await openDialog({
				directory: true,
				multiple: false,
				title: "Choose a folder for this session",
				...(workspaceCwd ? { defaultPath: workspaceCwd } : {}),
			});
			if (typeof picked === "string") selected = picked;
		} catch {
			// dialog unavailable — fall through to no-op
		}
		if (!selected) return; // cancelled — don't create, don't touch active session
		setSidebarView("chats");
		await handleNewSession(selected);
	}, [handleNewSession, workspaceCwd]);

	// Slash-command dispatch (epic #179). Built-in commands close over these
	// GUI actions; the registry itself is pure (src/lib/builtinCommands.ts).
	const handleRunCommand = useCallback(
		(cmd: Command, args: string) => {
			const builtin = findBuiltinCommand(cmd.name);
			if (!builtin) return;
			const openSettings = () => {
				setSidebarView("settings");
				setShowSettings(true);
			};
			const ctx: CommandContext = {
				newSession: () => handleNewSessionPrompt(),
				openSessions: () => setSidebarView("chats"),
				openModelSelector: () => setShowModelSelector(true),
				openSettings,
				showHelp: () => setShowHelp(true),
				sendMessage: (text) => handleSend(text),
			};
			runBuiltinCommand(ctx, builtin, args);
		},
		[handleNewSessionPrompt, handleSend],
	);

	// Load the sidecar's active workspace once it's ready, so the sidebar can
	// show "where am I working" from the first paint.
	useEffect(() => {
		let cancelled = false;
		invoke<{ cwd?: string; default?: string }>("get_workspace")
			.then((res) => {
				if (cancelled || !res) return;
				if (typeof res.cwd === "string") setWorkspaceCwd(res.cwd);
				if (typeof res.default === "string") setHomeDir(res.default);
			})
			.catch(() => {
				// sidecar not ready yet — harmless; updated on next new_session
			});
		return () => {
			cancelled = true;
		};
	}, []);

	// Font scale / zoom preference

	const [pendingDelete, setPendingDelete] = useState<{ file: string; title: string } | null>(null);
	const [pendingRename, setPendingRename] = useState<{ file: string; title: string } | null>(null);

	const handleDeleteSession = useCallback(
		(file: string) => {
			const entry = sessionEntries.find((s) => s.file === file);
			setPendingDelete({ file, title: entry?.title ?? "this chat" });
		},
		[sessionEntries],
	);

	const handleConfirmDelete = useCallback(async () => {
		if (!pendingDelete) return;
		const file = pendingDelete.file;
		try {
			await invoke("delete_session", { sessionFile: file });
		} catch {
			// ignore
		}
		setSessionEntries((prev) => prev.filter((s) => s.file !== file));
		// A deleted session's stream state should be forgotten regardless of
		// whether it happened to be the displayed one — this only ever touches
		// the deleted session's own entry, never another session's.
		forgetSession(file);
		if (activeSessionFile === file) {
			setActiveSessionFile(null);
			setLoadedSessionMessages(null);
			playground.clear();
			setSelectedArtifactId(null);
		}
	}, [pendingDelete, activeSessionFile, forgetSession, playground.clear]);

	// Open the rename popup for a session (mirrors the delete confirm flow).
	const handleRequestRename = useCallback(
		(file: string) => {
			const entry = sessionEntries.find((s) => s.file === file);
			setPendingRename({ file, title: entry?.title ?? "" });
		},
		[sessionEntries],
	);

	// ── Rename a session (sticky, user-chosen title) ──
	// biome-ignore lint/correctness/useExhaustiveDependencies: loadSessionList is a stable component-scope reconcile helper
	const handleRenameSession = useCallback(async (file: string, title: string) => {
		const clean = title.trim();
		if (!clean) return;
		// Optimistic: update the sidebar immediately and lock the title so the
		// auto-derive-on-save path won't clobber it before the disk reconcile.
		setSessionEntries((prev) =>
			prev.map((s) => (s.file === file ? { ...s, title: clean, titleLocked: true } : s)),
		);
		try {
			await invoke("rename_session", { sessionFile: file, title: clean });
			trackEvent("session_renamed");
		} catch (err) {
			log.error("Failed to rename session:", err);
			loadSessionList().catch(() => {});
		}
	}, []);

	// ── Pin / unpin a session ──
	// biome-ignore lint/correctness/useExhaustiveDependencies: loadSessionList is a stable component-scope reconcile helper
	const handlePinSession = useCallback(async (file: string, pinned: boolean) => {
		setSessionEntries((prev) => prev.map((s) => (s.file === file ? { ...s, pinned } : s)));
		try {
			await invoke("set_session_pinned", { sessionFile: file, pinned });
			trackEvent(pinned ? "session_pinned" : "session_unpinned");
			// Reconcile so pinned-first ordering matches disk truth.
			loadSessionList().catch(() => {});
		} catch (err) {
			log.error("Failed to pin session:", err);
			loadSessionList().catch(() => {});
		}
	}, []);

	// ── Deep content search across all session bodies ──
	const handleDeepSearch = useCallback(async (query: string) => {
		try {
			const result = await invoke("search_sessions", { query, allFolders: true });
			const data = result as { matches?: { file: string; snippet: string; matchCount: number }[] };
			return data.matches ?? [];
		} catch (err) {
			log.error("Deep search failed:", err);
			return [];
		}
	}, []);

	const handleSessionSelect = useCallback(
		async (file: string) => {
			if (file === activeSessionFile) return;
			setLoadingSession(true);
			setActiveSessionFile(file);
			setLoadedSessionMessages(null);
			// Deliberately no stream reset here — the session being switched TO
			// may still be actively streaming in the background, and switching
			// away from the PREVIOUS session must not touch its state either.
			// See docs/plans/multi-session-concurrency.md Phase 3.
			playground.clear();
			setSelectedArtifactId(null);
			try {
				const result = await invoke("load_session", { sessionFile: file });
				const data = result as {
					messages: ChatMessage[];
					artifacts?: PlaygroundArtifactPayload[];
					model?: string;
					provider?: string;
					cwd?: string;
				};
				if (data.messages && data.messages.length > 0) {
					setLoadedSessionMessages(data.messages);
				}
				// Reconstruct the playground panel's artifacts from this session's
				// history — the engine derives these from completed show_artifact
				// tool calls in the session's toolCalls (see hypatia-backend's
				// reconstructShowArtifacts), so this is a full replacement of the
				// map, not a merge with the previous session.
				playground.seed(data.artifacts ?? []);
				// Reflect the workspace this session was restored into (the sidecar
				// rebinds to the session's saved folder, or home for legacy chats).
				if (typeof data.cwd === "string") {
					setWorkspaceCwd(data.cwd);
				}
				// Restore the model that was used in this conversation, so the
				// user doesn't have to manually re-select it before sending.
				if (data.model && data.provider) {
					const key = modelKey(data.provider, data.model);
					if (findModel(models, key)) {
						setActiveModelId(key);
						invoke("set_active_model", { model: data.model, provider: data.provider }).catch(
							() => {},
						);
					} else {
						// Saved model isn't available (e.g. different provider config on
						// this device). Leave the default model active; the user can
						// pick a new one from the dropdown.
						log.warn(
							"[cowork] Saved model %s/%s not found in available models",
							data.provider,
							data.model,
						);
					}
				}
			} catch (err) {
				log.error("Failed to load session:", err);
			} finally {
				setLoadingSession(false);
			}
		},
		[activeSessionFile, models, playground.clear, playground.seed],
	);

	// ── Build display messages ──
	// Show loaded session history + any new stream messages together
	const displayMessages = loadedSessionMessages
		? streamState.messages.length > 0
			? [...loadedSessionMessages, ...streamState.messages]
			: loadedSessionMessages
		: streamState.messages;

	// Hide the app chrome (sidebar, mobile bars, share button) whenever the
	// main pane is showing a full-screen state: settings or the startup
	// loading splash (#169).
	const hideChrome = showSettings || initializing;

	const sidebarSessions = sessionEntries.map((s) => ({
		id: s.file,
		title: s.title,
		// Prefer a real content preview; fall back to a count for empty sessions.
		lastMessage: s.preview?.trim() ? s.preview : `${s.messageCount} messages`,
		timestamp: s.lastActivity || s.createdAt,
		active: s.file === activeSessionFile,
		folder: s.cwd,
		pinned: s.pinned,
		titleLocked: s.titleLocked,
	}));
	const presentingModel = findModel(models, activeModelId);

	return (
		// The app is scaled with CSS `zoom` (font-size presets). Because `zoom`
		// multiplies the PAINTED size, the root height is zoom-COMPENSATED (100vh
		// divided by the scale) so it always paints as exactly one viewport —
		// otherwise Large/Extra-Large overflows <body>, and focus-scroll clips the
		// fixed sidebar top-chrome (the New-chat button) off the top. The per-preset
		<div className="flex md:gap-2.5 md:p-2.5 [zoom:1] h-screen">
			{/* V3 dummy auth gate: full-screen overlay, once per session. The app
			    mounts beneath it so the reveal lands on a ready chat. */}
			{showAuthGate && <AuthGate onDone={() => setShowAuthGate(false)} />}

			{/* Delete chat confirmation */}
			<ConfirmDialog
				open={pendingDelete !== null}
				onClose={() => setPendingDelete(null)}
				onConfirm={handleConfirmDelete}
				title="Delete chat?"
				description={
					<>
						<span className="text-foreground font-medium">“{pendingDelete?.title}”</span> will be
						permanently removed. This can’t be undone.
					</>
				}
				confirmLabel="Delete"
				cancelLabel="Cancel"
				variant="destructive"
			/>

			{/* Rename chat popup */}
			<RenameDialog
				open={pendingRename !== null}
				initialTitle={pendingRename?.title ?? ""}
				onClose={() => setPendingRename(null)}
				onSave={(title) => {
					if (pendingRename) handleRenameSession(pendingRename.file, title);
				}}
			/>

			<HelpDialog open={showHelp} commands={BUILTIN_COMMANDS} onClose={() => setShowHelp(false)} />

			{/* Pending pi extension confirm/select/input/editor request, if any */}
			<ExtensionUiDialog
				request={isPlanModeQuestionPending ? null : extensionUiRequest}
				onRespond={respondExtensionUi}
			/>

			{/* Sidebar — desktop: visible, mobile: slide-over */}
			{!hideChrome && (
				<>
					{/* Desktop sidebar — floating glass panel */}
					<div className="hidden md:block panel-sidebar overflow-hidden shrink-0">
						<Sidebar
							sessions={sidebarSessions}
							activeSessionId={activeSessionFile || undefined}
							onSessionSelect={(id) => {
								handleChangeView("chats");
								handleSessionSelect(id);
							}}
							onNewSession={() => {
								handleChangeView("chats");
								// "New" starts a session in the configured Hypatia Cowork folder — no folder prompt.
								handleNewSession();
							}}
							onOpenSession={() => {
								handleChangeView("chats");
								// "Open" picks a folder for the agent to work in.
								handleNewSessionPrompt();
							}}
							homeDir={homeDir ?? undefined}
							activeWorkspace={workspaceCwd ?? undefined}
							onDeleteSession={handleDeleteSession}
							onRequestRename={handleRequestRename}
							onPinSession={handlePinSession}
							onDeepSearch={handleDeepSearch}
							onChangeView={handleChangeView}
							isRecordingMeeting={meetingRecording.recording}
							meetingElapsed={meetingRecording.elapsed}
						/>
					</div>
				</>
			)}

			{/* Main content — raised glass panel */}
			<div className="relative flex-1 flex flex-col min-w-0 md:panel-raised md:overflow-hidden">
				{/* In-app update banner (issue #271) */}
				<UpdateBanner update={appUpdate} />

				{/* Content with view transition key */}
				<main className="flex-1 flex flex-col min-h-0 overflow-hidden">
					<div
						key={
							initializing
								? "splash"
								: showSettings
									? "settings"
									: showPresenting
										? "presenting"
										: showMeetings
											? "meetings"
											: loadingSession
												? "loading"
												: "chat"
						}
						className="flex-1 flex flex-col min-h-0 animate-fade-in"
					>
						{initializing ? (
							<SplashScreen />
						) : showSettings ? (
							<SettingsPage
								onClose={() => {
									setShowSettings(false);
									setSidebarView("chats");
								}}
							/>
						) : showPresenting ? (
							<PresentingPanel provider={presentingModel?.provider} model={presentingModel?.id} />
						) : showMeetings ? (
							<MeetingsPanel
								{...meetingRecording}
								onClose={() => {
									setShowMeetings(false);
									setSidebarView("chats");
								}}
							/>
						) : loadingSession ? (
							<div className="flex-1 flex flex-col items-center justify-center gap-4">
								<div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
								<div className="text-sm text-muted-foreground">Loading session...</div>
							</div>
						) : (
							<div className="flex-1 flex min-h-0">
								<div className="flex-1 flex flex-col min-w-0">
									<ChatView
										messages={displayMessages}
										streamingMessage={streamState.streamingMessage}
										isRunning={streamState.isRunning}
										error={streamState.error}
										onSend={handleSend}
										planModeStatus={planModeStatus}
										onPlanModeAction={handlePlanModeAction}
										planQuestionRequest={planQuestionRequest}
										onRespondPlanQuestion={respondExtensionUi}
										onAbort={() => activeSessionFile && abortStream(activeSessionFile)}
										/* Issue #201, PR 2 — mid-turn message queuing. */
										onSteer={(text) => activeSessionFile && steerStream(activeSessionFile, text)}
										onFollowUp={(text) =>
											activeSessionFile && followUpStream(activeSessionFile, text)
										}
										/* Issue #201, PR 3 — queue visibility + editing. */
										queue={streamState.queue}
										onEditQueue={handleEditQueue}
										sessionKey={activeSessionFile ?? "new"}
										onRetry={() => {
											const lastUser = [...displayMessages]
												.reverse()
												.find((m) => m.role === "user");
											if (lastUser?.content) handleSend(lastUser.content);
										}}
										models={models}
										currentModelId={activeModelId}
										onModelSelect={handleModelSelect}
										modelSelectorOpen={showModelSelector}
										onModelSelectorOpenChange={setShowModelSelector}
										draft={composerDraft}
										commands={BUILTIN_COMMANDS}
										onRunCommand={handleRunCommand}
										onOpenArtifact={handleOpenArtifact}
										sessionId={activeSessionFile || undefined}
									/>
								</div>
								{playgroundClosed ? (
									<PlaygroundReopenTab
										artifacts={playground.artifacts}
										onOpen={() => setPlaygroundClosed(false)}
									/>
								) : (
									Object.keys(playground.artifacts).length > 0 && (
										<PlaygroundPanel
											artifacts={playground.artifacts}
											onClose={() => setPlaygroundClosed(true)}
											selectedId={selectedArtifactId}
											onSelectId={setSelectedArtifactId}
										/>
									)
								)}
							</div>
						)}
					</div>
				</main>
			</div>
		</div>
	);
}

export default App;
