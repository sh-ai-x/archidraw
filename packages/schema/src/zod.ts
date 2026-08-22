import { z } from "zod";

const point = z.tuple([z.number(), z.number()]);
const boundElement = z.object({ id: z.string(), type: z.enum(["arrow", "text"]) });
const binding = z.object({
  elementId: z.string(),
  focus: z.number(),
  gap: z.number(),
  fixedPoint: point.optional(),
});
const roundness = z.object({ type: z.number(), seed: z.number().optional() });

const elementBase = z.object({
  id: z.string(),
  type: z.enum(["rectangle", "ellipse", "diamond", "arrow", "line", "freedraw", "text", "image", "group"]),
  x: z.number(), y: z.number(), width: z.number(), height: z.number(), angle: z.number(),
  strokeColor: z.string(), backgroundColor: z.string(),
  fillStyle: z.enum(["solid", "hachure", "cross-hatch", "zigzag"]),
  strokeWidth: z.number(), strokeStyle: z.enum(["solid", "dashed", "dotted"]),
  roughness: z.number(), opacity: z.number(), groupIds: z.array(z.string()).nullable(),
  frameId: z.string().nullable(), index: z.string().nullable(), roundness: roundness.nullable(),
  seed: z.number(), versionNonce: z.number(), isDeleted: z.boolean(),
  boundElements: z.array(boundElement).nullable(), updated: z.number(), link: z.string().nullable(), locked: z.boolean(),
}).passthrough();

export const ExcalidrawElementSchema = z.discriminatedUnion("type", [
  elementBase.extend({ type: z.literal("rectangle") }),
  elementBase.extend({ type: z.literal("ellipse") }),
  elementBase.extend({ type: z.literal("diamond") }),
  elementBase.extend({ type: z.literal("group") }),
  elementBase.extend({ type: z.literal("line"), points: z.array(point) }),
  elementBase.extend({ type: z.literal("arrow"), points: z.array(point), startBinding: binding.nullable(), endBinding: binding.nullable(), startArrowhead: z.enum(["arrow", "bar", "dot", "triangle"]).nullable(), endArrowhead: z.enum(["arrow", "bar", "dot", "triangle"]).nullable() }),
  elementBase.extend({ type: z.literal("freedraw"), points: z.array(point), simulatePressure: z.boolean(), lastCommittedPoint: point.nullable() }),
  elementBase.extend({ type: z.literal("text"), fontSize: z.number(), fontFamily: z.number(), text: z.string(), textAlign: z.enum(["left", "center", "right"]), verticalAlign: z.enum(["top", "middle", "bottom"]), containerId: z.string().nullable(), originalText: z.string(), lineHeight: z.number(), baseline: z.number() }),
  elementBase.extend({ type: z.literal("image"), fileId: z.string().nullable(), status: z.enum(["pending", "saved", "error"]), scale: point }),
]);

export const AppStateSchema = z.object({ gridSize: z.number().nullable().optional(), viewBackgroundColor: z.string().optional() }).passthrough();
export const ImageFileSchema = z.object({ mimeType: z.string(), id: z.string(), dataURL: z.string(), created: z.number(), lastRetrieved: z.number().optional() }).passthrough();

// (2026-08-22) N:N shape↔text binding collection. `kind` is required so
// future binding kinds (`shape-arrow`, `arrow-endpoint`) can coexist in
// the same `bindings[]` without a schema version bump. `.passthrough()`
// is NOT needed on the binding object — we deliberately cap the kind
// enum so unknown future kinds force a schema update, but we keep
// `bindings` itself `.optional()` so old scenes without the field parse.
export const ShapeTextBindingSchema = z.object({
  id: z.string(),
  kind: z.enum(["shape-text", "shape-arrow", "arrow-endpoint"]),
  shapeId: z.string(),
  textId: z.string(),
  shapeAnchor: point,
  textAnchor: point,
  zHint: z.number().optional(),
});

export const ExcalidrawSceneSchema = z.object({
  type: z.literal("excalidraw"),
  version: z.number(),
  source: z.string(),
  elements: z.array(ExcalidrawElementSchema),
  appState: AppStateSchema,
  files: z.record(z.string(), ImageFileSchema),
  bindings: z.array(ShapeTextBindingSchema).optional(),
}).passthrough();

export const CreateElementInputSchema = z.object({ element: ExcalidrawElementSchema });
export const UpdateElementInputSchema = z.object({ id: z.string(), updates: z.record(z.string(), z.unknown()).default({}) });
export const DeleteElementInputSchema = z.object({ id: z.string() });
export const QueryElementsInputSchema = z.object({ ids: z.array(z.string()).optional(), type: z.string().optional(), includeDeleted: z.boolean().default(false) });

export type ExcalidrawElementInput = z.infer<typeof ExcalidrawElementSchema>;
