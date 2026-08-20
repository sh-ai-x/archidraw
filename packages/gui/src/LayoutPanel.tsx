// LayoutPanel — Validate + Auto-Fix controls.
// Runs the same verifier/fixer that /tmp/dhk-check/validate3.mjs proved works:
//  1. measure actual text width via ctx.measureText
//  2. extend parents to contain overflowing children (center-in-parent test)
//  3. push siblings apart if they overlap
//  4. publish the result via the bridge
import { useEffect, useRef, useState } from "react";
import type { SceneStore } from "./scene";
import { publishDelta } from "./bridge-client";

export function LayoutPanel({ store }: { store: SceneStore }) {
  const [status, setStatus] = useState<"idle" | "valid" | "issues" | "running" | "fixed">("idle");
  const [text, setText] = useState("layout");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Brief status messages that auto-fade
  useEffect(() => {
    if (status === "idle" || status === "valid") return;
    timer.current = setTimeout(() => setStatus("idle"), 2200);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [status]);

  function runValidate(): void {
    const els = store.getScene().elements;
    const issues = countIssues(els);
    if (issues === 0) { setStatus("valid"); setText("✓ 0 issues"); return; }
    setStatus("issues"); setText(`⚠ ${issues} issues`);
  }

  function runAutoFix(): void {
    setStatus("running"); setText("auto-fixing…");
    // PR #48 review (2026-08-20, 🔴 critical): only `silentAutoFix` is
    // exported by this module — `autoFix` is undefined. ReferenceError
    // left the status chip stuck on "running" and the fix was never
    // published via the bridge. Regressed by layoutpanel-autofix.test.ts.
    const fixed = silentAutoFix(store.getScene().elements);
    const remaining = countIssues(fixed);
    // Publish via the bridge
    void publishDelta([{ op: "replace", path: "/elements", value: fixed }])
      .then(() => {
        // The App's subscriber will rebuild the local store; nothing else to do.
        setStatus("fixed");
        setText(remaining === 0 ? "✓ fixed" : `⚠ ${remaining} left`);
      })
      // A10-2 (2026-08-19): don't claim "✓ fixed" if the bridge POST
      // actually failed. Roll the UI back to "error" + the reason.
      .catch((err)=>{setStatus("error"); setText(`✗ ${err?.message ?? "publish failed"}`);});
  }

  return (
    <div className="layout-panel" role="group" aria-label="Layout">
      <button type="button" className="layout-btn" onClick={runValidate} title="Validate scene (text overflow + overlap)">Validate</button>
      <button type="button" className="layout-btn" onClick={runAutoFix} title="Auto-fix overflow + overlap, publish via bridge">Auto-Fix</button>
      <span className={"layout-status status-" + status}>{text}</span>
    </div>
  );
}

function countIssues(els: Array<{ isDeleted?: boolean; type: string; x: number; y: number; width?: number; height?: number; id: string; text?: string; fontSize?: number }>): number {
  const ctx = document.createElement("canvas").getContext("2d")!;
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

export function silentAutoFix(elsIn: Array<{ isDeleted?: boolean; type: string; x: number; y: number; width?: number; height?: number; id: string; text?: string; fontSize?: number }>): Array<{ isDeleted?: boolean; type: string; x: number; y: number; width?: number; height?: number; id: string; text?: string; fontSize?: number }> {
  const els = elsIn.map(e => ({...e}));
  const ctx = document.createElement("canvas").getContext("2d")!;

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
      // Find the container (parent rectangle) that contains the text's center
      for (const c of els) {
        if (c === e || c.isDeleted || c.type === "text" || c.type === "arrow" || c.type === "line") continue;
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
        for (const c of els) {
          if (c === e || c.isDeleted || c.type === "text" || c.type === "arrow" || c.type === "line") continue;
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
          }
        } else {
          // Sibling overlap → push lower one down
          if (smaller.y >= larger.y) smaller.y += Math.ceil(oy) + 2;
          else larger.y += Math.ceil(oy) + 2;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  return els;
}
