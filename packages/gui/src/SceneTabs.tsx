import {useEffect, useRef, useState, type JSX} from "react";
import {tabsStore, useTabsStore, type Tab} from "./tabs-state";

interface SceneTabsProps {
  store: {
    getScene(): {elements: Array<{isDeleted?: boolean; id: string}>};
  };
  /**
   * Monotonically increasing on every store mutation. SceneTabs
   * forwards `store.getScene()` to `tabsStore.snapshotActiveTab`
   * when this prop changes.
   *
   * 🟠 major #3 follow-up (2026-08-20): the previous SceneTabs
   * owned three synchronizers — the forwarded handle (removed in
   * F09), a sceneVersion effect (this prop), and an onActiveChange
   * callback (removed in this revision). Drop onActiveChange by
   * having App subscribe to the store's activeTabId directly;
   * SceneTabs is now a near-pure presentational component.
   */
  sceneVersion: number;
  /** Where to render the inner Save/Load buttons next to the tabs. */
  rightSlot?: React.ReactNode;
}

/**
 * Multi-scene tab strip. Reads tab state from `tabsStore` and
 * dispatches user actions back to it. The only side-effects this
 * component owns are:
 *   1. first-run seed (copy store scene into the starter tab)
 *   2. sceneVersion-driven snapshot into the active tab
 * App subscribes to tabsStore.activeTabId directly for the
 * active-tab reload path — SceneTabs no longer pushes upstream.
 */
export function SceneTabs({store, sceneVersion, rightSlot}: SceneTabsProps): JSX.Element {
  const state = useTabsStore(s => s);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const lastSavedVersion = useRef<number>(-1);

  // First-run only: copy current scene into the starter tab so the
  // empty tab is hydrated with whatever was already in the
  // localStorage scene.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    tabsStore.snapshotActiveTab(store.getScene());
    lastSavedVersion.current = sceneVersion;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save: when sceneVersion bumps, snapshot the current store
  // elements into the active tab. Using a version counter (rather
  // than a no-deps effect) guarantees this runs once per logical
  // mutation, not on every render.
  useEffect(() => {
    if (lastSavedVersion.current === sceneVersion) return;
    lastSavedVersion.current = sceneVersion;
    tabsStore.snapshotActiveTab(store.getScene());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneVersion]);

  const handleNew = () => {
    tabsStore.newTab();
  };

  const handleSelect = (id: string) => {
    tabsStore.setActiveTab(id);
  };

  const handleStartRename = (tab: Tab) => {
    setEditing(tab.id);
    setDraftName(tab.name);
  };

  const handleCommitRename = (tab: Tab) => {
    const next = draftName.trim();
    setEditing(null);
    if (!next || next === tab.name) return;
    tabsStore.renameTab(tab.id, next);
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
    tabsStore.deleteTab(tab.id);
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
}
