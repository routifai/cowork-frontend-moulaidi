/**
 * Fits a fixed 1280x720 slide canvas into whatever container it's placed
 * in, via CSS transform: scale — same approach presenton's frontend uses
 * (SlideScale in PresentationRender.tsx / SlideThumbnailCard.tsx): measure
 * the container with a ResizeObserver, scale = min(box.w/1280, box.h/720),
 * apply via `transform: scale(...)` on a 1280x720-native inner box.
 *
 * hypatia already had this exact pattern ported (presenting/presentation/
 * components/SlideContent.tsx + SlideThumbnailCard.tsx) but the component
 * that actually computes the scale (components/PresentationRender.tsx) was
 * left as a stub, and neither was wired into PresentingPanel.tsx. This is
 * that missing piece, built directly for the embedded panel's
 * TemplateV2KonvaSlide-based slides instead of the legacy HTML-string path.
 */
import { type ReactNode, useEffect, useRef, useState } from "react";

const BASE_WIDTH = 1280;
const BASE_HEIGHT = 720;

interface ScaledSlideStageProps {
	children: ReactNode;
	/** Outer container — sizes the available space to fit into. Defaults to filling its parent. */
	className?: string;
	/** The scaled, 1280x720-native box itself — put bg/shadow/rounded-corner styling here. */
	stageClassName?: string;
}

export function ScaledSlideStage({ children, className, stageClassName }: ScaledSlideStageProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const [box, setBox] = useState({ w: 0, h: 0 });

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
		ro.observe(el);
		setBox({ w: el.clientWidth, h: el.clientHeight });
		return () => ro.disconnect();
	}, []);

	const scale = box.w > 0 && box.h > 0 ? Math.min(box.w / BASE_WIDTH, box.h / BASE_HEIGHT) : 1;

	return (
		<div
			ref={containerRef}
			className={className ?? "flex h-full w-full items-center justify-center overflow-hidden"}
		>
			<div
				className={stageClassName}
				style={{ width: BASE_WIDTH * scale, height: BASE_HEIGHT * scale, overflow: "hidden" }}
			>
				<div
					style={{
						width: BASE_WIDTH,
						height: BASE_HEIGHT,
						transformOrigin: "top left",
						transform: `scale(${scale})`,
					}}
				>
					{children}
				</div>
			</div>
		</div>
	);
}
