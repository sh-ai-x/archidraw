// @vitest-environment jsdom
import {describe, expect, it, beforeEach, vi} from "vitest";

// Stub roughjs — the real module uses canvas APIs not exposed by jsdom
// (bezierCurveTo, quadraticCurveTo, …) and we only need to assert the
// renderer's text behavior here. The shape-drawing branch is exercised
// in canvas-dpr-cap / integration tests; this suite isolates text layout.
vi.mock("roughjs", () => ({
  default: {
    canvas: () => ({
      path: () => {},
      ellipse: () => {},
      line: () => {},
    }),
  },
}));

import {renderScene} from "../src/Renderer";
import type {Element} from "@archidraw/schema";

// 2D context mock — record every fillText call so we can assert the
// renderer (a) clipped text into the container, (b) flushed it to the
// container's left edge (no left-bias padding), (c) word-wrapped when
// the line overflowed the container width.
function makeMockCtx(): {
  ctx: CanvasRenderingContext2D;
  fillTextCalls: Array<{text: string; x: number; y: number}>;
} {
  const fillTextCalls: Array<{text: string; x: number; y: number}> = [];
  const ctx: Partial<CanvasRenderingContext2D> = {
    font: "",
    fillStyle: "",
    textAlign: "start" as CanvasTextAlign,
    textBaseline: "alphabetic" as CanvasTextBaseline,
    measureText: (text: string) => {
      const w = (text?.length ?? 0) * 10;
      return {
        width: w,
        actualBoundingBoxAscent: 12,
        actualBoundingBoxDescent: 4,
        actualBoundingBoxLeft: 0,
        actualBoundingBoxRight: w,
        fontBoundingBoxAscent: 12,
        fontBoundingBoxDescent: 4,
      } as TextMetrics;
    },
    fillText: (text: string, x: number, y: number) => {
      fillTextCalls.push({text, x, y});
    },
    clearRect: () => {},
    save: () => {},
    restore: () => {},
    scale: () => {},
    translate: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    fill: () => {},
    stroke: () => {},
    strokeRect: () => {},
    fillRect: () => {},
    setLineDash: () => {},
  };
  return {ctx: ctx as CanvasRenderingContext2D, fillTextCalls};
}

describe("도형 안 텍스트 렌더링 (containerId 처리)", () => {
  let fillTextCalls: Array<{text: string; x: number; y: number}>;
  let ctx: CanvasRenderingContext2D;

  beforeEach(() => {
    const mock = makeMockCtx();
    ctx = mock.ctx;
    fillTextCalls = mock.fillTextCalls;
    HTMLCanvasElement.prototype.getContext = vi
      .fn()
      .mockReturnValue(ctx) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  });

  function makeCanvas(): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = 800;
    c.height = 600;
    return c;
  }

  const baseShape: Omit<Element, "type"> = {
    id: "r1",
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    angle: 0,
    strokeColor: "#000",
    backgroundColor: "#fff",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: null,
    frameId: null,
    index: null,
    roundness: null,
    seed: 1,
    versionNonce: 1,
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
  };

  const baseText: Omit<Element, "type" | "containerId" | "text" | "textAlign" | "verticalAlign"> = {
    id: "t1",
    x: 999,
    y: 999,
    width: 0,
    height: 0,
    angle: 0,
    strokeColor: "#000",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: null,
    frameId: null,
    index: null,
    roundness: null,
    seed: 2,
    versionNonce: 2,
    isDeleted: false,
    boundElements: null,
    updated: 2,
    link: null,
    locked: false,
    fontSize: 16,
    fontFamily: 1,
    originalText: "hi",
    lineHeight: 1.2,
    baseline: 16,
  };

  it("containerId가 있는 텍스트는 컨테이너 도형 내부에 그려진다", () => {
    const rect: Element = {...baseShape, id: "r1", type: "rectangle", x: 100, y: 100, width: 200, height: 100};
    const text: Element = {
      ...baseText,
      type: "text",
      containerId: "r1",
      text: "hi",
      textAlign: "left",
      verticalAlign: "middle",
    };
    renderScene(makeCanvas(), [rect, text], 1, {x: 0, y: 0});
    expect(fillTextCalls.length).toBeGreaterThan(0);
    const call = fillTextCalls[0];
    expect(call.x).toBeGreaterThanOrEqual(100);
    expect(call.x).toBeLessThanOrEqual(300);
    expect(call.y).toBeGreaterThanOrEqual(100);
    expect(call.y).toBeLessThanOrEqual(200);
    expect(call.text).toBe("hi");
  });

  it("텍스트는 도형 좌측에 붙어 그려진다 (좌측 패딩/마진 없음)", () => {
    const rect: Element = {...baseShape, type: "rectangle", width: 400, height: 100};
    const text: Element = {
      ...baseText,
      type: "text",
      containerId: "r1",
      text: "Hello",
      textAlign: "left",
      verticalAlign: "middle",
    };
    renderScene(makeCanvas(), [rect, text], 1, {x: 0, y: 0});
    expect(fillTextCalls.length).toBe(1);
    // 좌측 여백 = TEXT_IN_SHAPE_INSET (대칭 패딩, 좌측 쏠림 없음)
    expect(fillTextCalls[0].x).toBe(4);
    expect(fillTextCalls[0].text).toBe("Hello");
  });

  it("도형 너비를 초과하는 텍스트는 단어 단위로 줄바꿈된다", () => {
    const rect: Element = {...baseShape, type: "rectangle", width: 60, height: 200};
    const text: Element = {
      ...baseText,
      type: "text",
      containerId: "r1",
      text: "alpha beta gamma",
      textAlign: "left",
      verticalAlign: "middle",
    };
    renderScene(makeCanvas(), [rect, text], 1, {x: 0, y: 0});
    // 컨테이너 너비 60 - 2*4 = 52px
    // "alpha"     = 50 ≤ 52 → 한 줄
    // "alpha beta" = 60 > 52 → wrap → "beta" 단독 줄
    // "beta"      = 40 ≤ 52 → 한 줄
    // "beta gamma" = 60 > 52 → wrap → "gamma" 단독 줄
    expect(fillTextCalls.length).toBe(3);
    expect(fillTextCalls.map(c => c.text.replace(/\s+$/, ""))).toEqual(["alpha", "beta", "gamma"]);
  });

  it("verticalAlign=top 이면 첫 줄이 도형 상단에 붙어 그려진다", () => {
    const rect: Element = {...baseShape, type: "rectangle", width: 200, height: 100};
    const text: Element = {
      ...baseText,
      type: "text",
      containerId: "r1",
      text: "Hi",
      textAlign: "left",
      verticalAlign: "top",
    };
    renderScene(makeCanvas(), [rect, text], 1, {x: 0, y: 0});
    // 좌상단 (4, ~22) 근처 — 대칭 패딩 + 폰트 베이스라인 오프셋만
    expect(fillTextCalls[0].x).toBe(4);
    expect(fillTextCalls[0].y).toBeLessThan(40);
  });

  it("textAlign/verticalAlign 미지정 시에도 좌측 상단부터 그려진다", () => {
    const rect: Element = {...baseShape, type: "rectangle", width: 200, height: 100};
    const text: Element = {
      ...baseText,
      type: "text",
      containerId: "r1",
      text: "Hi",
      textAlign: undefined as any,
      verticalAlign: undefined as any,
    };
    renderScene(makeCanvas(), [rect, text], 1, {x: 0, y: 0});
    expect(fillTextCalls[0].x).toBe(4);
    expect(fillTextCalls[0].y).toBeLessThan(40);
  });
});
