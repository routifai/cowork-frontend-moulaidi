/**
 * ExtensionUiDialog — renders whatever interactive request is at the head of
 * `useExtensionUi()`'s queue (confirm / select / input / editor).
 *
 * pi extensions (e.g. a permission gate around bash/edit/write) call
 * `ctx.ui.confirm()`/`select()`/`input()`/`editor()`, which the sidecar turns
 * into a `ui_request` Tauri event. Without something rendering that event and
 * calling `respond()`, the extension's promise never resolves and the tool
 * call — and the whole turn — hangs forever. This is that renderer.
 *
 * Mirrors the visual language of ConfirmDialog/RenameDialog (Dialog shell,
 * centered icon, two-button grid) so an extension prompt doesn't look like a
 * different app.
 */
import { Dialog } from "@/components/ui/dialog";
import type { ExtensionUiRequest, ExtensionUiResponse } from "@/hooks/useExtensionUi";
import { FileEdit, ListChecks, Pencil, ShieldAlert } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useState } from "react";

interface ExtensionUiDialogProps {
	request: ExtensionUiRequest | null;
	onRespond: (response: ExtensionUiResponse) => void;
}

const METHOD_ICON = {
	confirm: ShieldAlert,
	select: ListChecks,
	input: Pencil,
	editor: FileEdit,
} as const;

export function ExtensionUiDialog({ request, onRespond }: ExtensionUiDialogProps) {
	const titleId = useId();
	const reduced = useReducedMotion();
	const [draft, setDraft] = useState("");

	// Reset the draft whenever a new input/editor request comes in.
	useEffect(() => {
		if (request?.method === "input" || request?.method === "editor") {
			setDraft(request.prefill ?? "");
		}
	}, [request]);

	if (!request) return null;

	const handleCancel = () => onRespond({ cancelled: true });
	const Icon = METHOD_ICON[request.method as keyof typeof METHOD_ICON] ?? ShieldAlert;

	return (
		<Dialog
			open
			onClose={handleCancel}
			size={request.method === "editor" ? "lg" : "sm"}
			labelledBy={titleId}
			closeOnBackdrop={false}
		>
			<div className="px-6 pt-7 pb-5">
				{/* Icon */}
				<div className="flex justify-center mb-4">
					<motion.div
						className="relative w-12 h-12 rounded-2xl flex items-center justify-center bg-primary/10"
						initial={reduced ? false : { scale: 0.7, opacity: 0 }}
						animate={{ scale: 1, opacity: 1 }}
						transition={{ type: "spring", stiffness: 360, damping: 22, delay: 0.08 }}
					>
						<Icon className="w-6 h-6 text-primary" />
					</motion.div>
				</div>

				{/* Title */}
				<h2
					id={titleId}
					className="text-base font-semibold text-card-foreground text-center mb-1.5"
				>
					{request.title || "Extension request"}
				</h2>

				{/* Message — monospace block for confirm (usually a shell command or
				    file path), plain prose otherwise. */}
				{request.message &&
					(request.method === "confirm" ? (
						<pre className="text-xs font-mono text-foreground/80 bg-muted/50 rounded-md px-3 py-2 mb-5 whitespace-pre-wrap break-all max-h-40 overflow-y-auto text-left">
							{request.message}
						</pre>
					) : (
						<p className="text-sm text-muted-foreground text-center leading-relaxed mb-4 px-1">
							{request.message}
						</p>
					))}

				{/* Select — one button per option */}
				{request.method === "select" && (
					<div className="flex flex-col gap-1.5 mb-2">
						{(request.options ?? []).map((opt) => (
							<button
								key={opt}
								type="button"
								onClick={() => onRespond({ value: opt })}
								className="w-full text-left text-sm px-3 py-2 rounded-md border border-border hover:border-primary/50 hover:bg-muted/50 transition-colors"
							>
								{opt}
							</button>
						))}
					</div>
				)}

				{/* Input — single-line field */}
				{request.method === "input" && (
					<input
						data-autofocus
						type="text"
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						onFocus={(e) => e.currentTarget.select()}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								onRespond({ value: draft });
							}
						}}
						placeholder={request.placeholder}
						className="w-full text-sm rounded-md border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20 mb-4"
					/>
				)}

				{/* Editor — multi-line field */}
				{request.method === "editor" && (
					<textarea
						data-autofocus
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						placeholder={request.placeholder}
						rows={12}
						className="w-full text-sm font-mono rounded-md border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20 mb-4 resize-y"
					/>
				)}

				{/* Buttons — confirm/input/editor get a submit action; select's
				    options above already act as the submit, so only Cancel shows. */}
				<div className={request.method === "select" ? "" : "grid grid-cols-2 gap-2 mt-2"}>
					<button
						type="button"
						onClick={handleCancel}
						className="px-4 py-2 text-xs font-medium text-foreground bg-muted/60 hover:bg-muted rounded-md transition-colors active:scale-[0.97]"
					>
						{request.method === "confirm" ? "Deny" : "Cancel"}
					</button>
					{request.method === "confirm" && (
						<button
							type="button"
							onClick={() => onRespond({ confirmed: true })}
							className="px-4 py-2 text-xs font-medium rounded-md transition-all active:scale-[0.97] bg-primary text-primary-foreground hover:brightness-110"
						>
							Allow
						</button>
					)}
					{(request.method === "input" || request.method === "editor") && (
						<button
							type="button"
							onClick={() => onRespond({ value: draft })}
							className="px-4 py-2 text-xs font-medium rounded-md transition-all active:scale-[0.97] bg-primary text-primary-foreground hover:brightness-110"
						>
							Submit
						</button>
					)}
				</div>
			</div>
		</Dialog>
	);
}
