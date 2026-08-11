# Architecture

Archidraw is a local-first monorepo. The GUI owns presentation, the MCP server owns the tool boundary, and the bridge carries scene changes between the two processes.

## Layers

### Schema

`@archidraw/schema` defines the Excalidraw-compatible element and scene types plus Zod validation. It is the shared contract imported by the store and MCP packages.

### Store

`@archidraw/store` provides the scene aggregate: create, update, delete, query, grouping, alignment, clear, export, and JSON Patch-style subscriptions. The memory store is used for fast local operations; the SQLite adapter supplies file-backed persistence when `--db` is passed to the MCP server.

### MCP

`@archidraw/mcp-server` runs over stdio and exposes nine tools: create, update, delete, query, group, align, get-scene, clear-scene, and export-scene. Claude Code starts it as a child process, so stdout remains reserved for MCP protocol traffic and diagnostics go to stderr.

### GUI

`@archidraw/gui` is a Vite + React app at `http://localhost:5173`. It renders scene elements on the canvas, supports basic drawing and selection interactions, and persists the local scene in browser storage.

### Bridge

`@archidraw/bridge` is a localhost-only SSE service at `http://127.0.0.1:5174`. The GUI subscribes to `GET /events`; publishers send RFC 6902 scene deltas to `POST /publish`. The transport interface keeps the application independent from SSE and leaves room for a future adapter.

## Runtime flow

```text
Claude Code --stdio--> MCP server --scene delta--> bridge --SSE--> GUI
     ^                                                         |
     └────────────── query/update result ----------------------┘
```

The MCP process and bridge are intentionally separate. This keeps the MCP protocol on stdio while allowing the browser to use ordinary HTTP and EventSource APIs.

## E2E

`@archidraw/e2e` starts deterministic local fixtures and exercises draw → query → update → delete. Each stage captures a screenshot, making the cross-process contract reviewable without Docker or a hosted service.
