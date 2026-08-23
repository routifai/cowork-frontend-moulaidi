/** Stub for Presenton's presentation generation HTTP API. */
export const PresentationGenerationApi = {
	generate: async (_params: unknown) => { throw new Error("Use Tauri presenting engine"); },
	savePresentation: async (_id: string, _data: unknown): Promise<Record<string, unknown>> => { return {}; },
	getPresentation: async (_id: string) => { throw new Error("Use Tauri presenting engine"); },
	uploadDoc: async (_formData: unknown) => { throw new Error("Use Tauri presenting engine"); },
	uploadImage: async (_formData: unknown): Promise<null> => { return null; },
	updatePresentationContent: async (_data: unknown): Promise<void> => {},
	updatePresentationSlide: async (_id: string, _slideIndex: number, _data: unknown): Promise<void> => {},
};
