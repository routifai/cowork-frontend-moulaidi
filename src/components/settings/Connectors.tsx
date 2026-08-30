import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
	Check,
	ChevronDown,
	ChevronRight,
	Loader2,
	Plug,
	Plus,
	ShieldCheck,
	Trash,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { openExternalUrl } from "../../lib/utils";

type Transport = "stdio" | "http";

interface Connector {
	id: string;
	name: string;
	enabledByDefault: boolean;
	transport: Transport;
	command?: string;
	args?: string[];
	env?: Record<string, string>;
	url?: string;
	headers?: Record<string, string>;
	hasOAuth?: boolean;
}

interface ConnectorForm {
	id?: string;
	name: string;
	enabledByDefault: boolean;
	transport: Transport;
	command: string;
	argsText: string;
	url: string;
}

const EMPTY_FORM: ConnectorForm = {
	name: "",
	enabledByDefault: true,
	transport: "stdio",
	command: "",
	argsText: "",
	url: "",
};

function formToInput(form: ConnectorForm) {
	const base = { id: form.id, name: form.name.trim(), enabledByDefault: form.enabledByDefault };
	if (form.transport === "stdio") {
		return {
			...base,
			transport: "stdio" as const,
			command: form.command.trim(),
			args: form.argsText.trim() ? form.argsText.trim().split(/\s+/) : undefined,
		};
	}
	return { ...base, transport: "http" as const, url: form.url.trim() };
}

/**
 * My Connectors — add, test, and manage MCP servers (local, spawned by this
 * process; or remote, over Streamable HTTP with an optional OAuth login).
 * Per-chat on/off toggling lives in the composer (McpConnectorsMenu) — this
 * page controls what exists and each connector's default enablement.
 */
