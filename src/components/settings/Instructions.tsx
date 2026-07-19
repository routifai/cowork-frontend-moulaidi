import { CustomInstructions } from "../CustomInstructions";

export function Instructions() {
	return (
		<section className="flex flex-col flex-1 min-h-0 h-full">
			<h2 className="text-sm font-semibold text-foreground mb-1 shrink-0">Custom Instructions</h2>
			<p className="text-xs text-muted-foreground mb-5 shrink-0">
				Persist context, preferences, or constraints across every session. Written in Markdown and
				applied immediately to this chat and all new ones.
			</p>
			<CustomInstructions />
		</section>
	);
}
