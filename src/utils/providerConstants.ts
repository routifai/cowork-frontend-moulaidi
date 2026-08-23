/** Stub for Presenton's LLM provider constants. */
export const LLM_PROVIDERS: Record<string, { label: string }> = {
	openai: { label: "OpenAI" },
	anthropic: { label: "Anthropic" },
	google: { label: "Google" },
};

export const IMAGE_PROVIDERS: Record<string, { label: string }> = {
	pexels: { label: "Pexels" },
	pixabay: { label: "Pixabay" },
	openai: { label: "OpenAI" },
};

export function getSelectedTextModel(_config: Record<string, unknown>): string | undefined {
	return undefined;
}
