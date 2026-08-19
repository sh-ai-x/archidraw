---
name: archidraw
description: Launch archidraw — the Excalidraw-compatible scene editor for AI agents.
triggers:
  - "start archidraw"
  - "archidraw dev"
  - "/dev-kit:archidraw"
  - "open archidraw"
---

# archidraw

Local Excalidraw-style scene editor with an SSE bridge that lets AI agents
publish scene deltas into a running canvas.

## What it does
- Serves the GUI on `:5173` (Vite, hot-reload).
- Serves an SSE bridge on `:5174` so agents (Claude Code, Codex) can
  POST JSON-Patch deltas to push elements (rectangles, ellipses, diamonds,
  arrows, text) into the live canvas.
- Supports tabs (per-tab scenes in localStorage), Save/Load to JSON,
  Validate / Auto-Fix (AABB overlap + text-overflow checker with greedy
  extend-parent / push-siblings repair), and 📷 PNG download.

## When to use
- The user wants to draw a diagram interactively.
- The user wants to embed a generated diagram from a script/agent
  (POST a `replace /elements` delta to `:5174/publish`).
- The user wants to validate or auto-arrange an existing scene.

## How to launch

```bash
# from archidraw repo root:
./bin/archidraw                       # GUI on :5173, bridge on :5174, opens browser
./bin/archidraw --no-open             # don't open browser
./bin/archidraw --port 5180          # custom port (bridge = port+1)
./bin/archidraw --no-bridge           # GUI only (no agent publish)
```

If `./bin/archidraw` isn't there yet, install first:
```bash
pnpm install
```

## How to publish from an agent/skill

Bridge endpoint: `POST http://127.0.0.1:5174/publish`

Body: an array of JSON-Patch operations (RFC 6902). The full Excalidraw
shape set is supported:

```bash
curl -X POST http://127.0.0.1:5174/publish \
  -H 'Content-Type: application/json' \
  -d '[{
    "op": "replace",
    "path": "/elements",
    "value": [
      {"id":"t1","type":"text","x":100,"y":40,"width":600,"height":24,
       "fontSize":26,"text":"My Diagram","strokeColor":"#0f172a",
       "textAlign":"center","verticalAlign":"middle","containerId":null,
       "fillStyle":"solid","strokeWidth":1,"roughness":0,"opacity":100},
      {"id":"r1","type":"rectangle","x":80,"y":90,"width":300,"height":120,
       "backgroundColor":"#dbeafe","strokeColor":"#1d4ed8","fillStyle":"solid",
       "strokeWidth":1.5,"roughness":0,"opacity":100,"roundness":{"type":3,"value":8}}
    ]
  }]'
```

From inside the browser (recommended — bypasses CORS):
```js
await fetch("http://127.0.0.1:5174/publish", {
  method: "POST",
  headers: { "Content-Type": "application/json", "Origin": "http://localhost:5173" },
  body: JSON.stringify([{ op: "replace", path: "/elements", value: elements }]),
});
```

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
- `packages/gui/src/Renderer.ts` — canvas render (Inter font, center text)
