import {forwardRef, useEffect, useImperativeHandle, useRef, useState, type JSX} from "react";
import type {Element} from "@archidraw/schema";
import type {SceneStore} from "./scene";
import {
  createTabsState,
  loadTabsState,
  saveTabsState,
  type Tab,
  type TabsState,
} from "./tabs-state";

interface SceneTabsProps {
  store: SceneStore;
  /** Monotonically increasing on every store mutation (from App.tsx via store.onChange). */
  sceneVersion: number;
  /** Called whenever the active tab changes; the parent should swap the store's contents to match. */
  onActiveChange: (active: TabsState) => void;
  /** Where to render the inner Save/Load buttons next to the tabs. */
  rightSlot?: React.ReactNode;
}

/** Imperative handle exposed to parents via the forwarded ref. */
export interface SceneTabsHandle {
  /**
   * Create a new tab from the given elements and switch to it. Bypasses
   * `localStorage` — all tab-state mutations stay inside React so the
   * component's own debounced persist can't overwrite the new tab.
   * PR #48 review (2026-08-20, 🔴 critical #2): the previous
   * App.handleLoadAsTab wrote `archidraw:tabs` directly, which
   * SceneTabs's 300ms debounced persist then overwrote on the next
   * tick, dropping the loaded tab.
   */
  createTab: (name: string, elements: Element[]) => void;
}

const PERSIST_DEBOUNCE_MS = 300;

/**
 * Multi-scene tab strip. Manages a list of named scenes backed by `localStorage`,
 * swap-tab behavior (rewriting the store contents when the active tab changes),
 * inline rename, and per-tab delete with a non-empty confirmation.
 */
export const SceneTabs = forwardRef<SceneTabsHandle, SceneTabsProps>(function SceneTabs({store, sceneVersion, onActiveChange, rightSlot}, ref): JSX.Element {
  const [state, setState] = useState<TabsState>(() => {
    const loaded = loadTabsState();
    if (loaded) return loaded;
    return createTabsState("Untitled");
  });

  const [editing, setEditing] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const lastEmittedTabId = useRef<string | null>(null);
  const lastSavedVersion = useRef<number>(-1);

  // Expose createTab so App.handleLoadAsTab can route through this
  // component's own state instead of writing localStorage directly
  // (PR #48 review, 2026-08-20).
  useImperativeHandle(ref, () => ({
    createTab: (name, elements) => {
      const id = (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36));
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
      setState(s => ({ tabs: [...s.tabs, tab], activeTabId: id }));
    },
  }), []);

  // Persist on a 300ms debounce.
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => saveTabsState(state), PERSIST_DEBOUNCE_MS);
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, [state]);

  // First-run only: copy current scene into the starter tab so the empty
  // tab is hydrated with whatever was already in the localStorage scene.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    setState(s => {
      const idx = s.tabs.findIndex(t => t.id === s.activeTabId);
      if (idx < 0) return s;
      const tabs = s.tabs.slice();
      tabs[idx] = { ...tabs[idx], scene: structuredClone(store.getScene()) };
      return { ...s, tabs };
    });
    lastSavedVersion.current = sceneVersion;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save: when sceneVersion bumps, snapshot the current store elements
  // into the active tab. Using a version counter (rather than a no-deps effect)
  // guarantees this runs once per logical mutation, not on every render.
  useEffect(() => {
    if (lastSavedVersion.current === sceneVersion) return;
    lastSavedVersion.current = sceneVersion;
    const currentScene = store.getScene();
    setState(s => {
      const idx = s.tabs.findIndex(t => t.id === s.activeTabId);
      if (idx < 0) return s;
      const nextTabs = s.tabs.slice();
      nextTabs[idx] = { ...nextTabs[idx], scene: structuredClone(currentScene) };
      return { ...s, tabs: nextTabs };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneVersion]);

  // Emit to parent whenever the active tab changes so App.tsx can reload the store.
  useEffect(() => {
    const activeId = state.activeTabId;
    if (!activeId || activeId === lastEmittedTabId.current) return;
    const active = state.tabs.find(t => t.id === activeId);
    if (active) {
      lastEmittedTabId.current = activeId;
      onActiveChange({ tabs: state.tabs, activeTabId: activeId });
    }
  }, [state.activeTabId, state.tabs, onActiveChange]);

  const handleNew = () => {
    setState(s => createTabsState("Untitled", s));
  };

  const handleSelect = (id: string) => {
    if (id === state.activeTabId) return;
    setState(s => ({ ...s, activeTabId: id }));
  };

  const handleStartRename = (tab: Tab) => {
    setEditing(tab.id);
    setDraftName(tab.name);
  };

  const handleCommitRename = (tab: Tab) => {
    const next = draftName.trim();
    setEditing(null);
    if (!next || next === tab.name) return;
    setState(s => ({
      ...s,
      tabs: s.tabs.map(t => t.id === tab.id ? { ...t, name: next } : t),
    }));
  };

  const handleCancelRename = () => {
    setEditing(null);
    setDraftName("");
  };

  const handleDelete = (tab: Tab) => {
    const hasContent = tab.scene.elements.some(e => !e.isDeleted);
    if (hasContent && !window.confirm(`Delete tab "${tab.name}"? This will discard its elements.`)) {
      return;
    }
    setState(s => {
      const idx = s.tabs.findIndex(t => t.id === tab.id);
      if (idx < 0) return s;
      const nextTabs = s.tabs.filter(t => t.id !== tab.id);
      if (!nextTabs.length) return s;
      let nextActive = s.activeTabId;
      if (s.activeTabId === tab.id) {
        nextActive = nextTabs[Math.max(0, idx - 1)].id;
      }
      return { tabs: nextTabs, activeTabId: nextActive };
    });
  };

  return (
    <div className="scene-tabs" data-testid="scene-tabs">
      {state.tabs.map(tab => {
        const isActive = tab.id === state.activeTabId;
        const isEditing = editing === tab.id;
        return (
          <div
            key={tab.id}
            className={"scene-tab" + (isActive ? " active" : "")}
            onClick={() => handleSelect(tab.id)}
            onDoubleClick={e => { e.preventDefault(); handleStartRename(tab); }}
            title={tab.name}
          >
            {isEditing ? (
              <input
                ref={el => { if (el && el !== document.activeElement) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }}
                className="scene-tab-input"
                defaultValue={tab.name}
                onChange={e => setDraftName(e.target.value)}
                onBlur={() => handleCommitRename(tab)}
                onKeyDown={e => {
                  if (e.key === "Enter") { e.preventDefault(); (e.currentTarget as HTMLInputElement).blur(); }
                  else if (e.key === "Escape") { e.preventDefault(); handleCancelRename(); }
                }}
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <>
                <span className="scene-tab-name">{tab.name}</span>
                <button
                  className="scene-tab-close"
                  aria-label={`Close ${tab.name}`}
                  onClick={e => { e.stopPropagation(); handleDelete(tab); }}
                >×</button>
              </>
            )}
          </div>
        );
      })}
      <button className="scene-tab-new" onClick={handleNew} title="New tab">+ New</button>
      {rightSlot && <div className="scene-tabs-right">{rightSlot}</div>}
    </div>
  );
});
