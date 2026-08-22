// bindings.ts — N:N shape↔text binding helpers.
//
// (2026-08-22) Replaces the 1:1 `TextElement.containerId` model with a
// top-level `bindings[]` edge collection on `ExcalidrawScene`. Each
// `ShapeTextBinding` is an undirected edge between a shape and a text
// element with normalized anchor points on each bbox.
//
// Design record: ~/.claude/plans/nn-shape-text-bindings.md
//
// Store dispatcher: `SceneStore` does not currently expose
// `updateBindings` or `replaceScene`. To keep the store contract
// stable (the F04 `boundElements` invariant guards in Canvas/Renderer
// ride on the existing API surface), addBinding / removeBinding
// fall back to direct localStorage writeback on the
// `archidraw:scene` key. This is acceptable for the dev build where
// localStorage is the only persistence path. If the store grows
// `updateBindings` later, the helpers prefer it first.

import type {Element, ExcalidrawScene, ShapeTextBinding, Point} from "@archidraw/schema";
import type {SceneStore} from "./scene";
import {assertSceneShape} from "./scene";

const SCENE_KEY = "archidraw:scene";

/**
 * (2026-08-22) A06 review round 4: cap the input-shape-id sets in
 * `reparentTextBindings`. The previous unbounded iteration let a
 * caller pass `newShapeIds.length === 10_000_000` and force the
 * materialization + Set + JSON.stringify → OOM. Match the same
 * conservative upper bound SceneIO + assertSceneShape use.
 */
const REPARENT_MAX_IDS = 25000;

