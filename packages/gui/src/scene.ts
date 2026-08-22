import type {Element, ExcalidrawScene, Point, ShapeTextBinding} from "@archidraw/schema";
export type Tool="hand"|"select"|"rectangle"|"ellipse"|"diamond"|"arrow"|"line"|"text"|"erase";
export type ElementPatch=Partial<Element> & Record<string, unknown>;
export interface SceneStore {
  getScene():ExcalidrawScene;
  queryElements(opts?:{includeDeleted?:boolean}):Element[];
  updateElement(id:string, updates:ElementPatch):void;
  deleteElement(id:string):void;
  createElement(element:Element):void;
  undo():boolean;
  redo():boolean;
  canUndo():boolean;
  canRedo():boolean;
  // (2026-08-22) N:N shape↔text binding collection. Optional in the
  // type so legacy callers compile; missing methods fall back to a
  // localStorage write in bindings.ts.
  updateBindings?(bindings: ShapeTextBinding[]): void;
  replaceScene?(scene: ExcalidrawScene): void;
}
const KEY="archidraw:scene";
// ─────────────────────────────────────────────────────────────────────────
// Task E — point-to-shape binding helpers (2026-08-21). Snap to the 5 cardinal
// anchor points (top / right / bottom / left / center) of a shape so an
// arrow-tool drag from one shape to another can produce a real
// startBinding / endBinding pair instead of a free-floating endpoint.
// ─────────────────────────────────────────────────────────────────────────
export type BindingPoint = "top" | "right" | "bottom" | "left" | "center";
export const BINDING_POINTS: BindingPoint[] = ["top", "right", "bottom", "left", "center"];

/** Convert a binding-point name + element into a world-space {x, y}. */
export const bindingPointWorld = (el: Element, p: BindingPoint): {x: number; y: number} => {
  const w = el.width || 0;
  const h = el.height || 0;
  switch (p) {
    case "top":    return { x: el.x + w / 2, y: el.y };
    case "right":  return { x: el.x + w,     y: el.y + h / 2 };
    case "bottom": return { x: el.x + w / 2, y: el.y + h };
    case "left":   return { x: el.x,         y: el.y + h / 2 };
    case "center": return { x: el.x + w / 2, y: el.y + h / 2 };
  }
};

/** Inverse — given a world-space {x, y} and an element, return the closest
 *  binding point name AND its normalized [nx, ny] on the element bounding
 *  box (in [0,1]). Used to set Binding.fixedPoint. */
export const closestBindingPoint = (el: Element, x: number, y: number): {point: BindingPoint; fixedPoint: Point} => {
  const w = el.width || 0;
  const h = el.height || 0;
  if (w <= 0 || h <= 0) return { point: "center", fixedPoint: [0.5, 0.5] };
  const candidates: Array<{point: BindingPoint; pos: {x:number;y:number}; fixedPoint: Point}> = [
    { point: "top",    pos: bindingPointWorld(el, "top"),    fixedPoint: [0.5, 0]   },
    { point: "right",  pos: bindingPointWorld(el, "right"),  fixedPoint: [1,   0.5] },
    { point: "bottom", pos: bindingPointWorld(el, "bottom"), fixedPoint: [0.5, 1]   },
    { point: "left",   pos: bindingPointWorld(el, "left"),   fixedPoint: [0,   0.5] },
    { point: "center", pos: bindingPointWorld(el, "center"), fixedPoint: [0.5, 0.5] },
  ];
  let best = candidates[0];
  let bestD = Math.hypot(x - best.pos.x, y - best.pos.y);
  for (let i = 1; i < candidates.length; i++) {
    const d = Math.hypot(x - candidates[i].pos.x, y - candidates[i].pos.y);
    if (d < bestD) { best = candidates[i]; bestD = d; }
  }
  return { point: best.point, fixedPoint: best.fixedPoint };
};

/** Find the topmost element whose binding-point snap zone contains (x, y).
 *  Snap tolerance scales with the element's diagonal so small shapes still
 *  have a generous snap zone. */
