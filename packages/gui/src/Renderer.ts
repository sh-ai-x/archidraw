import type {Element} from "@archidraw/schema";
import rough from "roughjs";
import {getStroke} from "perfect-freehand";

// Padding (in world units) applied INSIDE a shape when rendering text bound
// to that shape. Symmetric on all four edges so text fills the shape
// evenly with no left-bias. Per the GUI rules ("remove left padding/margin"),
// the inset is the SAME on all sides — the previous renderer ignored
// containerId and offset text right because textAlign="start" plus the
// container-bound text element rendered at its own x, not the shape's.
const TEXT_IN_SHAPE_INSET = 4;

export const renderScene=(canvas:HTMLCanvasElement,elements:Element[],zoom=1,pan={x:0,y:0},selected:string|null=null,marquee?:{x1:number;y1:number;x2:number;y2:number}|null,multiSel:string[]=[])=>{
  const ctx=canvas.getContext("2d");
  if(!ctx)return;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.save();
  ctx.scale(devicePixelRatio,devicePixelRatio);
  ctx.translate(pan.x,pan.y);
  ctx.scale(zoom,zoom);
  const rc=rough.canvas(canvas);
  for(const e of elements){
    if(e.isDeleted)continue;
    const opts={seed:e.seed,stroke:e.strokeColor,strokeWidth:e.strokeWidth,roughness:e.roughness,fillStyle:e.fillStyle||"solid",fill:e.backgroundColor==="transparent"?undefined:e.backgroundColor};
    if(e.type==="rectangle"||e.type==="diamond"){
      const points=e.type==="diamond"
        ?[[e.x+e.width/2,e.y],[e.x+e.width,e.y+e.height/2],[e.x+e.width/2,e.y+e.height],[e.x,e.y+e.height/2],[e.x+e.width/2,e.y]]
        :[[e.x,e.y],[e.x+e.width,e.y],[e.x+e.width,e.y+e.height],[e.x,e.y+e.height],[e.x,e.y]];
      rc.path(`M ${points.map(p=>p.join(" ")).join(" L ")}`,opts);
    } else if(e.type==="ellipse"){
      rc.ellipse(e.x+e.width/2,e.y+e.height/2,Math.abs(e.width),Math.abs(e.height),opts);
    } else if(e.type==="line"||e.type==="arrow"){
      const x1=e.x+e.points[0][0],y1=e.y+e.points[0][1],x2=e.x+e.points[1][0],y2=e.y+e.points[1][1];
      rc.line(x1,y1,x2,y2,opts);
      if(e.type==="arrow"){
        // Draw a filled triangular arrowhead at the (x2,y2) endpoint.
        const angle=Math.atan2(y2-y1,x2-x1);
        const head=Math.max(10,e.strokeWidth*4);
        const ax=x2,ay=y2;
        const bx=ax-head*Math.cos(angle-Math.PI/7);
        const by=ay-head*Math.sin(angle-Math.PI/7);
        const cx=ax-head*Math.cos(angle+Math.PI/7);
        const cy=ay-head*Math.sin(angle+Math.PI/7);
        ctx.beginPath();
        ctx.moveTo(ax,ay);
        ctx.lineTo(bx,by);
        ctx.lineTo(cx,cy);
        ctx.closePath();
        ctx.fillStyle=e.strokeColor;
        ctx.fill();
      }
    } else if(e.type==="text"){
      const fontSize=e.fontSize||12;
      ctx.font=`${fontSize}px Inter, ui-sans-serif, system-ui, sans-serif`;
      ctx.fillStyle=e.strokeColor;

      // Resolve render bounds. If bound to a container shape, render INSIDE
      // the shape's bounds with a symmetric inset (no left-bias) and word-
      // wrap to the inner width so the text fills the shape completely.
      let bounds={x:e.x,y:e.y,w:e.width||0,h:e.height||0};
      let wrapped=false;
      if(e.containerId){
        const c=elements.find(el=>el.id===e.containerId&&!el.isDeleted);
        if(c){
          const pad=TEXT_IN_SHAPE_INSET;
          bounds={x:c.x+pad,y:c.y+pad,w:Math.max(0,(c.width||0)-2*pad),h:Math.max(0,(c.height||0)-2*pad)};
          wrapped=true;
        }
      }

      // Word-wrap to bounds.w when bound to a container; otherwise the text
      // is a single line at its natural width (legacy behavior).
      const rawText=e.text||"";
      let lines:string[];
      if(wrapped&&bounds.w>0){
        lines=[];
        // Split on whitespace boundaries, preserving the spaces. The loop
        // packs as many whole words as fit into the current line; if a
        // single word is wider than bounds.w we keep it (one over-long
        // token is preferable to dropping characters silently).
        const tokens=rawText.split(/(\s+)/).filter(t=>t.length>0);
        let line="";
        for(const tok of tokens){
          const test=line+tok;
          if(!line||ctx.measureText(test).width<=bounds.w){
            line=test;
          } else {
            lines.push(line);
            line=tok.replace(/^\s+/,"");
          }
        }
        if(line)lines.push(line);
        if(!lines.length)lines=[""];
      } else {
        lines=[rawText];
      }

      // Bound text always defaults to (left, top) — no left-bias padding
      // and no vertical centering, so the user types once and the text
      // grows from the shape's top-left corner down + right.
      const _ta=e.textAlign||"left";
      const _va=e.verticalAlign||"top";
      const lineHeight=(e.lineHeight||1.2)*fontSize;

      // X anchor per line, derived from textAlign. "left" flushes to bounds.x
      // so there is no left padding/margin between the shape and the glyphs.
      const lineX=(_line:string):number=>{
        if(_ta==="center")return bounds.x+bounds.w/2;
        if(_ta==="right")return bounds.x+bounds.w;
        return bounds.x;
      };

      // Y anchor for the FIRST line. "top" puts the baseline near the top of
      // bounds, "middle" centers the whole block vertically, "bottom" flushes
      // it to the bottom.
      let firstY:number;
      if(_va==="middle"){
        const blockH=(lines.length-1)*lineHeight;
        firstY=bounds.y+bounds.h/2-blockH/2+fontSize*0.35;
      } else if(_va==="bottom"){
        const blockH=(lines.length-1)*lineHeight;
        firstY=bounds.y+bounds.h-blockH-fontSize*0.15;
      } else {
        firstY=bounds.y+fontSize*0.9;
      }

      for(let i=0;i<lines.length;i++){
        const y=firstY+i*lineHeight;
        ctx.textAlign=_ta==="left"?"start":_ta==="right"?"end":"center";
        ctx.textBaseline="alphabetic";
        ctx.fillText(lines[i],lineX(lines[i]),y);
      }
    }

    if(selected===e.id){
      // Primary selection: thick blue dashed bounding box + 4 corner handles.
      ctx.strokeStyle="#3b82f6";
      ctx.lineWidth=2;
      ctx.setLineDash([8,4]);
      ctx.strokeRect(e.x-6,e.y-6,e.width+12,e.height+12);
      ctx.setLineDash([]);
      // Corner handles (Excalidraw style): small filled squares at corners
      const hs=8/zoom; // handle size in world units
      const corners=[[e.x-6,e.y-6],[e.x+e.width+6-hs,e.y-6],[e.x-6,e.y+e.height+6-hs],[e.x+e.width+6-hs,e.y+e.height+6-hs]];
      ctx.fillStyle="#3b82f6";
      ctx.strokeStyle="#fff";
      ctx.lineWidth=1.5;
      corners.forEach(([cx,cy])=>{ctx.fillRect(cx,cy,hs,hs);ctx.strokeRect(cx,cy,hs,hs)});
    } else if(multiSel.includes(e.id)){
      // Multi-selection: thinner blue dashed for non-primary selected.
      ctx.strokeStyle="#60a5fa";
      ctx.lineWidth=1.5;
      ctx.setLineDash([4,3]);
      ctx.strokeRect(e.x-3,e.y-3,e.width+6,e.height+6);
      ctx.setLineDash([]);
    }
  }
  // Render marquee selection rectangle (dashed blue, like Excalidraw).
  if(marquee){
    const left=Math.min(marquee.x1,marquee.x2);
    const right=Math.max(marquee.x1,marquee.x2);
    const top=Math.min(marquee.y1,marquee.y2);
    const bottom=Math.max(marquee.y1,marquee.y2);
    ctx.strokeStyle="#3b82f6";
    ctx.lineWidth=1;
    ctx.setLineDash([5,4]);
    ctx.strokeRect(left,top,right-left,bottom-top);
    ctx.setLineDash([]);
  }
  ctx.restore();
};
