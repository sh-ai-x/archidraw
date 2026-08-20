---
name: archidraw
description: Launch archidraw — the Excalidraw-compatible scene editor for AI agents, with strict composition rules for clean diagrams.
category: ui
when_to_use:
  - User types "start archidraw" / "archidraw dev" / "/dev-kit:archidraw" / "open archidraw"
  - An agent needs to publish scene deltas (rectangles, ellipses, diamonds, arrows, text) to the live canvas via the SSE bridge
  - User wants to validate or auto-arrange an existing scene (AABB overlap + text-overflow checker)
allowed-tools: Read Bash Write
model: sonnet
user-invocable: true
disable-model-invocation: false
---

## What it does

A local Excalidraw-style scene editor with an SSE bridge that lets AI agents
publish scene deltas into a running canvas.

- GUI on `:5173` (Vite, hot-reload).
- Bridge on `:5174` (loopback SSE) — agents POST JSON-Patch deltas to push
  elements into the live canvas.
- Tabs (per-tab scenes in `localStorage`), Save/Load, Validate / Auto-Fix,
  and 📷 PNG download.

## How to launch

```bash
# from archidraw repo root:
./bin/archidraw                       # GUI on :5173, bridge on :5174
./bin/archidraw --no-open             # don't open browser
./bin/archidraw --port 5180           # custom port (bridge = port+1)
./bin/archidraw --no-bridge           # GUI only (no agent publish)
```

If `./bin/archidraw` is missing, run `pnpm install` first.

## How to publish from an agent/skill

Bridge endpoint: `POST http://127.0.0.1:5174/publish`

Body: an array of RFC 6902 JSON-Patch operations. The full Excalidraw shape
set is supported (rectangle, ellipse, diamond, line, arrow, text, freedraw).

```bash
curl -X POST http://127.0.0.1:5174/publish \
  -H 'Content-Type: application/json' \
  -d '[{"op":"replace","path":"/elements","value": ELEMENTS_JSON }]'
```

From inside the browser (recommended — bypasses CORS):

```js
await fetch("http://127.0.0.1:5174/publish", {
  method: "POST",
  headers: { "Content-Type": "application/json", "Origin": "http://localhost:5173" },
  body: JSON.stringify([{ op: "replace", path: "/elements", value: elements }]),
});
```

## Composition rules (READ BEFORE PUBLISHING)

These rules are mandatory. Diagrams that violate them look broken and fail
review.

### 1. Text labels NEVER sit inside a shape

The renderer honors `textAlign` and `verticalAlign` literally — sending
`"center"` + `"middle"` paints the text on top of the shape, where it clashes
with the fill, the icon, and the stroke. **Always place text BELOW or BESIDE
the shape it labels**, not centered on it.

Concretely, every text element MUST satisfy one of these:

| Position | x / width | y / height | textAlign | verticalAlign |
|---|---|---|---|---|
| Caption (below shape) | same x as shape, width = shape.width | `shape.y + shape.height + 8` | `"center"` | `"top"` |
| Side label (right of shape) | `shape.x + shape.width + 12` | shape.y, width = ~200 | `"left"` | `"top"` |
| Title (top of canvas) | x=80, width=1240, height=32 | y=24 | `"left"` | `"top"` |

The shape's own interior is reserved for icons / color cues. The shape never
carries its own name as overlay text.

### 2. Shapes have meaningful geometry

| Shape | Use for | Size guideline |
|---|---|---|
| `rectangle` | component, stage, file, table | 200×100 to 280×120 |
| `ellipse` | start/end node, person, external actor | 160×80 |
| `diamond` | decision, conditional branch | 180×120 |
| `arrow` | directed flow | straight or 1 right-angle bend |
| `line` | undirected link, bracket | straight only |

Roundness: `{"type":3,"value":8}` for components (subtle), `{"type":2}` for
process nodes, `null` for diamonds.

### 3. Arrows are minimal

- One endpoint = one arrowhead. No double-headed arrows unless explicitly
  bidirectional.
- `strokeStyle: "solid"`, `roughness: 0`, `strokeWidth: 1.5`.
- Use **straight lines** for left↔right and top↔bottom. Use **one right-angle
  bend** (horizontal-then-vertical or vertical-then-horizontal) when the
  source and target share an axis — never three bends.
- Arrow color = source stroke color. Don't recolor arrows per-target.
- Bind endpoints to shape edges by placing them on the bounding-box edge,
  not inside the shape interior. For a rectangle at `(x, y, w, h)`:
  - right edge midpoint → `(x+w, y+h/2)`
  - left edge midpoint → `(x, y+h/2)`
  - bottom edge midpoint → `(x+w/2, y+h)`
  - top edge midpoint → `(x+w/2, y)`

### 4. Layout grid

