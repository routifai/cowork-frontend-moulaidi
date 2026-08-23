/** Stub types for Presenton's API service types. */
export interface ImageAsset {
	url: string;
	thumbnail?: string;
	alt?: string;
}

export interface Theme {
	primary?: string;
	secondary?: string;
	background?: string;
	text?: string;
	[key: string]: unknown;
}