export const hitBindingPoint = (elements: Element[], x: number, y: number, tolerance = 16): {element: Element; point: BindingPoint} | null => {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if(el.isDeleted) continue;
    if (el.type === "text" || el.type === "arrow" || el.type === "line") continue;
    for (const p of BINDING_POINTS) {
      const bp = bindingPointWorld(el, p);
      const diag = Math.hypot(el.width || 0, el.height || 0);
      const tol = Math.max(tolerance, diag * 0.15);
      if (Math.hypot(bp.x - x, bp.y - y) <= tol) return { element: el, point: p };
    }
  }
  return null;
};
export const emptyScene=():ExcalidrawScene=>({type:"excalidraw",version:2,source:"archidraw",elements:[],appState:{},files:{}});
// A06-2 / A08-5 review (2026-08-20): previous loadScene only checked
// `type === "excalidraw"` and `Array.isArray(elements)`, which a
// tampered localStorage payload can satisfy with a million-element
// array and freeze the tab. Run `assertSceneShape` so the same
// MAX_ELEMENTS / MAX_PARSE_DEPTH guards SceneIO uses apply on
// hydration too.
// F11 review (2026-08-20): the `type === "excalidraw" && Array.isArray(elements)`
// pre-check is redundant — assertSceneShape already enforces both,
// plus the elements-count / parse-depth guards. Let assertSceneShape
// be the single source of truth for shape validation.
export const loadScene=():ExcalidrawScene=>{try{const raw=localStorage.getItem(KEY);if(raw){const parsed=JSON.parse(raw);if(parsed&&assertSceneShape(parsed).ok)return parsed as ExcalidrawScene}}catch{}return emptyScene()};
export const saveScene=(scene:ExcalidrawScene)=>{try{localStorage.setItem(KEY,JSON.stringify(scene))}catch{}};
export const pointInElement=(element:Element,x:number,y:number,tolerance=8)=>{const left=Math.min(element.x,element.x+element.width)-tolerance;const top=Math.min(element.y,element.y+element.height)-tolerance;const right=Math.max(element.x,element.x+element.width)+tolerance;const bottom=Math.max(element.y,element.y+element.height)+tolerance;if(element.type!=="arrow"&&element.type!=="line")return x>=left&&x<=right&&y>=top&&y<=bottom;const points=element.points.map(([px,py])=>[element.x+px,element.y+py] as Point);return points.some(([px,py])=>Math.hypot(x-px,y-py)<=tolerance)||points.slice(1).some(([a,b],i)=>{const [c,d]=points[i];const len=Math.hypot(a-c,b-d)||1;return Math.abs((b-d)*x-(a-c)*y+a*d-b*c)/len<=tolerance&&x>=Math.min(a,c)-tolerance&&x<=Math.max(a,c)+tolerance&&y>=Math.min(b,d)-tolerance&&y<=Math.max(b,d)+tolerance})};
export const makeElement=(type:Exclude<Tool,"select"|"erase">,x:number,y:number,w:number,h:number,seed=Date.now()):Element=>{const base={id:crypto.randomUUID(),type,x,y,width:w,height:h,angle:0,strokeColor:"#1f2937",backgroundColor:"transparent",fillStyle:"solid",strokeWidth:2,strokeStyle:"solid",roughness:1,opacity:100,groupIds:null,frameId:null,index:null,roundness:null,seed,versionNonce:seed,isDeleted:false,boundElements:null,updated:Date.now(),link:null,locked:false} as const;if(type==="arrow"||type==="line")return {...base,type,points:[[0,0],[w,h]],startBinding:null,endBinding:null,startArrowhead:type==="arrow"?null:null,endArrowhead:type==="arrow"?"arrow":null} as Element;if(type==="text")return {...base,type,width:Math.max(w,80),height:28,fontSize:20,fontFamily:1,text:"Text",textAlign:"left",verticalAlign:"top",containerId:null,originalText:"Text",lineHeight:1.2,baseline:20} as Element;
  // (2026-08-22) Newly drawn rectangle / diamond / ellipse get a light pastel
  // fill so they are visibly colored against the white canvas. Text, arrow,
  // and line keep `transparent` (set on `base`) so they render without a
  // colored box.
  return {...base,type,backgroundColor:"#fde68a"} as Element};

/**
 * Cap the BACKING STORE (cssW*dpr) of a Canvas to `maxDim` pixels on the
 * longest axis, regardless of `devicePixelRatio`. Pre-fix the 16384-cap was
 * applied to the CSS dim alone; on a 3x-DPR display the GPU backing-store
 * allocation silently grew to ~50k pixels, which is the same DoS class
 * with a bigger number (A06 review, 2026-08-19).
 *
 * The returned `w`/`h` are the CSS dims to feed into `c.width = w * dpr`;
 * the caller multiplies by dpr, so `w * dpr <= maxDim` is the invariant
 * we enforce here.
 */
