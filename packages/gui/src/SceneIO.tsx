import type {JSX} from "react";
import type {Element} from "@archidraw/schema";
import type {SceneStore} from "./scene";

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
      const text = await file.text();
      try {
        const parsed = JSON.parse(text);
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
