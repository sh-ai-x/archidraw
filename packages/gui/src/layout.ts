// layout — pure AABB + measureText layout primitives.
//
// F09 / F11 review (2026-08-20): the previous LayoutPanel.tsx mixed
// React UI state with the 120-line pure `silentAutoFix` algorithm,
// forcing App.tsx to dynamic-import the React component just to reach
// the pure function on bootstrap. Move the pure logic here so it can
// be unit-tested directly and so future non-UI consumers (CLI /
// server) don't have to import a React component.
//
// The Element shape here is intentionally loose — we accept the
// minimum subset needed for layout (id, type, x, y, width, height,
// isDeleted, text, fontSize) so callers don't have to cast their
// Element union to a specific concrete shape.

type LooseElement = {
  id: string;
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  isDeleted?: boolean;
  text?: string;
  fontSize?: number;
};

export type ElementForLayout = LooseElement;

/** Compute the 2D context used for measureText. */
const measureContext = (): CanvasRenderingContext2D => {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) throw new Error("layout: 2D canvas context unavailable");
  return ctx;
};

/**
 * Count the number of layout issues in the given elements:
 *   - text whose measured width exceeds its bounding-box width (overflow)
 *   - overlapping rectangle/diamond/ellipse pairs that aren't nested
 *     (sibling overlap, not containment)
 *
 * Returns the total count. Zero means the scene is layout-clean.
 */
export function countIssues(els: ElementForLayout[]): number {
  const ctx = measureContext();
  let n = 0;
  for (const e of els) {
    if (e.isDeleted || e.type !== "text") continue;
    ctx.font = `${e.fontSize || 12}px Inter, ui-sans-serif, system-ui, sans-serif`;
    if (ctx.measureText(e.text || "").width > (e.width || 0) + 4) n++;
  }
  for (let i = 0; i < els.length; i++) {
    for (let j = i + 1; j < els.length; j++) {
      const a = els[i], b = els[j];
      if (a.isDeleted || b.isDeleted) continue;
      if (["text","arrow","line"].includes(a.type) || ["text","arrow","line"].includes(b.type)) continue;
      const ax2 = a.x + (a.width || 0), ay2 = a.y + (a.height || 0);
      const bx2 = b.x + (b.width || 0), by2 = b.y + (b.height || 0);
      const ox = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x, b.x));
      const oy = Math.max(0, Math.min(ay2, by2) - Math.max(a.y, b.y));
      if (ox > 4 && oy > 4) {
        const aArea = (ax2 - a.x) * (ay2 - a.y);
        const bArea = (bx2 - b.x) * (by2 - b.y);
        const minArea = Math.min(aArea, bArea);
        if (minArea > 0 && (ox * oy) / minArea > 0.95) continue;
        n++;
      }
    }
  }
  return n;
}

/**
 * Layout auto-fix pass. Returns a NEW elements array (does not mutate
 * the input) with:
 *   - text bounding boxes widened to fit the measured text width
 *   - parent rectangles extended to contain their child text + 8px margin
 *   - sibling overlaps pushed apart (or the larger parent extended for
 *     containment)
 *
 * Up to 3 measurement-then-fit iterations, then up to 4 sibling-push
 * passes. Returns the same array reference when no fixes were applied
 * so callers can short-circuit ("did anything change?").
 */
