/** Stub — TemplateV2 slide HTML preview for the Hypatia panel. */
import React from "react";

export interface TemplateV2HtmlSlidePreviewProps {
	slide?: unknown;
	presentationData?: unknown;
	scale?: number;
	className?: string;
	style?: React.CSSProperties;
	[key: string]: unknown;
}

export function TemplateV2HtmlSlidePreview({ className, style }: TemplateV2HtmlSlidePreviewProps) {
	return <div className={className} style={{ background: "#f3f4f6", ...style }} />;
}

export function TemplateV2SlidePreview(props: TemplateV2HtmlSlidePreviewProps) {
	return <TemplateV2HtmlSlidePreview {...props} />;
}
