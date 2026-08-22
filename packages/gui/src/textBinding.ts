// textBinding — pure text-to-shape binding primitives.
//
// F10 review (2026-08-20): the previous 45-line onDoubleClick / text-tool
// onPointerDown flow was inlined into JSX, with three different
// boundElements predicates scattered across both call sites.
//
// F10 / 🟠 major #4 (review round 2, 2026-08-20): the `Element.boundElements`
// schema invariant (filter on `type==="text"`, writeback splice of
// `[...nonTextBindings(shapeHit), {id, type:"text"}]`) was hard-coded
// inside a React hook. Renderer, Canvas, LayoutPanel, and SceneIO all
// consume boundElements; the moment a second binding type is added
// every consumer must replicate the predicate. Move bindText here
// so the invariant has one home, then have useTextBinding delegate.
//
// Pure functions: callers (Canvas, useTextBinding, SceneIO) pass
// elements + the requested new-text content; bindText returns the
// updated array plus the new text element's id (or null on cancel).

import {makeElement, pointInElement, type Element, type SceneStore, type Tool} from "./scene";
import type {Element as SchemaElement} from "@archidraw/schema";
import {addBinding} from "./bindings";

export type LooseElement = Pick<Element, "id" | "type" | "x" | "y" | "width" | "height" | "isDeleted">;

/** Predicate: shape hits at the click point with an 8-unit tolerance
 *  (matches the selection hit-test; F04 review). */
export const isShapeElement = (el: LooseElement): boolean =>
  el.type === "rectangle" || el.type === "diamond" || el.type === "ellipse";

export const findShapeAt = (elements: LooseElement[], x: number, y: number): LooseElement | undefined =>
  [...elements].reverse().find(el => isShapeElement(el) && pointInElement(el, x, y, 8));

// F06 review (2026-08-20): bound-element predicate guards malformed
// items (`[null]` / `[{}]` bypasses assertSceneShape's structural
// check). F02 / F03 / F06 hardened into one place.
export interface BoundElementRef {id: string; type: string}

/** Find the bound-text child of `shape`, or undefined if none. */
export const findBoundText = (shape: LooseElement): BoundElementRef | undefined => {
  const bound = (shape as unknown as {boundElements?: unknown}).boundElements as unknown[] | null | undefined;
  if (!Array.isArray(bound)) return undefined;
  return bound.find((b): b is BoundElementRef =>
    !!b && typeof b === "object" && (b as {type?: unknown}).type === "text",
  ) as BoundElementRef | undefined;
};

/** F03 review (2026-08-20): preserve non-text bindings when writing back. */
export const nonTextBindings = (shape: LooseElement): BoundElementRef[] => {
  const bound = (shape as unknown as {boundElements?: unknown}).boundElements as unknown[] | null | undefined;
  if (!Array.isArray(bound)) return [];
  return bound.filter((b): b is BoundElementRef =>
    !!b && typeof b === "object" && (b as {type?: unknown}).type !== "text",
  );
};

const newId = (): string =>
  (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2));

export interface BindTextResult {
  /** Updated shape element with the new boundElements. */
  shape: SchemaElement;
  /** The new or updated text element (already in the store). */
  text: SchemaElement;
  /** True if an existing bound text was UPDATED; false if a new text was CREATED. */
  updated: boolean;
}

/**
 * Bind a text element to the shape at (x, y). Returns null when no
 * shape was hit OR the user cancelled the prompt. The caller is
 * responsible for applying the returned shape + text mutations to
 * the store (typically via SceneStore.createElement / updateElement).
 */
export const bindTextAt = (
  elements: LooseElement[],
  x: number,
  y: number,
  prompt: (msg: string, defaultText: string) => string | null,
): BindTextResult | null => {
  const shape = findShapeAt(elements, x, y);
  if (!shape) return null;
  const defaultText = String((shape as unknown as {text?: string}).text ?? "");
  const content = prompt("Text:", defaultText);
  if (content === null) return null;
  // F02: UPDATE existing bound text instead of creating a new one
  // (re-double-clicks used to accumulate orphan text elements).
  const existing = findBoundText(shape);
  if (existing) {
    return {
      shape: shape as SchemaElement,
      text: {id: existing.id, type: "text", text: content} as unknown as SchemaElement,
      updated: true,
    };
  }
  // F03: preserve non-text bindings when writing back.
  //
  // (2026-08-22) Final shape-text positioning rule from the user's last
  // message: text renders at the LEFT edge of the shape's inner bounds,
  // VERTICALLY CENTERED. The renderer resolves inner bounds via
  // resolveContainerBounds; textAlign + verticalAlign drive placement,
  // so the metadata x/y is just the bbox top-left for every shape type.
  const id = newId();
  const txtX = shape.x;
  const txtY = shape.y;
  const txtAlign = "left" as const;
  const txtVAlign = "middle" as const;
  const txt = {
    ...makeElement("text", txtX, txtY, shape.width, shape.height),
    id,
    text: content,
    originalText: content,
    containerId: shape.id,
    width: shape.width,
    height: shape.height,
    textAlign: txtAlign,
    verticalAlign: txtVAlign,
  } as unknown as SchemaElement;
  const merged = {
    ...shape,
    boundElements: [...nonTextBindings(shape), {id, type: "text"}],
  } as SchemaElement;
  return {shape: merged, text: txt, updated: false};
};

/**
 * Helper for callers that already have a SceneStore in scope: apply
 * the bindTextAt result (or no-op on null) to the store. Used by
 * useTextBinding and the Canvas text-tool onPointerDown handler so
 * the store-mutation wiring lives in exactly one place.
 */
export const applyBindResult = (
  store: SceneStore,
  result: BindTextResult | null,
): string | null => {
  if (!result) return null;
  if (result.updated) {
    store.updateElement(result.text.id, {text: (result.text as {text?: string}).text ?? "", originalText: (result.text as {originalText?: string}).originalText ?? ""} as Partial<Element>);
    return result.text.id;
  }
  store.updateElement(result.shape.id, {boundElements: (result.shape as unknown as {boundElements?: unknown}).boundElements as SchemaElement["boundElements"]} as Partial<Element>);
  store.createElement(result.text);
  // (2026-08-22) N:N binding collection: also create a ShapeTextBinding
  // edge so the renderer can iterate multiple bindings for one text.
  // addBinding is idempotent — re-runs of bindTextAt that already
  // produced an edge for this (shape, text) pair return null silently.
  addBinding(store, {
    shapeId: result.shape.id,
    textId: result.text.id,
    shapeAnchor: [0.5, 0.5],
    textAnchor: [0.5, 0.5],
  });
  return result.text.id;
};

// Stub to make the test import path stable.
export type _Unused = Tool;
