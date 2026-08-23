// @ts-nocheck — isolated legacy Presenton path; not imported by the embedded panel.
import type { TemplateFontOption } from "@/presenting/editor/text/google-fonts";
import type { Marker } from "@/presenting/editor/types";
import {
  rawTextListRunsForEditor,
  setRawTextListRunsContent,
} from "@/presenting/editor/text/template-v2-text";
import type { TextSelectionRange } from "@/presenting/editor/text/text-runs";
import type { BulletsSlideElement, TextSlideElement } from "@/presenting/editor/state/state";
import { TextToolbar } from "@/presenting/editor/text/TextToolbar";
import type { ComponentActionsMenuActions } from "@/presenting/editor/selection/ComponentActionsMenu";

export function BulletsToolbar({
  element,
  index,
  anchorBox,
  scale,
  componentActions,
  selectionRange,
  templateFonts,
  onChange,
}: {
  element: BulletsSlideElement;
  index: number;
  anchorBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  scale: number;
  componentActions?: ComponentActionsMenuActions | null;
  selectionRange?: TextSelectionRange | null;
  templateFonts?: TemplateFontOption[];
  onChange: (index: number, element: BulletsSlideElement) => void;
}) {
  const marker = readMarker(element.marker);
  const textElement: TextSlideElement = {
    ...element,
    type: "text",
    runs: rawTextListRunsForEditor(element),
  };

  const updateMarker = (nextMarker: Marker) => {
    onChange(index, {
      ...element,
      marker: nextMarker,
    });
  };

  const updateTextElement = (
    _index: number,
    nextTextElement: TextSlideElement,
  ) => {
    const nextListElement = setRawTextListRunsContent(
      {
        ...element,
        font: nextTextElement.font,
      },
      nextTextElement.runs,
    ) as BulletsSlideElement;
    onChange(index, nextListElement);
  };

  return (
    <TextToolbar
      element={textElement}
      index={index}
      anchorBox={anchorBox}
      scale={scale}
      componentActions={componentActions}
      disableAlignment
      listMarker={marker}
      selectionRange={selectionRange}
      templateFonts={templateFonts}
      onChange={updateTextElement}
      onListMarkerChange={updateMarker}
    />
  );
}

function readMarker(value: unknown): Marker {
  return value === "number" || value === "none" ? value : "bullet";
}
