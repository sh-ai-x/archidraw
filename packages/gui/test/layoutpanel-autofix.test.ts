// @vitest-environment jsdom
// PR #48 review (2026-08-20, A06 critical): LayoutPanel.runAutoFix used
// to call `autoFix(elements)` but only `silentAutoFix` was exported.
// Clicking the Auto-Fix button threw ReferenceError, the status chip
// stuck on "running", and the fix was never published via the bridge.
// Source-level regression test: the file must not reference the
// undefined `autoFix` name.
//
// 🟠 major #2 follow-up (2026-08-20): `silentAutoFix` is now exported
// from ./layout.ts so App.tsx can statically import it (the previous
// dynamic import of the React component to reach the pure function
// was the reviewer-flagged surface). The test now checks both that
// LayoutPanel.tsx stays free of the undefined name AND that the pure
// logic lives in layout.ts where it can be unit-tested directly.
import {describe, expect, it} from "vitest";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

const LAYOUT_PANEL = resolve(__dirname, "../src/LayoutPanel.tsx");
const LAYOUT = resolve(__dirname, "../src/layout.ts");
const APP = resolve(__dirname, "../src/App.tsx");
const layoutPanel = readFileSync(LAYOUT_PANEL, "utf8");
const layout = readFileSync(LAYOUT, "utf8");
const app = readFileSync(APP, "utf8");

describe("LayoutPanel Auto-Fix 회귀 (PR #48, A06 review)", () => {
  it("활성 코드에서 autoFix( 호출이 등장하지 않는다 (silentAutoFix 만 사용)", () => {
    // 줄 단위 검사: 주석(`// ...`)을 제거한 뒤 `autoFix(` 토큰이
    // 발견되면 실패. 단어 경계로 잘라서 silentAutoFix, runAutoFix 등은
    // 매치하지 않도록 한다.
    const violations: string[] = [];
    for (const src of [layoutPanel, layout]) {
      const lines = src.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const stripped = lines[i].replace(/\/\/.*$/, "");
        if (/(?<![A-Za-z0-9_])autoFix\s*\(/.test(stripped)) {
          violations.push(`${LAYOUT_PANEL}:L${i + 1}: ${lines[i].trim()}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("silentAutoFix + countIssues는 layout.ts에서 export된다", () => {
    expect(/export\s+function\s+silentAutoFix\b/.test(layout)).toBe(true);
    expect(/export\s+function\s+countIssues\b/.test(layout)).toBe(true);
  });

  it("App.tsx는 dynamic import 없이 layout.ts에서 silentAutoFix를 static import 한다", () => {
    const code = app.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(/from\s+["']\.\/layout["']/.test(code)).toBe(true);
    expect(/import\s*\(\s*["']\.\/LayoutPanel["']\s*\)/.test(code)).toBe(false);
  });

  it("LayoutPanel.tsx는 layout.ts에서 silentAutoFix를 import 한다", () => {
    const code = layoutPanel.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(/import\s*\{[^}]*\bsilentAutoFix\b[^}]*\}\s+from\s+["']\.\/layout["']/.test(code)).toBe(true);
  });
});
