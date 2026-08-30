import { invoke } from "@tauri-apps/api/core";
import { Plug } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * McpConnectorsMenu — composer-toolbar popover for toggling which MCP
 * connectors are active in THIS session, mirroring Claude's "+ → Connectors"
 * per-chat toggle. Full connector CRUD (add/edit/delete/OAuth) lives in
 * Settings → My Connectors; this is just the live on/off switch.
 *
 * State is in-memory per session on the backend (see SessionState's
 * `mcpConnectorIds`) — reopening this session later, or restarting the app,
 * resets each connector back to its stored default.
 */

interface SessionMcpConnector {
	id: string;
	name: string;
	transport: "stdio" | "http";
	enabled: boolean;
}

interface McpConnectorsMenuProps {
	sessionId: string;
	disabled?: boolean;
}

export function McpConnectorsMenu({ sessionId, disabled }: McpConnectorsMenuProps) {
	const [open, setOpen] = useState(false);
	const [connectors, setConnectors] = useState<SessionMcpConnector[]>([]);
	const [loading, setLoading] = useState(false);
	const [pendingId, setPendingId] = useState<string | null>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const res = await invoke<{ connectors: SessionMcpConnector[] }>("list_mcp_connectors", {
				sessionId,
			});
			setConnectors(res.connectors ?? []);
		} catch {
			setConnectors([]);
		} finally {
			setLoading(false);
		}
	}, [sessionId]);

	const openMenu = useCallback(() => {
		if (!triggerRef.current) return;
		const rect = triggerRef.current.getBoundingClientRect();
		setDropdownStyle({
			position: "fixed",
			left: rect.left,
			bottom: window.innerHeight - rect.top + 6,
			width: 260,
			zIndex: 9999,
		});
		setOpen(true);
		void load();
	}, [load]);

	useEffect(() => {
		if (!open) return;
		function close(e: MouseEvent) {
			if (
				triggerRef.current &&
				!triggerRef.current.contains(e.target as Node) &&
				!(e.target as HTMLElement).closest("[data-mcp-connectors-dropdown]")
			) {
				setOpen(false);
			}
		}
		document.addEventListener("mousedown", close);
		return () => document.removeEventListener("mousedown", close);
	}, [open]);

	async function toggle(connector: SessionMcpConnector) {
		const nextEnabled = !connector.enabled;
		setPendingId(connector.id);
		// Optimistic update — reload() on the backend can take a moment.
		setConnectors((prev) =>
			prev.map((c) => (c.id === connector.id ? { ...c, enabled: nextEnabled } : c)),
		);
		try {
			await invoke("set_session_mcp_connector", {
				sessionId,
				connectorId: connector.id,
				enabled: nextEnabled,
			});
		} catch {
			// revert on failure
			setConnectors((prev) =>
				prev.map((c) => (c.id === connector.id ? { ...c, enabled: connector.enabled } : c)),
			);
		} finally {
			setPendingId(null);
		}
	}

	const enabledCount = connectors.filter((c) => c.enabled).length;

	return (
		<>
			<button
				ref={triggerRef}
				type="button"
				disabled={disabled}
				aria-haspopup="listbox"
				aria-expanded={open}
				onClick={open ? () => setOpen(false) : openMenu}
				aria-label="MCP connectors"
				title="MCP connectors"
				className="flex items-center gap-1 h-8 px-2 rounded-lg text-xs transition-colors disabled:opacity-40
				           text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--muted)/0.7)]"
			>
				<Plug size={15} />
				{enabledCount > 0 && (
					<span className="text-[10px] font-semibold tabular-nums text-primary">
						{enabledCount}
					</span>
				)}
			</button>

			{createPortal(
				<AnimatePresence>
					{open && (
						<motion.div
							data-mcp-connectors-dropdown=""
							role="listbox"
							aria-label="MCP connectors"
							initial={{ opacity: 0, y: 6, scale: 0.97 }}
							animate={{ opacity: 1, y: 0, scale: 1 }}
							exit={{ opacity: 0, y: 6, scale: 0.97 }}
							transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
							className="rounded-xl border overflow-hidden flex flex-col max-h-80"
							style={{
								...dropdownStyle,
								background: "hsl(var(--popover))",
								borderColor: "hsl(var(--border))",
								boxShadow: "0 16px 48px hsl(0 0% 0% / 0.35), 0 2px 8px hsl(0 0% 0% / 0.2)",
							}}
						>
							<div className="px-3 py-2 border-b border-border shrink-0">
								<p className="text-[11px] font-semibold text-foreground">
									Connectors for this chat
								</p>
							</div>
							<div className="flex-1 min-h-0 overflow-y-auto py-1">
								{loading ? (
									<p className="px-3 py-4 text-center text-xs text-muted-foreground/50">Loading…</p>
								) : connectors.length === 0 ? (
									<p className="px-3 py-4 text-center text-xs text-muted-foreground/50">
										No connectors yet — add one in Settings → My Connectors.
									</p>
								) : (
									connectors.map((c) => (
										<button
											key={c.id}
											type="button"
											role="option"
											aria-selected={c.enabled}
											disabled={pendingId === c.id}
											onClick={() => toggle(c)}
											className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-accent/50 transition-colors disabled:opacity-50"
										>
											<span className="flex items-center gap-2 min-w-0">
												<span className="text-xs text-foreground truncate">{c.name}</span>
												<span className="shrink-0 rounded px-1 py-px text-[9px] font-semibold uppercase tracking-wider bg-primary/10 text-primary">
													{c.transport === "stdio" ? "Local" : "Remote"}
												</span>
											</span>
											<span
												className={`shrink-0 w-8 h-[18px] rounded-full transition-colors relative ${
													c.enabled ? "bg-primary" : "bg-muted"
												}`}
											>
												<span
													className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-background transition-transform ${
														c.enabled ? "translate-x-[18px]" : "translate-x-0.5"
													}`}
												/>
											</span>
										</button>
									))
								)}
							</div>
						</motion.div>
					)}
				</AnimatePresence>,
				document.body,
			)}
		</>
	);
}
