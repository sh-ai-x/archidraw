// bindingDrag — pure arrow-to-shape binding drag helpers.
//
// F12 review round 4 (2026-08-22): the previous Canvas.tsx inlined
// the entire pendingBinding state machine across pointerdown /
// pointermove / pointerup / pointercancel handlers with the state
// (a ref + a useState + a useState) declared at the top of one 424-
// line component. Mix-and-match of (a) pure world-coordinate math
// (b) React state plumbing (c) DOM event lifecycle made the file
// impossible to unit-test and forced the test files to use
// `playwright e2e` to assert behaviour. Extract the pure logic so
// the state machine can be tested without React, and Canvas.tsx
// keeps only the imperative glue that wires the pure functions to
// pointer events and `useState`.
//
// Pure functions in this module:
//   - `tryStartBindingDrag(worldPos, elements)`       — drop one
//      into the drag context if the cursor is over a snap zone
//   - `updateBindingDragPreview(worldPos)`             — rubber-band
//      update from the pointermove handler
//   - `commitBindingDrag(worldPos, elements, store)`  — finalize
//      the arrow, write into the scene store, set selection
//   - `cancelBindingDrag()`                           — drop the
//      drag context (pointercancel / pointerup on empty hit)

import {
  bindingPointWorld,
  closestBindingPoint,
  hitBindingPoint,
  makeElement,
  type SceneStore,
} from "./scene";
import type {Element, Point} from "@archidraw/schema";

/** Live drag context — the captured start binding + the rubber-band
 *  endpoint. The Canvas owns the React `useRef` + `useState` that
 *  store this; the pure functions below accept + return values
 *  instead of touching React.
 */
export interface BindingDragState {
  startPoint: {x: number; y: number};
  element: Element;
  fixedPoint: Point;
}

/**
 * If the pointer at `worldPos` is over one of the snap zones around
 * a shape's binding point, return a fresh `BindingDragState`. Otherwise
 * null — the caller should fall through to the element-creation
 * path.
 */
export const tryStartBindingDrag = (
  worldPos: Point,
  elements: Element[],
): BindingDragState | null => {
  const startHit = hitBindingPoint(elements, worldPos[0], worldPos[1]);
  if (!startHit) return null;
  const fp = closestBindingPoint(startHit.element, worldPos[0], worldPos[1]).fixedPoint;
  const startWorld = bindingPointWorld(startHit.element, startHit.point);
  return {
    startPoint: startWorld,
    element: startHit.element,
    fixedPoint: fp,
  };
};

/**
 * Final-point resolver: did the user drag onto another shape's
 * binding-point snap zone? If yes, the arrow endpoint snaps there
 * (and the `endBinding` is anchored to that shape). If no, the
 * arrow endpoint stays at the raw pointer position (free-floating
 * endpoint, no binding).
 *
 * Returns `{endWorld, endBinding}` where `endBinding` is null for
 * the free-floating case.
 */
export const resolveBindingDragEndpoint = (
  worldPos: Point,
  elements: Element[],
): {endWorld: {x: number; y: number}; endBinding: {
  elementId: string;
  focus: number;
  gap: number;
  fixedPoint: Point;
} | null} => {
  const endHit = hitBindingPoint(elements, worldPos[0], worldPos[1]);
  if (endHit) {
    const endFp = closestBindingPoint(endHit.element, worldPos[0], worldPos[1]);
    const endWorld = bindingPointWorld(endHit.element, endFp.point);
    return {
      endWorld,
      endBinding: {
        elementId: endHit.element.id,
        focus: 0,
        gap: 1,
        fixedPoint: endFp.fixedPoint,
      },
    };
  }
  return {endWorld: {x: worldPos[0], y: worldPos[1]}, endBinding: null};
};

/**
 * Materialize the arrow element from a finalised binding drag.
 * Caller is responsible for committing the resulting element to
 * the scene store (typically via `store.createElement`).
 *
 * Pre-fix used endHit.element.x / .y which painted the arrow to
 * the top-left of the target shape (nowhere near the cursor).
 * Use the resolved binding-point world coordinates so the line
 * lands on the actual snap zone the user hovered.
 */
export const buildBindingDragArrow = (
  start: BindingDragState,
  endWorld: {x: number; y: number},
  endBinding: {
  elementId: string;
  focus: number;
  gap: number;
  fixedPoint: Point;
} | null,
): Element => {
  const arrow = makeElement("arrow", start.startPoint.x, start.startPoint.y, 0, 0);
  (arrow as unknown as {points: Point[]}).points = [
    [0, 0],
    [endWorld.x - start.startPoint.x, endWorld.y - start.startPoint.y],
  ];
  (arrow as unknown as {startBinding: unknown}).startBinding = {
    elementId: start.element.id,
    focus: 0,
    gap: 1,
    fixedPoint: start.fixedPoint,
  };
  (arrow as unknown as {endBinding: unknown}).endBinding = endBinding;
  return arrow;
};

/**
 * One-shot committer for the pointerup handler. Resolves the
 * endpoint, builds the arrow, writes it to the store. Returns the
 * new arrow's id so the caller can update the selection without
 * re-querying elements.
 */
export const commitBindingDrag = (
  start: BindingDragState,
  worldPos: Point,
  elements: Element[],
  store: SceneStore,
): string | null => {
  const {endWorld, endBinding} = resolveBindingDragEndpoint(worldPos, elements);
  const arrow = buildBindingDragArrow(start, endWorld, endBinding);
  store.createElement(arrow);
  return arrow.id;
};
