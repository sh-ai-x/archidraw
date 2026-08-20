// @vitest-environment jsdom
// PR #48 review (2026-08-20, A06 critical): LayoutPanel.runAutoFix called
// `autoFix(elements)` but only `silentAutoFix` is exported. Clicking the
// Auto-Fix button threw ReferenceError, the status chip stuck on
// "running", and the fix was never published via the bridge. Source-level
// regression test: the file must not reference the undefined `autoFix`
// name. Approved export is `silentAutoFix` (used by App.tsx bootstrap too).
import {describe, expect, it} from "vitest";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

const LAYOUT = resolve(__dirname, "../src/LayoutPanel.tsx");
const src = readFileSync(LAYOUT, "utf8");

describe("LayoutPanel Auto-Fix 회귀 (PR #48, A06 review)", () => {
  it("활성 코드에서 autoFix( 호출이 등장하지 않는다 (silentAutoFix 만 사용)", () => {
    // 줄 단위 검사: 주석(`// ...`)을 제거한 뒤 `autoFix(` 토큰이
    // 발견되면 실패. 단어 경계로 잘라서 silentAutoFix, runAutoFix 등은
    // 매치하지 않도록 한다.
    const violations: string[] = [];
    const lines = src.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const stripped = lines[i].replace(/\/\/.*$/, "");
      if (/(?<![A-Za-z0-9_])autoFix\s*\(/.test(stripped)) {
        violations.push(`L${i + 1}: ${lines[i].trim()}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("silentAutoFix가 export되어 있다 (App.tsx dynamic import가 의존)", () => {
    // App.tsx는 `import("./LayoutPanel").then(({silentAutoFix}) => ...)`
    // 형태로 dynamic import한다. named export가 사라지면 bootstrap이 무너진다.
    expect(/export\s+function\s+silentAutoFix\b/.test(src)).toBe(true);
  });
});
