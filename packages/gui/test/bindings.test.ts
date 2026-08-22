// @vitest-environment jsdom
import {afterEach, beforeEach, describe, expect, it} from "vitest";
import {createMemoryStore, emptyScene, makeElement} from "../src/scene";
import {
  addBinding,
  listBindings,
  listBindingsForShape,
  listBindingsForText,
  migrateLegacyContainerId,
  removeBinding,
  reparentTextBindings,
} from "../src/bindings";
import type {ShapeTextBinding} from "@archidraw/schema";

afterEach(() => {
  localStorage.clear();
});

describe("addBinding", () => {
  it("유효한 shape+text로 호출하면 binding을 생성하고 id를 반환한다", () => {
    const store = createMemoryStore(emptyScene());
    const s = makeElement("rectangle", 0, 0, 100, 80);
    const t = makeElement("text", 0, 0, 80, 28);
    store.createElement(s);
    store.createElement(t);
    const id = addBinding(store, {shapeId: s.id, textId: t.id});
    expect(id).toBeTypeOf("string");
    expect(id).toBeTruthy();
    expect(listBindings(store)).toHaveLength(1);
    expect(listBindings(store)[0]).toMatchObject({
      kind: "shape-text",
      shapeId: s.id,
      textId: t.id,
      shapeAnchor: [0.5, 0.5],
      textAnchor: [0.5, 0.5],
      zHint: 0,
    });
  });

  it("같은 shape+text로 두 번 호출하면 null을 반환한다 (중복 금지)", () => {
    const store = createMemoryStore(emptyScene());
    const s = makeElement("rectangle", 0, 0, 100, 80);
    const t = makeElement("text", 0, 0, 80, 28);
    store.createElement(s);
    store.createElement(t);
    const first = addBinding(store, {shapeId: s.id, textId: t.id});
    const second = addBinding(store, {shapeId: s.id, textId: t.id});
    expect(first).toBeTypeOf("string");
    expect(second).toBeNull();
    expect(listBindings(store)).toHaveLength(1);
  });

  it("존재하지 않는 shapeId로 호출하면 null을 반환한다", () => {
    const store = createMemoryStore(emptyScene());
    const t = makeElement("text", 0, 0, 80, 28);
    store.createElement(t);
    expect(addBinding(store, {shapeId: "missing-shape", textId: t.id})).toBeNull();
    expect(listBindings(store)).toHaveLength(0);
  });

  it("존재하지 않는 textId로 호출하면 null을 반환한다", () => {
    const store = createMemoryStore(emptyScene());
    const s = makeElement("rectangle", 0, 0, 100, 80);
    store.createElement(s);
    expect(addBinding(store, {shapeId: s.id, textId: "missing-text"})).toBeNull();
    expect(listBindings(store)).toHaveLength(0);
  });

  it("anchor와 zHint를 명시하면 그대로 저장된다", () => {
    const store = createMemoryStore(emptyScene());
    const s = makeElement("diamond", 0, 0, 100, 80);
    const t = makeElement("text", 0, 0, 80, 28);
    store.createElement(s);
    store.createElement(t);
    const id = addBinding(store, {
      shapeId: s.id,
      textId: t.id,
      shapeAnchor: [0.25, 0.75],
      textAnchor: [0, 1],
      zHint: 3,
    });
    expect(id).toBeTypeOf("string");
    const got = listBindings(store)[0];
    expect(got.shapeAnchor).toEqual([0.25, 0.75]);
    expect(got.textAnchor).toEqual([0, 1]);
    expect(got.zHint).toBe(3);
  });
});

describe("removeBinding", () => {
  it("존재하는 id로 호출하면 true를 반환하고 binding이 사라진다", () => {
    const store = createMemoryStore(emptyScene());
    const s = makeElement("rectangle", 0, 0, 100, 80);
    const t = makeElement("text", 0, 0, 80, 28);
    store.createElement(s);
    store.createElement(t);
    const id = addBinding(store, {shapeId: s.id, textId: t.id})!;
    expect(id).toBeTruthy();
    expect(removeBinding(store, id)).toBe(true);
    expect(listBindings(store)).toHaveLength(0);
  });

  it("존재하지 않는 id로 호출하면 false를 반환한다", () => {
    const store = createMemoryStore(emptyScene());
    expect(removeBinding(store, "non-existent-id")).toBe(false);
  });
});

