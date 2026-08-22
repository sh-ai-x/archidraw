// @vitest-environment jsdom
import {describe, expect, it} from "vitest";
import {safeAnchor} from "../src/Renderer";

// (2026-08-22) F07-RC2 review: tampered binding.shapeAnchor crashed the
// renderer with NaN / Infinity arithmetic on the destructure. The
// safeAnchor coercion is the trust boundary at the renderer — these
// tests pin the contract.
describe("Renderer.safeAnchor (F07-RC2)", () => {
  it("정상 unit-square 앵커는 그대로 보존된다", () => {
    expect(safeAnchor([0.5, 0.5])).toEqual([0.5, 0.5]);
    expect(safeAnchor([0, 0])).toEqual([0, 0]);
    expect(safeAnchor([1, 1])).toEqual([1, 1]);
  });

  it("NaN 앵커는 시각 중심 [0.5, 0.5]로 폴백된다", () => {
    expect(safeAnchor([NaN, NaN])).toEqual([0.5, 0.5]);
    expect(safeAnchor([Number.NaN, 0.5])).toEqual([0.5, 0.5]);
  });

  it("Infinity / -Infinity 앵커는 [0.5, 0.5]로 폴백된다", () => {
    expect(safeAnchor([Infinity, Infinity])).toEqual([0.5, 0.5]);
    expect(safeAnchor([-Infinity, -Infinity])).toEqual([0.5, 0.5]);
  });

  it("범위 밖 앵커는 [0, 1]로 클램프된다", () => {
    expect(safeAnchor([-0.5, 2])).toEqual([0, 1]);
    expect(safeAnchor([5, -3])).toEqual([1, 0]);
  });

  it("배열이 아닌 입력은 시각 중심으로 폴백된다", () => {
    expect(safeAnchor(null)).toEqual([0.5, 0.5]);
    expect(safeAnchor(undefined)).toEqual([0.5, 0.5]);
    expect(safeAnchor("0.5,0.5")).toEqual([0.5, 0.5]);
    expect(safeAnchor({x: 0.5, y: 0.5})).toEqual([0.5, 0.5]);
    expect(safeAnchor(0.5)).toEqual([0.5, 0.5]);
  });

  it("길이 1 배열은 시각 중심으로 폴백된다", () => {
    expect(safeAnchor([0.5])).toEqual([0.5, 0.5]);
  });

  it("문자열 숫자는 정상 unit-square로 변환된다", () => {
    // The trust boundary coerces anything via Number(); a tampered
    // payload whose anchor is the string "0.5" is still parsable into
    // a legitimate [0.5, 0.5] coordinate.
    expect(safeAnchor(["0.5", "0.25"])).toEqual([0.5, 0.25]);
  });
});
