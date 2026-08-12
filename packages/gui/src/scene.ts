import type {Element, ExcalidrawScene, Point} from "@archidraw/schema";
export type Tool="select"|"rectangle"|"ellipse"|"diamond"|"arrow"|"line"|"text"|"erase";
export type ElementPatch=Partial<Element> & Record<string, unknown>;
export interface SceneStore {getScene():ExcalidrawScene; queryElements():Element[]; updateElement(id:string, updates:ElementPatch):void; deleteElement(id:string):void; createElement(element:Element):void; undo():boolean; redo():boolean; canUndo():boolean; canRedo():boolean}
const KEY="archidraw:scene";
export const emptyScene=():ExcalidrawScene=>({type:"excalidraw",version:2,source:"archidraw",elements:[],appState:{},files:{}});
export const loadScene=():ExcalidrawScene=>{try{const raw=localStorage.getItem(KEY);if(raw){const parsed=JSON.parse(raw);if(parsed?.type==="excalidraw"&&Array.isArray(parsed.elements))return parsed}}catch{}return emptyScene()};
export const saveScene=(scene:ExcalidrawScene)=>{try{localStorage.setItem(KEY,JSON.stringify(scene))}catch{}};
export const pointInElement=(element:Element,x:number,y:number,tolerance=8)=>{const left=Math.min(element.x,element.x+element.width)-tolerance;const top=Math.min(element.y,element.y+element.height)-tolerance;const right=Math.max(element.x,element.x+element.width)+tolerance;const bottom=Math.max(element.y,element.y+element.height)+tolerance;if(element.type!=="arrow"&&element.type!=="line")return x>=left&&x<=right&&y>=top&&y<=bottom;const points=element.points.map(([px,py])=>[element.x+px,element.y+py] as Point);return points.some(([px,py])=>Math.hypot(x-px,y-py)<=tolerance)||points.slice(1).some(([a,b],i)=>{const [c,d]=points[i];const len=Math.hypot(a-c,b-d)||1;return Math.abs((b-d)*x-(a-c)*y+a*d-b*c)/len<=tolerance&&x>=Math.min(a,c)-tolerance&&x<=Math.max(a,c)+tolerance&&y>=Math.min(b,d)-tolerance&&y<=Math.max(b,d)+tolerance})};
export const makeElement=(type:Exclude<Tool,"select"|"erase">,x:number,y:number,w:number,h:number,seed=Date.now()):Element=>{const base={id:crypto.randomUUID(),type,x,y,width:w,height:h,angle:0,strokeColor:"#1f2937",backgroundColor:"transparent",fillStyle:"solid",strokeWidth:2,strokeStyle:"solid",roughness:1,opacity:100,groupIds:null,frameId:null,index:null,roundness:null,seed,versionNonce:seed,isDeleted:false,boundElements:null,updated:Date.now(),link:null,locked:false} as const;if(type==="arrow"||type==="line")return {...base,type,points:[[0,0],[w,h]],startBinding:null,endBinding:null,startArrowhead:type==="arrow"?null:null,endArrowhead:type==="arrow"?"arrow":null} as Element;if(type==="text")return {...base,type,width:Math.max(w,80),height:28,fontSize:20,fontFamily:1,text:"Text",textAlign:"left",verticalAlign:"top",containerId:null,originalText:"Text",lineHeight:1.2,baseline:20} as Element;return {...base,type} as Element};
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
    queryElements:()=>scene.elements.filter(e=>!e.isDeleted),
    updateElement:(id,updates)=>{snapshot();const i=scene.elements.findIndex(e=>e.id===id);if(i>=0)scene.elements[i]={...scene.elements[i],...updates,id:scene.elements[i].id} as Element;persist()},
    deleteElement:id=>{snapshot();scene.elements=scene.elements.filter(e=>e.id!==id);persist()},
    createElement:element=>{snapshot();scene.elements=[...scene.elements,element];persist()},
    undo:()=>{if(!history.length)return false;redoStack.push(structuredClone(scene));restore(history.pop()!);return true},
    redo:()=>{if(!redoStack.length)return false;history.push(structuredClone(scene));restore(redoStack.pop()!);return true},
    canUndo:()=>history.length>0,
    canRedo:()=>redoStack.length>0,
  };
};