describe("listBindingsForShape / listBindingsForText", () => {
  it("주어진 shape와 연결된 binding만 반환한다", () => {
    const store = createMemoryStore(emptyScene());
    const s1 = makeElement("rectangle", 0, 0, 100, 80);
    const s2 = makeElement("diamond", 200, 0, 100, 80);
    const t1 = makeElement("text", 0, 0, 80, 28);
    const t2 = makeElement("text", 0, 28, 80, 28);
    store.createElement(s1);
    store.createElement(s2);
    store.createElement(t1);
    store.createElement(t2);
    addBinding(store, {shapeId: s1.id, textId: t1.id});
    addBinding(store, {shapeId: s1.id, textId: t2.id});
    addBinding(store, {shapeId: s2.id, textId: t1.id});

    const scene = store.getScene();
    expect(listBindingsForShape(scene, s1.id)).toHaveLength(2);
    expect(listBindingsForShape(scene, s2.id)).toHaveLength(1);
    expect(listBindingsForShape(scene, "absent")).toHaveLength(0);
  });

  it("주어진 text와 연결된 binding만 반환한다", () => {
    const store = createMemoryStore(emptyScene());
    const s1 = makeElement("rectangle", 0, 0, 100, 80);
    const s2 = makeElement("diamond", 200, 0, 100, 80);
    const t1 = makeElement("text", 0, 0, 80, 28);
    store.createElement(s1);
    store.createElement(s2);
    store.createElement(t1);
    addBinding(store, {shapeId: s1.id, textId: t1.id});
    addBinding(store, {shapeId: s2.id, textId: t1.id});

    const scene = store.getScene();
    expect(listBindingsForText(scene, t1.id)).toHaveLength(2);
    expect(listBindingsForText(scene, "absent")).toHaveLength(0);
  });
});

describe("N:N shape↔text bindings", () => {
  it("하나의 text가 두 shape에 동시에 binding될 수 있다", () => {
    const store = createMemoryStore(emptyScene());
    const s1 = makeElement("rectangle", 0, 0, 100, 80);
    const s2 = makeElement("ellipse", 200, 0, 100, 80);
    const t = makeElement("text", 0, 0, 80, 28);
    store.createElement(s1);
    store.createElement(s2);
    store.createElement(t);
    addBinding(store, {shapeId: s1.id, textId: t.id});
    addBinding(store, {shapeId: s2.id, textId: t.id});
    const scene = store.getScene();
    expect(listBindingsForText(scene, t.id)).toHaveLength(2);
    expect(listBindingsForShape(scene, s1.id)).toHaveLength(1);
    expect(listBindingsForShape(scene, s2.id)).toHaveLength(1);
  });

  it("하나의 shape가 두 text에 동시에 binding될 수 있다", () => {
    const store = createMemoryStore(emptyScene());
    const s = makeElement("rectangle", 0, 0, 100, 80);
    const t1 = makeElement("text", 0, 0, 80, 28);
    const t2 = makeElement("text", 0, 28, 80, 28);
    store.createElement(s);
    store.createElement(t1);
    store.createElement(t2);
    addBinding(store, {shapeId: s.id, textId: t1.id});
    addBinding(store, {shapeId: s.id, textId: t2.id});
    const scene = store.getScene();
    expect(listBindingsForShape(scene, s.id)).toHaveLength(2);
    expect(listBindingsForText(scene, t1.id)).toHaveLength(1);
    expect(listBindingsForText(scene, t2.id)).toHaveLength(1);
  });
});

