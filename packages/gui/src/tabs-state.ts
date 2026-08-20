import type {Element, ExcalidrawScene} from "@archidraw/schema";
import {assertSceneShape} from "./scene";

export interface Tab {
  id: string;
  name: string;
  scene: ExcalidrawScene;
}

export interface TabsState {
  tabs: Tab[];
  activeTabId: string | null;
}

const TABS_KEY = "archidraw:tabs";
const ACTIVE_KEY = "archidraw:activeTab";

export const emptyScene = (): ExcalidrawScene => ({
  type: "excalidraw",
  version: 2,
  source: "archidraw",
  elements: [] as Element[],
  appState: {},
  files: {},
});

/**
 * Compute the inclusive world-space bounding box that covers every element,
 * padded by 100px on each side. An empty scene returns a 2000x1500 default.
 */
export function boundingBoxFromElements(elements: Element[]): { x: number; y: number; w: number; h: number } {
  if (!elements.length) return { x: 0, y: 0, w: 2000, h: 1500 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const e of elements) {
    minX = Math.min(minX, e.x);
    minY = Math.min(minY, e.y);
    maxX = Math.max(maxX, e.x + (e.width || 0));
    maxY = Math.max(maxY, e.y + (e.height || 0));
  }
  return { x: minX - 100, y: minY - 100, w: (maxX - minX) + 200, h: (maxY - minY) + 200 };
}

const newId = (): string =>
  (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36));

/**
 * Create a fresh tabs state with a single starter tab. If `base` is provided
 * (e.g., when rehydrating from localStorage), the new tab is appended at the
 * end and the active id is set to the new tab.
 */
export function createTabsState(defaultName: string, base?: TabsState): TabsState {
  const existing = base?.tabs ?? [];
  const active = base?.activeTabId ?? null;
  const id = newId();
  const name = nextUntitledName(existing, defaultName);
  const tab: Tab = { id, name, scene: emptyScene() };
  return {
    tabs: [...existing, tab],
    activeTabId: active ?? id,
  };
}

function nextUntitledName(tabs: Tab[], base: string): string {
  // If "Untitled" is unused, take it. Otherwise find the lowest "Untitled N" that's free.
  const taken = new Set(tabs.map(t => t.name));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

export function saveTabsState(state: TabsState): void {
  try {
    localStorage.setItem(TABS_KEY, JSON.stringify(state.tabs));
    if (state.activeTabId) localStorage.setItem(ACTIVE_KEY, state.activeTabId);
  } catch {
    // localStorage may be unavailable (private mode); swallow.
  }
}

export function loadTabsState(): TabsState | null {
  try {
    const raw = localStorage.getItem(TABS_KEY);
    if (!raw) return null;
    const tabs = JSON.parse(raw) as Tab[];
    if (!Array.isArray(tabs) || tabs.length === 0) return null;
    const activeRaw = localStorage.getItem(ACTIVE_KEY);
    const activeTabId = activeRaw && tabs.some(t => t.id === activeRaw) ? activeRaw : tabs[0].id;
    // A06-2 / A08-5 review (2026-08-20): previous guard only checked
    // `type === "excalidraw"` + `Array.isArray(elements)`, which a
    // tampered localStorage payload can satisfy with a million-element
    // array and freeze the tab on hydration. Run assertSceneShape so
    // the same MAX_ELEMENTS / MAX_PARSE_DEPTH guards SceneIO uses
    // apply on hydration. A failing shape is replaced with an empty
    // scene (the local equivalent of SceneIO's user-facing alert).
    const cleaned = tabs.map(t => ({
      id: String(t.id),
      name: String(t.name ?? "Untitled"),
      scene: isValidScene(t.scene) ? t.scene : emptyScene(),
    }));
    return { tabs: cleaned, activeTabId };
  } catch {
    return null;
  }
}

function isValidScene(scene: unknown): scene is ExcalidrawScene {
  // A06-2 / A08-5 (2026-08-20): chain into assertSceneShape so the
  // MAX_ELEMENTS / MAX_PARSE_DEPTH guards apply on hydration, not
  // just on file load. The cheap `type + elements array` check is
  // preserved so a non-object (e.g. string, number) cannot crash
  // assertSceneShape's structural walks.
  if (!scene || typeof scene !== "object") return false;
  const s = scene as ExcalidrawScene;
  if (s.type !== "excalidraw" || !Array.isArray(s.elements)) return false;
  return assertSceneShape(s).ok;
}
