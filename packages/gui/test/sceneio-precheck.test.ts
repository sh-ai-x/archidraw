// @vitest-environment jsdom
import {describe, expect, it} from "vitest";
import {estimateElementCountFromText, MAX_ELEMENTS} from "../src/scene";

describe("SceneIO pre-parse element-count estimate (A08 major)", () => {
  // The 25 MB file-size cap isn't enough — a small JSON with millions of
  // `"id":` fields can parse to a giant object before assertSceneShape
  // rejects. estimateElementCountFromText runs BEFORE JSON.parse so we
  // can refuse without materialising the document.
  it("returns 0 for empty input", () => {
    expect(estimateElementCountFromText("")).toBe(0);
  });
  it("counts one id in a minimal scene", () => {
    const text = JSON.stringify({
      type: "excalidraw",
      elements: [{id: "a", type: "rectangle", x: 0, y: 0, width: 10, height: 10}],
    });
    expect(estimateElementCountFromText(text)).toBe(1);
  });
  it("counts N ids in a synthetic large scene", () => {
    const N = 1000;
    const elements = Array.from({length: N}, (_, i) => ({
      id: `e${i}`, type: "rectangle" as const, x: 0, y: 0, width: 1, height: 1,
    }));
    const text = JSON.stringify({type: "excalidraw", elements});
    expect(estimateElementCountFromText(text)).toBe(N);
  });
  it("flags a scene whose id count exceeds MAX_ELEMENTS", () => {
    const N = MAX_ELEMENTS + 10;
    const elements = Array.from({length: N}, (_, i) => ({
      id: `e${i}`, type: "rectangle" as const, x: 0, y: 0, width: 1, height: 1,
    }));
    const text = JSON.stringify({type: "excalidraw", elements});
    expect(estimateElementCountFromText(text)).toBeGreaterThan(MAX_ELEMENTS);
  });
  it("accepts whitespace between the closing quote and colon", () => {
    const text = '{"id" : "a", "id"  :  "b", "id"\n:\t"c"}';
    expect(estimateElementCountFromText(text)).toBe(3);
  });
});