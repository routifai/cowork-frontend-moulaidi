/**
 * ConfirmDialog — small attention-getting modal for destructive or
 * consequential actions. Built on the Dialog primitive.
 *
 * UX choices:
 *   • Cancel button is rendered first so it receives initial focus —
 *     accidental Enter key won't trigger destructive actions.
 *   • Destructive variant uses an icon with a subtle pulsing halo to
 *     telegraph "stop and read".
 *   • Esc and backdrop dismissal both map to onClose (cancel), never
 *     to confirm.
 */
import { Dialog } from "@/components/ui/dialog";
import { AlertTriangle, type LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useId } from "react";

type ConfirmVariant = "default" | "destructive";

interface ConfirmDialogProps {
	open: boolean;
	onClose: () => void;
	onConfirm: () => void;
	title: string;
	description?: ReactNode;
	confirmLabel?: string;
	cancelLabel?: string;
	variant?: ConfirmVariant;
	icon?: LucideIcon;
	/** If true, cancel autofocuses (safer for destructive). Default true for destructive. */
	focusCancel?: boolean;
}

export function ConfirmDialog({
	open,
	onClose,
	onConfirm,
	title,
	description,
	confirmLabel = "Confirm",
	cancelLabel = "Cancel",
	variant = "default",
	icon,
	focusCancel,
}: ConfirmDialogProps) {
	const titleId = useId();
	const reduced = useReducedMotion();
	const Icon = icon ?? AlertTriangle;
	const isDestructive = variant === "destructive";
	const focusCancelFirst = focusCancel ?? isDestructive;

	const accent = isDestructive ? "destructive" : "primary";

	const handleConfirm = () => {
		onConfirm();
		onClose();
	};

	return (
		<Dialog open={open} onClose={onClose} size="sm" labelledBy={titleId}>
			<div className="px-6 pt-7 pb-5">
				{/* Icon with pulsing halo */}
				<div className="flex justify-center mb-4">
					<motion.div
						className="relative w-12 h-12 rounded-2xl flex items-center justify-center"
						style={{ background: `hsl(var(--${accent}) / 0.12)` }}
						initial={reduced ? false : { scale: 0.7, opacity: 0 }}
						animate={{ scale: 1, opacity: 1 }}
						transition={{
							type: "spring",
							stiffness: 360,
							damping: 22,
							delay: 0.08,
						}}
					>
						{!reduced && (
							<motion.div
								className="absolute inset-0 rounded-2xl"
								style={{ background: `hsl(var(--${accent}) / 0.18)` }}
								initial={{ scale: 1, opacity: 0.5 }}
								animate={{ scale: 1.55, opacity: 0 }}
								transition={{
									duration: 1.6,
									repeat: Number.POSITIVE_INFINITY,
									repeatDelay: 0.4,
									ease: "easeOut",
								}}
							/>
						)}
						<Icon className="w-6 h-6 relative" style={{ color: `hsl(var(--${accent}))` }} />
					</motion.div>
				</div>

				{/* Title */}
				<h2
					id={titleId}
					className="text-base font-semibold text-card-foreground text-center mb-1.5"
				>
					{title}
				</h2>

				{/* Description */}
				{description && (
					<div className="text-sm text-muted-foreground text-center leading-relaxed mb-5 px-1">
						{description}
					</div>
				)}

				{/* Buttons */}
				<div className="grid grid-cols-2 gap-2 mt-4">
					{focusCancelFirst ? (
						<>
							<CancelButton onClick={onClose} label={cancelLabel} />
							<ConfirmButton onClick={handleConfirm} label={confirmLabel} variant={variant} />
						</>
					) : (
						<>
							<ConfirmButton onClick={handleConfirm} label={confirmLabel} variant={variant} />
							<CancelButton onClick={onClose} label={cancelLabel} />
						</>
					)}
				</div>
			</div>
		</Dialog>
	);
}

function CancelButton({ onClick, label }: { onClick: () => void; label: string }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="px-4 py-2 text-xs font-medium text-foreground bg-muted/60 hover:bg-muted rounded-md transition-colors active:scale-[0.97]"
		>
			{label}
		</button>
	);
}

function ConfirmButton({
	onClick,
	label,
	variant,
}: {
	onClick: () => void;
	label: string;
	variant: ConfirmVariant;
}) {
	const classes =
		variant === "destructive"
			? "bg-destructive text-destructive-foreground hover:brightness-110"
			: "bg-primary text-primary-foreground hover:brightness-110";
	return (
		<button
			type="button"
			onClick={onClick}
			className={`px-4 py-2 text-xs font-medium rounded-md transition-all active:scale-[0.97] ${classes}`}
		>
			{label}
		</button>
	);
}
