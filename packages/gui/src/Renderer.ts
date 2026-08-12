import type {Element} from "@archidraw/schema";
import rough from "roughjs";
import {getStroke} from "perfect-freehand";
export const renderScene=(canvas:HTMLCanvasElement,elements:Element[],zoom=1,pan={x:0,y:0},selected:string|null=null,marquee?:{x1:number;y1:number;x2:number;y2:number}|null)=>{const ctx=canvas.getContext("2d");if(!ctx)return;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.save();ctx.scale(devicePixelRatio,devicePixelRatio);ctx.translate(pan.x,pan.y);ctx.scale(zoom,zoom);const rc=rough.canvas(canvas);for(const e of elements){if(e.isDeleted)continue;const opts={seed:e.seed,stroke:e.strokeColor,strokeWidth:e.strokeWidth,roughness:e.roughness,fill:e.backgroundColor==="transparent"?undefined:e.backgroundColor};if(e.type==="rectangle"||e.type==="diamond"){const points=e.type==="diamond"?[[e.x+e.width/2,e.y],[e.x+e.width,e.y+e.height/2],[e.x+e.width/2,e.y+e.height],[e.x,e.y+e.height/2],[e.x+e.width/2,e.y]]:[[e.x,e.y],[e.x+e.width,e.y],[e.x+e.width,e.y+e.height],[e.x,e.y+e.height],[e.x,e.y]];rc.path(`M ${points.map(p=>p.join(" ")).join(" L ")}`,opts)}else if(e.type==="ellipse")rc.ellipse(e.x+e.width/2,e.y+e.height/2,Math.abs(e.width),Math.abs(e.height),opts);else if(e.type==="line"||e.type==="arrow"){
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
        }else if(e.type==="text"){ctx.fillStyle=e.strokeColor;ctx.font=`${e.fontSize}px sans-serif`;ctx.fillText(e.text,e.x,e.y+e.fontSize)}if(selected===e.id){ctx.strokeStyle="#2563eb";ctx.setLineDash([5,4]);ctx.strokeRect(e.x-5,e.y-5,e.width+10,e.height+10);ctx.setLineDash([])}}// Render marquee selection rectangle (dashed blue, like Excalidraw).
      if(marquee){const left=Math.min(marquee.x1,marquee.x2);const right=Math.max(marquee.x1,marquee.x2);const top=Math.min(marquee.y1,marquee.y2);const bottom=Math.max(marquee.y1,marquee.y2);ctx.strokeStyle="#3b82f6";ctx.lineWidth=1;ctx.setLineDash([5,4]);ctx.strokeRect(left,top,right-left,bottom-top);ctx.setLineDash([])}
      ctx.restore()};
