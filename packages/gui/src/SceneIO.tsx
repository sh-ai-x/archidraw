import type {JSX} from "react";
import type {Element} from "@archidraw/schema";
import {assertSceneShape,estimateElementCountFromText,MAX_ELEMENTS,type SceneStore} from "./scene";

/**
 * SceneIO — Save/Load buttons. Save writes the *active* tab's scene to a
 * JSON file (existing behavior). Load replaces the scene wholesale UNLESS
 * an `onLoadAsTab` callback is provided — in that case the loaded file is
 * imported as a new tab named after the file's basename.
 */
export function SceneIO({
  store,
  defaultName,
  onLoadAsTab,
}: {
  store: SceneStore;
  /** Filename hint when saving (no extension). */
  defaultName?: string;
  /** When provided, Load creates a new tab instead of replacing the scene. */
  onLoadAsTab?: (name: string, elements: Element[]) => void;
}): JSX.Element {
  const handleSave = () => {
    const scene = store.getScene();
    const blob = new Blob([JSON.stringify(scene, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${defaultName ?? "scene"}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleLoad = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      // 25 MB hard cap — a 1 GB file or one that parses to millions of
      // nested elements can OOM the tab. Per A08 review on PR #48.
      const MAX_BYTES = 25 * 1024 * 1024;
      if (file.size > MAX_BYTES) {
        // 25 MB cap (A08 review on PR #48). Alert is the only transient
        // error sink — handleLoad is fire-and-forget outside React state.
        window.alert(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB > 25 MB)`);
        return;
      }
      const text = await file.text();
      // A08 review (2026-08-19): estimate element count from raw text
      // BEFORE JSON.parse. A 24.9 MB JSON with millions of `"id":` entries
      // fully materialises in V8's parser before assertSceneShape rejects —
      // the cheap string scan refuses without ever touching the document.
      const elementEstimate = estimateElementCountFromText(text);
      if (elementEstimate > MAX_ELEMENTS) {
        window.alert(`Invalid scene file: too many elements (${elementEstimate} > ${MAX_ELEMENTS})`);
        return;
      }
      try {
        const parsed = JSON.parse(text);
        // A06 / A10 review (2026-08-19): the 25 MB file-size cap isn't
        // enough — a small JSON can parse to millions of nested elements
        // or a pathologically deep object and freeze the tab. Reject
        // before touching the store. estimateElementCountFromText runs
        // first as a fast lower-bound; this is the authoritative check.
        const shape = assertSceneShape(parsed);
        if (!shape.ok) {
          window.alert(`Invalid scene file: ${shape.reason}`);
          return;
        }
        const elements: Element[] = Array.isArray(parsed?.elements) ? parsed.elements : [];
        if (onLoadAsTab) {
          const baseName = file.name.replace(/\.[^.]+$/, "");
          onLoadAsTab(baseName, elements);
          return;
        }
        // Fall back: replace scene wholesale.
        for (const el of store.queryElements()) store.deleteElement(el.id);
        for (const el of elements) {
          if (el && !el.isDeleted) store.createElement(el);
        }
      } catch (e) {
        console.error("[SceneIO] failed to parse load file", e);
        window.alert("Failed to parse scene file. Make sure it's an Excalidraw JSON.");
      }
    };
    input.click();
  };

  return (
    <div className="scene-io">
      <button className="scene-io-btn" onClick={handleSave} title="Save active scene as JSON">Save</button>
      <button className="scene-io-btn" onClick={handleLoad} title={onLoadAsTab ? "Load scene into a new tab" : "Load scene (replaces current)"}>Load</button>
    </div>
  );
}
