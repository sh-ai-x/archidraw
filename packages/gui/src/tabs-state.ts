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

export const saveTabsState = (state: TabsState): void => {
  try {
    localStorage.setItem(TABS_KEY, JSON.stringify(state.tabs));
    if (state.activeTabId) localStorage.setItem(ACTIVE_KEY, state.activeTabId);
  } catch {
    // localStorage may be unavailable (private mode); swallow.
  }
};

export const loadTabsState = (): TabsState | null => {
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
    // F11 review (2026-08-20): assertSceneShape already enforces
    // object-shape + `elements` is an array + element-count +
    // parse-depth. The cheap pre-check is redundant and was hand-rolled
    // in three places (scene.ts loadScene, tabs-state.ts isValidScene,
    // and assertSceneShape itself); assertSceneShape is the single
    // source of truth.
    const cleaned = tabs.map(t => ({
      id: String(t.id),
      name: String(t.name ?? "Untitled"),
      scene: isValidScene(t.scene) ? t.scene : emptyScene(),
    }));
    return { tabs: cleaned, activeTabId };
  } catch {
    return null;
  }
};

function isValidScene(scene: unknown): scene is ExcalidrawScene {
  // A06-2 / A08-5 (2026-08-20): chain into assertSceneShape so the
  // MAX_ELEMENTS / MAX_PARSE_DEPTH guards apply on hydration, not
  // just on file load.
  // F11 review (2026-08-20): assertSceneShape already handles
  // non-objects, arrays, missing `elements`, and element-count +
  // parse-depth. The previous hand-rolled pre-check was redundant.
  return assertSceneShape(scene).ok;
}

// ──────────────────────────────────────────────────────────────────────────
// F09 review (2026-08-20): lift tabs state out of SceneTabs into a
// module-level store with a subscribe/getState interface. App.tsx can
// then call tabsStore.createTab() directly instead of going through a
// forwarded ref + useImperativeHandle — drops the ref dance on the
// handleLoadAsTab path.
// ──────────────────────────────────────────────────────────────────────────

interface TabsStoreApi {
  subscribe(listener: () => void): () => void;
  getState(): TabsState;
  /** Replace the entire state. Internal — prefer the typed actions. */
  setState(next: TabsState): void;
  /** Append a new tab with the given elements and switch to it. */
  createTab(name: string, elements: Element[]): string;
  /** Switch to a different tab by id. No-op if id is already active. */
  setActiveTab(id: string): void;
  /** Rename a tab (trimmed; no-op on empty or unchanged). */
  renameTab(id: string, nextName: string): void;
  /** Delete a tab. Returns the new active tab id, or null. */
  deleteTab(id: string): string | null;
  /** Append a fresh starter tab and switch to it. */
  newTab(): string;
  /** Snapshot the current scene into the active tab. */
  snapshotActiveTab(scene: ExcalidrawScene): void;
  /** Trigger a debounced persist to localStorage. Safe to call on every state change. */
  flushPersist(): void;
}

let _state: TabsState = loadTabsState() ?? createTabsState("Untitled");
const _listeners = new Set<() => void>();
let _persistTimer: ReturnType<typeof setTimeout> | null = null;
const PERSIST_DEBOUNCE_MS = 300;

const _notify = () => _listeners.forEach(l => l());
const _schedulePersist = () => {
  if (_persistTimer) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => saveTabsState(_state), PERSIST_DEBOUNCE_MS);
};

export const tabsStore: TabsStoreApi = {
  subscribe(listener) {
    _listeners.add(listener);
    return () => { _listeners.delete(listener); };
  },
  getState() { return _state; },
  setState(next) {
    _state = next;
    _notify();
    _schedulePersist();
  },
  createTab(name, elements) {
    const id = newId();
    const tab: Tab = {
      id,
      name,
      scene: {
        type: "excalidraw",
        version: 2,
        source: "archidraw",
        elements: structuredClone(elements),
        appState: {},
        files: {},
      },
    };
    _state = {tabs: [..._state.tabs, tab], activeTabId: id};
    _notify();
    _schedulePersist();
    return id;
  },
  setActiveTab(id) {
    if (_state.activeTabId === id) return;
    _state = {..._state, activeTabId: id};
    _notify();
    _schedulePersist();
  },
  renameTab(id, nextName) {
    const trimmed = nextName.trim();
    if (!trimmed) return;
    let changed = false;
    _state = {
      ..._state,
      tabs: _state.tabs.map(t => {
        if (t.id !== id) return t;
        if (t.name === trimmed) return t;
        changed = true;
        return {...t, name: trimmed};
      }),
    };
    if (changed) {
      _notify();
      _schedulePersist();
    }
  },
  deleteTab(id) {
    const idx = _state.tabs.findIndex(t => t.id === id);
    if (idx < 0) return _state.activeTabId;
    const nextTabs = _state.tabs.filter(t => t.id !== id);
    if (!nextTabs.length) return _state.activeTabId;
    let nextActive = _state.activeTabId;
    if (_state.activeTabId === id) {
      nextActive = nextTabs[Math.max(0, idx - 1)].id;
    }
    _state = {tabs: nextTabs, activeTabId: nextActive};
    _notify();
    _schedulePersist();
    return nextActive;
  },
  newTab() {
    const next = createTabsState("Untitled", _state);
    _state = next;
    _notify();
    _schedulePersist();
    return next.activeTabId ?? "";
  },
  snapshotActiveTab(scene) {
    const idx = _state.tabs.findIndex(t => t.id === _state.activeTabId);
    if (idx < 0) return;
    const nextTabs = _state.tabs.slice();
    nextTabs[idx] = {...nextTabs[idx], scene: structuredClone(scene)};
    _state = {..._state, tabs: nextTabs};
    _notify();
    _schedulePersist();
  },
  flushPersist() {
    if (_persistTimer) {
      clearTimeout(_persistTimer);
      _persistTimer = null;
    }
    saveTabsState(_state);
  },
};

/**
 * React hook that subscribes to the tabs store and returns a slice.
 * Uses useSyncExternalStore so React's render scheduling matches the
 * store's notify calls. Selector equality defaults to Object.is.
 */
export const useTabsStore = <T,>(selector: (s: TabsState) => T): T => {
  // useSyncExternalStore is imported lazily so this module stays
  // usable in non-React contexts (e.g. unit tests for tabsStore
  // directly).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react") as typeof import("react");
  return React.useSyncExternalStore(
    tabsStore.subscribe,
    () => selector(tabsStore.getState()),
    () => selector(tabsStore.getState()),
  );
};
