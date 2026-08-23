/**
 * Imported Template state for the Presenting Panel's design-import entry
 * path (distinct from uploadSlice.ts's Uploaded Template content-fill path
 * — see presenting/CONTEXT.md in hypatia-backend for the glossary).
 */
import type { ImportedTemplateSummary } from "../../api/presentingApi";

export interface ImportedTemplateState {
	templates: ImportedTemplateSummary[];
	isImporting: boolean;
	importError: string | null;
}

export const importedTemplateInitialState: ImportedTemplateState = {
	templates: [],
	isImporting: false,
	importError: null,
};

const ns = "importedTemplate/";
export const setImporting = () => ({ type: ns + "setImporting" });
export const setImported = (summary: ImportedTemplateSummary) => ({
	type: ns + "setImported",
	payload: summary,
});
export const setImportError = (error: string) => ({ type: ns + "setImportError", payload: error });
export const setImportedTemplatesList = (list: ImportedTemplateSummary[]) => ({
	type: ns + "setImportedTemplatesList",
	payload: list,
});
export const removeImportedTemplate = (templateId: string) => ({
	type: ns + "removeImportedTemplate",
	payload: templateId,
});

export function importedTemplateReducer(
	state: ImportedTemplateState = importedTemplateInitialState,
	action: { type: string; payload?: any },
): ImportedTemplateState {
	switch (action.type) {
		case ns + "setImporting":
			return { ...state, isImporting: true, importError: null };
		case ns + "setImported":
			return {
				...state,
				isImporting: false,
				importError: null,
				templates: [...state.templates, action.payload],
			};
		case ns + "setImportError":
			return { ...state, isImporting: false, importError: action.payload };
		case ns + "setImportedTemplatesList":
			return { ...state, templates: action.payload };
		case ns + "removeImportedTemplate":
			return { ...state, templates: state.templates.filter((t) => t.id !== action.payload) };
		default:
			return state;
	}
}