export const clampCanvasBackingStore = ({cssW, cssH, maxDim, dpr}: {
  cssW: number;
  cssH: number;
  maxDim: number;
  dpr: number;
}): {w: number; h: number} => {
  const safeDpr = dpr > 0 ? dpr : 1;
  // CSS dim cannot exceed maxDim even on a 1x display.
  const capCss = Math.min(cssW, cssH) > maxDim ? maxDim : Infinity;
  // On HiDPI, cssDim must shrink so cssDim * dpr <= maxDim.
  const cssCapForDpr = Math.floor(maxDim / safeDpr);
  const w = Math.min(cssW, capCss, cssCapForDpr);
  const h = Math.min(cssH, capCss, cssCapForDpr);
  return {w, h};
};

/**
 * A06 / A10 review (2026-08-19): SceneIO's 25 MB file-size cap is necessary
 * but not sufficient — a 1 KB JSON can still parse to millions of nested
 * elements or a deeply-recursive object and freeze the tab. assertSceneShape
 * is the cheap pre-validate pass that runs right after `JSON.parse` in
 * SceneIO.handleLoad: it rejects scenes that are not plain objects, scenes
 * with too many elements, and scenes whose element tree exceeds
 * MAX_PARSE_DEPTH. Callers surface the result's `reason` to the user.
 *
 * estimateElementCountFromText is a *pre-parse* heuristic that runs BEFORE
 * V8 touches the bytes — it counts `"id":` substrings (every Excalidraw
 * element carries at least one `"id"` field) and rejects files whose
 * element-count estimate already exceeds MAX_ELEMENTS. This closes the
 * "24.9 MB JSON with millions of elements materialises in V8 before
 * assertSceneShape rejects" gap that the post-parse guard left open
 * (A08 major, 2026-08-19).
 */
export const MAX_ELEMENTS = 5000;
export const MAX_PARSE_DEPTH = 32;

/**
 * (2026-08-22) Review round 4 (F02 review / A08 major): cap the N:N
 * shape↔text binding collection length at parse time, matching the
 * MAX_ELEMENTS / MAX_PARSE_DEPTH guards on `elements`. A tampered or
 * malicious scene.json claiming 10M bindings[] entries would otherwise
 * bypass assertSceneShape's elements-only check and freeze the tab on
 * the first render. Picked 5x MAX_ELEMENTS (25k) as the conservative
 * upper bound: each element can have a handful of bindings, but 25k
 * already exceeds any human-authored scene.
 */
export const MAX_BINDINGS = 25000;

/**
 * Maximum canvas dimension (longest axis) for both the renderer backing
 * store and the SnapshotPanel PNG export. Hoisted from Canvas.tsx and
 * SnapshotPanel.tsx (which used to declare their own `MAX_DIM = 16384`)
 * so the two files that must change together cannot drift. See F12
 * review (2026-08-20).
 */
export const MAX_CANVAS_DIM = 16384;

/**
 * Cheap pre-parse element-count estimate. Counts `"id":` occurrences in
 * the raw text — every Excalidraw element carries at least one `"id"`
 * field, so the count is a lower bound on the actual element count. We
 * use it to refuse *before* JSON.parse materialises the document; the
 * exact element count is enforced by `assertSceneShape` after parse.
 */
export const estimateElementCountFromText = (text: string): number => {
  if (!text) return 0;
  // Count `"id"` followed (after optional whitespace) by `:` — both
  // `:"a"` and ` : "a"` are legal JSON. The loop avoids allocating a
  // regex match array per occurrence. This is a lower bound, not an
  // exact count: a scene with `"id"` in a string literal would be
  // over-counted. assertSceneShape gives the authoritative answer after
  // parse — this is a fast reject only.
  let count = 0;
  for (let i = 0; i < text.length - 4; i++) {
    if (text.charCodeAt(i) !== 34) continue;       // "
    if (text.charCodeAt(i + 1) !== 105) continue;   // i
    if (text.charCodeAt(i + 2) !== 100) continue;   // d
    if (text.charCodeAt(i + 3) !== 34) continue;    // "
    let j = i + 4;
    // Whitespace: space, tab, LF, CR. JSON allows any whitespace between
    // the closing quote of the key and the colon.
    while (j < text.length) {
      const c = text.charCodeAt(j);
      if (c === 32 || c === 9 || c === 10 || c === 13) { j++; continue; }
      break;
    }
    if (text.charCodeAt(j) === 58) count++;        // :
  }
  return count;
};

const DEPTH_SENTINEL = Symbol("depth-exceeded");

