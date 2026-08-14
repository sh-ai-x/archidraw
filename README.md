# Archidraw

Archidraw is a local, MCP-controlled whiteboard: Claude Code edits a scene and the Vite GUI renders it live through a localhost bridge.

![Archidraw demo](e2e/screenshots/01-drawn.png)

## Quickstart

```bash
pnpm i && pnpm build && pnpm dev:gui
```

In a second terminal, start the bridge:

```bash
pnpm dev:bridge
```

Open <http://localhost:5173>.

## Install as an MCP plugin (Claude Code)

The repo itself is a Claude Code plugin. The manifest at `.claude-plugin/plugin.json` declares the `archidraw` MCP server, `.claude-plugin/mcp.json` ships the server wiring (with `${CLAUDE_PLUGIN_ROOT}` paths substituted by Claude Code at launch), and `bin/archidraw-mcp` is the stdio entrypoint shared with Codex.

```bash
# from a clone of this repo
git clone https://github.com/sh-ai-x/archidraw.git
cd archidraw

# Build the install tarball (excludes node_modules; the shim installs deps on first run)
git archive -o /tmp/archidraw-0.2.0.tgz HEAD
# or:  pnpm pack --pack-destination /tmp

claude plugin install /tmp/archidraw-0.2.0.tgz
```

Claude Code runs the shim, which on first call installs dependencies (`pnpm install --prod --frozen-lockfile`) and builds the MCP server (`pnpm --filter @archidraw/mcp-server build`). Subsequent calls hit the cached `dist/`.

## Install as an MCP plugin (Codex)

The repo carries a parallel manifest at `.codex-plugin/plugin.json` pointing at `.codex-plugin/mcp.json`. The wire format mirrors Claude Code, but the command/args paths differ (see the caveat below).

```bash
# Option A — install via marketplace snapshot (if published)
codex plugin marketplace add sh-ai-x/archidraw
codex plugin install archidraw@sh-ai-x-archidraw

# Option B — manual registration from a clone
codex mcp add archidraw "$(pwd)/bin/archidraw-mcp"
```

