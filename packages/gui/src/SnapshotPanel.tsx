// SnapshotPanel — download the current scene as a PNG image.
export function SnapshotPanel() {
  function download(): void {
    const canvas = document.querySelector<HTMLCanvasElement>(".canvas");
    if (!canvas) return;
    // Use a fresh off-screen canvas at 2x resolution for crisp output.
    const out = document.createElement("canvas");
    const scale = 2;
    out.width = canvas.width * scale;
    out.height = canvas.height * scale;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(canvas, 0, 0, out.width, out.height);
    out.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `archidraw-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  }
  return (
    <button type="button" className="snapshot-btn" onClick={download} title="Download canvas as PNG (2x resolution)">📷 PNG</button>
  );
}
