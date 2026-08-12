import {useEffect,useRef,useState} from "react";
import type {Element} from "@archidraw/schema";
import {makeElement,pointInElement,type SceneStore,type Tool} from "./scene";
import {renderScene} from "./Renderer";
export function Canvas({store,tool,setTool}:{store:SceneStore;tool:Tool;setTool:(tool:Tool)=>void}){const ref=useRef<HTMLCanvasElement>(null);const [zoom,setZoom]=useState(1);const [pan,setPan]=useState({x:0,y:0});const [selected,setSelected]=useState<string|null>(null);const drag=useRef<{x:number;y:number;id?:string;start?:Element;space?:boolean}|null>(null);const elements=store.queryElements();useEffect(()=>{const c=ref.current;if(!c)return;const resize=()=>{c.width=c.clientWidth*devicePixelRatio;c.height=c.clientHeight*devicePixelRatio;renderScene(c,elements,zoom,pan,selected)};resize();window.addEventListener("resize",resize);return()=>window.removeEventListener("resize",resize)},[elements,zoom,pan,selected]);useEffect(()=>{const onKey=(e:KeyboardEvent)=>{const map:{[key:string]:Tool}={v:"select",r:"rectangle",o:"ellipse",a:"arrow",t:"text",p:"freedraw"};if(map[e.key.toLowerCase()])setTool(map[e.key.toLowerCase()]);
      if((e.key==="Delete"||e.key==="Backspace")&&selected){store.deleteElement(selected);setSelected(null)}
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"){
        e.preventDefault();
        if(e.shiftKey){if(store.redo())setSelected(null)}
        else{if(store.undo())setSelected(null)}
      }
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="y"){
        e.preventDefault();
        if(store.redo())setSelected(null)
      }};window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey)},[selected,store,setTool]);const world=(e:React.PointerEvent)=>{const r=ref.current!.getBoundingClientRect();return {x:(e.clientX-r.left-pan.x)/zoom,y:(e.clientY-r.top-pan.y)/zoom}};return <canvas ref={ref} data-testid="canvas" className="canvas" onWheel={e=>{e.preventDefault();setZoom(z=>Math.max(.1,Math.min(8,z*(e.deltaY<0?1.1:.9))))}} onPointerDown={e=>{
        const p=world(e);
        // Middle-mouse OR Space-held → start a pan gesture (works regardless of tool).
        if(e.button===1||e.getModifierState("Space")){
          drag.current={...p,space:true};
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          return;
        }
        if(tool==="select"){
          // Hit-test against existing elements; tolerate 8px outside bounds.
          const hit=[...elements].reverse().find(el=>pointInElement(el,p.x,p.y,8));
          setSelected(hit?.id??null);
          if(hit)drag.current={...p,id:hit.id,start:hit};
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          return;
        }
        if(tool==="text"){
          // Prompt for text content. Cancel/Escape = no element created.
          const content=window.prompt("Text:","");
          if(content===null||content.trim()==="")return;
          const el=makeElement("text",p.x,p.y,Math.max(content.length*12,80),28);
          (el as any).text=content;
          (el as any).originalText=content;
          store.createElement(el);
          setSelected(el.id);
          setTool("select");
          return;
        }
        if(tool==="erase"){
          const hit=[...elements].reverse().find(el=>pointInElement(el,p.x,p.y,8));
          if(hit)store.deleteElement(hit.id);
          return;
        }
        // Default: rectangle/ellipse/diamond → drag-to-resize from 1×1 seed.
        const el=makeElement(tool,p.x,p.y,1,1);
        store.createElement(el);
        setSelected(el.id);
        drag.current={...p,id:el.id,start:el};
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }} onPointerMove={e=>{
        if(!drag.current)return;
        const p=world(e);
        const d={x:p.x-drag.current.x,y:p.y-drag.current.y};
        if(drag.current.space){setPan(v=>({x:v.x+d.x*zoom,y:v.y+d.y*zoom}));drag.current={...p,space:true};return}
        const id=drag.current.id;
        if(!id)return;
        const start=drag.current.start;
        if(!start)return;
        if(tool==="select"){
          // Drag to move: use absolute world position so the element follows the cursor exactly.
          // Avoids cumulative drift from delta accumulation when the user moves slowly.
          const dx=start.x-(drag.current.x-d.x),dy=start.y-(drag.current.y-d.y);
          store.updateElement(id,{x:start.x+d.x,y:start.y+d.y});
        } else if(tool==="freedraw"){
          // Accumulate world-space points relative to element origin so perfect-freehand can render.
          const px=p.x-start.x, py=p.y-start.y;
          const existing=(start.type==="freedraw"?start.points:[])as Array<[number,number]>;
          const last=existing[existing.length-1];
          // Skip near-duplicate points (within 2px) so the stroke isn't 1000 segments of jitter.
          if(!last||Math.hypot(px-last[0],py-last[1])>2){
            store.updateElement(id,{points:[...existing,[px,py]] as any});
          }
        } else if(tool==="arrow"||tool==="line"){
          store.updateElement(id,{points:[[0,0],[d.x,d.y]] as any});
        } else {
          store.updateElement(id,{width:d.x,height:d.y});
        }
      }} onPointerUp={()=>{drag.current=null}}/>}
