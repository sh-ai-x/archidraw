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

export interface ShapeLabel {
  text?: string;
  originalText?: string;
  fontSize?: number;
}

export interface RectangleElement extends ElementBase, ShapeLabel { type: "rectangle" }
export interface EllipseElement extends ElementBase, ShapeLabel { type: "ellipse" }
export interface DiamondElement extends ElementBase, ShapeLabel { type: "diamond" }
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
}

