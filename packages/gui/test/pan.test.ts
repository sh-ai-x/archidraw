// @vitest-environment node
import {describe, expect, it} from "vitest";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

/**
 * Regression guard for the hand-tool pan implementation.
 *
 * The pre-fix code path mutated the wrapper's scrollLeft/scrollTop
 * (which is uncontrolled state and never round-trips into the React
 * render cycle). The fix is to call `setPan` so the canvas re-renders
 * with the new offset. This test enforces the source-level invariant
 * so a future refactor cannot re-introduce the wrapper.scrollLeft
 * pattern inside the gesture branch.
 */
describe("hand-tool pan implementation", () => {
  const sourcePath = resolve(__dirname, "../src/Canvas.tsx");
  const rawSource = readFileSync(sourcePath, "utf8");
  // Strip // line comments so the check ignores explanatory comments
  // (the post-fix code includes a comment that names `scrollLeft` while
  // describing why the gesture branch no longer touches it).
  const code = rawSource.replace(/\/\/[^\n]*/g, "");

  it("pan 분기는 setPan을 사용한다 (wrapper.scrollLeft 회귀 방지)", () => {
    // The pan branch must call setPan...
    expect(code).toMatch(/setPan\(/);
    // ...and must NOT use wrapper.scrollLeft inside the gesture branch.
    // We locate the branch that sets drag.current.space and verify the
    // 200 characters of CODE (not comments) after it contain setPan but
    // not scrollLeft.
    const panBranch = code.match(/drag\.current\.space[\s\S]{0,200}/);
    expect(panBranch).not.toBeNull();
    expect(panBranch![0]).toContain("setPan");
    expect(panBranch![0]).not.toContain("scrollLeft");
  });

  it("hitTestHandle은 HIT_MARGIN을 사용한다 (stroke ring 정확 hit-test)", () => {
    expect(code).toMatch(/HIT_MARGIN/);
  });
});
