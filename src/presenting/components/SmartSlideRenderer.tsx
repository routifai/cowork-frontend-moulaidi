/**
 * Renders one Smart-mode slide (a raw `<section>` HTML/Tailwind/Chart.js
 * fragment stored in slide.html_content) via a sandboxed iframe. Wraps it in
 * the same Tailwind/Chart.js CDN scaffold the backend's export path uses
 * (smart-slide-render.ts) so the live preview and the exported picture
 * match. Meant to sit inside <ScaledSlideStage> as its `children`, same as
 * TemplateV2KonvaSlide for template-mode slides — this component always
 * renders at the native 1280x720 size and lets the parent's CSS transform
 * scale it down.
 *
 * Chart.js/Tailwind load from CDN (jsdelivr/cdn.tailwindcss.com) — this
 * requires internet access, matching Presenton's own Smart mode. No local
 * offline bundle is vendored yet.
 *
 * Hover-to-preview / click-to-select: Smart slides have no drag/resize
 * editing (there's no structural element tree to move — see chat/tools.ts,
 * saveSlide only replaces whole-slide HTML for Smart mode), but scoping the
 * next chat message to an element is still useful, same as Presenton's own
 * Smart editor (hovering shows a dashed purple outline as a preview; only a
 * click actually commits the selection, shown as a solid outline). The
 * iframe has an opaque origin (srcDoc), so the injected script talks to the
 * host page via postMessage rather than direct DOM access; only the
 * interactive instance (the main editor view, not sidebar thumbnails) gets
 * this script injected at all.
 */
import { useEffect, useMemo } from "react";

const TAILWIND_CDN_SRC = "https://cdn.tailwindcss.com";
const CHART_JS_CDN_SRC = "https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js";
const CHART_JS_DATALABELS_CDN_SRC =
	"https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2/dist/chartjs-plugin-datalabels.min.js";

const SELECT_MESSAGE_TYPE = "hypatia-smart-slide-select";
const HOVER_OUTLINE = "2px dashed #7c5cff";
const SELECTED_OUTLINE = "2px solid #7c5cff";

const HOVER_AND_CLICK_TO_SELECT_SCRIPT = `
<script>
(function () {
  var hovered = null;
  var selected = null;
  function isMeaningful(el) {
    if (!el || el === document.body) return false;
    if (el.getAttribute && (el.getAttribute('aria-hidden') === 'true' || el.getAttribute('data-decorative') === 'true')) return false;
    if (['CANVAS', 'IMG', 'SVG', 'VIDEO'].indexOf(el.tagName) !== -1) return true;
    var text = (el.textContent || '').trim();
    return text.length > 0;
  }
  function describe(el) {
    var text = (el.textContent || '').trim().replace(/\\s+/g, ' ');
    if (text) return text.length > 60 ? text.slice(0, 60) + '…' : text;
    if (el.tagName === 'CANVAS') return 'the chart';
    if (el.tagName === 'IMG') return el.getAttribute('alt') || 'the image';
    if (el.tagName === 'SVG') return 'the icon/graphic';
    return 'the ' + el.tagName.toLowerCase();
  }
  function findTarget(el) {
    var node = el;
    while (node && node !== document.body) {
      if (node.tagName !== 'SECTION' && isMeaningful(node)) return node;
      node = node.parentElement;
    }
    return null;
  }
  function applyOutline(el, value) {
    el.style.outline = value;
    el.style.outlineOffset = '2px';
    el.style.borderRadius = el.style.borderRadius || '4px';
  }
  function clearOutline(el) {
    el.style.outline = '';
    el.style.outlineOffset = '';
  }
  function repaint() {
    if (hovered && hovered !== selected) applyOutline(hovered, '${HOVER_OUTLINE}');
    if (selected) applyOutline(selected, '${SELECTED_OUTLINE}');
  }
  document.addEventListener('mouseover', function (e) {
    var target = findTarget(e.target);
    if (target === hovered) return;
    if (hovered && hovered !== selected) clearOutline(hovered);
    hovered = target;
    repaint();
  }, true);
  document.addEventListener('mouseout', function (e) {
    var target = findTarget(e.target);
    if (target !== hovered) return;
    if (hovered !== selected) clearOutline(hovered);
    hovered = null;
  }, true);
  document.addEventListener('click', function (e) {
    e.preventDefault();
    var target = findTarget(e.target);
    if (selected) clearOutline(selected);
    selected = target;
    if (!target) {
      window.parent.postMessage({ type: '${SELECT_MESSAGE_TYPE}', label: null }, '*');
      return;
    }
    repaint();
    window.parent.postMessage({ type: '${SELECT_MESSAGE_TYPE}', label: describe(target) }, '*');
  }, true);
})();
</script>`;

interface SmartSlideRendererProps {
	html: string;
	/** Enables click-to-select. Only pass on the single interactive (main editor) instance — never on sidebar thumbnails. */
	interactive?: boolean;
	onElementSelect?: (label: string | null) => void;
}

export function SmartSlideRenderer({ html, interactive = false, onElementSelect }: SmartSlideRendererProps) {
	const srcDoc = useMemo(
		() => `<!doctype html><html><head><meta charset="utf-8" />
<script src="${TAILWIND_CDN_SRC}"></script>
<script src="${CHART_JS_CDN_SRC}"></script>
<script src="${CHART_JS_DATALABELS_CDN_SRC}"></script>
<script>if (window.Chart && window.ChartDataLabels) { Chart.register(ChartDataLabels); }</script>
<style>* { box-sizing: border-box; } html, body { margin: 0; padding: 0; width: 1280px; height: 720px; overflow: hidden; }</style>
</head><body>${html}${interactive ? HOVER_AND_CLICK_TO_SELECT_SCRIPT : ""}</body></html>`,
		[html, interactive],
	);

	useEffect(() => {
		if (!interactive) return;
		const handler = (event: MessageEvent) => {
			if (event.data?.type === SELECT_MESSAGE_TYPE) onElementSelect?.(event.data.label ?? null);
		};
		window.addEventListener("message", handler);
		return () => window.removeEventListener("message", handler);
	}, [interactive, onElementSelect]);

	return (
		<iframe
			title="Smart slide preview"
			srcDoc={srcDoc}
			width={1280}
			height={720}
			style={{ border: "none", display: "block", pointerEvents: interactive ? "auto" : "none" }}
			sandbox="allow-scripts"
		/>
	);
}
