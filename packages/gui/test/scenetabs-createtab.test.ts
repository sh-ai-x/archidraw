// @vitest-environment jsdom
// PR #48 review (2026-08-20, 🔴 critical #2): App.tsx handleLoadAsTab
// bypassed SceneTabs's React state by writing localStorage directly,
// then SceneTabs's debounced persist overwrote the new tab on the next
// tick. Fix: expose a forwarded `createTab(name, elements)` handle on
// SceneTabs so App can route the load through SceneTabs's own state.
import {describe, expect, it} from "vitest";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

const SCENE_TABS = resolve(__dirname, "../src/SceneTabs.tsx");
const APP = resolve(__dirname, "../src/App.tsx");
const sceneTabs = readFileSync(SCENE_TABS, "utf8");
const app = readFileSync(APP, "utf8");

describe("SceneTabs createTab 핸들 (PR #48, A06 review #2)", () => {
  it("SceneTabs는 forwardRef로 createTab 핸들을 노출한다", () => {
    expect(/forwardRef\b/.test(sceneTabs)).toBe(true);
    expect(/useImperativeHandle\b/.test(sceneTabs)).toBe(true);
    expect(/createTab\s*:/.test(sceneTabs)).toBe(true);
  });

  it("App의 handleLoadAsTab는 localStorage를 직접 쓰지 않는다 (SceneTabs state 우회 금지)", () => {
    // App의 handleLoadAsTab 본문에서 archidraw:tabs / archidraw:activeTab
    // 라는 localStorage 키를 직접 setItem 하지 않아야 한다. 모든 tab
    // state 변경은 SceneTabs의 React state를 통해야 한다.
    const fnMatch = app.match(/handleLoadAsTab[\s\S]*?\n\s*\}/);
    expect(fnMatch).toBeTruthy();
    const body = fnMatch ? fnMatch[0] : "";
    expect(/localStorage\.(setItem|getItem|removeItem)\(/.test(body)).toBe(false);
  });

  it("App는 SceneTabs의 ref를 통해 createTab을 호출한다", () => {
    // tabsRef.current?.createTab(...) 형태의 호출이 있어야 한다.
    expect(/createTab\s*\(/.test(app)).toBe(true);
  });
});
