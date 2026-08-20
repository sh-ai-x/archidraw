// @vitest-environment jsdom
import {afterEach,beforeEach,describe, expect, it, vi} from "vitest";
import {silentAutoFix} from "../src/LayoutPanel";

// jsdom does not implement canvas.getContext; provide a minimal mock so
// silentAutoFix's measureText/font logic runs in tests.
type FakeCtx = {font:string; measureText:(s:string)=>{width:number}};
let ctxByFontSize:Map<number,{width:number}>;
const makeCtx=():FakeCtx=>{
  ctxByFontSize=new Map();
  // crude monospace approximation: each char is fontSize*0.6 wide
  return {
    font:"",
    measureText:(s:string)=>({width:(s?.length??0)*(0.6*16)}),
  };
};
beforeEach(()=>{
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(()=>makeCtx() as unknown as CanvasRenderingContext2D);
});
afterEach(()=>{
  vi.restoreAllMocks();
});

describe("silentAutoFix container text", () => {
  it("grows the text HEIGHT to fit long content inside a container-bound text without resizing the container", () => {
    const rect = {
      id: "r1", type: "rectangle" as const,
      x: 100, y: 100, width: 200, height: 100,
      angle: 0, strokeColor: "#000", backgroundColor: "transparent",
      fillStyle: "solid" as const, strokeWidth: 1, strokeStyle: "solid" as const,
      roughness: 1, opacity: 100, groupIds: null, frameId: null, index: null,
      roundness: null, seed: 1, versionNonce: 1, isDeleted: false,
      boundElements: [{id: "t1", type: "text" as const}], updated: 1,
      link: null, locked: false,
    };
    const text = {
      id: "t1", type: "text" as const,
      x: 108, y: 130, width: 80, height: 28,
      angle: 0, strokeColor: "#000", backgroundColor: "transparent",
      fillStyle: "solid" as const, strokeWidth: 1, strokeStyle: "solid" as const,
      roughness: 1, opacity: 100, groupIds: null, frameId: null, index: null,
      roundness: null, seed: 2, versionNonce: 2, isDeleted: false,
      boundElements: null, updated: 1, link: null, locked: false,
      fontSize: 20, fontFamily: 1, text: "Hello World This Is A Long Sentence",
      textAlign: "center" as const, verticalAlign: "middle" as const,
      containerId: "r1", originalText: "Hello World This Is A Long Sentence",
      lineHeight: 1.25, baseline: 20,
    };
    const fixed = silentAutoFix([rect, text] as any);
    const outRect = fixed.find(e => e.id === "r1")!;
    const outText = fixed.find(e => e.id === "t1")!;
    // Container must be unchanged (the user picked 200x100; that's the contract).
    expect(outRect.width).toBe(200);
    expect(outRect.height).toBe(100);
    // Text height should have grown to accommodate wrapping.
    expect((outText as any).height).toBeGreaterThan(28);
    // Text width should NOT have grown (it stays at the container's interior width).
    expect((outText as any).width).toBeLessThanOrEqual(80);
  });

  it("does not change a container-bound text element whose content already fits", () => {
    const rect = {
      id: "r1", type: "rectangle" as const,
      x: 100, y: 100, width: 200, height: 100,
      angle: 0, strokeColor: "#000", backgroundColor: "transparent",
      fillStyle: "solid" as const, strokeWidth: 1, strokeStyle: "solid" as const,
      roughness: 1, opacity: 100, groupIds: null, frameId: null, index: null,
      roundness: null, seed: 1, versionNonce: 1, isDeleted: false,
      boundElements: [{id: "t1", type: "text" as const}], updated: 1,
      link: null, locked: false,
    };
    const text = {
      id: "t1", type: "text" as const,
      x: 108, y: 130, width: 80, height: 28,
      angle: 0, strokeColor: "#000", backgroundColor: "transparent",
      fillStyle: "solid" as const, strokeWidth: 1, strokeStyle: "solid" as const,
      roughness: 1, opacity: 100, groupIds: null, frameId: null, index: null,
      roundness: null, seed: 2, versionNonce: 2, isDeleted: false,
      boundElements: null, updated: 1, link: null, locked: false,
      fontSize: 20, fontFamily: 1, text: "OK",
      textAlign: "center" as const, verticalAlign: "middle" as const,
      containerId: "r1", originalText: "OK",
      lineHeight: 1.25, baseline: 20,
    };
    const fixed = silentAutoFix([rect, text] as any);
    const outRect = fixed.find(e => e.id === "r1")!;
    expect(outRect.width).toBe(200);
    expect(outRect.height).toBe(100);
  });

  it("still resizes free-floating text (no containerId) when its content overflows — regression guard", () => {
    const rect = {
      id: "r1", type: "rectangle" as const,
      x: 100, y: 100, width: 200, height: 100,
      angle: 0, strokeColor: "#000", backgroundColor: "transparent",
      fillStyle: "solid" as const, strokeWidth: 1, strokeStyle: "solid" as const,
      roughness: 1, opacity: 100, groupIds: null, frameId: null, index: null,
      roundness: null, seed: 1, versionNonce: 1, isDeleted: false,
      boundElements: null, updated: 1, link: null, locked: false,
    };
    const text = {
      id: "t1", type: "text" as const,
      x: 108, y: 130, width: 40, height: 28,
      angle: 0, strokeColor: "#000", backgroundColor: "transparent",
      fillStyle: "solid" as const, strokeWidth: 1, strokeStyle: "solid" as const,
      roughness: 1, opacity: 100, groupIds: null, frameId: null, index: null,
      roundness: null, seed: 2, versionNonce: 2, isDeleted: false,
      boundElements: null, updated: 1, link: null, locked: false,
      fontSize: 20, fontFamily: 1, text: "Hello World",
      textAlign: "center" as const, verticalAlign: "middle" as const,
      containerId: null, originalText: "Hello World",
      lineHeight: 1.25, baseline: 20,
    };
    const fixed = silentAutoFix([rect, text] as any);
    const outText = fixed.find(e => e.id === "t1")!;
    expect((outText as any).width).toBeGreaterThan(40);
  });
});