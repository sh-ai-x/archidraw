import {useEffect,useRef,useState} from "react";
import type {Element} from "@archidraw/schema";
import {makeElement,pointInElement,type SceneStore,type Tool} from "./scene";
import {renderScene} from "./Renderer";
export function Canvas({store,tool,setTool}:{store:SceneStore;tool:Tool;setTool:(tool:Tool)=>void}){const ref=useRef<HTMLCanvasElement>(null);const [zoom,setZoom]=useState(1);const [pan,setPan]=useState({x:0,y:0});const [selected,setSelected]=useState<string|null>(null);
  const [hovering,setHovering]=useState(false);
  const [marquee,setMarquee]=useState<{x1:number;y1:number;x2:number;y2:number}|null>(null);const drag=useRef<{x:number;y:number;id?:string;start?:Element;space?:boolean;gesture:"none"|"drag-element"|"pan-marquee"}|null>(null);
  // Pointer-down start position; threshold-based gesture discrimination (Excalidraw pattern).
  const pointerDownPos=useRef<{x:number;y:number;hit:Element|null}|null>(null);
  const DRAGGING_THRESHOLD=3;const elements=store.queryElements();useEffect(()=>{const c=ref.current;if(!c)return;const resize=()=>{c.width=c.clientWidth*devicePixelRatio;c.height=c.clientHeight*devicePixelRatio;renderScene(c,elements,zoom,pan,selected,marquee)};resize();window.addEventListener("resize",resize);return()=>window.removeEventListener("resize",resize)},[elements,zoom,pan,selected,marquee]);useEffect(()=>{const onKey=(e:KeyboardEvent)=>{const map:{[key:string]:Tool}={h:"hand",v:"select",r:"rectangle",d:"diamond",o:"ellipse",a:"arrow",l:"line",t:"text",p:"freedraw"};if(map[e.key.toLowerCase()])setTool(map[e.key.toLowerCase()]);
      if(e.key==="Escape"){setSelected(null);if(tool!=="select")setTool("select");return}
      if(e.key==="Delete"||e.key==="Backspace"){e.preventDefault();const ids=multiSel.length?multiSel:(selected?[selected]:[]);ids.forEach(id=>store.deleteElement(id));if(ids.length){setSelected(null);setMultiSel([])}}
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"){e.preventDefault();if(e.shiftKey){if(store.redo()){setSelected(null);setMultiSel([])}}else{if(store.undo()){setSelected(null);setMultiSel([])}}}
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="y"){e.preventDefault();if(store.redo()){setSelected(null);setMultiSel([])}}
      if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&e.key.toLowerCase()==="a"){e.preventDefault();setMultiSel(elements.map(e=>e.id));setSelected(null)}
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="d"){e.preventDefault();multiSel.forEach(id=>{const el=elements.find(x=>x.id===id);if(el)store.createElement({...el,id:crypto.randomUUID()})});selected&&store.createElement({...elements.find(x=>x.id===selected)!,id:crypto.randomUUID()})}};window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey)},[selected,multiSel,store,setTool,setMultiSel,setMarquee,elements]);const world=(e:React.PointerEvent)=>{const r=ref.current!.getBoundingClientRect();return {x:(e.clientX-r.left-pan.x)/zoom,y:(e.clientY-r.top-pan.y)/zoom}};return <canvas ref={ref} data-testid="canvas" className={"canvas tool-"+tool+(drag.current?" dragging":"")+(tool==="select"&&hovering?" hovering":"")} onDoubleClick={e=>{const p=world(e);if(tool!=="select")return;const hit=[...elements].reverse().find(el=>el.type==="text"&&pointInElement(el,p.x,p.y,8));if(hit){const next=window.prompt("Edit text:",String((hit as any).text||""));if(next!==null&&next.trim()!=="")store.updateElement(hit.id,{text:next,originalText:next} as any)}}} onWheel={e=>{e.preventDefault();setZoom(z=>Math.max(.1,Math.min(8,z*(e.deltaY<0?1.1:.9))))}} onPointerDown={e=>{
        const p=world(e);
        // Middle-mouse OR Space-held → start a pan gesture (works regardless of tool).
        if(e.button===1||e.getModifierState("Space")||tool==="hand"){
          // Hand tool / middle-mouse / Space → pan immediately, no threshold.
          drag.current={...p,space:true,gesture:"none"};
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          return;
        }
        if(tool==="select"){
          // Record start position. We commit to drag-element vs marquee only
          // once movement exceeds DRAGGING_THRESHOLD (3px) to avoid the
          // classic Excalidraw bug: a tiny mouse jitter between pointerdown
          // and pointerup re-interprets the gesture as a new click.
          const hit=[...elements].reverse().find(el=>pointInElement(el,p.x,p.y,8));
          setSelected(hit?.id??null);
          pointerDownPos.current={x:p.x,y:p.y,hit:hit??null};
          drag.current=null; // do NOT commit yet
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
        setHovering(false);
      }} onPointerMove={e=>{
        // Stale-event guard: if no buttons are pressed, this is a stray
        // pointermove (e.g. from trackpad release jitter). Clean up and bail.
        if(e.buttons===0){
          drag.current=null;
          pointerDownPos.current=null;
          setMarquee(null);
          setHovering(false);
          return;
        }
        const pHover=world(e);
        // Threshold-based gesture commit (Excalidraw pattern).
        // If we have a pending pointerDownPos but no committed drag, check distance.
        if(pointerDownPos.current&&!drag.current){
          const ddx=pHover.x-pointerDownPos.current.x;
          const ddy=pHover.y-pointerDownPos.current.y;
          if(Math.hypot(ddx,ddy)>=DRAGGING_THRESHOLD){
            if(pointerDownPos.current.hit){
              drag.current={x:pointerDownPos.current.x,y:pointerDownPos.current.y,id:pointerDownPos.current.hit.id,start:pointerDownPos.current.hit,space:false};
            } else {
              setMarquee({x1:pointerDownPos.current.x,y1:pointerDownPos.current.y,x2:pHover.x,y2:pHover.y});
              setMultiSel([]);
            }
            pointerDownPos.current=null;
          } else {
            // Below threshold — hover only.
            const hit=[...elements].reverse().find(el=>pointInElement(el,pHover.x,pHover.y,8));
            setHovering(!!hit);
            return;
          }
        }
        // Marquee selection in progress — update its rectangle.
        if(marquee){
          setMarquee(m=>m?{...m,x2:pHover.x,y2:pHover.y}:null);
          setHovering(false);
          return;
        }
        // Hover detection: drives grab/grabbing cursor when in select tool.
        if(!drag.current){
          const hit=[...elements].reverse().find(el=>pointInElement(el,pHover.x,pHover.y,8));
          setHovering(!!hit);
          return;
        }
        const p=pHover;
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
        } else if(tool==="arrow"||tool==="line"){
          store.updateElement(id,{points:[[0,0],[d.x,d.y]] as any});
        } else {
          store.updateElement(id,{width:d.x,height:d.y});
        }
      }} onPointerCancel={e=>{drag.current=null;setMarquee(null);setHovering(false);pointerDownPos.current=null;try{(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)}catch{}}}
        onPointerUp={e=>{try{(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)}catch{};if(marquee){const left=Math.min(marquee.x1,marquee.x2)-4;const right=Math.max(marquee.x1,marquee.x2)+4;const top=Math.min(marquee.y1,marquee.y2)-4;const bottom=Math.max(marquee.y1,marquee.y2)+4;const hits=elements.filter(el=>{const elLeft=Math.min(el.x,el.x+el.width);const elRight=Math.max(el.x,el.x+el.width);const elTop=Math.min(el.y,el.y+el.height);const elBottom=Math.max(el.y,el.y+el.height);return elLeft>=left&&elRight<=right&&elTop>=top&&elBottom<=bottom;}).map(el=>el.id);setMultiSel(hits);setSelected(hits[hits.length-1]??null);setMarquee(null);setHovering(false)}else if(pointerDownPos.current&&!drag.current){const stillHit=pointerDownPos.current.hit;setSelected(stillHit?.id??null)};drag.current=null;pointerDownPos.current=null}}/>}
