// @vitest-environment jsdom
import {describe, expect, it} from "vitest";
import {estimateElementCountFromText, MAX_ELEMENTS} from "../src/scene";

describe("SceneIO 파싱 전 원소 수 추정 (A08 major)", () => {
  // 25 MB 파일 크기 캡만으로는 부족하다 — 수백만 개의 `"id":` 필드를 가진
  // 작은 JSON이 assertSceneShape가 거부하기 전에 V8 파서에서 거대한 객체로
  // 파싱될 수 있다. estimateElementCountFromText는 JSON.parse 전에 실행되어
  // 문서를 건드리지 않고 거부할 수 있게 한다.
  it("빈 입력에 대해 0을 반환한다", () => {
    expect(estimateElementCountFromText("")).toBe(0);
  });
  it("최소 scene에서 하나의 id를 센다", () => {
    const text = JSON.stringify({
      type: "excalidraw",
      elements: [{id: "a", type: "rectangle", x: 0, y: 0, width: 10, height: 10}],
    });
    expect(estimateElementCountFromText(text)).toBe(1);
  });
  it("합성된 큰 scene에서 N개의 id를 센다", () => {
    const N = 1000;
    const elements = Array.from({length: N}, (_, i) => ({
      id: `e${i}`, type: "rectangle" as const, x: 0, y: 0, width: 1, height: 1,
    }));
    const text = JSON.stringify({type: "excalidraw", elements});
    expect(estimateElementCountFromText(text)).toBe(N);
  });
  it("id 수가 MAX_ELEMENTS를 초과하는 scene을 플래그한다", () => {
    const N = MAX_ELEMENTS + 10;
    const elements = Array.from({length: N}, (_, i) => ({
      id: `e${i}`, type: "rectangle" as const, x: 0, y: 0, width: 1, height: 1,
    }));
    const text = JSON.stringify({type: "excalidraw", elements});
    expect(estimateElementCountFromText(text)).toBeGreaterThan(MAX_ELEMENTS);
  });
  it("닫는 따옴표와 콜론 사이의 공백을 허용한다", () => {
    const text = '{"id" : "a", "id"  :  "b", "id"\n:\t"c"}';
    expect(estimateElementCountFromText(text)).toBe(3);
  });
});