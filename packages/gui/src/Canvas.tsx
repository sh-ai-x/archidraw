import {useEffect,useRef,useState} from "react";
import type {Element} from "@archidraw/schema";
import {clampCanvasBackingStore,makeElement,MAX_CANVAS_DIM,pointInElement,type SceneStore,type Tool} from "./scene";
import {renderScene} from "./Renderer";
import {boundingBoxFromElements} from "./tabs-state";

type ResizeHandle = "nw"|"ne"|"sw"|"se";
const MIN_SIZE = 4;
const HANDLE_PX = 8;

export function Canvas({store,tool,setTool}:{store:SceneStore;tool:Tool;setTool:(tool:Tool)=>void}){
  const ref=useRef<HTMLCanvasElement>(null);
  const [zoom,setZoom]=useState(1);
  const [pan,setPan]=useState({x:0,y:0});
  const [selected,setSelected]=useState<string|null>(null);
  const [hovering,setHovering]=useState(false);
  const [marquee,setMarquee]=useState<{x1:number;y1:number;x2:number;y2:number}|null>(null);
  const [multiSel,setMultiSel]=useState<string[]>([]);
  const drag=useRef<{x:number;y:number;id?:string;start?:Element;space?:boolean;gesture:"none"|"drag-element"|"resize";handle?:ResizeHandle}|null>(null);
  const pointerDownPos=useRef<{x:number;y:number;hit:Element|null}|null>(null);
  const DRAGGING_THRESHOLD=3;
  const elements=store.queryElements();
  const bbox=boundingBoxFromElements(elements);
  // A06 review: cap canvas size to prevent unbounded allocation if bbox is huge
  // (e.g. tampered localStorage with attacker-controllable coordinates).
  const cssW=Math.min(Math.max(bbox.w,800), MAX_CANVAS_DIM);
  const cssH=Math.min(Math.max(bbox.h,600), MAX_CANVAS_DIM);

  // 1. render whenever scene/zoom/pan/selection changes
  useEffect(()=>{
    const c=ref.current;
    if(!c)return;
    const resize=()=>{
      // Cap the BACKING STORE (cssW*dpr) so a 3x-DPR display can't blow
      // past MAX_DIM. cssW/cssH are already <= MAX_DIM, so a HiDPI display
      // just gets cssW/cssH clipped to MAX_DIM/devicePixelRatio to honor
      // the cap on the GPU allocation. See clampCanvasBackingStore for
      // the A06 backing-store DoS class this closes.
      const dpr = window.devicePixelRatio || 1;
      const {w, h} = clampCanvasBackingStore({cssW, cssH, maxDim: MAX_CANVAS_DIM, dpr});
      c.width=Math.round(w*dpr);
      c.height=Math.round(h*dpr);
      renderScene(c,elements,zoom,pan,selected,marquee,multiSel);
    };
    resize();
    window.addEventListener("resize",resize);
    return()=>window.removeEventListener("resize",resize);
  },[elements,zoom,pan,selected,marquee,multiSel,cssW,cssH]);

  // 2. keyboard shortcuts
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      // Skip when typing in any text input/textarea/contenteditable so we don't
      // intercept Backspace/Delete/tool-shortcuts while editing tab names etc.
      const t=e.target as HTMLElement|null;
      if(t&&(t.tagName==="INPUT"||t.tagName==="TEXTAREA"||t.isContentEditable))return;
      const map:{[key:string]:Tool}={h:"hand",v:"select",r:"rectangle",d:"diamond",o:"ellipse",a:"arrow",l:"line",t:"text"};
      if(map[e.key.toLowerCase()])setTool(map[e.key.toLowerCase()]);
      if(e.key==="Escape"){setSelected(null);setMultiSel([]);if(tool!=="select")setTool("select");return}
      if(e.key==="Delete"||e.key==="Backspace"){
        e.preventDefault();
        const ids=multiSel.length?multiSel:(selected?[selected]:[]);
        ids.forEach(id=>store.deleteElement(id));
        if(ids.length){setSelected(null);setMultiSel([])}
      }
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"){
        e.preventDefault();
        if(e.shiftKey){if(store.redo()){setSelected(null);setMultiSel([])}}
        else{if(store.undo()){setSelected(null);setMultiSel([])}}
      }
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="y"){
        e.preventDefault();
        if(store.redo()){setSelected(null);setMultiSel([])}
      }
      if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&e.key.toLowerCase()==="a"){
        e.preventDefault();
        setMultiSel(elements.map(e=>e.id));
        setSelected(null);
      }
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="d"){
        e.preventDefault();
        multiSel.forEach(id=>{const el=elements.find(x=>x.id===id);if(el)store.createElement({...el,id:crypto.randomUUID()})});
        selected&&store.createElement({...elements.find(x=>x.id===selected)!,id:crypto.randomUUID()});
      }
    };
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[selected,multiSel,store,setTool,elements]);

  // 3. world coords (subtract pan; pan is 0 in normal scroll mode but kept for hand-tool offset)
  const world=(e:React.PointerEvent)=>{
    const r=ref.current!.getBoundingClientRect();
    return{x:(e.clientX-r.left-pan.x)/zoom,y:(e.clientY-r.top-pan.y)/zoom};
  };

  // 4. handle hit-test: find topmost shape whose corner-handle sits at p.
  //    Independent of `selected` — works on first click after the user draws.
  const hitTestHandle=(p:{x:number;y:number}):{handle:ResizeHandle;target:Element} | null => {
    const hs=HANDLE_PX/zoom;
    const PAD=6; // matches Renderer.ts
    for(let i=elements.length-1;i>=0;i--){
      const el=elements[i];
      if(el.isDeleted) continue;
      if(el.type!=="rectangle"&&el.type!=="diamond"&&el.type!=="ellipse") continue;
      const left=el.x, top=el.y, right=el.x+(el.width||0), bottom=el.y+(el.height||0);
      const corners:Array<{h:ResizeHandle;cx:number;cy:number}>=[
        {h:"nw",cx:left-PAD,cy:top-PAD},
        {h:"ne",cx:right+PAD-hs,cy:top-PAD},
        {h:"sw",cx:left-PAD,cy:bottom+PAD-hs},
        {h:"se",cx:right+PAD-hs,cy:bottom+PAD-hs},
      ];
      const c=corners.find(c=>p.x>=c.cx&&p.x<=c.cx+hs&&p.y>=c.cy&&p.y<=c.cy+hs);
      if(c) return {handle:c.h, target:el};
    }
    return null;
  };

  return <canvas
    ref={ref}
    data-testid="canvas"
    width={Math.round(cssW*devicePixelRatio)}
    height={Math.round(cssH*devicePixelRatio)}
    style={{width:cssW+"px",height:cssH+"px",display:"block"}}
    className={"canvas tool-"+tool+(drag.current?" dragging":"")+(tool==="select"&&hovering?" hovering":"")}
    onDoubleClick={e=>{
      const p=world(e as unknown as React.PointerEvent);
      if(tool!=="select")return;
      const textHit=[...elements].reverse().find(el=>el.type==="text"&&pointInElement(el,p.x,p.y,8));
      if(textHit){
        const next=window.prompt("Edit text:",String((textHit as any).text||""));
        if(next!==null&&next.trim()!=="")store.updateElement(textHit.id,{text:next,originalText:next} as any);
        return;
      }
      // Double-click on a shape → create or update a text element bound
      // to that shape (Excalidraw-style "text inside rectangle"). The
      // renderer's containerId branch wraps + flushes the text to the
      // shape's bounds with no left padding, so the user types once
      // and the text fills the shape evenly.
      const shapeHit=[...elements].reverse().find(el=>(el.type==="rectangle"||el.type==="diamond"||el.type==="ellipse")&&pointInElement(el,p.x,p.y,8));
      if(shapeHit){
        const content=window.prompt("Text:",String((shapeHit as any).text||""));
        if(content===null)return;
        const id=(typeof crypto!=="undefined"&&typeof crypto.randomUUID==="function"
          ?crypto.randomUUID()
          :Math.random().toString(36).slice(2));
        // F02 review (2026-08-20): re-double-clicking an already-text-bound
        // shape must UPDATE the existing bound text, not create a fresh
        // element. Without this, repeated double-clicks accumulated orphan
        // text elements (each createElement pushes a new entry onto the
        // scene). Filter for the existing bound text and route through
        // updateElement when present.
        // F03 review (2026-08-20): filter for non-text bindings to
        // PRESERVE arrow / container bindings when writing back — the
        // previous `b.type === "text"` filter silently severed the
        // bidirectional binding contract.
        // F06 review (2026-08-20): guard against malformed boundElements
        // items (`[null]` / `[{}]` bypasses assertSceneShape's structural
        // check). The `b && typeof b === "object"` predicate matches
        // Excalidraw's own validator shape.
        const curTextBound = (shapeHit.boundElements || []).find(
          (b: any) => b && typeof b === "object" && b.type === "text"
        );
        if (curTextBound) {
          store.updateElement(curTextBound.id, {text: content, originalText: content} as any);
          setSelected(curTextBound.id);
          setTool("select");
          return;
        }
        const nonTextBound = (shapeHit.boundElements || []).filter(
          (b: any) => b && typeof b === "object" && b.type !== "text"
        );
        // Place the text element's own bounds at the shape's bounds so the
        // legacy non-container code path is a no-op fallback. The renderer
        // ignores these when containerId is set. Defaults are forced to
        // (textAlign=left, verticalAlign=top) so the text starts at the
        // shape's top-left corner with no left-bias — the renderer wraps
        // long text down from there.
        const txt:any={
          ...makeElement("text",shapeHit.x,shapeHit.y,shapeHit.width,shapeHit.height),
          id,
          text:content,
          originalText:content,
          containerId:shapeHit.id,
          width:shapeHit.width,
          height:shapeHit.height,
          textAlign:"left",
          verticalAlign:"top",
        };
        // Mark the shape as having a bound text element (Excalidraw-style).
        store.updateElement(shapeHit.id,{boundElements:[...nonTextBound,{id,type:"text"}]});
        store.createElement(txt);
        setSelected(id);
        setTool("select");
      }
    }}
    onWheel={e=>{
      if(e.ctrlKey||e.metaKey){
        e.preventDefault();
        setZoom(z=>Math.max(.1,Math.min(8,z*(e.deltaY<0?1.1:.9))));
        return;
      }
      // Plain wheel scrolls the wrapper
      const wrap=ref.current?.parentElement;
      if(wrap){wrap.scrollLeft+=e.deltaX;wrap.scrollTop+=e.deltaY;}
    }}
    onPointerDown={e=>{
      const p=world(e);
      // pan (middle / Space / hand tool) — scrolls the wrapper
      if(e.button===1||(e.getModifierState as (k:string)=>boolean)("Space")||tool==="hand"){
        drag.current={...p,space:true,gesture:"none"};
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }
      if(tool==="select"){
        // 1) resize-handle hit-test (works even before user has selected anything)
        const handleHit=hitTestHandle(p);
        if(handleHit){
          drag.current={x:p.x,y:p.y,id:handleHit.target.id,start:handleHit.target,space:false,gesture:"resize",handle:handleHit.handle};
          setSelected(handleHit.target.id);
          pointerDownPos.current=null;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          return;
        }
        // 2) regular element hit-test
        const hit=[...elements].reverse().find(el=>pointInElement(el,p.x,p.y,8));
        setSelected(hit?.id??null);
        setMultiSel([]);
        pointerDownPos.current={x:p.x,y:p.y,hit:hit??null};
        drag.current=null; // do NOT commit yet (threshold-based)
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }
      if(tool==="text"){
        const content=window.prompt("Text:","");
        if(content===null||content.trim()==="")return;
        // If the click landed inside a rectangle/diamond/ellipse, bind the
        // text to that shape — Excalidraw-style "text in shape". The
        // renderer then flushes it to the shape's top-left with a
        // symmetric 4px inset and word-wraps to the inner width, so the
        // text fills the shape from the left edge regardless of WHERE in
        // the shape the user clicked. Without this auto-bind, a click in
        // the middle of a shape created a standalone text element that
        // appeared at the click point (visually biased right inside the
        // shape's frame), which the user reports as "pushed right".
        const shapeHit=[...elements].reverse().find(el=>(el.type==="rectangle"||el.type==="diamond"||el.type==="ellipse")&&pointInElement(el,p.x,p.y,8));
        if(shapeHit){
          const id=(typeof crypto!=="undefined"&&typeof crypto.randomUUID==="function"
            ?crypto.randomUUID()
            :Math.random().toString(36).slice(2));
          const txt:any={
            ...makeElement("text",shapeHit.x,shapeHit.y,shapeHit.width,shapeHit.height),
            id,
            text:content,
            originalText:content,
            containerId:shapeHit.id,
            width:shapeHit.width,
            height:shapeHit.height,
            textAlign:"left",
            verticalAlign:"top",
          };
          const curTextBound = (shapeHit.boundElements || []).find(
            (b: any) => b && typeof b === "object" && b.type === "text"
          );
          if (curTextBound) {
            store.updateElement(curTextBound.id, {text: content, originalText: content} as any);
            setSelected(curTextBound.id);
            setTool("select");
            return;
          }
          const nonTextBound = (shapeHit.boundElements || []).filter(
            (b: any) => b && typeof b === "object" && b.type !== "text"
          );
          store.updateElement(shapeHit.id,{boundElements:[...nonTextBound,{id,type:"text"}]});
          store.createElement(txt);
          setSelected(id);
          setTool("select");
          return;
        }
        // No shape under the click — fall back to standalone text at the
        // click point. Renderer still defaults to (textAlign=left,
        // verticalAlign=top) so the text flushes to its own x, y.
        const el=makeElement("text",p.x,p.y,Math.max(content.length*12,80),28);
        (el as any).text=content;(el as any).originalText=content;
        store.createElement(el);setSelected(el.id);setTool("select");
        return;
      }
      if(tool==="erase"){
        const hit=[...elements].reverse().find(el=>pointInElement(el,p.x,p.y,8));
        if(hit)store.deleteElement(hit.id);
        return;
      }
      const el=makeElement(tool,p.x,p.y,1,1);
      store.createElement(el);setSelected(el.id);
      drag.current={...p,id:el.id,start:el,gesture:"drag-element"};
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setHovering(false);
    }}
    onPointerMove={e=>{
      if(e.buttons===0){
        drag.current=null;pointerDownPos.current=null;setMarquee(null);setHovering(false);
        return;
      }
      const pHover=world(e);
      // threshold-based gesture commit
      if(pointerDownPos.current&&!drag.current){
        const ddx=pHover.x-pointerDownPos.current.x;
        const ddy=pHover.y-pointerDownPos.current.y;
        if(Math.hypot(ddx,ddy)>=DRAGGING_THRESHOLD){
          if(pointerDownPos.current.hit){
            drag.current={x:pointerDownPos.current.x,y:pointerDownPos.current.y,id:pointerDownPos.current.hit.id,start:pointerDownPos.current.hit,space:false,gesture:"drag-element"};
          } else {
            setMarquee({x1:pointerDownPos.current.x,y1:pointerDownPos.current.y,x2:pHover.x,y2:pHover.y});
            setMultiSel([]);
          }
          pointerDownPos.current=null;
        } else {
          const hit=[...elements].reverse().find(el=>pointInElement(el,pHover.x,pHover.y,8));
          setHovering(!!hit);
          return;
        }
      }
      if(marquee){setMarquee(m=>m?{...m,x2:pHover.x,y2:pHover.y}:null);setHovering(false);return;}
      if(!drag.current){
        const hit=[...elements].reverse().find(el=>pointInElement(el,pHover.x,pHover.y,8));
        setHovering(!!hit);
        return;
      }
      const p=pHover;
      const d={x:p.x-drag.current.x,y:p.y-drag.current.y};
      if(drag.current.space){
        const wrap=ref.current?.parentElement;
        if(wrap){wrap.scrollLeft-=d.x*zoom;wrap.scrollTop-=d.y*zoom;}
        drag.current={...p,space:true,gesture:"none"};
        return;
      }
      const id=drag.current.id;
      if(!id)return;
      const start=drag.current.start;
      if(!start)return;
      // RESIZE gesture
      if(drag.current.gesture==="resize"){
        const handle=drag.current.handle!;
        let nx=start.x,ny=start.y,nw=start.width,nh=start.height;
        if(handle==="nw"){nw=start.width-d.x;nh=start.height-d.y;nx=start.x+d.x;ny=start.y+d.y;}
        else if(handle==="ne"){nw=start.width+d.x;nh=start.height-d.y;ny=start.y+d.y;}
        else if(handle==="sw"){nw=start.width-d.x;nh=start.height+d.y;nx=start.x+d.x;}
        else if(handle==="se"){nw=start.width+d.x;nh=start.height+d.y;}
        if(nw<MIN_SIZE){nw=MIN_SIZE;if(handle==="nw"||handle==="sw")nx=start.x+start.width-MIN_SIZE;}
        if(nh<MIN_SIZE){nh=MIN_SIZE;if(handle==="nw"||handle==="ne")ny=start.y+start.height-MIN_SIZE;}
        store.updateElement(id,{x:nx,y:ny,width:nw,height:nh});
        return;
      }
      if(tool==="select"){
        store.updateElement(id,{x:start.x+d.x,y:start.y+d.y});
      } else if(tool==="arrow"||tool==="line"){
        store.updateElement(id,{points:[[0,0],[d.x,d.y]] as any});
      } else {
        store.updateElement(id,{width:d.x,height:d.y});
      }
    }}
    onPointerCancel={()=>{drag.current=null;setMarquee(null);setHovering(false);pointerDownPos.current=null;}}
    onPointerUp={e=>{
      try{(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)}catch{};
      if(marquee){
        const left=Math.min(marquee.x1,marquee.x2)-4;
        const right=Math.max(marquee.x1,marquee.x2)+4;
        const top=Math.min(marquee.y1,marquee.y2)-4;
        const bottom=Math.max(marquee.y1,marquee.y2)+4;
        const hits=elements.filter(el=>{
          const elLeft=Math.min(el.x,el.x+el.width);
          const elRight=Math.max(el.x,el.x+el.width);
          const elTop=Math.min(el.y,el.y+el.height);
          const elBottom=Math.max(el.y,el.y+el.height);
          return elLeft>=left&&elRight<=right&&elTop>=top&&elBottom<=bottom;
        }).map(el=>el.id);
        setMultiSel(hits);setSelected(hits[hits.length-1]??null);setMarquee(null);setHovering(false);
      } else if(pointerDownPos.current&&!drag.current){
        const stillHit=pointerDownPos.current.hit;
        setSelected(stillHit?.id??null);
      }
      drag.current=null;pointerDownPos.current=null;
    }}
  />;
}
