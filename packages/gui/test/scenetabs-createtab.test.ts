// @vitest-environment jsdom
// PR #48 review (2026-08-20, 🔴 critical #2): App.tsx handleLoadAsTab
// previously bypassed SceneTabs's React state by writing localStorage
// directly, then SceneTabs's debounced persist overwrote the new tab
// on the next tick. The original fix exposed a forwarded `createTab`
// handle on SceneTabs.
// F09 review (2026-08-20): lift tabs state into `tabsStore` so App can
// call `tabsStore.createTab(name, elements)` directly without a
// forwarded ref. This test now verifies the new architecture: no
// forwardRef/useImperativeHandle on SceneTabs, no localStorage writes
// in App's handleLoadAsTab, and `tabsStore.createTab(...)` is the
// call site.
import {describe, expect, it} from "vitest";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

const SCENE_TABS = resolve(__dirname, "../src/SceneTabs.tsx");
const APP = resolve(__dirname, "../src/App.tsx");
const TABS_STATE = resolve(__dirname, "../src/tabs-state.ts");
const sceneTabs = readFileSync(SCENE_TABS, "utf8");
const app = readFileSync(APP, "utf8");
const tabsState = readFileSync(TABS_STATE, "utf8");

describe("SceneTabs createTab 핸들 (PR #48, A06 review #2)", () => {
  it("SceneTabs는 tabsStore를 구독해서 forwardRef 없이 렌더링한다", () => {
    // Strip comments before matching so doc-only mentions of `forwardRef` /
    // `useImperativeHandle` (in the refactor-rationale paragraph) don't
    // false-positive.
    const code = sceneTabs.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(/forwardRef\b/.test(code)).toBe(false);
    expect(/useImperativeHandle\b/.test(code)).toBe(false);
    expect(/useTabsStore\b/.test(code)).toBe(true);
  });

  it("App의 handleLoadAsTab는 localStorage를 직접 쓰지 않는다 (tabsStore 우회 금지)", () => {
    const fnMatch = app.match(/handleLoadAsTab[\s\S]*?\n\s*\}/);
    expect(fnMatch).toBeTruthy();
    const body = fnMatch ? fnMatch[0] : "";
    expect(/localStorage\.(setItem|getItem|removeItem)\(/.test(body)).toBe(false);
  });

  it("App는 tabsStore.createTab을 직접 호출한다 (ref 없이)", () => {
    const code = app.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(/tabsStore\.createTab\s*\(/.test(code)).toBe(true);
    // No more tabsRef dance.
    expect(/tabsRef\b/.test(code)).toBe(false);
  });

  it("tabsStore는 createTab, setActiveTab, renameTab, deleteTab, newTab, snapshotActiveTab 액션을 노출한다", () => {
    const code = tabsState.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const action of ["createTab", "setActiveTab", "renameTab", "deleteTab", "newTab", "snapshotActiveTab"]) {
      // Accept either interface declaration (`createTab(...): string`) or
      // shorthand method (`createTab(name, elements) {`).
      const declared = new RegExp(`\\b${action}\\s*\\(`).test(code);
      expect(declared).toBe(true);
    }
  });
});
