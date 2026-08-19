// @vitest-environment jsdom
import {describe, expect, it} from "vitest";
import {clampCanvasBackingStore} from "../src/scene";

describe("Canvas backing-store cap (A06 minor)", () => {
  // The cap is on the BACKING STORE (cssDim * devicePixelRatio), not on
  // cssDim alone. Pre-fix the 16384-cap silently grew to ~50k on a 3x-DPR
  // display, which is the same DoS class with a bigger number.
  it("css dim below cap on 1x display is unchanged", () => {
    expect(clampCanvasBackingStore({cssW: 800, cssH: 600, maxDim: 16384, dpr: 1}))
      .toEqual({w: 800, h: 600});
  });
  it("css dim below cap on 3x display is unchanged", () => {
    expect(clampCanvasBackingStore({cssW: 800, cssH: 600, maxDim: 16384, dpr: 3}))
      .toEqual({w: 800, h: 600});
  });
  it("css dim above cap on 1x display is clamped to maxDim", () => {
    expect(clampCanvasBackingStore({cssW: 32000, cssH: 32000, maxDim: 16384, dpr: 1}))
      .toEqual({w: 16384, h: 16384});
  });
  // The actual fix: when DPR > 1, css dim is reduced so that
  // cssW * dpr <= maxDim. Otherwise the backing store exceeds maxDim.
  it("css dim above cap on 3x display is clamped so cssW*dpr stays at maxDim", () => {
    const result = clampCanvasBackingStore({cssW: 16384, cssH: 16384, maxDim: 16384, dpr: 3});
    // cssW after clamp = floor(16384/3) = 5461; cssW*dpr = 16383 ≤ 16384
    expect(result.w * 3).toBeLessThanOrEqual(16384);
    expect(result.h * 3).toBeLessThanOrEqual(16384);
    expect(result.w).toBeLessThan(16384);
  });
});