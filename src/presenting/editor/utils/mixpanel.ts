// @ts-nocheck — isolated legacy Presenton path; not imported by the embedded panel.
// Hypatia has its own telemetry (Sentry) — this replaces presenton's mixpanel-browser
// wrapper with a no-op stub carrying only the event names the editor actually fires.
export enum MixpanelEvent {
	Editor_Element_Deleted = "Editor Element Deleted",
	Editor_Element_Duplicated = "Editor Element Duplicated",
	Editor_Element_Text_Edited = "Editor Element Text Edited",
	Editor_Element_Style_Changed = "Editor Element Style Changed",
	Editor_Component_Ungrouped = "Editor Component Ungrouped",
	Editor_Component_Layer_Changed = "Editor Component Layer Changed",
	Editor_Icon_Replaced = "Editor Icon Replaced",
	Editor_Image_Replace_Failed = "Editor Image Replace Failed",
	Editor_Image_Replaced = "Editor Image Replaced",
}

export function trackEvent(_event: MixpanelEvent, _props?: Record<string, unknown>): void {
	// no-op — Hypatia's telemetry surface (Sentry) is wired elsewhere, not per-keystroke editor events
}
