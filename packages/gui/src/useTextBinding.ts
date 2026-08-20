// useTextBinding — encapsulate the text-in-shape binding flow.
//
// F10 review (2026-08-20): the previous 45-line onDoubleClick / text-tool
// onPointerClick flow was inlined into JSX, with three different
// boundElements predicates scattered across both call sites. This hook
// centralizes:
//
//   - hit-testing the shape at the click point
//   - the prompt → (update | create) flow
//   - the boundElements predicate that handles F02 (already-bound update),
//     F03 (preserve non-text bindings), and F06 (null-guard malformed items)
//
// Callers get back {bindOnDoubleClick, bindOnTextToolClick} handlers
// that take a `world` coordinate and return the new selected id (or
// null when no shape was under the cursor / the user cancelled).
//
// The hook is intentionally a thin orchestrator over the store — it
// does NOT own any state of its own, so React's render-cycle cost is
// bounded to one `useCallback` per handler.
import {useCallback} from "react";
import type {Element} from "@archidraw/schema";
import {makeElement, pointInElement, type SceneStore} from "./scene";

/**
 * Predicate: shape hits at the click point with a 8-unit tolerance
 * (matches the selection hit-test; F04 review).
 */
const isShape = (el: Element): boolean =>
  el.type === "rectangle" || el.type === "diamond" || el.type === "ellipse";

const findShapeAt = (elements: Element[], x: number, y: number): Element | undefined =>
  [...elements].reverse().find(el => isShape(el) && pointInElement(el, x, y, 8));

// Bound-element predicate, F02 / F03 / F06 hardened:
//   - skips null/non-object items (F06)
//   - matches by `type === "text"` for the "already bound text" lookup
const findBoundText = (el: Element): {id: string} | undefined => {
  const bound = (el.boundElements || []) as Array<unknown>;
  return bound.find((b): b is {id: string} =>
    !!b && typeof b === "object" && (b as {type?: unknown}).type === "text"
  ) as {id: string} | undefined;
};

// F03: preserve non-text bindings when writing back.
const nonTextBindings = (el: Element): Array<{id: string; type: string}> => {
  const bound = (el.boundElements || []) as Array<unknown>;
  return bound.filter((b): b is {id: string; type: string} =>
    !!b && typeof b === "object" && (b as {type?: unknown}).type !== "text"
  );
};

const newTextId = (): string =>
  (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2));

export interface UseTextBindingOpts {
  store: SceneStore;
  elements: Element[];
  setSelected: (id: string | null) => void;
  setTool: (tool: "select") => void;
}

/**
 * Bind (or update) a text element to the shape at the click point.
 *
 * Returns the new selected text id, or null when no shape was hit or
 * the user cancelled the prompt. Callers are expected to wire the
 * returned handlers to onDoubleClick and the text-tool onPointerDown.
 */
export const useTextBinding = ({store, elements, setSelected, setTool}: UseTextBindingOpts) => {
  const handleBindAt = useCallback((x: number, y: number): string | null => {
    const shapeHit = findShapeAt(elements, x, y);
    if (!shapeHit) return null;
    const existing = window.prompt("Text:", String((shapeHit as unknown as {text?: string}).text ?? ""));
    if (existing === null) return null;
    const curBoundText = findBoundText(shapeHit);
    if (curBoundText) {
      // F02: UPDATE the existing bound text instead of creating a new one.
      store.updateElement(curBoundText.id, {text: existing, originalText: existing} as Partial<Element>);
      setSelected(curBoundText.id);
      setTool("select");
      return curBoundText.id;
    }
    const id = newTextId();
    const txt = {
      ...makeElement("text", shapeHit.x, shapeHit.y, shapeHit.width, shapeHit.height),
      id,
      text: existing,
      originalText: existing,
      containerId: shapeHit.id,
      width: shapeHit.width,
      height: shapeHit.height,
      textAlign: "left" as const,
      verticalAlign: "top" as const,
    };
    // F03: preserve non-text bindings when writing back.
    store.updateElement(shapeHit.id, {
      boundElements: [...nonTextBindings(shapeHit), {id, type: "text"}],
    } as Partial<Element>);
    store.createElement(txt);
    setSelected(id);
    setTool("select");
    return id;
  }, [store, elements, setSelected, setTool]);

  return {handleBindAt};
};
