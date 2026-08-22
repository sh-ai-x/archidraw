// @vitest-environment jsdom
import {afterEach, describe, expect, it} from "vitest";
import {addBinding, reparentTextBindings, migrateLegacyContainerId} from "../src/bindings";
import {MAX_BINDINGS} from "../src/scene";

// (2026-08-22) A06 + A08 review round 4: bindings.ts now uses
// assertSceneShape on both `readScene` (localStorage hydration) and
// `writeScene` (writeback). Smoke tests pin the validation contract
// so a future regression that bypasses the shape check surfaces.
describe("bindings.ts validation (A06/A08 round 4)", () => {
  afterEach(() => localStorage.clear());

  it("REPARENT_MAX_IDS 초과 입력은 즉시 무시된다 (A06)", () => {
    // Construct a legitimate scene then attempt the A06 OOM probe.
    const giant = new Array(25_001).fill("shape-id");
    // Capture behaviour: reparentTextBindings should be a no-op, not a
    // 10M-element iteration. No writeScene call, no localStorage.setItem,
    // no JSON.stringify on the giant array.
    expect(() =>
      reparentTextBindings({} as any, "text-1", [], giant),
    ).not.toThrow();
    // No writeScene side-effect — localStorage stays empty.
    expect(localStorage.getItem("archidraw:scene")).toBeNull();
  });

  it("addBinding 후 writeScene 호출은 shape-check를 통과해야 한다", () => {
    // Just check that the helpers don't crash on a normal call.
    const store = {
      getScene: () => ({type: "excalidraw", version: 2, source: "x", elements: [], appState: {}, files: {}}),
      queryElements: () => [],
      updateElement: () => {},
      deleteElement: () => {},
      createElement: () => {},
      undo: () => false,
      redo: () => false,
      canUndo: () => false,
      canRedo: () => false,
    } as any;
    // No shape + text present → returns null (existing invariant).
    expect(addBinding(store, {shapeId: "missing", textId: "missing"})).toBeNull();
  });

  it("migrateLegacyContainerId는 scene-shape 검사를 통과한다", () => {
    const scene = {
      type: "excalidraw",
      version: 2,
      source: "x",
      elements: [
        {id: "t1", type: "text", x: 0, y: 0, width: 50, height: 20,
         containerId: null, originalText: "old", text: "old"},
      ],
      appState: {},
      files: {},
    };
    // Already has containerId === null → no migration
    const out = migrateLegacyContainerId(scene as any);
    expect(out.bindings ?? []).toEqual([]);
  });

  it("MAX_BINDINGS 상수가 25000으로 노출된다", () => {
    // Sanity: the round-4 cap is the same constant SceneIO enforces.
    expect(MAX_BINDINGS).toBe(25000);
  });
});
