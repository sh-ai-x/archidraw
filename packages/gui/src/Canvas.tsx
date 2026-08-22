import {useEffect,useRef,useState} from "react";
import type {Element} from "@archidraw/schema";
import {bindingPointWorld,clampCanvasBackingStore,closestBindingPoint,hitBindingPoint,makeElement,MAX_CANVAS_DIM,pointInElement,type SceneStore,type Tool} from "./scene";
import {HANDLE_PAD, HANDLE_PX, HANDLE_STROKE_MARGIN, renderScene} from "./Renderer";
import {boundingBoxFromElements} from "./tabs-state";
import {useTextBinding} from "./useTextBinding";
import {ColorPanel} from "./ColorPanel";
import {commitBindingDrag, tryStartBindingDrag, type BindingDragState} from "./bindingDrag";

type ResizeHandle = "nw"|"ne"|"sw"|"se";
const MIN_SIZE = 4;

export function Canvas({store,tool,setTool}:{store:SceneStore;tool:Tool;setTool:(tool:Tool)=>void}){
  const ref=useRef<HTMLCanvasElement>(null);
  const [zoom,setZoom]=useState(1);
  const [pan,setPan]=useState({x:0,y:0});
  const [selected,setSelected]=useState<string|null>(null);
  const [hovering,setHovering]=useState(false);
  const [marquee,setMarquee]=useState<{x1:number;y1:number;x2:number;y2:number}|null>(null);
  const [multiSel,setMultiSel]=useState<string[]>([]);
  const drag=useRef<{x:number;y:number;pdownX?:number;pdownY?:number;id?:string;start?:Element;space?:boolean;gesture:"none"|"drag-element"|"resize";handle?:ResizeHandle}|null>(null);
  const pointerDownPos=useRef<{x:number;y:number;hit:Element|null}|null>(null);
  const DRAGGING_THRESHOLD=3;
  // Task E — pendingBinding tracks an in-flight arrow-tool drag anchored
  // to one shape's binding point. The other end is rubber-banded to the
  // current pointer position (pendingBindingPreview) and finalized on
  // pointerup, with another shape's binding point if the cursor is
  // within snap tolerance at that moment. The pure state-machine logic
  // (resolver / committer) lives in `bindingDrag.ts` so it can be
  // unit-tested without React; this component owns only the React-side
  // persistence (`useRef` for the captured start, `useState` for the
  // rubber-band endpoint + hover flag).
  const pendingBinding=useRef<BindingDragState|null>(null);
  const [pendingBindingPreview,setPendingBindingPreview]=useState<{x:number;y:number}|null>(null);
  const [hoverBinding,setHoverBinding]=useState(false);
  const elements=store.queryElements();
  // F10: extract the text-in-shape binding flow into useTextBinding so
  // the JSX handlers below stay one-liners and the predicate logic
  // (F02 update vs create, F03 preserve non-text bindings, F06 null
  // guard) lives in exactly one place.
  const {handleBindAt} = useTextBinding({store, elements, setSelected, setTool});
  const bbox=boundingBoxFromElements(elements);
  // A06 review: cap canvas size to prevent unbounded allocation if bbox is huge
  // (e.g. tampered localStorage with attacker-controllable coordinates).
  const cssW=Math.min(Math.max(bbox.w,800), MAX_CANVAS_DIM);
  const cssH=Math.min(Math.max(bbox.h,600), MAX_CANVAS_DIM);

  // 1. render whenever scene/zoom/pan/selection changes
  useEffect(()=>{
    const c=ref.current;
    if(!c)return;
    // A06 review round 4 (2026-08-22): coalesce renderScene calls via
    // requestAnimationFrame. Without rAF, a 250 Hz trackpad × a 5k-
    // element scene queues one full render per pointer-move event —
    // 250 renderScene calls per second sustained. rAF caps the rate
    // to the display refresh (60–120 Hz) and drops the tail when the
    // pointer produces more events than the screen can paint.
    let rafId: number | null = null;
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
      // Task E — feed the in-flight arrow-binding rubber-band into the
      // renderer so the user sees a live preview from the start binding
      // point to the cursor.
      const binding = pendingBinding.current;
      const rubber = binding && pendingBindingPreview ? {
        start: binding.startPoint,
        end: pendingBindingPreview,
      } : null;
      // Coalesce: only one render per animation frame. rAF is undefined
      // in non-browser test environments (jsdom without a paint loop);
      // fall through to the immediate render so unit tests still see
      // the paint on the same tick.
      if (typeof requestAnimationFrame === "function") {
        if (rafId !== null) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          rafId = null;
          renderScene(c,elements,zoom,pan,selected,marquee,multiSel,rubber,store.getScene().bindings);
        });
      } else {
        renderScene(c,elements,zoom,pan,selected,marquee,multiSel,rubber,store.getScene().bindings);
      }
    };
    resize();
    window.addEventListener("resize",resize);
    return()=>{
      window.removeEventListener("resize",resize);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };
  },[elements,zoom,pan,selected,marquee,multiSel,cssW,cssH,pendingBindingPreview]);

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
    // HANDLE_PAD + HANDLE_STROKE_MARGIN come from Renderer.ts — see
    // F12 review round 4. The renderer's `lineWidth = 1.5` world-unit
    // stroke extends HANDLE_STROKE_MARGIN on every side of the
    // fillRect, so the VISIBLE painted handle sits outside the fillRect
    // by exactly HANDLE_STROKE_MARGIN. Without this margin the hit-test
    // rectangle is smaller than the painted handle and clicks never
    // commit at zoom > ~1.0.
    for(let i=elements.length-1;i>=0;i--){
      const el=elements[i];
      if(el.isDeleted) continue;
      if(el.type!=="rectangle"&&el.type!=="diamond"&&el.type!=="ellipse") continue;
      const left=el.x, top=el.y, right=el.x+(el.width||0), bottom=el.y+(el.height||0);
      const corners:Array<{h:ResizeHandle;cx:number;cy:number}>=[
        {h:"nw",cx:left-HANDLE_PAD,cy:top-HANDLE_PAD},
        {h:"ne",cx:right+HANDLE_PAD-hs,cy:top-HANDLE_PAD},
        {h:"sw",cx:left-HANDLE_PAD,cy:bottom+HANDLE_PAD-hs},
        {h:"se",cx:right+HANDLE_PAD-hs,cy:bottom+HANDLE_PAD-hs},
      ];
      const c=corners.find(c=>
        p.x>=c.cx-HANDLE_STROKE_MARGIN&&p.x<=c.cx+hs+HANDLE_STROKE_MARGIN&&
        p.y>=c.cy-HANDLE_STROKE_MARGIN&&p.y<=c.cy+hs+HANDLE_STROKE_MARGIN,
      );
      if(c) return {handle:c.h, target:el};
    }
    return null;
  };

  // Derive the currently-selected element's type so the ColorPanel can decide
  // whether to render (only shapes carry a fill color).
  const selectedElement = selected ? elements.find(el => el.id === selected) : undefined;
  const selectedType = selectedElement ? selectedElement.type : null;
  const isShapeType = (t: string | null): boolean =>
    t === "rectangle" || t === "diamond" || t === "ellipse";
  return <div className="canvas-stage">
    {selected && isShapeType(selectedType) && (
      <div className="color-panel-overlay">
        <ColorPanel store={store} selectedId={selected} selectedType={selectedType} />
      </div>
    )}
    <canvas
    ref={ref}
    data-testid="canvas"
    width={Math.round(cssW*devicePixelRatio)}
    height={Math.round(cssH*devicePixelRatio)}
    style={{width:cssW+"px",height:cssH+"px",display:"block"}}
    className={"canvas tool-"+tool+(drag.current?" dragging":"")+(tool==="select"&&hovering?" hovering":"")+(tool==="arrow"&&hoverBinding?" binding-hover":"")}
    onDoubleClick={e=>{
      const p=world(e as unknown as React.PointerEvent);
      if(tool!=="select")return;
      // 1. Bound text inside a shape -> route through handleBindAt so the
      //    existing text is UPDATED (or cleared, if the user submits "").
      const shapeHit=[...elements].reverse().find(el=>
        (el.type==="rectangle"||el.type==="diamond"||el.type==="ellipse")&&
        pointInElement(el,p.x,p.y,8),
      );
      if(shapeHit){
        handleBindAt(p.x, p.y);
        return;
      }
      // 2. Standalone (non-bound) text element on canvas -> edit directly.
      //    Empty/whitespace input now CLEARs the text (was: silently preserved).
      const textHit=[...elements].reverse().find(el=>
        el.type==="text"&&!el.containerId&&pointInElement(el,p.x,p.y,8),
      );
      if(textHit){
        const next=window.prompt("Edit text:",String((textHit as any).text||""));
        if(next!==null)store.updateElement(textHit.id,{text:next,originalText:next} as any);
        return;
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
        drag.current={...p,pdownX:p.x,pdownY:p.y,space:true,gesture:"none"};
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }
      if(tool==="select"){
        // 1) resize-handle hit-test (works even before user has selected anything)
        const handleHit=hitTestHandle(p);
        if(handleHit){
          drag.current={x:p.x,y:p.y,pdownX:p.x,pdownY:p.y,id:handleHit.target.id,start:handleHit.target,space:false,gesture:"resize",handle:handleHit.handle};
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
        // F10: route through useTextBinding for the shape-hit case.
        if (handleBindAt(p.x, p.y)) return;
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
      // Task E — arrow-tool binding-point pick. The pure resolver in
      // `bindingDrag.ts::tryStartBindingDrag` does the hit-test +
      // closest-point math; the React-side `useRef` here keeps the
      // captured start across the pointermove/pointerup lifecycle.
      if (tool === "arrow") {
        const drag = tryStartBindingDrag([p.x, p.y], elements);
        if (drag) {
          pendingBinding.current = drag;
          setPendingBindingPreview({ x: p.x, y: p.y });
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          return;
        }
      }
      const el=makeElement(tool,p.x,p.y,1,1);
      store.createElement(el);setSelected(el.id);
      drag.current={...p,pdownX:p.x,pdownY:p.y,id:el.id,start:el,gesture:"drag-element"};
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setHovering(false);
    }}
    onPointerMove={e=>{
      if(e.buttons===0){
        drag.current=null;pointerDownPos.current=null;setMarquee(null);setHovering(false);
        pendingBinding.current=null;setPendingBindingPreview(null);
        return;
      }
      const pHover=world(e);
      // Task E — track the cursor while an arrow-binding drag is in
      // flight so the rubber-band stays anchored to the pointer.
      if (pendingBinding.current) {
        setPendingBindingPreview({ x: pHover.x, y: pHover.y });
        return;
      }
      // threshold-based gesture commit
      if(pointerDownPos.current&&!drag.current){
        const ddx=pHover.x-pointerDownPos.current.x;
        const ddy=pHover.y-pointerDownPos.current.y;
        if(Math.hypot(ddx,ddy)>=DRAGGING_THRESHOLD){
          if(pointerDownPos.current.hit){
            drag.current={x:pointerDownPos.current.x,y:pointerDownPos.current.y,pdownX:pointerDownPos.current.x,pdownY:pointerDownPos.current.y,id:pointerDownPos.current.hit.id,start:pointerDownPos.current.hit,space:false,gesture:"drag-element"};
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
      if(marquee){setMarquee(m=>m?{...m,x2:pHover.x,y2:pHover.y}:null);setHovering(false);setHoverBinding(false);return;}
      if(!drag.current){
        const hit=[...elements].reverse().find(el=>pointInElement(el,pHover.x,pHover.y,8));
        setHovering(!!hit);
        // Task E — show binding-snap hover state in arrow-tool mode so
        // the user can see which shape the arrow will latch onto.
        if (tool === "arrow") {
          setHoverBinding(!!hitBindingPoint(elements, pHover.x, pHover.y));
        } else {
          setHoverBinding(false);
        }
        return;
      }
      const p=pHover;
      // Two deltas:
      // - dCumulative: from the IMMUTABLE pointerdown anchor (drag.current.pdownX/Y).
      //   Used for resize / drag-element / arrow / line / draw-shape so multi-step
      //   pointer events accumulate correctly. Without this, a 50-step Playwright
      //   drag would shrink the shape because d.x would equal only the LAST step's
      //   delta, not the total.
      // - dEvent: from the last processed event (drag.current.x/y). Used for the
      //   pan branch only, where each move should pan by exactly the per-event
      //   delta and we reset drag.current = {...p} at the end of the branch.
      const dCumulative={x:p.x-(drag.current.pdownX??drag.current.x),y:p.y-(drag.current.pdownY??drag.current.y)};
      const dEvent={x:p.x-drag.current.x,y:p.y-drag.current.y};
      if(drag.current.space){
        // Hand-tool / Space / middle-button pan: move the world via setPan
        // instead of touching the wrapper's scrollLeft / scrollTop. The
        // scrollLeft approach was broken because the wrapper clamps its
        // own scrollLeft to [0, scrollWidth - clientWidth] — the first
        // rightward pan from scrollLeft=0 produced no motion at all.
        setPan(v=>({x:v.x+dEvent.x*zoom,y:v.y+dEvent.y*zoom}));
        drag.current={...p,pdownX:drag.current.pdownX,pdownY:drag.current.pdownY,space:true,gesture:"none"};
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
        if(handle==="nw"){nw=start.width-dCumulative.x;nh=start.height-dCumulative.y;nx=start.x+dCumulative.x;ny=start.y+dCumulative.y;}
        else if(handle==="ne"){nw=start.width+dCumulative.x;nh=start.height-dCumulative.y;ny=start.y+dCumulative.y;}
        else if(handle==="sw"){nw=start.width-dCumulative.x;nh=start.height+dCumulative.y;nx=start.x+dCumulative.x;}
        else if(handle==="se"){nw=start.width+dCumulative.x;nh=start.height+dCumulative.y;}
        if(nw<MIN_SIZE){nw=MIN_SIZE;if(handle==="nw"||handle==="sw")nx=start.x+start.width-MIN_SIZE;}
        if(nh<MIN_SIZE){nh=MIN_SIZE;if(handle==="nw"||handle==="ne")ny=start.y+start.height-MIN_SIZE;}
        store.updateElement(id,{x:nx,y:ny,width:nw,height:nh});
        return;
      }
      if(tool==="select"){
        store.updateElement(id,{x:start.x+dCumulative.x,y:start.y+dCumulative.y});
      } else if(tool==="arrow"||tool==="line"){
        store.updateElement(id,{points:[[0,0],[dCumulative.x,dCumulative.y]] as any});
      } else {
        store.updateElement(id,{width:dCumulative.x,height:dCumulative.y});
      }
    }}
    onPointerCancel={()=>{drag.current=null;setMarquee(null);setHovering(false);setHoverBinding(false);pointerDownPos.current=null;pendingBinding.current=null;setPendingBindingPreview(null);}}
    onPointerUp={e=>{
      try{(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)}catch{};
      // Task E — finalize an arrow-to-shape binding drag. The pure
      // `commitBindingDrag` helper resolves the endpoint, builds
      // the arrow, and writes it to the store. We just clear the
      // captured state + select the new arrow + flip back to
      // select tool.
      if (pendingBinding.current) {
        const start = pendingBinding.current;
        const pEnd = world(e as unknown as React.PointerEvent);
        const newId = commitBindingDrag(start, [pEnd.x, pEnd.y], elements, store);
        if (newId) setSelected(newId);
        pendingBinding.current = null;
        setPendingBindingPreview(null);
        setTool("select");
        return;
      }
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
  </div>;
}
