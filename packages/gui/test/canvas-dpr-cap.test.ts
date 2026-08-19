// @vitest-environment jsdom
import {describe, expect, it} from "vitest";
import {clampCanvasBackingStore} from "../src/scene";

describe("Canvas 백킹 스토어 캡 (A06 minor)", () => {
  // 캡은 cssDim이 아닌 백킹 스토어(cssDim * devicePixelRatio)에 적용.
  // 수정 전에는 16384 캡이 cssDim에만 적용되어 3x-DPR 디스플레이에서
  // 백킹 스토어가 조용히 ~50k 픽셀로 자랐는데, 이는 더 큰 숫자로 표현된
  // 같은 DoS 클래스 (2026-08-19 A06 리뷰).
  it("1x 디스플레이에서 캡 이하 css 차원은 변경되지 않는다", () => {
    expect(clampCanvasBackingStore({cssW: 800, cssH: 600, maxDim: 16384, dpr: 1}))
      .toEqual({w: 800, h: 600});
  });
  it("3x 디스플레이에서 캡 이하 css 차원은 변경되지 않는다", () => {
    expect(clampCanvasBackingStore({cssW: 800, cssH: 600, maxDim: 16384, dpr: 3}))
      .toEqual({w: 800, h: 600});
  });
  it("1x 디스플레이에서 캡 초과 css 차원은 maxDim으로 클램프된다", () => {
    expect(clampCanvasBackingStore({cssW: 32000, cssH: 32000, maxDim: 16384, dpr: 1}))
      .toEqual({w: 16384, h: 16384});
  });
  // 실제 수정: DPR > 1이면 cssW * dpr <= maxDim이 되도록 css 차원을 축소.
  it("3x 디스플레이에서 캡 초과 css 차원은 cssW*dpr ≤ maxDim이 되도록 클램프된다", () => {
    const result = clampCanvasBackingStore({cssW: 16384, cssH: 16384, maxDim: 16384, dpr: 3});
    // 클램프 후 cssW = floor(16384/3) = 5461; cssW*dpr = 16383 ≤ 16384
    expect(result.w * 3).toBeLessThanOrEqual(16384);
    expect(result.h * 3).toBeLessThanOrEqual(16384);
    expect(result.w).toBeLessThan(16384);
  });
});