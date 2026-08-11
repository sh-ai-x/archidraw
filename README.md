# archidraw

> Excalidraw-class browser whiteboard with Model Context Protocol (MCP) integration.
> Draw diagrams in the browser GUI and edit the same scene from Claude Code / Codex via MCP.

## Highlights

- Single source of truth: Excalidraw JSON schema. The GUI and the MCP server mutate the same scene.
- Bidirectional sync: A change in the GUI appears in the MCP server within 1 second (and vice versa) via a local SSE bridge.
- 9 MCP tools: create_element, update_element, delete_element, query_elements, get_scene, clear_scene, export_scene, group_elements, align_elements.
- Hand-drawn aesthetic: rough.js + perfect-freehand for the Excalidraw look, MIT-licensed, lightweight.
- Self-hosted: No cloud account, no auth. Runs on localhost.

## Repository layout

```
archidraw/
  packages/
    schema/       Excalidraw element types + zod schemas (TypeScript)
    store/        in-memory SceneStore + JSON Patch + SqliteSceneStore
    mcp-server/   @modelcontextprotocol/sdk stdio server (9 tools)
    gui/          Vite + React + rough.js infinite canvas
    bridge/       local SSE bridge (MCP <-> GUI scene-delta)
  e2e/            Playwright 4-step scenario
  docs/
    architecture.md
    quickstart-mcp.md
  scripts/        ci-local.sh, validate.py, test.sh, branch-policy.sh
  .github/workflows/  CI, PR review, security scan, auto-fix
  PRD.md          6-section plan
  CHANGELOG.md
```

## Prerequisites

- Node.js >= 18
- pnpm >= 8 (or npm workspaces)
- Optional: act to run GitHub Actions locally (brew install act)
- For MCP registration: Claude Code >= 1.0 or any MCP-compatible client

## Setup

```bash
git clone https://github.com/sh-ai-x/archidraw.git
cd archidraw
pnpm install
pnpm -r build
```

## Running the three processes

You need three processes running in parallel. Open three terminals:

### Terminal 1 -- MCP server (stdio)

```bash
cd /path/to/archidraw
pnpm dev:mcp
# or directly:
pnpm exec archidraw-mcp --db /tmp/archidraw.db
```

The server listens on stdio. It only talks when a client (Claude Code) connects. Logs go to stderr.

### Terminal 2 -- Bridge (SSE bridge on port 5174)

```bash
cd /path/to/archidraw
pnpm dev:bridge
```

The bridge exposes http://localhost:5174/events (SSE stream) and http://localhost:5174/publish (HTTP POST). The MCP server publishes scene-deltas to this bridge; the GUI subscribes to receive them.

### Terminal 3 -- GUI (Vite dev server on port 5173)

```bash
cd /path/to/archidraw
pnpm dev:gui
```

Open http://localhost:5173 in your browser. You should see an empty infinite canvas with a left toolbar.

## Register the MCP server with Claude Code

Edit ~/.claude.json (or use /mcp in Claude Code):

```json
{
  "mcpServers": {
    "archidraw": {
      "command": "pnpm",
      "args": ["-C", "/path/to/archidraw", "exec", "archidraw-mcp", "--db", "/tmp/archidraw.db"]
    }
  }
}
```

Restart Claude Code. Run /mcp -- you should see 9 tools listed:

- create_element, update_element, delete_element
- query_elements, get_scene, clear_scene, export_scene
- group_elements, align_elements

## GUI shortcuts

| Key | Action |
|-----|--------|
| V | Select tool |
| R | Rectangle |
| O | Ellipse |
| D | Diamond |
| A | Arrow |
| L | Line |
| T | Text |
| P | Freedraw |
| Space + drag | Pan |
| Wheel | Zoom |
| Backspace / Delete | Delete selected |
| Cmd/Ctrl + Z | Undo |

Scenes auto-save to localStorage and restore on reload.

## Try this prompt