export function silentAutoFix(elsIn: ElementForLayout[]): ElementForLayout[] {
  const els = elsIn.map(e => ({...e}));
  const ctx = measureContext();
  let changed = false;

  // Pre-step: resize each text bbox to its measured width, and resize the parent
  // rectangle (whose center contains this text's center) to contain the text.
  for (const e of els) {
    if (e.isDeleted || e.type !== "text" || !e.text) continue;
    ctx.font = `${e.fontSize || 12}px Inter, ui-sans-serif, system-ui, sans-serif`;
    const measured = ctx.measureText(e.text).width;
    if (measured > (e.width || 0) + 2) {
      const newW = Math.ceil(measured + 16);
      const oldCenter = e.x + (e.width || 0) / 2;
      e.width = newW;
      e.x = Math.round(oldCenter - newW / 2);  // keep centered
      changed = true;
      // Find the container (parent rectangle) that contains the text's center
      for (const c of els) {
        if (c.isDeleted || c.type === "text" || c.type === "arrow" || c.type === "line") continue;
        const cx1 = c.x, cy1 = c.y, cx2 = c.x + (c.width || 0), cy2 = c.y + (c.height || 0);
        const tcx = e.x + e.width / 2, tcy = e.y + (e.height || 24) / 2;
        if (tcx >= cx1 && tcx <= cx2 && tcy >= cy1 && tcy <= cy2) {
          // Resize parent to contain text + 4px margin
          const margin = 8;
          const needX1 = e.x - margin;
          const needY1 = e.y - margin;
          const needX2 = e.x + e.width + margin;
          const needY2 = e.y + (e.height || 24) + margin;
          if (needX1 < cx1 || needY1 < cy1 || needX2 > cx2 || needY2 > cy2) {
            c.x = Math.min(cx1, needX1);
            c.y = Math.min(cy1, needY1);
            c.width = Math.max(cx2, needX2) - c.x;
            c.height = Math.max(cy2, needY2) - c.y;
          }
          break;
        }
      }
    }
  }

  // Re-measure + refit until all text fits (max 3 iterations)
  for (let fitPass = 0; fitPass < 3; fitPass++) {
    let allFit = true;
    for (const e of els) {
      if (e.isDeleted || e.type !== "text" || !e.text) continue;
      ctx.font = `${e.fontSize || 12}px Inter, ui-sans-serif, system-ui, sans-serif`;
      const measured = ctx.measureText(e.text).width;
      if (measured > (e.width || 0) + 4) { allFit = false; break; }
    }
    if (allFit) break;
    for (const e of els) {
      if (e.isDeleted || e.type !== "text" || !e.text) continue;
      ctx.font = `${e.fontSize || 12}px Inter, ui-sans-serif, system-ui, sans-serif`;
      const measured = ctx.measureText(e.text).width;
      if (measured > (e.width || 0) + 2) {
        const newW = Math.ceil(measured + 16);
        const oldCenter = e.x + (e.width || 0) / 2;
        e.width = newW;
        e.x = Math.round(oldCenter - newW / 2);
        changed = true;
        for (const c of els) {
          if (c.isDeleted || c.type === "text" || c.type === "arrow" || c.type === "line") continue;
          const cx1 = c.x, cy1 = c.y, cx2 = c.x + (c.width || 0), cy2 = c.y + (c.height || 0);
          const tcx = e.x + e.width / 2, tcy = e.y + (e.height || 24) / 2;
          if (tcx >= cx1 && tcx <= cx2 && tcy >= cy1 && tcy <= cy2) {
            const margin = 8;
            const needX1 = e.x - margin, needY1 = e.y - margin;
            const needX2 = e.x + e.width + margin, needY2 = e.y + (e.height || 24) + margin;
            if (needX1 < cx1 || needY1 < cy1 || needX2 > cx2 || needY2 > cy2) {
              c.x = Math.min(cx1, needX1); c.y = Math.min(cy1, needY1);
              c.width = Math.max(cx2, needX2) - c.x;
              c.height = Math.max(cy2, needY2) - c.y;
            }
            break;
          }
        }
      }
    }
  }

  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (let i = 0; i < els.length; i++) {
      for (let j = i + 1; j < els.length; j++) {
        const a = els[i], b = els[j];
        if (a.isDeleted || b.isDeleted) continue;
        if (["text","arrow","line"].includes(a.type) || ["text","arrow","line"].includes(b.type)) continue;
        const ax1 = a.x, ay1 = a.y, ax2 = a.x + (a.width || 0), ay2 = a.y + (a.height || 0);
        const bx1 = b.x, by1 = b.y, bx2 = b.x + (b.width || 0), by2 = b.y + (b.height || 0);
        const ox = Math.max(0, Math.min(ax2, bx2) - Math.max(ax1, bx1));
        const oy = Math.max(0, Math.min(ay2, by2) - Math.max(ay1, by1));
        if (ox <= 4 || oy <= 4) continue;
        const aArea = (ax2 - ax1) * (ay2 - ay1);
        const bArea = (bx2 - bx1) * (by2 - by1);
        const smaller = aArea <= bArea ? a : b;
        const larger  = aArea <= bArea ? b : a;
        const sx1 = smaller.x, sy1 = smaller.y, sx2 = smaller.x + (smaller.width || 0), sy2 = smaller.y + (smaller.height || 0);
        const lx1 = larger.x, ly1 = larger.y, lx2 = larger.x + (larger.width || 0), ly2 = larger.y + (larger.height || 0);
        const cx = (sx1 + sx2) / 2, cy = (sy1 + sy2) / 2;
        // Containment (child's center inside parent) → extend parent
        if (cx >= lx1 && cx <= lx2 && cy >= ly1 && cy <= ly2) {
          const m = 6;
          const needX1 = sx1 - m, needY1 = sy1 - m, needX2 = sx2 + m, needY2 = sy2 + m;
          if (needX1 < lx1 || needY1 < ly1 || needX2 > lx2 || needY2 > ly2) {
            larger.x = Math.min(lx1, needX1);
            larger.y = Math.min(ly1, needY1);
            larger.width  = Math.max(lx2, needX2) - larger.x;
            larger.height = Math.max(ly2, needY2) - larger.y;
            moved = true;
            changed = true;
          }
        } else {
          // Sibling overlap → push lower one down
          if (smaller.y >= larger.y) smaller.y += Math.ceil(oy) + 2;
          else larger.y += Math.ceil(oy) + 2;
          moved = true;
          changed = true;
        }
      }
    }
    if (!moved) break;
  }
  return changed ? els : elsIn;
}