**Caveat (Codex-specific):** Codex CLI does not yet substitute `${CLAUDE_PLUGIN_ROOT}` or `${CLAUDE_PLUGIN_DATA}` in `.mcp.json` `command`/`args` fields (open bug: openai/codex#19582 — *"`Codex CLI should interpolate `${CLAUDE_PLUGIN_ROOT}` in `.mcp.json` `args[]` and `command`"*). Until that bug lands, the relative `command: "bin/archidraw-mcp"` path inside `.codex-plugin/mcp.json` only resolves when Codex launches the process with cwd = plugin cache root; otherwise use Option B (`codex mcp add` with the absolute path). The shim's `bin/..` fallback works either way — DB lands at `<install-root>/.data/archidraw.db`.

## Manual MCP registration (fallback)

If you'd rather not use the plugin or Codex config path, add this object to Claude Code's `~/.claude.json` (replace `<clone>` with the absolute clone path):

```json
{
  "mcpServers": {
    "archidraw": {
      "command": "pnpm",
      "args": ["-C", "<clone>", "exec", "archidraw-mcp", "--db", "/tmp/archidraw.db"]
    }
  }
}
```

Restart Claude Code or run `/mcp`. The `archidraw` server exposes nine scene tools.

## Try this prompt

Open localhost:5173, then in Claude Code: `Create a rectangle named 'auth' at 200,200`. Confirm the rectangle appears in the GUI.

## Architecture

```text
┌──────────────┐    scene deltas    ┌──────────────┐    tool calls    ┌──────────────┐
│ GUI :5173    │ <────────────────> │ bridge :5174 │ <──────────────> │ MCP (stdio)  │
│ Vite + React │                    │ local SSE    │                    │ 9 tools      │
└──────────────┘                    └──────────────┘                    └──────────────┘
```

The layered design is described in [docs/architecture.md](docs/architecture.md). For Zed and Continue, see [docs/quickstart-mcp.md](docs/quickstart-mcp.md).

## Screenshots

| Draw | Query | Update | Delete |
|---|---|---|---|
| ![Draw](e2e/screenshots/01-drawn.png) | ![Query](e2e/screenshots/02-queried.png) | ![Update](e2e/screenshots/03-updated.png) | ![Delete](e2e/screenshots/04-deleted.png) |

### MCP agent architecture (live-drawn via bridge SSE)

![MCP agent architecture](docs/screenshots/archidraw-gui-diagram.png)

The diagram above was created by sending 22 `create_element` tool calls through the running MCP server, then broadcast over the bridge SSE pipeline. End-to-end latency ≈ 100ms. **This is archidraw drawing archidraw's own architecture** — the diagram is the system describing itself.

#### The seven components in the diagram

| Component | Port / Transport | Role |
|---|---|---|
| **LLM (Claude Code / Codex)** | stdio | Agent runtime. Sends JSON-RPC 2.0 `tools/call` to the MCP server. Receives tool results, emits tool calls. |
| **MCP Client** | stdio | Process-local connector inside the LLM host. Maintains a 1:1 connection to the MCP server. Implements the MCP protocol's [Host → Client → Server] role separation. |
| **MCP Server** (`packages/mcp-server/`) | stdio | Exposes 9 tools: `create_element`, `update_element`, `delete_element`, `query_elements`, `group_elements`, `align_elements`, `get_scene`, `clear_scene`, `export_scene`. Each tool has a Zod-derived JSON Schema. |
| **Zod schema (SoT)** | — | Single source of truth at `packages/schema/src/zod.ts`. Derives both TypeScript types (`z.infer<>`) and the MCP `inputSchema` (via `zod-to-json-schema`). No hand-written JSON Schema duplicates. |
| **Store (subscribe)** | — | Scene state holder (`MemorySceneStore` or `SqliteSceneStore`). Implements the `SceneStore` interface. `store.subscribe(callback)` fires JsonPatchOperations on every mutation. Decoupled from transport. |
| **HTTP+SSE Bridge** | `:5174` | Localhost-only SSE server. Receives publishes via `POST /publish` and broadcasts via `GET /events` (Server-Sent Events). RFC 6902 JsonPatch format. |
| **GUI (Vite)** | `:5173` | React + Vite app. Subscribes to bridge SSE via `EventSource`. Applies JsonPatches to local in-memory store. Re-renders canvas via rough.js + perfect-freehand. |

#### The data flow (9 steps)

```
1. LLM emits: tools/call {name: "create_element", arguments: {id, type, x, y, ...}}
2. MCP Client → MCP Server (over stdio JSON-RPC 2.0)
3. Server validates args via Zod, calls store.createElement()
4. Store emits: [{op: "add", path: "/elements/-", value: <element>}]
5. HttpBridgeTransport.publish POSTs to http://127.0.0.1:5174/publish
6. Bridge broadcasts via SSE to all connected /events subscribers
7. GUI EventSource receives the scene-delta event
8. App useEffect applies the patch to the local scene store
9. Canvas re-renders, displaying the new element
```

End-to-end latency: ~100ms. Reverse path: same wire (LLM tool result via stdio).

#### Why each design decision was made

- **Single source of truth for schema** (Zod in TypeScript, Pydantic mirror in Python): eliminates drift between the LLM-facing JSON Schema and the runtime validator. Both are derived from the same Zod declarations.
- **Transport-decoupled state** (`SceneStore.subscribe(callback)`): the same store feeds stdio MCP, HTTP-SSE bridge, and any future WebSocket transport without code changes. Adding a new transport is just wiring a new subscriber.
- **JSON-Patch over SSE** (RFC 6902): minimal bandwidth, ordered, idempotent. Every mutation is a small set of operations (`add`, `replace`, `remove`, `test`).
- **stdio for local, HTTP+SSE for GUI sync** (not Streamable HTTP yet): MCP officially recommends stdio for local tools; archidraw uses legacy SSE for the GUI↔MCP sync because the GUI cannot speak stdio (it's a browser). Streamable HTTP migration is Phase D (out of scope).
- **9 tools, not 1 mega-tool**: Anthropic's *writing-tools-for-agents* post recommends one tool per job. The 9 tools are: scene CRUD (5) + group/align (2) + export (1) + clear (1). Tool count <20 keeps the LLM's selection accuracy high.

#### The diagram itself was drawn via this same pipeline

The 7 boxes + 7 arrows + 8 text labels in the screenshot above were created by the `create_element` MCP tool. The full round-trip — Claude → MCP server → store.subscribe → HttpBridgeTransport → bridge POST → SSE broadcast → GUI EventSource → App useEffect → store.createElement → Canvas re-render — is the same pipeline the user uses when running `Create a rectangle named 'auth' at 200,200` in Claude Code.

The diagram is the system describing itself.

### MCP agent architecture (live-drawn via bridge SSE)

![MCP agent architecture](docs/screenshots/archidraw-gui-diagram.png)

The diagram above was created by sending 22 `create_element` tool calls through the running MCP server, then broadcast over the bridge SSE pipeline. End-to-end latency ≈ 100ms. **This is archidraw drawing archidraw's own architecture** — the diagram is the system describing itself.

#### The seven components in the diagram

| Component | Port / Transport | Role |
|---|---|---|
| **LLM (Claude Code / Codex)** | stdio | Agent runtime. Sends JSON-RPC 2.0 `tools/call` to the MCP server. Receives tool results, emits tool calls. |
| **MCP Client** | stdio | Process-local connector inside the LLM host. Maintains a 1:1 connection to the MCP server. Implements the MCP protocol's [Host → Client → Server] role separation. |
| **MCP Server** (`packages/mcp-server/`) | stdio | Exposes 9 tools: `create_element`, `update_element`, `delete_element`, `query_elements`, `group_elements`, `align_elements`, `get_scene`, `clear_scene`, `export_scene`. Each tool has a Zod-derived JSON Schema. |
| **Zod schema (SoT)** | — | Single source of truth at `packages/schema/src/zod.ts`. Derives both TypeScript types (`z.infer<>`) and the MCP `inputSchema` (via `zod-to-json-schema`). No hand-written JSON Schema duplicates. |
| **Store (subscribe)** | — | Scene state holder (`MemorySceneStore` or `SqliteSceneStore`). Implements the `SceneStore` interface. `store.subscribe(callback)` fires JsonPatchOperations on every mutation. Decoupled from transport. |
| **HTTP+SSE Bridge** | `:5174` | Localhost-only SSE server. Receives publishes via `POST /publish` and broadcasts via `GET /events` (Server-Sent Events). RFC 6902 JsonPatch format. |
| **GUI (Vite)** | `:5173` | React + Vite app. Subscribes to bridge SSE via `EventSource`. Applies JsonPatches to local in-memory store. Re-renders canvas via rough.js + perfect-freehand. |

#### The data flow (6 hops)

```
1. LLM emits: tools/call {name: "create_element", arguments: {id, type, x, y, ...}}
2. MCP Client → MCP Server (over stdio JSON-RPC 2.0)
3. Server validates args via Zod, calls store.createElement()
4. Store emits: [{op: "add", path: "/elements/-", value: <element>}]
5. HttpBridgeTransport.publish POSTs to http://127.0.0.1:5174/publish
6. Bridge broadcasts via SSE to all connected /events subscribers
7. GUI EventSource receives the scene-delta event
8. App useEffect applies the patch to the local scene store
9. Canvas re-renders, displaying the new element
```

End-to-end latency: ~100ms. Reverse path: same wire (LLM tool result via stdio).

#### Why each design decision was made

- **Single source of truth for schema** (Zod in TypeScript, Pydantic mirror in Python): eliminates drift between the LLM-facing JSON Schema and the runtime validator. Both are derived from the same Zod declarations.
- **Transport-decoupled state** (`SceneStore.subscribe(callback)`): the same store feeds stdio MCP, HTTP-SSE bridge, and any future WebSocket transport without code changes. Adding a new transport is just wiring a new subscriber.
- **JSON-Patch over SSE** (RFC 6902): minimal bandwidth, ordered, idempotent. Every mutation is a small set of operations (`add`, `replace`, `remove`, `test`).
- **stdio for local, HTTP+SSE for GUI sync** (not Streamable HTTP yet): MCP officially recommends stdio for local tools; archidraw uses legacy SSE for the GUI↔MCP sync because the GUI cannot speak stdio (it's a browser). Streamable HTTP migration is Phase D (out of scope).
- **9 tools, not 1 mega-tool**: Anthropic's *writing-tools-for-agents* post recommends one tool per job. The 9 tools are: scene CRUD (5) + group/align (2) + export (1) + clear (1). Tool count <20 keeps the LLM's selection accuracy high.

#### The diagram itself was drawn via this same pipeline

The 7 boxes + 7 arrows + 8 text labels in the screenshot above were created by the `create_element` MCP tool. The full round-trip — Claude → MCP server → store.subscribe → HttpBridgeTransport → bridge POST → SSE broadcast → GUI EventSource → App useEffect → store.createElement → Canvas re-render — is the same pipeline the user uses when running `Create a rectangle named 'auth' at 200,200` in Claude Code.

The diagram is the system describing itself.

## Development

```bash
pnpm -r build
pnpm test
pnpm e2e
```

Docker, Docker Compose, CI workflows, and automatic versioning are intentionally outside this MVP.
