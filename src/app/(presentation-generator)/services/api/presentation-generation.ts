/** Stub for Presenton's presentation generation HTTP API. In Hypatia, generation goes through the Tauri presenting engine. */
export const PresentationGenerationApi = {
	generate: async (_params: unknown) => { throw new Error("Use Tauri presenting engine"); },
	savePresentation: async (_id: string, _data: unknown) => { return {}; },
	getPresentation: async (_id: string) => { throw new Error("Use Tauri presenting engine"); },
};
