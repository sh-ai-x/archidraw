// LayoutPanel — Validate + Auto-Fix controls.
//
// PR #48 review (2026-08-20, 🟠 major #2): silentAutoFix used to live
// in this file mixed with the React UI, forcing App.tsx to dynamic-
// import the whole component just to reach the pure function on
// bootstrap. The pure logic has been moved to ./layout.ts; this
// component now imports countIssues + silentAutoFix statically and
// only owns the button + status-chip state.
import { useEffect, useRef, useState } from "react";
import type { SceneStore } from "./scene";
import { publishDelta } from "./bridge-client";
import {countIssues, silentAutoFix} from "./layout";

export function LayoutPanel({ store }: { store: SceneStore }) {
  const [status, setStatus] = useState<"idle" | "valid" | "issues" | "running" | "fixed" | "error">("idle");
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
