/** Stub — PresentationRender / SlideScale for the Hypatia panel. */
import React from "react";

interface SlideScaleProps {
	slide?: unknown;
	presentationData?: unknown;
	scale?: number;
	width?: number;
	height?: number;
	className?: string;
	style?: React.CSSProperties;
	[key: string]: unknown;
}

export default function SlideScale({ className, style }: SlideScaleProps) {
	return <div className={className} style={{ background: "#f9fafb", ...style }} />;
}
