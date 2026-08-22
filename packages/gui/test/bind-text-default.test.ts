// @vitest-environment jsdom
import {describe, expect, it, vi} from "vitest";
import {bindTextAt} from "../src/textBinding";
import {makeElement} from "../src/scene";

// (2026-08-22) F02-RC3 review: bindTextAt's `prompt` defaultText was
// always the empty string because shapes carry no `.text` field — the
// user was forced to retype the entire string on every re-bind, and an
// accidental empty submit looked like a creation. The fix pre-fills
// from the EXISTING bound text element's content when the user is
// updating.
describe("bindTextAt defaultText prefill (F02-RC3)", () => {
  it("기존 bound text가 있으면 그 내용을 default로 prompt에 넘긴다", () => {
    const rect = makeElement("rectangle", 0, 0, 100, 80);
    // shape.boundElements must reference the existing text element so
    // findBoundText() can pick it up.
    rect.boundElements = [{id: "t-existing", type: "text"}];
    const textEl = {
      ...makeElement("text", 0, 0, 100, 80),
      id: "t-existing",
      type: "text" as const,
      text: "기존 라벨",
    };
    const capturedPromptArgs: {msg: string; defaultText: string} = {
      msg: "", defaultText: "(unset)",
    };
    const result = bindTextAt(
      [rect, textEl as any],
      50, 40,
      (msg, defaultText) => {
        capturedPromptArgs.msg = msg;
        capturedPromptArgs.defaultText = defaultText;
        return "수정된 라벨";
      },
    );
    expect(result).not.toBeNull();
    expect(result!.updated).toBe(true);
    expect(capturedPromptArgs.msg).toBe("Text:");
    expect(capturedPromptArgs.defaultText).toBe("기존 라벨");
    expect((result!.text as unknown as {text: string}).text).toBe("수정된 라벨");
  });

  it("bound text가 없으면 defaultText는 빈 문자열이다", () => {
    const rect = makeElement("rectangle", 0, 0, 100, 80);
    const capturedDefault = {value: "(unset)" as string};
    const result = bindTextAt(
      [rect],
      50, 40,
      (msg, defaultText) => {
        capturedDefault.value = defaultText;
        return "새 라벨";
      },
    );
    expect(result).not.toBeNull();
    expect(result!.updated).toBe(false);
    expect(capturedDefault.value).toBe("");
  });

  it("bound text의 text 필드가 비어있으면 defaultText도 빈 문자열이다", () => {
    const rect = makeElement("rectangle", 0, 0, 100, 80);
    rect.boundElements = [{id: "t-empty", type: "text"}];
    const emptyText = {
      ...makeElement("text", 0, 0, 100, 80),
      id: "t-empty",
      type: "text" as const,
      text: "",
    };
    const capturedDefault = {value: "(unset)" as string};
    bindTextAt(
      [rect, emptyText as any],
      50, 40,
      (_msg, defaultText) => {
        capturedDefault.value = defaultText;
        return null;
      },
    );
    expect(capturedDefault.value).toBe("");
  });

  it("사용자가 prompt를 취소하면 null을 반환한다", () => {
    const rect = makeElement("rectangle", 0, 0, 100, 80);
    const result = bindTextAt([rect], 50, 40, () => null);
    expect(result).toBeNull();
  });
});
