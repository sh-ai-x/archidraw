# CHANGELOG -- archidraw

## [0.1.0] -- 2026-08-11

### Initial release

First end-to-end MVP of an Excalidraw-class browser whiteboard with Model Context Protocol (MCP) integration. The same scene-state is editable from both the browser GUI and Claude Code / Codex via MCP, and changes propagate between the two surfaces within 1 second.

### Added

- **@archidraw/schema** -- strict TypeScript types and zod schemas for Excalidraw elements (rectangle, ellipse, diamond, arrow, line, freedraw, text, image, group). passthrough for extension fields like seed so hand-drawn visual data is preserved.
- **@archidraw/store** -- in-memory SceneStore with create/update/delete/query plus JSON Patch (RFC 6902) diff subscription. Optional SQLite backend (SqliteSceneStore) gated by --db <path>, with WAL mode and process-restart round-trip.
- **@archidraw/mcp-server** -- @modelcontextprotocol/sdk server exposing 9 tools over stdio: create_element, update_element, delete_element, query_elements, group_elements, align_elements, get_scene, clear_scene, export_scene. Inputs validated by zod with MCP error code -32602 on failure.
- **@archidraw/gui** -- Vite + React + TypeScript infinite canvas with pan/zoom, 6 toolbar tools (select/rectangle/ellipse/arrow/text/freedraw), rough.js + perfect-freehand for the hand-drawn aesthetic, and localStorage scene round-trip.
- **@archidraw/bridge** -- local SSE bridge on localhost:5174 with a swappable transport interface (SSE default, WebSocket adapter future). Bidirectional scene-delta sync between MCP server and the GUI.
- **e2e/** -- Playwright 4-step scenario (draw -> query -> update -> delete) with auto-screenshots and a generated report.md.
- **Monorepo root** -- pnpm workspace with pnpm -r build, dev:gui, dev:mcp, dev:bridge, e2e scripts.
- **README** -- quickstart, Claude Code MCP registration snippet, and a "Try this prompt" recipe.
- **docs/architecture.md, docs/quickstart-mcp.md** -- layered architecture and multi-client MCP registration.

### CI / hooks

- ci.yml -- branch-policy + validate + test jobs on PR and direct trunk commit.
- review.yml -- 3-dim PR review, 10-dim OWASP scan, severity gate.
- auto-fix-pr.yml -- auto-fix loop on changes_requested review (5-iter cap).
- .githooks/pre-push -- client-side block of direct trunk commit.
- scripts/ci-local.sh -- local-runner entrypoint (validate + test + optional act -l).

### Notes

- This is the first cut. Collaboration (Yjs), mobile/tablet, and cloud auth are explicitly out of scope for 0.1.0. See PRD.md section 3 Non-goals.
- All 7 steps verified locally: pnpm --filter @archidraw/<pkg> test exit 0 for schema, store, mcp-server, gui, bridge, and the end-to-end Playwright suite.
