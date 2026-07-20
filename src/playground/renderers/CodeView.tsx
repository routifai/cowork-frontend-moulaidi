import { type ThemeMode, getThemeMode } from "@/lib/themes";
import type { PlaygroundArtifact } from "@/types/playground";
import { Highlight, themes } from "prism-react-renderer";
import { useEffect, useState } from "react";

/** Editor-style code view: syntax highlighting + line numbers, synced to
 * the app's own dark/light theme. Falls back to a plain block for content
 * prism-react-renderer doesn't recognize as a language (still highlights
 * fine — Prism just treats it as plain tokens). */
export function CodeView({ artifact }: { artifact: PlaygroundArtifact }) {
	const [colorMode, setColorMode] = useState<ThemeMode>(() => getThemeMode());

	// Keep in sync with the app theme (data-theme on <html>, toggled
	// elsewhere) — same pattern as CustomInstructions.tsx's editor.
	useEffect(() => {
		const sync = () => setColorMode(getThemeMode());
		const observer = new MutationObserver(sync);
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["data-theme"],
		});
		return () => observer.disconnect();
	}, []);

	const language = artifact.language || "text";
	const prismTheme = colorMode === "dark" ? themes.vsDark : themes.vsLight;

	return (
		<div className="flex flex-col h-full">
			{artifact.language && (
				<div className="px-3 py-1 text-[10px] font-mono opacity-50 border-b border-border shrink-0">
					{artifact.language}
				</div>
			)}
			<Highlight theme={prismTheme} code={artifact.content} language={language}>
				{({ className, style, tokens, getLineProps, getTokenProps }) => (
					<pre
						className={`${className} text-[11px] font-mono leading-relaxed p-3 overflow-x-auto`}
						style={style}
					>
						{tokens.map((line, i) => {
							const lineProps = getLineProps({ line });
							return (
								// biome-ignore lint/suspicious/noArrayIndexKey: line order within one static render is stable
								<div key={i} {...lineProps} className={`${lineProps.className} table-row`}>
									<span
										data-testid="code-line-number"
										className="table-cell pr-4 select-none opacity-35 text-right"
									>
										{i + 1}
									</span>
									<span className="table-cell whitespace-pre">
										{line.map((token, tokenIndex) => {
											const tokenProps = getTokenProps({ token });
											return (
												// biome-ignore lint/suspicious/noArrayIndexKey: token order within one line is stable
												<span key={tokenIndex} {...tokenProps} />
											);
										})}
									</span>
								</div>
							);
						})}
					</pre>
				)}
			</Highlight>
		</div>
	);
}
