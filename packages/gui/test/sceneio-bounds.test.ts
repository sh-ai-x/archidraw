// @vitest-environment jsdom
import {describe, expect, it} from "vitest";
import {assertSceneShape, MAX_BINDINGS, MAX_ELEMENTS, MAX_PARSE_DEPTH} from "../src/scene";

describe("SceneIO 파싱된 형태 가드 (A06 minor)", () => {
  // 25 MB 파일 크기 캡만으로는 부족하다 — 작은 JSON도 수백만 개의 중첩
  // 원소 또는 비정상적으로 깊은 객체로 파싱되어 탭을 멈추게 할 수 있다.
  // assertSceneShape는 두 경우 모두 명시적 카운터로 거부하여 호출자가
  // 사용자용 오류 메시지를 표시할 수 있게 한다.
  it("소수의 원소를 가진 일반 scene을 수락한다", () => {
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

  it("MAX_ELEMENTS를 초과하는 원소를 가진 scene을 거부한다", () => {
    const tooMany = Array.from({length: MAX_ELEMENTS + 1}, (_, i) => ({
      id: `e${i}`, type: "rectangle" as const, x: 0, y: 0, width: 1, height: 1,
    }));
    const result = assertSceneShape({type: "excalidraw", elements: tooMany});
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/too many elements/);
  });

  it("MAX_PARSE_DEPTH를 초과하는 scene을 거부한다", () => {
    // MAX_PARSE_DEPTH보다 깊은 중첩 객체를 만든다.
    let deep: Record<string, unknown> = {leaf: true};
    for (let i = 0; i < MAX_PARSE_DEPTH + 5; i++) {
      deep = {nested: deep};
    }
    const result = assertSceneShape({type: "excalidraw", elements: [deep]});
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/too deep|MAX_PARSE_DEPTH/);
  });

  it("객체가 아닌 scene 루트를 거부한다", () => {
    expect(assertSceneShape("객체가 아님").ok).toBe(false);
    expect(assertSceneShape(null).ok).toBe(false);
    expect(assertSceneShape(undefined).ok).toBe(false);
    expect(assertSceneShape(42).ok).toBe(false);
  });

  it("빈 원소 배열을 수락한다", () => {
    expect(assertSceneShape({type: "excalidraw", elements: []}).ok).toBe(true);
  });

  // (2026-08-22) A08 review round 4: assertSceneShape must cap the
  // scene.bindings[] N:N binding collection the same way it caps
  // elements[]. A tampered scene.json claiming 10M binding entries
  // would otherwise bypass the elements-only check and freeze the
  // tab on the first render.
  it("MAX_BINDINGS를 초과하는 bindings[] 배열을 가진 scene을 거부한다", () => {
    const tooManyBindings = Array.from({length: MAX_BINDINGS + 1}, (_, i) => ({
      id: `b${i}`,
      kind: "shape-text" as const,
      shapeId: `s${i}`,
      textId: `t${i}`,
      shapeAnchor: [0.5, 0.5] as [number, number],
      textAnchor: [0.5, 0.5] as [number, number],
    }));
    const result = assertSceneShape({
      type: "excalidraw",
      elements: [],
      bindings: tooManyBindings,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/too many bindings/);
  });

  it("MAX_BINDINGS 이하의 bindings[] 배열은 수락된다", () => {
    const okBindings = Array.from({length: 100}, (_, i) => ({
      id: `b${i}`,
      kind: "shape-text" as const,
      shapeId: `s${i}`,
      textId: `t${i}`,
      shapeAnchor: [0.5, 0.5] as [number, number],
      textAnchor: [0.5, 0.5] as [number, number],
    }));
    const result = assertSceneShape({
      type: "excalidraw",
      elements: [],
      bindings: okBindings,
    });
    expect(result.ok).toBe(true);
  });

  it("bindings 필드가 없는 레거시 scene을 수락한다", () => {
    const result = assertSceneShape({
      type: "excalidraw",
      elements: [],
    });
    expect(result.ok).toBe(true);
  });

  it("bindings가 배열이 아닌 경우 명시적으로 거부된다", () => {
    const result = assertSceneShape({
      type: "excalidraw",
      elements: [],
      bindings: "not-an-array",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/bindings must be an array/);
  });
});