describe("migrateLegacyContainerId", () => {
  it("containerId가 있는 text를 ShapeTextBinding으로 변환한다", () => {
    const s = makeElement("rectangle", 0, 0, 100, 80);
    const t = {
      ...makeElement("text", 0, 0, 80, 28),
      containerId: s.id,
      text: "hello",
    };
    const scene = {
      type: "excalidraw" as const,
      version: 2,
      source: "archidraw",
      elements: [s, t],
      appState: {},
      files: {},
    };
    const next = migrateLegacyContainerId(scene);
    expect(next.bindings).toBeDefined();
    expect(next.bindings).toHaveLength(1);
    expect(next.bindings![0]).toMatchObject({
      kind: "shape-text",
      shapeId: s.id,
      textId: t.id,
      shapeAnchor: [0.5, 0.5],
      textAnchor: [0.5, 0.5],
    });
  });

  it("두 번 실행해도 binding이 중복 생성되지 않는다 (idempotent)", () => {
    const s = makeElement("rectangle", 0, 0, 100, 80);
    const t = {
      ...makeElement("text", 0, 0, 80, 28),
      containerId: s.id,
    };
    const scene = {
      type: "excalidraw" as const,
      version: 2,
      source: "archidraw",
      elements: [s, t],
      appState: {},
      files: {},
    };
    const once = migrateLegacyContainerId(scene);
    const twice = migrateLegacyContainerId(once);
    expect(twice.bindings).toHaveLength(1);
  });

  it("containerId가 null인 text는 binding을 만들지 않는다", () => {
    const s = makeElement("rectangle", 0, 0, 100, 80);
    const t = makeElement("text", 0, 0, 80, 28); // containerId=null
    const scene = {
      type: "excalidraw" as const,
      version: 2,
      source: "archidraw",
      elements: [s, t],
      appState: {},
      files: {},
    };
    const next = migrateLegacyContainerId(scene);
    expect(next.bindings).toEqual([]);
  });

  it("가리키는 shape이 이미 삭제되었으면 binding을 만들지 않는다", () => {
    const s = makeElement("rectangle", 0, 0, 100, 80);
    const t = {
      ...makeElement("text", 0, 0, 80, 28),
      containerId: "ghost-shape-id",
    };
    const scene = {
      type: "excalidraw" as const,
      version: 2,
      source: "archidraw",
      elements: [s, t],
      appState: {},
      files: {},
    };
    const next = migrateLegacyContainerId(scene);
    expect(next.bindings).toEqual([]);
  });
});

describe("reparentTextBindings", () => {
  it("text의 binding을 다른 shape 집합으로 옮긴다", () => {
    const store = createMemoryStore(emptyScene());
    const s1 = makeElement("rectangle", 0, 0, 100, 80);
    const s2 = makeElement("diamond", 200, 0, 100, 80);
    const sNew = makeElement("ellipse", 400, 0, 100, 80);
    const t = makeElement("text", 0, 0, 80, 28);
    store.createElement(s1);
    store.createElement(s2);
    store.createElement(sNew);
    store.createElement(t);
    addBinding(store, {shapeId: s1.id, textId: t.id});
    addBinding(store, {shapeId: s2.id, textId: t.id});
    reparentTextBindings(store, t.id, [s1.id, s2.id], [sNew.id]);
    const scene = store.getScene();
    const forText = listBindingsForText(scene, t.id);
    expect(forText).toHaveLength(1);
    expect(forText[0].shapeId).toBe(sNew.id);
  });

  it("oldShapeIds와 newShapeIds의 교집합은 무시된다", () => {
    const store = createMemoryStore(emptyScene());
    const s1 = makeElement("rectangle", 0, 0, 100, 80);
    const s2 = makeElement("diamond", 200, 0, 100, 80);
    const t = makeElement("text", 0, 0, 80, 28);
    store.createElement(s1);
    store.createElement(s2);
    store.createElement(t);
    addBinding(store, {shapeId: s1.id, textId: t.id});
    reparentTextBindings(store, t.id, [s1.id], [s2.id, s1.id]);
    const scene = store.getScene();
    const forText = listBindingsForText(scene, t.id);
    // s1 stays (intersection with newShapeIds), s2 added.
    expect(forText).toHaveLength(2);
  });
});
