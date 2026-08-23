/**
 * Stub for Presenton's math/KaTeX rendering helpers.
 */
export function renderLatex(source: string): string {
	return source;
}
export function parseLatexInline(source: string): string {
	return source;
}
export function normalizeMathLatex(source: string): string {
	return source;
}
export function measureMathLatex(_source: string): { width: number; height: number } {
	return { width: 0, height: 0 };
}
export function mathSvgDataUri(options: {
	latex: string;
	color?: string;
	width?: number;
	height?: number;
	fontSize?: number;
}): string {
	const escape = (value: string) =>
		value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${options.width ?? 320}" height="${options.height ?? 80}"><text x="0" y="${options.fontSize ?? 24}" fill="${options.color ?? "#111"}" font-size="${options.fontSize ?? 24}">${escape(options.latex)}</text></svg>`;
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
export function isLatexExpression(_value: unknown): boolean {
	return false;
}
