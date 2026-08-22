import type {Element, ShapeTextBinding} from "@archidraw/schema";
import rough from "roughjs";
import {getStroke} from "perfect-freehand";

// Padding (in world units) applied INSIDE a shape when rendering text bound
// to that shape. Symmetric on all four edges so text fills the shape
// evenly with no left-bias. Per the GUI rules ("remove left padding/margin"),
// the inset is the SAME on all sides — the previous renderer ignored
// containerId and offset text right because textAlign="start" plus the
// container-bound text element rendered at its own x, not the shape's.
const TEXT_IN_SHAPE_INSET = 4;

// (2026-08-22) F12 review round 4: hoisted shared handle-geometry
// constants. Previously Canvas.tsx declared its own HANDLE_PX (8) /
// PAD (6) and Renderer.ts redeclared the same values inline as `8 /
// zoom` and `e.x - 6` literals. Drift between the two led to corner
// handles whose paint sat outside the hit-test rect at zoom > ~1.0 —
// the renderer drew handles bigger than the canvas's hit-test allowed
// for. Centralising here means a single edit shifts both at once.
export const HANDLE_PX = 8;
export const HANDLE_PAD = 6;
// Renderer outline strokes are `lineWidth = 1.5` in world units; a
// stroke centered on the rect extends ~0.75 world units on each side.
// Exported so Canvas's hit-test margin matches what the renderer
// actually paints, otherwise the visible handle is outside the
// hit-test rectangle by exactly this margin.
export const HANDLE_STROKE_MARGIN = 0.75;

// ──────────────────────────────────────────────────────────────────────────
// F08 refactor (2026-08-20): extracted pure layout helpers from the inline
// per-frame loop in renderScene. Each helper is independently unit-testable
// and can be tweaked without touching shape-drawing code. The renderer's
// per-frame call site is now a thin orchestrator that calls resolveContainer
// → wrapText → layoutLines and only draws.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Coerce an anchor-like value (a `[number, number]` tuple) to a SAFE
 * `[nx, ny]` pair on the unit square. Anything that isn't a finite
 * pair returns `[0.5, 0.5]` (the visual center) so a tampered or
 * hand-edited scene cannot crash the renderer with NaN / Infinity /
 * out-of-bounds values. F07-RC2 (2026-08-22): mirrors the bound-text
 * text-coercion pass — apply the same trust boundary to the binding
 * anchor before the renderer destructures it.
 */
