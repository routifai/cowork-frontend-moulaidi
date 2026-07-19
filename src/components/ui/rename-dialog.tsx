/**
 * RenameDialog — small modal for renaming a chat session. Mirrors the
 * ConfirmDialog used for deletes so rename and delete feel like one family
 * of actions instead of an inline-edit one-off.
 *
 * UX choices:
 *   • Prefilled, auto-selected text field (`data-autofocus`) so the user can
 *     immediately type or tweak the existing title.
 *   • Enter commits, Esc / backdrop cancels (Esc handled by the Dialog shell).
 *   • Save is disabled while the field is empty.
 */
import { Dialog } from "@/components/ui/dialog";
import { Pencil } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";

interface RenameDialogProps {
	open: boolean;
	/** Title to prefill when the dialog opens. */
	initialTitle: string;
	onClose: () => void;
	/** Called with the trimmed, non-empty new title. */
	onSave: (title: string) => void;
}

export function RenameDialog({ open, initialTitle, onClose, onSave }: RenameDialogProps) {
	const titleId = useId();
	const reduced = useReducedMotion();
	const inputRef = useRef<HTMLInputElement>(null);
	const [draft, setDraft] = useState(initialTitle);

	// Reset the field every time the dialog (re)opens for a session.
	useEffect(() => {
		if (open) setDraft(initialTitle);
	}, [open, initialTitle]);

	const clean = draft.trim();
	const canSave = clean.length > 0;

	const handleSave = () => {
		if (!canSave) return;
		onSave(clean);
		onClose();
	};

	return (
		<Dialog open={open} onClose={onClose} size="sm" labelledBy={titleId}>
			<div className="px-6 pt-7 pb-5">
				{/* Icon */}
				<div className="flex justify-center mb-4">
					<motion.div
						className="relative w-12 h-12 rounded-2xl flex items-center justify-center bg-primary/10"
						initial={reduced ? false : { scale: 0.7, opacity: 0 }}
						animate={{ scale: 1, opacity: 1 }}
						transition={{ type: "spring", stiffness: 360, damping: 22, delay: 0.08 }}
					>
						<Pencil className="w-6 h-6 text-primary" />
					</motion.div>
				</div>

				{/* Title */}
				<h2
					id={titleId}
					className="text-base font-semibold text-card-foreground text-center mb-1.5"
				>
					Rename chat
				</h2>
				<p className="text-sm text-muted-foreground text-center leading-relaxed mb-5 px-1">
					Give this conversation a name you'll recognise later.
				</p>

				{/* Field */}
				<input
					ref={inputRef}
					data-autofocus
					type="text"
					aria-label="New chat name"
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onFocus={(e) => e.currentTarget.select()}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							handleSave();
						}
					}}
					placeholder="Chat name"
					className="w-full text-sm rounded-md border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
				/>

				{/* Buttons */}
				<div className="grid grid-cols-2 gap-2 mt-5">
					<button
						type="button"
						onClick={onClose}
						className="px-4 py-2 text-xs font-medium text-foreground bg-muted/60 hover:bg-muted rounded-md transition-colors active:scale-[0.97]"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={handleSave}
						disabled={!canSave}
						className="px-4 py-2 text-xs font-medium rounded-md transition-all active:scale-[0.97] bg-primary text-primary-foreground hover:brightness-110 disabled:opacity-40 disabled:pointer-events-none"
					>
						Save
					</button>
				</div>
			</div>
		</Dialog>
	);
}
