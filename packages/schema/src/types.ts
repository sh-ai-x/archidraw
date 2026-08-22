export const ELEMENT_TYPES = [
  "rectangle",
  "ellipse",
  "diamond",
  "arrow",
  "line",
  "freedraw",
  "text",
  "image",
  "group",
] as const;

export type ElementType = (typeof ELEMENT_TYPES)[number];
export type Point = readonly [number, number];
export type Arrowhead = "arrow" | "bar" | "dot" | "triangle" | null;
export type FillStyle = "solid" | "hachure" | "cross-hatch" | "zigzag";
export type StrokeStyle = "solid" | "dashed" | "dotted";
export type TextAlign = "left" | "center" | "right";
export type VerticalAlign = "top" | "middle" | "bottom";

// ─────────────────────────────────────────────────────────────────────────
// N:N binding collection (2026-08-22)
//
// The original `TextElement.containerId` (single back-pointer) is 1:1 —
// the same text could belong to exactly one shape, and a shape could
// carry exactly one bound text. Replacing that with a top-level
// `bindings[]` edge collection lets one text participate in many
// shape↔text edges simultaneously. `kind` lets us add
// `shape-arrow` / `arrow-endpoint` later without another schema
// version bump; consumers filter on `kind` when they need to.
// ─────────────────────────────────────────────────────────────────────────
export const BINDING_KINDS = [
  "shape-text",
  "shape-arrow",
  "arrow-endpoint",
] as const;

export type BindingKind = (typeof BINDING_KINDS)[number];

export interface ShapeTextBinding {
  id: string;
  kind: BindingKind;
  shapeId: string;
  textId: string;
  /** where on the shape's bbox [0,1], default [0.5, 0.5] (center) */
  shapeAnchor: Point;
  /** where on the text's bbox [0,1], default [0.5, 0.5] */
  textAnchor: Point;
  /** z-hint for layering, default 0 */
  zHint?: number;
}

export interface BoundElement {
  id: string;
  type: "arrow" | "text";
}

export interface Binding {
  elementId: string;
  focus: number;
  gap: number;
  fixedPoint?: Point;
}

export interface Roundness {
  type: number;
  seed?: number;
}

export interface ElementBase {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: FillStyle;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  roughness: number;
  opacity: number;
  groupIds: string[] | null;
  frameId: string | null;
  index: string | null;
  roundness: Roundness | null;
  seed: number;
  versionNonce: number;
  isDeleted: boolean;
  boundElements: BoundElement[] | null;
  updated: number;
  link: string | null;
  locked: boolean;
}

export interface RectangleElement extends ElementBase { type: "rectangle" }
export interface EllipseElement extends ElementBase { type: "ellipse" }
export interface DiamondElement extends ElementBase { type: "diamond" }
export interface LineElement extends ElementBase { type: "line"; points: Point[] }
export interface GroupElement extends ElementBase { type: "group" }

export interface ArrowElement extends ElementBase {
  type: "arrow";
  points: Point[];
  startBinding: Binding | null;
  endBinding: Binding | null;
  startArrowhead: Arrowhead;
  endArrowhead: Arrowhead;
}

export interface TextElement extends ElementBase {
  type: "text";
  fontSize: number;
  fontFamily: number;
  text: string;
  textAlign: TextAlign;
  verticalAlign: VerticalAlign;
  containerId: string | null;
  originalText: string;
  lineHeight: number;
  baseline: number;
}

export interface FreedrawElement extends ElementBase {
  type: "freedraw";
  points: Point[];
  simulatePressure: boolean;
  lastCommittedPoint: Point | null;
}

export interface ImageElement extends ElementBase {
  type: "image";
  fileId: string | null;
  status: "pending" | "saved" | "error";
  scale: Point;
}

export type Element =
  | RectangleElement
  | EllipseElement
  | DiamondElement
  | ArrowElement
  | LineElement
  | FreedrawElement
  | TextElement
  | ImageElement
  | GroupElement;

export interface AppState {
  gridSize?: number | null;
  viewBackgroundColor?: string;
  [key: string]: unknown;
}

export interface ImageFile {
  mimeType: string;
  id: string;
  dataURL: string;
  created: number;
  lastRetrieved?: number;
  [key: string]: unknown;
}

export interface ExcalidrawScene {
  type: "excalidraw";
  version: number;
  source: string;
  elements: Element[];
  appState: AppState;
  files: Record<string, ImageFile>;
  bindings?: ShapeTextBinding[];
}