export function Connectors() {
	const [connectors, setConnectors] = useState<Connector[]>([]);
	const [loading, setLoading] = useState(true);
	const [adding, setAdding] = useState(false);
	const [form, setForm] = useState<ConnectorForm>(EMPTY_FORM);
	const [saving, setSaving] = useState(false);
	const [testResult, setTestResult] = useState<
		| { success: true; tools: { name: string; description?: string }[] }
		| { success: false; error: string }
		| null
	>(null);
	const [testing, setTesting] = useState(false);
	const [authorizing, setAuthorizing] = useState<string | null>(null);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		try {
			const res = await invoke<{ connectors: Connector[] }>("list_mcp_connectors");
			setConnectors(res.connectors ?? []);
		} catch {
			setConnectors([]);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	// Opens the OAuth authorization URL in the system browser — the backend
	// sends this once `mcp_connector_oauth_start` needs a user login. See
	// mcp-oauth.ts's doc comment for why this event kind is already wired.
	useEffect(() => {
		const unlistenPromise = listen<{ url: string; connectorId: string }>(
			"oauth_authorize_url",
			(event) => {
				if (event.payload?.url) void openExternalUrl(event.payload.url);
			},
		);
		return () => {
			unlistenPromise.then((u) => u());
		};
	}, []);

	function startAdd() {
		setForm(EMPTY_FORM);
		setTestResult(null);
		setError(null);
		setAdding(true);
	}

	async function handleTest() {
		setTesting(true);
		setTestResult(null);
		try {
			const res = await invoke<
				| { success: true; tools: { name: string; description?: string }[] }
				| { success: false; error: string }
			>("test_mcp_connector", { connector: formToInput(form) });
			setTestResult(res);
		} catch (e) {
			setTestResult({ success: false, error: e instanceof Error ? e.message : String(e) });
		} finally {
			setTesting(false);
		}
	}

	async function handleSave() {
		if (!form.name.trim()) {
			setError("Give the connector a name.");
			return;
		}
		if (form.transport === "stdio" && !form.command.trim()) {
			setError("A local connector needs a command.");
			return;
		}
		if (form.transport === "http" && !form.url.trim()) {
			setError("A remote connector needs a URL.");
			return;
		}
		setSaving(true);
		setError(null);
		try {
			await invoke("save_mcp_connector", { connector: formToInput(form) });
			setAdding(false);
			await load();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Could not save the connector.");
		} finally {
			setSaving(false);
		}
	}

	async function handleDelete(id: string) {
		try {
			await invoke("delete_mcp_connector", { connectorId: id });
			setConnectors((prev) => prev.filter((c) => c.id !== id));
		} catch {
			// ignore
		}
	}

	async function handleToggleDefault(connector: Connector) {
		const next = !connector.enabledByDefault;
		setConnectors((prev) =>
			prev.map((c) => (c.id === connector.id ? { ...c, enabledByDefault: next } : c)),
		);
		try {
			await invoke("save_mcp_connector", {
				connector: {
					id: connector.id,
					name: connector.name,
					enabledByDefault: next,
					transport: connector.transport,
					command: connector.command,
					args: connector.args,
					url: connector.url,
				},
			});
		} catch {
			setConnectors((prev) => prev.map((c) => (c.id === connector.id ? connector : c)));
		}
	}

	async function handleAuthorize(connector: Connector) {
		setAuthorizing(connector.id);
		try {
			await invoke("mcp_connector_oauth_start", { connectorId: connector.id });
			await load();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Authorization failed.");
		} finally {
			setAuthorizing(null);
		}
	}

	return (
		<section className="flex flex-col flex-1 min-h-0 h-full">
			<h2 className="text-sm font-semibold text-foreground mb-1 shrink-0">My Connectors</h2>
			<p className="text-xs text-muted-foreground mb-5 shrink-0">
				MCP servers the agent can use as tools — local (a command this app runs) or remote (a URL,
				optionally behind OAuth login). Toggle which connectors are active in a given chat from the
				composer's connectors button.
			</p>

			<div className="flex-1 min-h-0 overflow-auto pr-1 space-y-2">
				{loading ? (
					<p className="text-xs text-muted-foreground/50 py-4 text-center">Loading…</p>
				) : connectors.length === 0 && !adding ? (
					<p className="text-xs text-muted-foreground/50 py-4 text-center">No connectors yet.</p>
				) : (
					connectors.map((c) => {
						const expanded = expandedId === c.id;
						return (
							<div key={c.id} className="rounded-lg border border-border/50 bg-muted/30">
								<button
									type="button"
									onClick={() => setExpandedId(expanded ? null : c.id)}
									className="flex items-center justify-between w-full px-3 py-2.5 text-left gap-2"
								>
									<span className="flex items-center gap-2 min-w-0">
										{expanded ? (
											<ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
										) : (
											<ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
										)}
										<Plug className="w-3.5 h-3.5 text-primary/70 shrink-0" />
										<span className="text-xs font-medium truncate">{c.name}</span>
										<span className="shrink-0 rounded px-1 py-px text-[9px] font-semibold uppercase tracking-wider bg-primary/10 text-primary">
											{c.transport === "stdio" ? "Local" : "Remote"}
										</span>
										{c.transport === "http" && c.hasOAuth && (
											<span title="Authorized">
												<ShieldCheck className="w-3.5 h-3.5 text-primary/70 shrink-0" />
											</span>
										)}
									</span>
									<span className="flex items-center gap-2 shrink-0">
										<label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
											Default on
											<input
												type="checkbox"
												checked={c.enabledByDefault}
												onClick={(e) => e.stopPropagation()}
												onChange={() => handleToggleDefault(c)}
												className="accent-primary"
											/>
										</label>
										<button
											type="button"
											onClick={(e) => {
												e.stopPropagation();
												handleDelete(c.id);
											}}
											title="Delete connector"
											className="p-1 rounded hover:bg-destructive/10 hover:text-destructive"
										>
											<Trash className="w-3.5 h-3.5" />
										</button>
									</span>
								</button>
								{expanded && (
									<div className="px-3 pb-3 text-[11px] text-muted-foreground space-y-2">
										{c.transport === "stdio" ? (
											<p className="font-mono truncate">
												{c.command} {c.args?.join(" ")}
											</p>
										) : (
											<p className="font-mono truncate">{c.url}</p>
										)}
										{c.transport === "http" && (
											<button
												type="button"
												onClick={() => handleAuthorize(c)}
												disabled={authorizing === c.id}
												className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium text-primary bg-primary/10 hover:bg-primary/15 disabled:opacity-50"
											>
												{authorizing === c.id ? (
													<Loader2 className="w-3 h-3 animate-spin" />
												) : (
													<ShieldCheck className="w-3 h-3" />
												)}
												{c.hasOAuth ? "Re-authorize" : "Connect with OAuth"}
											</button>
										)}
									</div>
								)}
							</div>
						);
					})
				)}

				{adding && (
					<div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
						<div>
							<label htmlFor="mcp-name" className="block text-[11px] text-muted-foreground mb-1">
								Name
							</label>
							<input
								id="mcp-name"
								type="text"
								value={form.name}
								onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
								placeholder="e.g. Filesystem"
								className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs"
							/>
						</div>

						<div className="flex items-center gap-3 text-[11px]">
							<label className="flex items-center gap-1.5">
								<input
									type="radio"
									name="mcp-transport"
									checked={form.transport === "stdio"}
									onChange={() => setForm((f) => ({ ...f, transport: "stdio" }))}
								/>
								Local (command)
							</label>
							<label className="flex items-center gap-1.5">
								<input
									type="radio"
									name="mcp-transport"
									checked={form.transport === "http"}
									onChange={() => setForm((f) => ({ ...f, transport: "http" }))}
								/>
								Remote (URL)
							</label>
						</div>

						{form.transport === "stdio" ? (
							<div className="space-y-2">
								<input
									type="text"
									value={form.command}
									onChange={(e) => setForm((f) => ({ ...f, command: e.target.value }))}
									placeholder="Command, e.g. npx"
									className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-mono"
								/>
								<input
									type="text"
									value={form.argsText}
									onChange={(e) => setForm((f) => ({ ...f, argsText: e.target.value }))}
									placeholder="Arguments, e.g. -y @modelcontextprotocol/server-everything"
									className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-mono"
								/>
							</div>
						) : (
							<input
								type="text"
								value={form.url}
								onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
								placeholder="https://example.com/mcp"
								className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-mono"
							/>
						)}

						{testResult && (
							<p
								className={`text-[11px] ${testResult.success ? "text-primary" : "text-destructive"}`}
							>
								{testResult.success ? (
									<>
										<Check className="inline w-3 h-3 mr-1" />
										Connected — {testResult.tools.length} tool
										{testResult.tools.length === 1 ? "" : "s"} available
									</>
								) : (
									testResult.error
								)}
							</p>
						)}
						{error && <p className="text-[11px] text-destructive">{error}</p>}

						<div className="flex items-center justify-end gap-2 pt-1">
							<button
								type="button"
								onClick={() => setAdding(false)}
								className="px-3 py-1.5 text-[11px] rounded-md text-muted-foreground hover:text-foreground"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={handleTest}
								disabled={testing}
								className="px-3 py-1.5 text-[11px] font-medium rounded-md bg-muted hover:bg-muted/70 disabled:opacity-50"
							>
								{testing ? "Testing…" : "Test"}
							</button>
							<button
								type="button"
								onClick={handleSave}
								disabled={saving}
								className="px-3 py-1.5 text-[11px] font-semibold rounded-md bg-primary text-primary-foreground hover:brightness-110 disabled:opacity-50"
							>
								{saving ? "Saving…" : "Save"}
							</button>
						</div>
					</div>
				)}
			</div>

			{!adding && (
				<button
					type="button"
					onClick={startAdd}
					className="mt-3 inline-flex items-center gap-1.5 self-start px-3 py-1.5 rounded-md text-[12px] font-medium text-primary bg-primary/10 hover:bg-primary/15 transition-colors"
				>
					<Plus className="w-3.5 h-3.5" />
					Add connector
				</button>
			)}
		</section>
	);
}
