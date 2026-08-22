// @vitest-environment jsdom
import {beforeEach, describe, expect, it, vi} from "vitest";
import {
  buildBindingDragArrow,
  commitBindingDrag,
  resolveBindingDragEndpoint,
  tryStartBindingDrag,
  type BindingDragState,
} from "../src/bindingDrag";
import {createMemoryStore, emptyScene, makeElement} from "../src/scene";
import type {Element} from "@archidraw/schema";

// F12 review round 4 (2026-08-22): the previous Canvas.tsx inlined
// the arrow-tool binding drag state machine across four pointer
// event handlers. Extracted to bindingDrag.ts as pure functions so
// the state-machine logic is unit-testable without React/DOM.
describe("bindingDrag pure helpers (F12)", () => {
  let rect: Element;
  let rect2: Element;
  beforeEach(() => {
    rect = makeElement("rectangle", 100, 100, 100, 60);
    rect2 = makeElement("rectangle", 300, 100, 80, 80);
  });

  describe("tryStartBindingDrag", () => {
    it("스냅존 내부 좌표를 반환한다 (top center)", () => {
      const drag = tryStartBindingDrag([150, 100], [rect]);
      expect(drag).not.toBeNull();
      expect(drag!.element.id).toBe(rect.id);
      expect(drag!.fixedPoint).toEqual([0.5, 0]);
      expect(drag!.startPoint).toEqual({x: 150, y: 100});
    });

    it("스냅존 밖 좌표는 null을 반환한다", () => {
      expect(tryStartBindingDrag([500, 500], [rect])).toBeNull();
    });

    it("빈 elements 배열에 대해 null을 반환한다", () => {
      expect(tryStartBindingDrag([0, 0], [])).toBeNull();
    });
  });

  describe("resolveBindingDragEndpoint", () => {
    it("두번째 도형의 스냅존 위에서 종료하면 endBinding이 채워진다", () => {
      // 300+40 = 340 ≈ rect2의 right binding point
      const result = resolveBindingDragEndpoint([340, 140], [rect, rect2]);
      expect(result.endBinding).not.toBeNull();
      expect(result.endBinding!.elementId).toBe(rect2.id);
      // right binding point는 도형 중앙 y (140)
      expect(result.endWorld.y).toBe(140);
    });

    it("스냅존 밖 좌표는 endBinding이 null이다 (free-floating)", () => {
      const result = resolveBindingDragEndpoint([500, 500], [rect, rect2]);
      expect(result.endBinding).toBeNull();
      expect(result.endWorld).toEqual({x: 500, y: 500});
    });
  });

  describe("buildBindingDragArrow", () => {
    it("두 점을 잇는 arrow element를 만든다", () => {
      const start: BindingDragState = {
        startPoint: {x: 150, y: 100},
        element: rect,
        fixedPoint: [0.5, 0],
      };
      const arrow = buildBindingDragArrow(
        start,
        {x: 200, y: 100},
        null,
      );
      expect(arrow.type).toBe("arrow");
      expect((arrow as unknown as {points: number[][]}).points).toEqual([
        [0, 0],
        [50, 0],
      ]);
      expect((arrow as unknown as {startBinding: {fixedPoint: number[]}}).startBinding.fixedPoint).toEqual([0.5, 0]);
      expect((arrow as unknown as {endBinding: unknown}).endBinding).toBeNull();
    });

    it("endBinding이 주어지면 arrow에 기록된다", () => {
      const start: BindingDragState = {
        startPoint: {x: 150, y: 100},
        element: rect,
        fixedPoint: [0.5, 0],
      };
      const arrow = buildBindingDragArrow(
        start,
        {x: 340, y: 140},
        {elementId: rect2.id, focus: 0, gap: 1, fixedPoint: [1, 0.5]},
      );
      const endB = (arrow as unknown as {endBinding: {elementId: string; fixedPoint: number[]}}).endBinding;
      expect(endB.elementId).toBe(rect2.id);
      expect(endB.fixedPoint).toEqual([1, 0.5]);
    });
  });

  describe("commitBindingDrag", () => {
    it("새 arrow의 id를 반환하고 store에 기록한다", () => {
      const store = createMemoryStore(emptyScene());
      const start: BindingDragState = {
        startPoint: {x: 150, y: 100},
        element: rect,
        fixedPoint: [0.5, 0],
      };
      const newId = commitBindingDrag(start, [200, 100], [rect], store);
      expect(typeof newId).toBe("string");
      expect(newId).not.toBeNull();
      const elements = store.queryElements();
      expect(elements).toHaveLength(1);
      expect(elements[0].type).toBe("arrow");
      expect(elements[0].id).toBe(newId!);
    });

    it("endHit 없으면 endBinding이 null인 free-floating arrow가 만들어진다", () => {
      const store = createMemoryStore(emptyScene());
      const start: BindingDragState = {
        startPoint: {x: 150, y: 100},
        element: rect,
        fixedPoint: [0.5, 0],
      };
      const newId = commitBindingDrag(start, [500, 500], [rect], store);
      expect(newId).not.toBeNull();
      const arrow = store.queryElements()[0];
      expect((arrow as unknown as {endBinding: unknown}).endBinding).toBeNull();
    });
  });
});
