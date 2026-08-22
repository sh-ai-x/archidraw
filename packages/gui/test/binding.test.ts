// @vitest-environment jsdom
import {describe, expect, it} from "vitest";
import {BINDING_POINTS, bindingPointWorld, closestBindingPoint, hitBindingPoint, makeElement} from "../src/scene";
import type {Element} from "@archidraw/schema";

describe("BINDING_POINTS", () => {
  it("5개의 binding point 이름을 포함한다", () => {
    expect(BINDING_POINTS).toEqual(expect.arrayContaining(["top", "right", "bottom", "left", "center"]));
    expect(BINDING_POINTS).toHaveLength(5);
  });
});

describe("bindingPointWorld", () => {
  it("사각형의 top은 위 변의 중앙을 반환한다", () => {
    const r = makeElement("rectangle", 100, 50, 200, 80);
    expect(bindingPointWorld(r, "top")).toEqual({x: 200, y: 50});
  });

  it("사각형의 right은 우측 변의 중앙을 반환한다", () => {
    const r = makeElement("rectangle", 100, 50, 200, 80);
    expect(bindingPointWorld(r, "right")).toEqual({x: 300, y: 90});
  });

  it("마름모의 bottom은 아래 꼭짓점을 반환한다", () => {
    const d = makeElement("diamond", 0, 0, 100, 80);
    expect(bindingPointWorld(d, "bottom")).toEqual({x: 50, y: 80});
  });

  it("타원의 left은 좌측 변의 중앙을 반환한다", () => {
    const e = makeElement("ellipse", 50, 50, 100, 60);
    expect(bindingPointWorld(e, "left")).toEqual({x: 50, y: 80});
  });

  it("center은 도형의 정중앙을 반환한다", () => {
    const r = makeElement("rectangle", 0, 0, 100, 60);
    expect(bindingPointWorld(r, "center")).toEqual({x: 50, y: 30});
  });
});

describe("closestBindingPoint", () => {
  const r = makeElement("rectangle", 0, 0, 100, 60); // top=30, right=100, bottom=90, left=0, center=50,30

  it("upper-left 근처 클릭은 top을 반환한다", () => {
    const c = closestBindingPoint(r, 40, 5);
    expect(c.point).toBe("top");
    expect(c.fixedPoint).toEqual([0.5, 0]);
  });

  it("좌측 변 중앙 근처 클릭은 left을 반환한다", () => {
    const c = closestBindingPoint(r, 5, 30);
    expect(c.point).toBe("left");
    expect(c.fixedPoint).toEqual([0, 0.5]);
  });

  it("정중앙 클릭은 center를 반환한다", () => {
    const c = closestBindingPoint(r, 50, 30);
    expect(c.point).toBe("center");
    expect(c.fixedPoint).toEqual([0.5, 0.5]);
  });

  it("width 또는 height가 0이면 center [0.5,0.5]를 반환한다", () => {
    const zero = makeElement("rectangle", 10, 10, 0, 0);
    const c = closestBindingPoint(zero, 10, 10);
    expect(c.point).toBe("center");
    expect(c.fixedPoint).toEqual([0.5, 0.5]);
  });
});

describe("hitBindingPoint", () => {
  it("shape 근처에서 클릭하면 가장 가까운 binding point를 반환한다", () => {
    const r = makeElement("rectangle", 0, 0, 100, 60);
    const els: Element[] = [r];
    const hit = hitBindingPoint(els, 50, 1); // very near top
    expect(hit).not.toBeNull();
    expect(hit!.point).toBe("top");
  });

  it("text 또는 arrow/line은 hit 결과에서 제외된다", () => {
    const a = makeElement("text", 0, 0, 80, 28);
    const ar = makeElement("arrow", 0, 0, 100, 0);
    expect(hitBindingPoint([a, ar], 5, 5)).toBeNull();
  });

  it("여러 도형이 겹치면 가장 위에 있는(topmost) 도형을 반환한다", () => {
    const a = makeElement("rectangle", 0, 0, 100, 100);
    const b = makeElement("rectangle", 30, 30, 60, 60);
    const hit = hitBindingPoint([a, b], 60, 60);
    expect(hit).not.toBeNull();
    expect(hit!.element.id).toBe(b.id); // b is later in the array → topmost
  });

  it("snap tolerance 외곽이면 null을 반환한다", () => {
    const r = makeElement("rectangle", 0, 0, 100, 60);
    expect(hitBindingPoint([r], 9999, 9999)).toBeNull();
  });
});
