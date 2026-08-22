// SnapshotPanel — download the current scene as a PNG image.
//
// A06-1 review (2026-08-20): the previous implementation multiplied the
// input canvas dimensions by `scale = 2` and assigned directly to
// `out.width` / `out.height`. After the 2026-08-19 backing-store cap
// (canvas backing ≤ 16384 px), the input is at most 16384, so the
// export canvas is 32768 × 32768 — that's 32768² × 4 bytes ≈ 4 GiB of
// pixel data, which Chromium silently caps at 32767 and OOMs the tab
// before the user can recover. Clamp to `MAX_CANVAS_DIM` (same constant
// the renderer's backing-store cap uses) so the export stays bounded.
// F12 review (2026-08-20): MAX_CANVAS_DIM (and clampCanvasBackingStore)
// is hoisted into scene.ts so Canvas.tsx + SnapshotPanel.tsx cannot
// drift apart.
//
// A10-5 review (2026-08-20): `ctx.drawImage(canvas, …)` can throw
// SecurityError if a future change introduces a cross-origin image
// into the source canvas. Surface the failure instead of swallowing
// it.
import {MAX_CANVAS_DIM} from "./scene";

export function SnapshotPanel() {
  function download(): void {
    const canvas = document.querySelector<HTMLCanvasElement>(".canvas");
    if (!canvas) return;
    // Use a fresh off-screen canvas at 2x resolution for crisp output.
    // Clamp the OUTPUT dims to MAX_CANVAS_DIM so the export stays bounded —
    // a tampered localStorage payload that pre-sets the canvas
    // backing store to 16384 still produces a 16384×16384 PNG
    // (≈1 GiB, Chromium-allowed) instead of the previous 4 GiB.
    const scale = 2;
    const outW = Math.min(canvas.width * scale, MAX_CANVAS_DIM);
    const outH = Math.min(canvas.height * scale, MAX_CANVAS_DIM);
    const out = document.createElement("canvas");
    out.width = outW;
    out.height = outH;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, outW, outH);
    try {
      ctx.drawImage(canvas, 0, 0, outW, outH);
    } catch (e) {
      // A10-5: SecurityError from cross-origin source, or a future
      // broken canvas state — surface to the operator rather than
      // silently producing an empty PNG.
      window.alert(`PNG export failed: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    try {
      out.toBlob((blob) => {
        // F01 review (2026-08-20): toBlob's callback can fire with `null`
        // when the encoder fails to produce a blob (e.g. memory pressure
        // on a near-cap canvas). The previous `if (!blob) return;`
        // silently swallowed the failure; the surrounding try/catch
        // only catches sync throws. Surface the failure so the operator
        // can recover (close other tabs, reduce scene size, retry).
        if (!blob) {
          window.alert("PNG export failed: encoder returned no blob (try reducing the canvas size).");
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `archidraw-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }, "image/png");
    } catch (e) {
      window.alert(`PNG encode failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return (
    <button type="button" className="snapshot-btn" onClick={download} title="Download canvas as PNG (2x resolution)">📷 PNG</button>
  );
}
