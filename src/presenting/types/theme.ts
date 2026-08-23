export interface Theme {
	id: string;
	name: string;
	description: string;
	user: string;
	logo: string; // image id
	logo_url?: string; // preview url
	company_name?: string;
	data: any;
}
export interface ThemeParams {
	id?: string;
	name: string;
	description: string;
	logo: string | null; // image id
	logo_url?: string | null; // preview url
	data: any;
	company_name?: string | null;
}
export interface DefaultTheme {
	id: string;
	name: string;
	description: string;
	data: any;
}
