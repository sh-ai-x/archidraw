// useTextBinding — thin React adapter over the pure bindTextAt helper.
//
// F10 (2026-08-20): extract the text-in-shape binding flow so the JSX
// handlers stay one-liners. F10 / 🟠 major #4 follow-up: the
// `Element.boundElements` predicate logic (F02 / F03 / F06) lives in
// packages/gui/src/textBinding.ts so the invariant has one home.
// This hook is a thin React adapter that delegates the bind math and
// applies the result to the store.

import {useCallback} from "react";
import type {Element} from "@archidraw/schema";
import type {SceneStore} from "./scene";
import {applyBindResult, bindTextAt} from "./textBinding";

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
 * the user cancelled the prompt. Callers wire the returned handler
 * to onDoubleClick and the text-tool onPointerDown.
 */
export const useTextBinding = ({store, elements, setSelected, setTool}: UseTextBindingOpts) => {
  const handleBindAt = useCallback((x: number, y: number): string | null => {
    const result = bindTextAt(
      elements,
      x,
      y,
      (msg, def) => window.prompt(msg, def),
    );
    const newId = applyBindResult(store, result);
    if (newId) {
      setSelected(newId);
      setTool("select");
    }
    return newId;
  }, [store, elements, setSelected, setTool]);

  return {handleBindAt};
};
