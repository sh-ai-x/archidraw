// @vitest-environment jsdom
import {describe, expect, it} from "vitest";
import {assertSceneShape, MAX_ELEMENTS, MAX_PARSE_DEPTH} from "../src/scene";

describe("SceneIO parsed-shape guard (A06 minor)", () => {
  // The 25 MB cap on file size isn't enough — a small JSON with millions of
  // nested elements or a pathologically deep object can still OOM the tab
  // once parsed. assertSceneShape rejects both with explicit counters so
  // the caller surfaces a user-readable error instead of freezing.
  it("accepts a normal scene with a few elements", () => {
    const result = assertSceneShape({
      type: "excalidraw",
      version: 2,
      source: "archidraw",
      elements: [
        {id: "a", type: "rectangle", x: 0, y: 0, width: 10, height: 10},
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a scene with more than MAX_ELEMENTS elements", () => {
    const tooMany = Array.from({length: MAX_ELEMENTS + 1}, (_, i) => ({
      id: `e${i}`, type: "rectangle" as const, x: 0, y: 0, width: 1, height: 1,
    }));
    const result = assertSceneShape({type: "excalidraw", elements: tooMany});
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/too many elements/i);
  });

  it("rejects a scene that exceeds MAX_PARSE_DEPTH", () => {
    // Build a nested object deeper than MAX_PARSE_DEPTH.
    let deep: Record<string, unknown> = {leaf: true};
    for (let i = 0; i < MAX_PARSE_DEPTH + 5; i++) {
      deep = {nested: deep};
    }
    const result = assertSceneShape({type: "excalidraw", elements: [deep]});
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/too deep|depth/i);
  });

  it("rejects a non-object scene root", () => {
    expect(assertSceneShape("not an object").ok).toBe(false);
    expect(assertSceneShape(null).ok).toBe(false);
    expect(assertSceneShape(undefined).ok).toBe(false);
    expect(assertSceneShape(42).ok).toBe(false);
  });

  it("accepts an empty elements array", () => {
    expect(assertSceneShape({type: "excalidraw", elements: []}).ok).toBe(true);
  });
});