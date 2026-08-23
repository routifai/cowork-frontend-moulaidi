/**
 * Upload state for the Presenting Panel's Uploaded Template entry path.
 *
 * Kept separate from PresentationGenerationState so it can be cleared
 * independently (e.g. after generation kicks off) without touching the
 * generating/editor state.
 */
export interface UploadState {
	/** Parsed document text returned by `presenting_parse_document`. */
	documentText: string | null;
	/** Original filename, forwarded to the engine for the prompt label. */
	documentName: string | null;
	/** `true` while the parse request is in flight. */
	isParsing: boolean;
	/** Non-null when parse fails. */
	parseError: string | null;
}

export const uploadInitialState: UploadState = {
	documentText: null,
	documentName: null,
	isParsing: false,
	parseError: null,
};

const ns = "upload/";
export const setDocumentParsing = (documentName: string) => ({
	type: ns + "setDocumentParsing",
	payload: documentName,
});
export const setDocumentParsed = (payload: { documentText: string; documentName: string }) => ({
	type: ns + "setDocumentParsed",
	payload,
});
export const setParseError = (error: string) => ({ type: ns + "setParseError", payload: error });
export const clearUpload = () => ({ type: ns + "clearUpload" });

export function uploadReducer(
	state: UploadState = uploadInitialState,
	action: { type: string; payload?: any },
): UploadState {
	switch (action.type) {
		case ns + "setDocumentParsing":
			return { ...uploadInitialState, isParsing: true, documentName: action.payload };
		case ns + "setDocumentParsed":
			return {
				...state,
				isParsing: false,
				parseError: null,
				documentText: action.payload.documentText,
				documentName: action.payload.documentName,
			};
		case ns + "setParseError":
			return { ...state, isParsing: false, parseError: action.payload };
		case ns + "clearUpload":
			return uploadInitialState;
		default:
			return state;
	}
}
