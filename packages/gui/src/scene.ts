import type {Element, ExcalidrawScene, Point} from "@archidraw/schema";
export type Tool="hand"|"select"|"rectangle"|"ellipse"|"diamond"|"arrow"|"line"|"text"|"erase";
export type ElementPatch=Partial<Element> & Record<string, unknown>;
export interface SceneStore {getScene():ExcalidrawScene; queryElements(opts?:{includeDeleted?:boolean}):Element[]; updateElement(id:string, updates:ElementPatch):void; deleteElement(id:string):void; createElement(element:Element):void; createContainerTextPair(container:Element, text:Element):void; undo():boolean; redo():boolean; canUndo():boolean; canRedo():boolean}
const KEY="archidraw:scene";
export const emptyScene=():ExcalidrawScene=>({type:"excalidraw",version:2,source:"archidraw",elements:[],appState:{},files:{}});
export const loadScene=():ExcalidrawScene=>{try{const raw=localStorage.getItem(KEY);if(raw){const parsed=JSON.parse(raw);if(parsed?.type==="excalidraw"&&Array.isArray(parsed.elements))return parsed}}catch{}return emptyScene()};
export const saveScene=(scene:ExcalidrawScene)=>{try{localStorage.setItem(KEY,JSON.stringify(scene))}catch{}};
export const pointInElement=(element:Element,x:number,y:number,tolerance=8)=>{const left=Math.min(element.x,element.x+element.width)-tolerance;const top=Math.min(element.y,element.y+element.height)-tolerance;const right=Math.max(element.x,element.x+element.width)+tolerance;const bottom=Math.max(element.y,element.y+element.height)+tolerance;if(element.type!=="arrow"&&element.type!=="line")return x>=left&&x<=right&&y>=top&&y<=bottom;const points=element.points.map(([px,py])=>[element.x+px,element.y+py] as Point);return points.some(([px,py])=>Math.hypot(x-px,y-py)<=tolerance)||points.slice(1).some(([a,b],i)=>{const [c,d]=points[i];const len=Math.hypot(a-c,b-d)||1;return Math.abs((b-d)*x-(a-c)*y+a*d-b*c)/len<=tolerance&&x>=Math.min(a,c)-tolerance&&x<=Math.max(a,c)+tolerance&&y>=Math.min(b,d)-tolerance&&y<=Math.max(b,d)+tolerance})};
export const makeElement=(type:Exclude<Tool,"select"|"erase">,x:number,y:number,w:number,h:number,seed=Date.now(),overrides?:{containerId?:string|null;text?:string}):Element=>{const base={id:crypto.randomUUID(),type,x,y,width:w,height:h,angle:0,strokeColor:"#1f2937",backgroundColor:"transparent",fillStyle:"solid",strokeWidth:2,strokeStyle:"solid",roughness:1,opacity:100,groupIds:null,frameId:null,index:null,roundness:null,seed,versionNonce:seed,isDeleted:false,boundElements:null,updated:Date.now(),link:null,locked:false} as const;if(type==="arrow"||type==="line")return {...base,type,points:[[0,0],[w,h]],startBinding:null,endBinding:null,startArrowhead:type==="arrow"?null:null,endArrowhead:type==="arrow"?"arrow":null} as Element;if(type==="text")return {...base,type,width:Math.max(w,80),height:28,fontSize:20,fontFamily:1,text:overrides?.text??"",textAlign:"center",verticalAlign:"middle",containerId:overrides?.containerId??null,originalText:overrides?.text??"",lineHeight:1.2,baseline:20} as Element;return {...base,type} as Element};

/**
 * Compute the bbox of a text element that sits inside a non-text container
 * (rectangle / ellipse / diamond). The bbox is centered horizontally and
 * vertically, with a small inset so the text doesn't kiss the stroke.
 *
 * `opts.height` lets callers (LayoutPanel silentAutoFix) override the
 * auto-derived height — used when a multi-line wrap grows the text.
 */
export const containerTextFor=(container:Element, opts?:{height?:number}):{x:number;y:number;width:number;height:number}=>{
  const padX=8;
  const padY=6;
  const width=Math.max(40,container.width-padX*2);
  const autoH=Math.min(container.height-padY*2,Math.max(20,Math.round(container.height*0.5)));
  const height=opts?.height??autoH;
  return {x:container.x+padX,y:container.y+(container.height-height)/2,width,height};
};

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
    // Atomic: one history entry for both insertions so a single Undo reverses them.
    // Text is inserted BEFORE the container so the container outline renders on top.
    // The container is already in the scene (caller created it via createElement);
    // we mutate its boundElements in place and splice the text in at the
    // container's position so the array order is [text, container, ...rest].
    createContainerTextPair:(container,text)=>{snapshot();const bound=[{id:text.id,type:"text"}];const ci=scene.elements.findIndex(e=>e.id===container.id);if(ci>=0){const cur=scene.elements[ci];scene.elements[ci]={...cur,boundElements:[...(cur.boundElements??[]),...bound]} as Element;scene.elements=[...scene.elements.slice(0,ci),text,...scene.elements.slice(ci)];}else{const linked={...container,boundElements:[...(container.boundElements??[]),...bound]} as Element;scene.elements=[...scene.elements,text,linked];}persist()},
    undo:()=>{if(!history.length)return false;redoStack.push(structuredClone(scene));restore(history.pop()!);return true},
    redo:()=>{if(!redoStack.length)return false;history.push(structuredClone(scene));restore(redoStack.pop()!);return true},
    canUndo:()=>history.length>0,
    canRedo:()=>redoStack.length>0,
  };
};
