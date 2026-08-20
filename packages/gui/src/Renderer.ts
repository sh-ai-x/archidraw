import type {Element} from "@archidraw/schema";
import rough from "roughjs";
import {getStroke} from "perfect-freehand";
export const renderScene=(canvas:HTMLCanvasElement,elements:Element[],zoom=1,pan={x:0,y:0},selected:string|null=null,marquee?:{x1:number;y1:number;x2:number;y2:number}|null,multiSel:string[]=[])=>{const ctx=canvas.getContext("2d");if(!ctx)return;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.save();ctx.scale(devicePixelRatio,devicePixelRatio);ctx.translate(pan.x,pan.y);ctx.scale(zoom,zoom);const rc=rough.canvas(canvas);
  // Pre-index shapes by id so container-bound text can find its container
  // without a per-element array scan.
  const byId=new Map<string,Element>();
  for(const e of elements){if(!e.isDeleted)byId.set(e.id,e);}
  for(const e of elements){if(e.isDeleted)continue;
    const opts={seed:e.seed,stroke:e.strokeColor,strokeWidth:e.strokeWidth,roughness:e.roughness,fillStyle:e.fillStyle||"solid",fill:e.backgroundColor==="transparent"?undefined:e.backgroundColor};
    if(e.type==="rectangle"||e.type==="diamond"){
      const points=e.type==="diamond"?[[e.x+e.width/2,e.y],[e.x+e.width,e.y+e.height/2],[e.x+e.width/2,e.y+e.height],[e.x,e.y+e.height/2],[e.x+e.width/2,e.y]]:[[e.x,e.y],[e.x+e.width,e.y],[e.x+e.width,e.y+e.height],[e.x,e.y+e.height],[e.x,e.y]];
      rc.path(`M ${points.map(p=>p.join(" ")).join(" L ")}`,opts)
    } else if(e.type==="ellipse"){
      rc.ellipse(e.x+e.width/2,e.y+e.height/2,Math.abs(e.width),Math.abs(e.height),opts)
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
      ctx.fillStyle=e.strokeColor;
      ctx.font=`${e.fontSize || 12}px Inter, ui-sans-serif, system-ui, sans-serif`;
      // Container-bound text is centered inside the container's bbox and clipped
      // horizontally so long strings don't bleed past the stroke. Free-floating
      // text honors textAlign/verticalAlign as before.
      const cid=(e as any).containerId as string|null|undefined;
      const container=cid?byId.get(cid):null;
      if(container){
        const padX=8,padY=6;
        const cx=container.x+padX;
        const cy=container.y+padY;
        const cw=Math.max(20,container.width-padX*2);
        const ch=Math.max(20,container.height-padY*2);
        ctx.save();
        ctx.beginPath();
        ctx.rect(cx,cy,cw,ch);
        ctx.clip();
        ctx.textAlign="center";
        ctx.textBaseline="middle";
        ctx.fillText(e.text||"",cx+cw/2,cy+ch/2);
        ctx.restore();
      } else {
        const _ta=e.textAlign||"start";
        const _va=e.verticalAlign||"top";
        ctx.textAlign=_ta;
        ctx.textBaseline=_va==="middle"?"middle":_va==="bottom"?"bottom":"top";
        let _tx=e.x;
        if(_ta==="center")_tx=e.x+(e.width||0)/2;
        else if(_ta==="right")_tx=e.x+(e.width||0);
        let _ty=e.y;
        if(_va==="middle")_ty=e.y+(e.height||0)/2;
        else if(_va==="bottom")_ty=e.y+(e.height||0);
        else _ty=e.y+(e.fontSize||14)*0.9;
        ctx.fillText(e.text||"",_tx,_ty)
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
  if(marquee){const left=Math.min(marquee.x1,marquee.x2);const right=Math.max(marquee.x1,marquee.x2);const top=Math.min(marquee.y1,marquee.y2);const bottom=Math.max(marquee.y1,marquee.y2);ctx.strokeStyle="#3b82f6";ctx.lineWidth=1;ctx.setLineDash([5,4]);ctx.strokeRect(left,top,right-left,bottom-top);ctx.setLineDash([])}
  ctx.restore()};
