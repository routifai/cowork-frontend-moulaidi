/** Chat stream trace types — used by the Chat component for structured traces. */
export interface ChatHistoryMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	created_at: string;
}

export interface ChatConversationSummary {
	conversation_id: string;
	created_at: string;
	summary?: string;
}

export interface ChatStreamTrace {
	type?: string;
	kind?: string;
	tool?: string;
	tools?: string[];
	status?: string;
	round?: number;
	slideIndex?: number;
	slideNumber?: number;
	message?: string;
	content?: string;
	layoutId?: string;
	[key: string]: unknown;
}

export interface ChatAttachment {
	id: string;
	name: string;
	url?: string;
	type?: string;
}
