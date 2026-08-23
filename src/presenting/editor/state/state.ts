// @ts-nocheck — isolated legacy Presenton path; not imported by the embedded panel.
import type { SlideElement } from "@/presenting/editor/types";

export type ExportMode = "native" | "keynote" | "raster";
export type TextSlideElement = Extract<SlideElement, { type: "text" }>;
export type BulletsSlideElement = Extract<SlideElement, { type: "text-list" }>;
export type ImageSlideElement = Extract<SlideElement, { type: "image" }>;
export type ShapeSlideElement = Extract<
  SlideElement,
  { type: "vector" }
>;
export type TableSlideElement = Extract<SlideElement, { type: "table" }>;
export type ChartSlideElement = Extract<SlideElement, { type: "chart" }>;
export type SvgSlideElement = Extract<SlideElement, { type: "svg" }>;
export type TableCellSelection = {
  elementIndex: number;
  elementPath?: string | null;
  rowIndex: number;
  colIndex: number;
};

export { useTableCellSelection } from "@/presenting/editor/tables/useTableCellSelection";
export { useTemplateV2InlineEditing } from "@/presenting/editor/state/useTemplateV2InlineEditing";
