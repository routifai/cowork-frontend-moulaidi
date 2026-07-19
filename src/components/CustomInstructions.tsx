import MDEditor from "@uiw/react-md-editor";
import "@uiw/react-md-editor/markdown-editor.css";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { type ThemeMode, getThemeMode } from "../lib/themes";

/**
 * Custom instructions editor.
 *
 * Instructions are stored as Markdown (`INSTRUCTIONS.md`) by the sidecar and
 * injected into the system prompt as always-on context. Saving reloads the live
 * session, so changes take effect immediately — no app restart.
 */
export function CustomInstructions() {
	const [instructions, setInstructions] = useState("");
	const [saved, setSaved] = useState(false);
	const [saving, setSaving] = useState(false);
	const [loading, setLoading] = useState(true);
	const [colorMode, setColorMode] = useState<ThemeMode>(() => getThemeMode());
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Load saved instructions on mount.
	useEffect(() => {
		let cancelled = false;
		invoke<string>("get_instructions")
			.then((content) => {
				if (cancelled) return;
				if (typeof content === "string") setInstructions(content);
			})
			.catch(() => {
				// Silently fail — absence of instructions is a valid state.
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	// Keep the editor's color scheme in sync with the app theme (data-theme on
	// <html>, toggled elsewhere). The editor reads `data-color-mode`.
	useEffect(() => {
		const sync = () => setColorMode(getThemeMode());
		const observer = new MutationObserver(sync);
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["data-theme"],
		});
		return () => observer.disconnect();
	}, []);

	// Clean up the "Saved!" timer on unmount.
	useEffect(
		() => () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		},
		[],
	);

	const handleSave = async () => {
		setSaving(true);
		try {
			await invoke("save_instructions", { content: instructions });
			setSaved(true);
			if (timerRef.current) clearTimeout(timerRef.current);
			timerRef.current = setTimeout(() => setSaved(false), 2000);
		} catch {
			// Silently fail — keep the editor content so the user can retry.
		} finally {
			setSaving(false);
		}
	};

	const handleChange = (value?: string) => {
		setInstructions(value ?? "");
		if (saved) setSaved(false);
	};

	return (
		<div className="flex flex-col flex-1 min-h-0">
			<div data-color-mode={colorMode} className="glass overflow-hidden cwk-md-fill flex-1 min-h-0">
				<MDEditor
					value={instructions}
					onChange={handleChange}
					preview="edit"
					visibleDragbar={false}
					textareaProps={{
						placeholder:
							"e.g. You are a senior developer who prefers TypeScript. Always explain trade-offs and keep changes minimal.",
						disabled: loading,
						"aria-label": "Custom instructions",
					}}
				/>
			</div>
			<div className="flex items-center justify-end gap-3 mt-4 shrink-0">
				{saved && (
					<span className="text-xs text-primary font-medium transition-opacity">
						Saved! Applied to this and new chats.
					</span>
				)}
				<button
					type="button"
					onClick={handleSave}
					disabled={loading || saving}
					className="px-6 py-2.5 text-sm font-semibold rounded-xl bg-primary text-primary-foreground shadow-sm hover:brightness-110 active:scale-[0.98] disabled:opacity-50 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
				>
					{saving ? "Saving…" : "Save"}
				</button>
			</div>
		</div>
	);
}