After pnpm dev:gui and pnpm dev:bridge are running, open http://localhost:5173 and use Claude Code:

```
Create a rectangle named 'api-gateway' at 200,200 with width 200 height 80.
Then create another rectangle 'postgres' at 600,200 with width 200 height 80.
Add an arrow from api-gateway to postgres.
List all elements.
```

Each call should appear in the GUI within 1 second. The MCP server logs the request, the bridge publishes the delta, the GUI patches it in.

## End-to-end test

```bash
pnpm -w e2e test
```

This runs the Playwright scenario in e2e/scenarios/full-flow.spec.ts:
1. Draw a rectangle via the GUI
2. Query via MCP
3. Update via MCP
4. Delete via MCP

Screenshots land in e2e/screenshots/.

## Local CI

```bash
bash scripts/ci-local.sh
```

This runs validate.py + test.sh (pytest-style). Use this before pushing a PR.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| GUI does not reflect MCP changes | Check pnpm dev:bridge is running on port 5174. Restart it. |
| MCP tools not visible in Claude Code | Verify ~/.claude.json has the entry; restart Claude Code. |
| archidraw-mcp command not found | Run pnpm -r build first. |
| Stale scene data | Delete /tmp/archidraw.db and restart pnpm dev:mcp. |
| Browser shows blank canvas | Open DevTools console; usually a missing bridge. Confirm pnpm dev:bridge is up. |
| Tests fail on a fresh clone | Ensure pnpm install ran and node_modules is present in each package. |

## Architecture

```
+----------------+    stdio    +----------------+   publish   +---------------+
|  Claude Code   | <--------> | archidraw-mcp  | ----------> | archidraw-    |
|  MCP client    |             |  (9 tools)     |             | bridge (SSE)  |
+----------------+             +----------------+             | :5174         |
                                                                  +-------+-------+
                                                                          |
                                                                          | SSE subscribe
                                                                          v
                                                                  +---------------+
                                                                  |  Browser GUI  |
                                                                  |  (Vite+React) |
                                                                  |  :5173        |
                                                                  +---------------+
                                                                          |
                                                                          | localStorage
                                                                          v
                                                                  [scene JSON]
                                                                  (canonical Excalidraw v)
```

The Excalidraw JSON schema is the single source of truth. The MCP server, the bridge, and the GUI all read/write the same JSON Patch (RFC 6902) deltas.

See docs/architecture.md for the layer-by-layer breakdown and docs/quickstart-mcp.md for non-Claude-Code MCP clients (Zed, Continue, Cursor).

## Development

### Workspace structure

This is a pnpm monorepo. Each package has its own package.json and test/ directory.

```bash
# Run schema tests only
pnpm --filter @archidraw/schema test

# Run all tests
pnpm -r --workspace-concurrency=2 test

# Build a single package
pnpm --filter @archidraw/gui build
```

### Adding a new MCP tool

1. Add a zod input schema in packages/schema/src/zod.ts.
2. Implement the handler in packages/mcp-server/src/tools/<tool>.ts.
3. Register it in packages/mcp-server/src/server.ts via server.tool(...).
4. Add a Playwright scenario in e2e/scenarios/.

### CI / dev-kit hooks

This repo uses the dev-kit CI templates (.dev-kit/ci-config.json marker). The four key hooks are:

- worktree-guard -- blocks edits in the trunk checkout; use a per-step worktree.
- git-guard -- blocks direct trunk commit; use feature branches and PRs.
- tdd-guard -- blocks production code without a failing test.
- secret-scan -- blocks credentials in source.

Run bash scripts/ci-local.sh to verify everything before pushing.

## Out of scope (per PRD section 3)

- Real-time multi-user collaboration (Yjs) -- design-time only; the bridge abstraction reserves a slot for a future Yjs adapter.
- Cloud account / auth / billing.
- Mobile / tablet native apps.
- Export formats beyond SVG / PNG.

## License

MIT.
