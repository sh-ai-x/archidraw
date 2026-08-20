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

// ──────────────────────────────────────────────────────────────────────────
// F08 refactor (2026-08-20): extracted pure layout helpers from the inline
// per-frame loop in renderScene. Each helper is independently unit-testable
// and can be tweaked without touching shape-drawing code. The renderer's
// per-frame call site is now a thin orchestrator that calls resolveContainer
// → wrapText → layoutLines and only draws.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Resolve the render bounds for a text element. If bound to a container
 * shape, returns the shape's inner bounds (with a symmetric inset so
 * text fills the shape evenly); otherwise returns the element's own
 * bounds. F07 (2026-08-20): coerces non-string `e.text` to a string so
 * `rawText.split(...)` cannot throw on numbers / objects loaded from
 * tampered storage.
 */
export const resolveContainerBounds = (
  e: Element,
  elements: Element[],
  inset: number = TEXT_IN_SHAPE_INSET,
): {bounds: {x: number; y: number; w: number; h: number}; wrapped: boolean; rawText: string} => {
  let bounds = {x: e.x, y: e.y, w: e.width || 0, h: e.height || 0};
  let wrapped = false;
  if (e.containerId) {
    const c = elements.find(el => el.id === e.containerId && !el.isDeleted);
    if (c) {
      bounds = {
        x: c.x + inset,
        y: c.y + inset,
        w: Math.max(0, (c.width || 0) - 2 * inset),
        h: Math.max(0, (c.height || 0) - 2 * inset),
      };
      wrapped = true;
    }
  }
  // F07 (2026-08-20): the trust boundary at the top of the file converts
  // non-string `text` to a string immediately. Pre-PR the renderer used
  // `e.text||""` which kept truthy non-strings (numbers, objects) and
  // crashed the next `.split(...)` call with TypeError. Pre-PR `fillText`
  // coerced via `ToString` so this is a regression introduced by the
  // word-wrap path — assertSceneShape should also reject non-string `text`
  // at hydration but this defense-in-depth keeps the renderer robust
  // against the in-memory shape too.
  const rawText = typeof e.text === "string" ? e.text : String(e.text ?? "");
  return {bounds, wrapped, rawText};
};

/**
 * Word-wrap `rawText` to `bounds.w` using the given width measure.
 * Returns one or more lines that fit horizontally within the bounds; if
 * the text is shorter than bounds.w the array is `[rawText]`. F05
 * (2026-08-20): skip pure-whitespace tokens when the current line is
 * empty so a leading whitespace token doesn't commit a blank line and
 * push the real text down by one lineHeight.
 *
 * `measure` takes a string and returns its pixel width — the caller
 * supplies this so the renderer can use `ctx.measureText` and tests
 * can supply a stub. Adapter wraps `ctx.measureText` (which returns
 * `TextMetrics`) at the call site.
 */
export const wrapText = (
  rawText: string,
  bounds: {w: number},
  measure: (s: string) => number,
): string[] => {
  if (bounds.w <= 0) return [rawText];
  // Split on whitespace boundaries, preserving the spaces. The loop
  // packs as many whole words as fit into the current line; if a
  // single word is wider than bounds.w we keep it (one over-long
  // token is preferable to dropping characters silently).
  const tokens = rawText.split(/(\s+)/).filter(t => t.length > 0);
  const lines: string[] = [];
  let line = "";
  for (const tok of tokens) {
    // F05: skip pure-whitespace tokens when the current line is empty
    // (they would otherwise commit a blank line on narrow bounds).
    if (!line && /^\s+$/.test(tok)) continue;
    const test = line + tok;
    if (!line || measure(test) <= bounds.w) {
      line = test;
    } else {
      lines.push(line);
      line = tok.replace(/^\s+/, "");
    }
  }
  if (line) lines.push(line);
  if (!lines.length) lines.push("");
  return lines;
};

/**
 * Compute (x, y) anchors for each line of wrapped text.
 *
 * - `textAlign`: "left" flushes to bounds.x, "center" centers each line
 *   around bounds.x + bounds.w/2, "right" flushes the END of each line
 *   to bounds.x + bounds.w.
 * - `verticalAlign`: "top" puts the first line's baseline near the top
 *   of bounds, "middle" centers the whole block vertically, "bottom"
 *   flushes it to the bottom.
 *
 * Returns an array of {x, y} one per line. The renderer applies
 * `ctx.textAlign` per fillText so the consumer doesn't need to know
 * about the alignment math.
 */
export const layoutLines = (
  lines: string[],
  bounds: {x: number; y: number; w: number; h: number},
  opts: {fontSize: number; lineHeight: number; textAlign?: string; verticalAlign?: string},
): Array<{x: number; y: number}> => {
  const ta = opts.textAlign || "left";
  const va = opts.verticalAlign || "top";
  const fontSize = opts.fontSize;
  const lineHeight = opts.lineHeight;
  let firstY: number;
  if (va === "middle") {
    const blockH = (lines.length - 1) * lineHeight;
    firstY = bounds.y + bounds.h / 2 - blockH / 2 + fontSize * 0.35;
  } else if (va === "bottom") {
    const blockH = (lines.length - 1) * lineHeight;
    firstY = bounds.y + bounds.h - blockH - fontSize * 0.15;
  } else {
    firstY = bounds.y + fontSize * 0.9;
  }
  return lines.map((line, i) => {
    let x: number;
    if (ta === "center") x = bounds.x + bounds.w / 2;
    else if (ta === "right") x = bounds.x + bounds.w;
    else x = bounds.x;
    return {x, y: firstY + i * lineHeight};
  });
};

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
        :[[e.x,e.y],[e.x+e.width,e.y],[e.x,e.y+e.height],[e.x+e.width,e.y+e.height],[e.x+e.width,e.y]];
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

      // F08: delegate layout to the pure helpers above. The renderer
      // is now a thin orchestrator: resolve → wrap → layout → draw.
      const {bounds, wrapped, rawText} = resolveContainerBounds(e, elements);
      // ctx.measureText returns TextMetrics; wrapText takes a width-only
      // function. Adapter keeps the helper signature simple for tests.
      const measureWidth = (s: string): number => ctx.measureText(s).width;
      const lines = wrapped ? wrapText(rawText, bounds, measureWidth) : [rawText];
      const lineHeight = (e.lineHeight || 1.2) * fontSize;
      const anchors = layoutLines(lines, bounds, {
        fontSize,
        lineHeight,
        textAlign: e.textAlign,
        verticalAlign: e.verticalAlign,
      });
      ctx.textAlign = e.textAlign === "center" ? "center" : e.textAlign === "right" ? "end" : "start";
      ctx.textBaseline = "alphabetic";
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], anchors[i].x, anchors[i].y);
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
