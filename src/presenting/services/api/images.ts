/** Stub for Presenton's image service HTTP API. */
export const ImagesApi = {
	searchImages: async (_query: string): Promise<unknown[]> => [],
	searchStockImages: async (_query: string): Promise<unknown[]> => [],
	generateImage: async (_prompt: string): Promise<null> => null,
	searchIcons: async (_query: string): Promise<unknown[]> => [],
	uploadImage: async (_file: unknown): Promise<null> => null,
};
