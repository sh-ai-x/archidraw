import type {SceneStore} from "./scene";

const PRESETS = ["#fde68a", "#fbcfe8", "#bbf7d0", "#bfdbfe", "#fecaca", "#cbd5e1"];

export function ColorPanel({store, selectedId, selectedType}: {
  store: SceneStore;
  selectedId: string | null;
  selectedType: string | null;
}) {
  const isShape = selectedType === "rectangle" || selectedType === "diamond" || selectedType === "ellipse";
  if (!selectedId || !isShape) return null;
  return (
    <div className="color-panel" role="group" aria-label="Shape color">
      <span className="color-panel-label">Fill</span>
      {PRESETS.map(c => (
        <button
          key={c}
          type="button"
          className="color-swatch"
          style={{backgroundColor: c}}
          onClick={() => store.updateElement(selectedId, {backgroundColor: c} as any)}
          aria-label={`Fill ${c}`}
          title={c}
        />
      ))}
      <input
        type="color"
        onChange={e => store.updateElement(selectedId, {backgroundColor: e.target.value} as any)}
        aria-label="Custom fill"
      />
      <button
        type="button"
        className="color-reset"
        onClick={() => store.updateElement(selectedId, {backgroundColor: "transparent"} as any)}
        aria-label="Reset fill"
      >Reset</button>
    </div>
  );
}