- Snap shapes to a 40-pixel grid. Vertical gap between rows: 80px (shape
  height + caption + arrow headroom).
- Title sits at `(80, 24)`. First row of shapes starts at y=120.
- Keep the diagram inside the canvas viewport — start x=120, end x ≤ 1240
  for a 1400px-wide canvas.

### 5. Color tokens

Use these six swatches only. Mixing more than 6 colors makes the diagram
visually noisy.

| Role | strokeColor | backgroundColor |
|---|---|---|
| Component | `#1d4ed8` | `#dbeafe` |
| Decision | `#b45309` | `#fef3c7` |
| Data / storage | `#047857` | `#d1fae5` |
| External actor | `#6d28d9` | `#ede9fe` |
| Error / failure | `#b91c1c` | `#fee2e2` |
| Title / caption text | `#0f172a` | n/a (transparent) |

Stroke width 1.5 for components, 2 for decisions, 1 for captions.

## Minimal correct example

A two-step pipeline: one rectangle → one rectangle, with a label below each
and an arrow between them.

```bash
curl -X POST http://127.0.0.1:5174/publish \
  -H 'Content-Type: application/json' \
  -d '[{
    "op":"replace",
    "path":"/elements",
    "value":[
      {"id":"title","type":"text","x":80,"y":24,"width":600,"height":32,
       "fontSize":22,"text":"Pipeline","strokeColor":"#0f172a",
       "textAlign":"left","verticalAlign":"top","containerId":null,
       "fillStyle":"solid","strokeWidth":1,"roughness":0,"opacity":100},

      {"id":"r1","type":"rectangle","x":120,"y":120,"width":220,"height":100,
       "backgroundColor":"#dbeafe","strokeColor":"#1d4ed8","fillStyle":"solid",
       "strokeWidth":1.5,"roughness":0,"opacity":100,
       "roundness":{"type":3,"value":8}},

      {"id":"l1","type":"text","x":120,"y":228,"width":220,"height":24,
       "fontSize":16,"text":"Load","strokeColor":"#0f172a",
       "textAlign":"center","verticalAlign":"top","containerId":null,
       "fillStyle":"solid","strokeWidth":1,"roughness":0,"opacity":100},

      {"id":"r2","type":"rectangle","x":480,"y":120,"width":220,"height":100,
       "backgroundColor":"#d1fae5","strokeColor":"#047857","fillStyle":"solid",
       "strokeWidth":1.5,"roughness":0,"opacity":100,
       "roundness":{"type":3,"value":8}},

      {"id":"l2","type":"text","x":480,"y":228,"width":220,"height":24,
       "fontSize":16,"text":"Process","strokeColor":"#0f172a",
       "textAlign":"center","verticalAlign":"top","containerId":null,
       "fillStyle":"solid","strokeWidth":1,"roughness":0,"opacity":100},

      {"id":"a1","type":"arrow","x":340,"y":170,"width":140,"height":0,
       "points":[[0,0],[140,0]],
       "strokeColor":"#1d4ed8","strokeWidth":1.5,"roughness":0,"opacity":100,
       "fillStyle":"solid","startArrowhead":null,"endArrowhead":"arrow"}
    ]
  }]'
```

Three rules this example enforces (so it doesn't regress):

1. **Captions are below the shape** — `l1.y = 228 = r1.y + 100 + 8`,
   `l1.textAlign = "center"`, `l1.verticalAlign = "top"`.
2. **The arrow is one straight horizontal segment** — `points:[[0,0],[140,0]]`,
   starts at right edge of `r1`, ends at left edge of `r2`.
3. **No text is centered on any shape interior** — every text element is
   either the canvas title or a shape caption beneath its shape.

## Tabs API (localStorage)

- `archidraw:tabs` — array of `{ id, name, scene }` records
- `archidraw:activeTab` — id of the currently active tab
- Tabs persist across reloads and are auto-saved per sceneVersion bump.

## CLI flags

| Flag | Default | Meaning |
|---|---|---|
| `--port N` | GUI 5173, bridge 5174 | GUI port (bridge = port+1) |
| `--gui-port N` | 5173 | GUI port only |
| `--bridge-port N` | 5174 | Bridge port only |
| `--no-open` | off | Skip launching the browser |
| `--no-bridge` | off | GUI only (no SSE bridge for agent publish) |
| `-h, --help` | — | Print the header comment and exit |

## See also

- `bin/archidraw` — the launcher script
- `packages/gui/src/LayoutPanel.tsx` — Validate/Auto-Fix algorithm
- `packages/bridge/src/server.ts` — SSE bridge source
- `packages/gui/src/Renderer.ts` — canvas render (Inter font, edge-aware text)

## Next step

After publishing elements, point the user at `http://localhost:5173/` to see
the result, and offer to run Validate / Auto-Fix from the toolbar.