const walkDepth = (node: unknown, depth: number): symbol | true => {
  if (depth > MAX_PARSE_DEPTH) return DEPTH_SENTINEL;
  if (node === null || typeof node !== "object") return true;
  if (Array.isArray(node)) {
    for (const child of node) {
      const r = walkDepth(child, depth + 1);
      if (r !== true) return r;
    }
    return true;
  }
  for (const key of Object.keys(node as Record<string, unknown>)) {
    const r = walkDepth((node as Record<string, unknown>)[key], depth + 1);
    if (r !== true) return r;
  }
  return true;
};

export type ShapeCheck =
  | {ok: true}
  | {ok: false; reason: string};

export const assertSceneShape = (parsed: unknown): ShapeCheck => {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {ok: false, reason: "scene must be a JSON object"};
  }
  const scene = parsed as Record<string, unknown>;
  if (!Array.isArray(scene.elements)) {
    return {ok: false, reason: "scene.elements must be an array"};
  }
  if (scene.elements.length > MAX_ELEMENTS) {
    return {ok: false, reason: `scene has too many elements (${scene.elements.length} > ${MAX_ELEMENTS})`};
  }
  if (walkDepth(scene, 0) === DEPTH_SENTINEL) {
    return {ok: false, reason: `scene element tree exceeds MAX_PARSE_DEPTH=${MAX_PARSE_DEPTH}`};
  }
  // (2026-08-22) Review round 4: cap the N:N shape↔text binding
  // collection. The field is optional (legacy scenes pre-date the
  // N:N API), so missing `bindings` is fine; an explicit non-array
  // (e.g. a string) is rejected so a tampered scene can't smuggle
  // payload through the field's name.
  if (scene.bindings !== undefined) {
    if (!Array.isArray(scene.bindings)) {
      return {ok: false, reason: "scene.bindings must be an array"};
    }
    if (scene.bindings.length > MAX_BINDINGS) {
      return {ok: false, reason: `scene has too many bindings (${scene.bindings.length} > ${MAX_BINDINGS})`};
    }
  }
  return {ok: true};
};
export const createMemoryStore=(initial=loadScene(), onChange:()=>void=()=>{}):SceneStore=>{
  let scene=structuredClone(initial);
  const HISTORY_LIMIT=100;
  let history:ExcalidrawScene[]=[];
  let redoStack:ExcalidrawScene[]=[];
  const persist=()=>{saveScene(scene);onChange()};
  // Push the current scene onto history BEFORE a mutation. New mutations
  // invalidate the redo branch (linear undo history).
  const snapshot=()=>{history.push(structuredClone(scene));if(history.length>HISTORY_LIMIT)history.shift();redoStack=[]};
  const restore=(target:ExcalidrawScene)=>{scene=structuredClone(target);persist()};
  return {
    getScene:()=>scene,
    queryElements:(opts?:{includeDeleted?:boolean})=>opts&&opts.includeDeleted?scene.elements:scene.elements.filter(e=>!e.isDeleted),
    updateElement:(id,updates)=>{snapshot();const i=scene.elements.findIndex(e=>e.id===id);if(i>=0)scene.elements[i]={...scene.elements[i],...updates,id:scene.elements[i].id} as Element;persist()},
    deleteElement:id=>{snapshot();scene.elements=scene.elements.filter(e=>e.id!==id);persist()},
    createElement:element=>{snapshot();scene.elements=[...scene.elements,element];persist()},
    undo:()=>{if(!history.length)return false;redoStack.push(structuredClone(scene));restore(history.pop()!);return true},
    redo:()=>{if(!redoStack.length)return false;history.push(structuredClone(scene));restore(redoStack.pop()!);return true},
    canUndo:()=>history.length>0,
    canRedo:()=>redoStack.length>0,
    // (2026-08-22) N:N binding helpers — snapshot before mutating so
    // they participate in the same undo/redo history as element ops.
    // A06 review round 4 (2026-08-22): run assertSceneShape on the
    // merged result so a tampered `updateBindings` payload with
    // `bindings: <huge array>` cannot bypass the MAX_BINDINGS guard.
    // On shape failure, leave the scene unchanged (no-op) rather
    // than letting the caller's payload reach the store. The shape
    // check also rejects non-array `bindings` so a payload like
    // `bindings: "string"` cannot smuggle arbitrary data.
    updateBindings:(bindings)=>{
      if (!Array.isArray(bindings)) return;
      if (bindings.length > MAX_BINDINGS) return;
      const next = {...scene, bindings};
      const check = assertSceneShape(next);
      if (!check.ok) return;
      snapshot();
      scene = next;
      persist();
    },
    replaceScene:(next)=>{
      const check = assertSceneShape(next);
      if (!check.ok) return;
      snapshot();
      scene = structuredClone(next);
      persist();
    },
  };
};
