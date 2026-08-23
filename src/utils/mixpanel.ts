/** Stub for Presenton's Mixpanel analytics (no-op in Hypatia). */

// Using an object type with index signature so new event names in ported
// code don't cause TypeScript errors.
type MixpanelEventMap = {
	readonly Presentation_Stream_API_Call: string;
	readonly Smart_Mode_Generation_Failed: string;
	readonly Smart_Mode_Generation_Completed: string;
	readonly TemplateV2_Stream_Failed: string;
	readonly TemplateV2_Stream_Completed: string;
	readonly Presentation_Exported: string;
	readonly Presentation_Export_Started: string;
	readonly Presentation_Export_Completed: string;
	readonly Presentation_Export_Failed: string;
	readonly Presentation_Slide_Added: string;
	readonly Presentation_Slides_Reordered: string;
	readonly Presentation_Slide_Deleted: string;
	readonly Navigation: string;
	readonly AI_Assistant_Attachment_Failed: string;
	readonly AI_Assistant_Attachment_Added: string;
	readonly Editor_Insert_Palette_Item_Selected: string;
	readonly Editor_Template_Blocks_Loaded: string;
	readonly Editor_Template_Block_Inserted: string;
	readonly Template_Selected: string;
	readonly Generation_Started: string;
	readonly Generation_Completed: string;
	readonly Smart_Mode_Select_Edit_Toggled: string;
	readonly Presentation_Title_Updated: string;
	readonly Presentation_Regenerated: string;
	readonly [key: string]: string;
};

export const MixpanelEvent: MixpanelEventMap = new Proxy({} as MixpanelEventMap, {
	get(_target, prop: string) {
		return prop.toLowerCase();
	},
});

export function trackEvent(_event: string, _props?: Record<string, unknown>): void {}
export function trackEventImmediately(_event: string, _props?: Record<string, unknown>): void {}
