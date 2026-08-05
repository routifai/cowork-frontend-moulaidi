import type { ExtensionUiRequest, ExtensionUiResponse } from "@/hooks/useExtensionUi";
import { useState } from "react";

/**
 * `@narumitw/pi-plan-mode`'s `plan_mode_question` tool asks clarifying
 * questions via `ctx.ui.select`/`ctx.ui.editor` — the SAME mechanism as
 * every other extension dialog (permission-gate confirms, etc.), rendered by
 * `ExtensionUiDialog.tsx` as a floating popup. Per explicit design direction,
 * clarification questions specifically should read like part of the
 * conversation, not an interruption — so `App.tsx` detects (via `toolPhases`)
 * that the pending dialog belongs to `plan_mode_question` and routes it here
 * instead, rendered inline in the chat transcript.
 *
 * question-tool.ts's actual protocol: a `select` request whose `options` are
 * pre-formatted strings ("1. Label — description", ..., "N. Other
 * (free-form)"). Choosing the trailing "Other" option resolves that select
 * with its exact string, then a SEPARATE `editor` request immediately
 * follows for free-form text — this component renders both steps.
 */
export function PlanModeQuestionCard({
	request,
	onRespond,
}: {
	request: ExtensionUiRequest;
	onRespond: (response: ExtensionUiResponse) => void;
}) {
	const [customText, setCustomText] = useState("");

	if (request.method === "editor") {
		return (
			<div
				className="mx-auto w-full px-4 mb-3"
				style={{ maxWidth: "var(--chat-max-width, 820px)" }}
			>
				<div className="rounded-xl border border-border bg-[hsl(var(--muted)/0.4)] p-4">
					<div className="text-sm font-medium mb-2">{request.title || "Add details"}</div>
					<textarea
						value={customText}
						onChange={(e) => setCustomText(e.target.value)}
						placeholder="Type your answer…"
						className="w-full min-h-[72px] resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
					/>
					<div className="flex justify-end gap-2 mt-2">
						<button
							type="button"
							onClick={() => onRespond({ cancelled: true })}
							className="px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:bg-[hsl(var(--muted)/0.7)] transition-colors"
						>
							Cancel
						</button>
						<button
							type="button"
							disabled={!customText.trim()}
							onClick={() => onRespond({ value: customText.trim() })}
							className="px-3 py-1.5 rounded-lg text-sm font-medium bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
						>
							Submit
						</button>
					</div>
				</div>
			</div>
		);
	}

	// method === "select"
	return (
		<div className="mx-auto w-full px-4 mb-3" style={{ maxWidth: "var(--chat-max-width, 820px)" }}>
			<div className="rounded-xl border border-border bg-[hsl(var(--muted)/0.4)] p-4">
				<div className="text-sm font-medium mb-3">{request.title}</div>
				<div className="flex flex-col gap-1.5">
					{(request.options ?? []).map((option) => (
						<button
							key={option}
							type="button"
							onClick={() => onRespond({ value: option })}
							className="text-left px-3 py-2 rounded-lg text-sm bg-background border border-border hover:border-primary hover:bg-[hsl(var(--muted)/0.5)] transition-colors"
						>
							{option}
						</button>
					))}
				</div>
			</div>
		</div>
	);
}
