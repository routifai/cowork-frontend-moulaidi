import { markdownComponents } from "@/components/MarkdownComponents";
import type { PlaygroundArtifact } from "@/types/playground";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MarkdownView({ artifact }: { artifact: PlaygroundArtifact }) {
	return (
		<div className="p-3 prose prose-sm max-w-none">
			<ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
				{artifact.content}
			</ReactMarkdown>
		</div>
	);
}