export const safeAnchor = (
  raw: unknown,
): readonly [number, number] => {
  if (!Array.isArray(raw) || raw.length < 2) return [0.5, 0.5];
  const x = Number(raw[0]);
  const y = Number(raw[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return [0.5, 0.5];
  // Clamp to [0, 1] — out-of-range anchors would render text outside
  // the shape's bbox, masking the binding visually.
  return [
    x < 0 ? 0 : x > 1 ? 1 : x,
    y < 0 ? 0 : y > 1 ? 1 : y,
  ];
};

/**
 * Inner bounds of a shape — the rectangle text is rendered into. Both
 * the N:N binding path and the legacy containerId path go through this
 * helper so the geometry stays in one place (review round 4 found the
 * two paths had diverged on the inset arithmetic).
 */
export const shapeInnerBounds = (
  shape: {x: number; y: number; width?: number; height?: number},
  inset: number = TEXT_IN_SHAPE_INSET,
): {x: number; y: number; w: number; h: number} => ({
  x: shape.x + inset,
  y: shape.y + inset,
  w: Math.max(0, (shape.width || 0) - 2 * inset),
  h: Math.max(0, (shape.height || 0) - 2 * inset),
});

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
  let bounds: {x: number; y: number; w: number; h: number} = {x: e.x, y: e.y, w: e.width || 0, h: e.height || 0};
  let wrapped = false;
  if (e.containerId) {
    const c = elements.find(el => el.id === e.containerId && !el.isDeleted);
    if (c) {
      bounds = shapeInnerBounds(c, inset);
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

/**
 * Draw a single text element at the given bounds. Pulled out of the
 * `renderScene` per-frame loop so the N:N binding path can call it once
 * per (binding, text) pair.
 */
const drawTextElement = (
  ctx: CanvasRenderingContext2D,
  e: Element,
  bounds: {x: number; y: number; w: number; h: number},
  measureWidth: (s: string) => number,
): void => {
  // Cast once: Element is a discriminated union; only TextElement has
  // these fields. The runtime guards (typeof checks) already defend
  // against wrong element types being passed in.
  const t = e as unknown as {
    fontSize?: number;
    strokeColor?: string;
    text?: unknown;
    lineHeight?: number;
    textAlign?: "left" | "center" | "right";
    verticalAlign?: "top" | "middle" | "bottom";
  };
  const fontSize = t.fontSize || 12;
  ctx.font = `${fontSize}px Inter, ui-sans-serif, system-ui, sans-serif`;
  ctx.fillStyle = t.strokeColor || "#1f2937";
  const rawText = typeof t.text === "string" ? t.text : String(t.text ?? "");
  const lines = wrapText(rawText, bounds, measureWidth);
  const lineHeight = (t.lineHeight || 1.2) * fontSize;
  const anchors = layoutLines(lines, bounds, {
    fontSize,
    lineHeight,
    textAlign: t.textAlign,
    verticalAlign: t.verticalAlign,
  });
  ctx.textAlign = t.textAlign === "center" ? "center"
    : t.textAlign === "right" ? "end"
    : "start";
  ctx.textBaseline = "alphabetic";
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], anchors[i].x, anchors[i].y);
  }
};

export const renderScene=(
  canvas:HTMLCanvasElement,
  elements:Element[],
  zoom=1,
  pan={x:0,y:0},
  selected:string|null=null,
  marquee?:{x1:number;y1:number;x2:number;y2:number}|null,
  multiSel:string[]=[],
  rubberBand?:{start:{x:number;y:number};end:{x:number;y:number}}|null,
  // (2026-08-22) N:N shape↔text bindings. Optional so the existing call
  // sites (Canvas.tsx + renderer unit tests) keep their 8-arg signature.
  bindings?: ShapeTextBinding[],
)=>{
  const ctx=canvas.getContext("2d");
  if(!ctx)return;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.save();
  ctx.scale(devicePixelRatio,devicePixelRatio);
  ctx.translate(pan.x,pan.y);
  ctx.scale(zoom,zoom);
  const rc=rough.canvas(canvas);
  const measureWidth = (s: string): number => ctx.measureText(s).width;
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

        // Task E — point-to-shape binding indicators. When the arrow has a
        // startBinding / endBinding we draw a small filled circle at the
        // bound point's world position so the user can see which points the
        // arrow is anchored to. Blue when the arrow is the primary
        // selection, gray otherwise.
        const arrowAny = e as unknown as {startBinding?: any; endBinding?: any};
        const isArrowSelected = selected === e.id;
        const drawBindingDot = (binding: any) => {
          if (!binding || !binding.fixedPoint) return;
          const target = elements.find(el => el.id === binding.elementId && !el.isDeleted);
          if (!target) return;
          const w = target.width || 0, h = target.height || 0;
          const [nx, ny] = binding.fixedPoint;
          const bx2 = target.x + nx * w;
          const by2 = target.y + ny * h;
          const r = 4 / zoom;
          ctx.beginPath();
          ctx.arc(bx2, by2, r, 0, Math.PI * 2);
          ctx.fillStyle = isArrowSelected ? "#3b82f6" : "#9ca3af";
          ctx.fill();
        };
        drawBindingDot(arrowAny.startBinding);
        drawBindingDot(arrowAny.endBinding);
      }
    } else if(e.type==="text"){
      // (2026-08-22) N:N binding collection. If `bindings` is provided
      // (the GUI default since the binding helpers run on every store
      // mutation), prefer the binding-driven path: draw the text once
      // for each binding whose textId matches. Falls back to the legacy
      // containerId path when the text has no N:N bindings — that keeps
      // every pre-binding scene renderable.
      const myBindings = (bindings || []).filter(b => b.textId === e.id);
      if (myBindings.length > 0) {
        for (const binding of myBindings) {
          const shape = elements.find(el => el.id === binding.shapeId && !el.isDeleted);
          if (!shape) continue;
          // F07-RC2 (2026-08-22): trust-boundary on binding anchors. A
          // tampered scene could feed NaN / Infinity / out-of-range
          // values here; coerce to a safe unit-square pair before the
          // destructure so the renderer never throws or paints outside
          // the shape bbox.
          const safe = safeAnchor(binding.shapeAnchor);
          const nx = safe[0], ny = safe[1];
          const cx = shape.x + (shape.width || 0) * nx;
          const cy = shape.y + (shape.height || 0) * ny;
          // MVP: render the text inside the bound shape's bbox, centered
          // at the binding's anchor point. textAlign + verticalAlign drive
          // the line layout as before. shapeInnerBounds() is the shared
          // helper used by the legacy containerId path below so the two
          // routes cannot drift on inner-bounds arithmetic.
          const bounds = shapeInnerBounds(shape);
          // Use the shape's anchor as the visual center when the text
          // element asks for centered alignment. Otherwise draw at the
          // inner-bounds top-left as the existing containerId path did.
          const isCentered = (e.textAlign === "center" || e.textAlign === "right")
            || (nx !== 0.5 || ny !== 0.5);
          const drawBounds = isCentered
            ? {...bounds, x: cx - bounds.w / 2, y: cy - bounds.h / 2}
            : bounds;
          drawTextElement(ctx, e, drawBounds, measureWidth);
        }
        continue;
      }
      // Legacy containerId fallback: render once, inside the container's
      // inner bounds. Kept identical to the pre-binding code so every
      // pre-N:N scene still renders text in the same place.
      const {bounds} = resolveContainerBounds(e, elements);
      drawTextElement(ctx, e, bounds, measureWidth);
    }

    if(selected===e.id){
      // Primary selection: thick blue dashed bounding box + 4 corner handles.
      ctx.strokeStyle="#3b82f6";
      ctx.lineWidth=2;
      ctx.setLineDash([8,4]);
      ctx.strokeRect(e.x-HANDLE_PAD,e.y-HANDLE_PAD,e.width+2*HANDLE_PAD,e.height+2*HANDLE_PAD);
      ctx.setLineDash([]);
      // Corner handles (Excalidraw style): small filled squares at corners
      const hs=HANDLE_PX/zoom;
      const corners=[
        [e.x-HANDLE_PAD, e.y-HANDLE_PAD],
        [e.x+e.width+HANDLE_PAD-hs, e.y-HANDLE_PAD],
        [e.x-HANDLE_PAD, e.y+e.height+HANDLE_PAD-hs],
        [e.x+e.width+HANDLE_PAD-hs, e.y+e.height+HANDLE_PAD-hs],
      ];
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
  // Task E — live rubber-band for an in-flight arrow-binding drag.
  // Drawn AFTER the marquee so it stays visible while the user moves
  // the pointer before committing on pointerup.
  if (rubberBand) {
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(rubberBand.start.x, rubberBand.start.y);
    ctx.lineTo(rubberBand.end.x, rubberBand.end.y);
    ctx.stroke();
    ctx.setLineDash([]);
    // Anchor dots at both ends so the user sees which binding point the
    // arrow is going to attach to.
    const r = 4 / zoom;
    ctx.fillStyle = "#3b82f6";
    ctx.beginPath(); ctx.arc(rubberBand.start.x, rubberBand.start.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(rubberBand.end.x, rubberBand.end.y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
};