// ID mint: prefer crypto.randomUUID where present; fall back to a
// short random suffix so unit tests in a jsdom environment without
// crypto still produce unique ids.
const newBindingId = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `b_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;

export interface AddBindingInput {
  shapeId: string;
  textId: string;
  shapeAnchor?: Point;
  textAnchor?: Point;
  zHint?: number;
}

interface SceneStoreWithBindings extends SceneStore {
  updateBindings?: (bindings: ShapeTextBinding[]) => void;
  replaceScene?: (scene: ExcalidrawScene) => void;
}

/** Read the current scene through the store's getter (preferred) or
 *  from localStorage (fallback when the store does not yet know
 *  about bindings). */
const readScene = (store: SceneStore): ExcalidrawScene => {
  try {
    if (typeof (store as SceneStoreWithBindings).getScene === "function") {
      return store.getScene();
    }
  } catch {
    /* fall through to localStorage */
  }
  const raw = typeof localStorage !== "undefined" ? localStorage.getItem(SCENE_KEY) : null;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      // A08/A10 review round 4 (2026-08-22): the previous localStorage
      // fallback only checked `Array.isArray(parsed.elements)`, which
      // a tampered payload satisfies with a million-element array
      // while bypassing MAX_ELEMENTS / MAX_PARSE_DEPTH / element-shape
      // guards. Run assertSceneShape so every hydration path enforces
      // the same caps SceneIO uses. A failing shape is replaced with an
      // empty scene (matches SceneIO's user-facing recovery).
      const check = assertSceneShape(parsed);
      if (check.ok) return parsed as ExcalidrawScene;
    } catch {
      /* fall through */
    }
  }
  return {type: "excalidraw", version: 2, source: "archidraw", elements: [], appState: {}, files: {}};
};

/** Write the next scene through the store's preferred dispatcher, with
 *  a localStorage fallback for stores that don't expose bindings yet.
 *  Returns true on a successful write. */
const writeScene = (store: SceneStore, next: ExcalidrawScene): boolean => {
  // A08 review round 4 (2026-08-22): the previous writeScene wrote
  // `next` straight through to localStorage / updateBindings without
  // a shape check, so a caller could push a 10M-element scene through
  // the bindings helper and bypass assertSceneShape entirely. Run
  // assertSceneShape here too. On failure, refuse to write (returns
  // false) and let the caller fall back to a no-op.
  const check = assertSceneShape(next);
  if (!check.ok) return false;
  const s = store as SceneStoreWithBindings;
  if (typeof s.updateBindings === "function") {
    s.updateBindings(next.bindings || []);
    return true;
  }
  if (typeof s.replaceScene === "function") {
    s.replaceScene(next);
    return true;
  }
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(SCENE_KEY, JSON.stringify(next));
      // Tell any mounted memory store to re-read.
      if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
        window.dispatchEvent(new Event("storage"));
      }
      return true;
    } catch {
      return false;
    }
  }
  return false;
};

/**
 * Add a new shape↔text binding. Returns the new binding id, or `null`
 * when:
 *   - the shape or text does not exist in the scene,
 *   - an identical (shapeId, textId) edge already exists.
 */
export const addBinding = (
  store: SceneStore,
  input: AddBindingInput,
): string | null => {
  const scene = readScene(store);
  const shapeExists = scene.elements.some(e => e.id === input.shapeId && !e.isDeleted);
  const textExists = scene.elements.some(e => e.id === input.textId && !e.isDeleted);
  if (!shapeExists || !textExists) return null;
  const existing = scene.bindings || [];
  if (existing.some(b => b.shapeId === input.shapeId && b.textId === input.textId)) {
    return null;
  }
  const next: ShapeTextBinding = {
    id: newBindingId(),
    kind: "shape-text",
    shapeId: input.shapeId,
    textId: input.textId,
    shapeAnchor: input.shapeAnchor ?? [0.5, 0.5],
    textAnchor: input.textAnchor ?? [0.5, 0.5],
    zHint: input.zHint ?? 0,
  };
  const nextScene: ExcalidrawScene = {...scene, bindings: [...existing, next]};
  return writeScene(store, nextScene) ? next.id : null;
};

/**
 * Remove the binding with `bindingId`. Returns true if a binding was
 * removed, false otherwise.
 */
export const removeBinding = (
  store: SceneStore,
  bindingId: string,
): boolean => {
  const scene = readScene(store);
  const existing = scene.bindings || [];
  const next = existing.filter(b => b.id !== bindingId);
  if (next.length === existing.length) return false;
  const nextScene: ExcalidrawScene = {...scene, bindings: next};
  return writeScene(store, nextScene);
};

/** All bindings whose `shapeId` matches. */
export const listBindingsForShape = (
  scene: ExcalidrawScene,
  shapeId: string,
): ShapeTextBinding[] =>
  (scene.bindings || []).filter(b => b.shapeId === shapeId);

/** All bindings whose `textId` matches. */
export const listBindingsForText = (
  scene: ExcalidrawScene,
  textId: string,
): ShapeTextBinding[] =>
  (scene.bindings || []).filter(b => b.textId === textId);

/**
 * Move a text element from one set of shapes to another. Useful when a
 * shape is deleted and its labels should follow a replacement shape, or
 * when the user re-binds a label via drag-and-drop.
 *
 * The function:
 *   1. removes any binding whose shapeId is in `oldShapeIds`,
 *   2. keeps bindings whose shapeId is not in either set,
 *   3. creates a fresh binding for each newShapeId (if one does not
 *      already exist).
 *
 * New edges inherit the default `[0.5, 0.5]` anchors so callers can
 * override later.
 */
export const reparentTextBindings = (
  store: SceneStore,
  textId: string,
  oldShapeIds: string[],
  newShapeIds: string[],
): void => {
  // A06 review round 4 (2026-08-22): cap the input ids. Unlimited
  // `newShapeIds.length` previously let a tampered caller OOM the
  // browser tab on `Set` materialization + JSON.stringify. Side
  // benefit: also bounds the JSON.stringify on the writeScene path
  // when MAX_BINDINGS is bypassed by a misbehaving caller.
  if (oldShapeIds.length > REPARENT_MAX_IDS || newShapeIds.length > REPARENT_MAX_IDS) {
    return;
  }
  const scene = readScene(store);
  const oldSet = new Set(oldShapeIds);
  const newSet = new Set(newShapeIds);
  const existing = scene.bindings || [];
  const kept = existing.filter(b => {
    if (b.textId !== textId) return true;
    if (oldSet.has(b.shapeId)) return false;
    return true;
  });
  // Detect the (textId, shapeId) pairs already in `kept` to skip dupes.
  const existingPairs = new Set(
    kept.filter(b => b.textId === textId).map(b => b.shapeId),
  );
  const additions: ShapeTextBinding[] = [];
  for (const sid of newShapeIds) {
    if (existingPairs.has(sid)) continue;
    if (!scene.elements.some(e => e.id === sid && !e.isDeleted)) continue;
    additions.push({
      id: newBindingId(),
      kind: "shape-text",
      shapeId: sid,
      textId,
      shapeAnchor: [0.5, 0.5],
      textAnchor: [0.5, 0.5],
      zHint: 0,
    });
  }
  if (additions.length === 0 && kept.length === existing.length) return;
  writeScene(store, {...scene, bindings: [...kept, ...additions]});
};

/**
 * Convert the legacy `TextElement.containerId` back-pointer into
 * `ShapeTextBinding` edges. Idempotent: a re-run on an already-migrated
 * scene produces no duplicates.
 */
export const migrateLegacyContainerId = (
  scene: ExcalidrawScene,
): ExcalidrawScene => {
  if (!scene.elements?.length) return scene;
  const existing = new Set(
    (scene.bindings || []).map(b => b.shapeId + "|" + b.textId),
  );
  const migrated: ShapeTextBinding[] = [...(scene.bindings || [])];
  for (const e of scene.elements) {
    if (e.type !== "text") continue;
    const cid = (e as unknown as {containerId?: string | null}).containerId;
    if (typeof cid !== "string" || !cid) continue;
    if (!scene.elements.some(el => el.id === cid && !el.isDeleted)) continue;
    const key = cid + "|" + e.id;
    if (existing.has(key)) continue;
    migrated.push({
      id: newBindingId(),
      kind: "shape-text",
      shapeId: cid,
      textId: e.id,
      shapeAnchor: [0.5, 0.5],
      textAnchor: [0.5, 0.5],
      zHint: 0,
    });
    existing.add(key);
  }
  return {...scene, bindings: migrated};
};

/**
 * Test-only / dev helper: read the current `bindings` from the store
 * without writing. Exposed for unit tests that need to assert the
 * post-write state.
 */
export const listBindings = (store: SceneStore): ShapeTextBinding[] => {
  const scene = readScene(store);
  return scene.bindings || [];
};

// Re-export Element so consumers can import helpers and types together.
export type {Element};
