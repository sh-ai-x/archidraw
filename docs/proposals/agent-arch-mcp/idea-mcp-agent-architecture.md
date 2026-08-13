---
title: MCP-based Agent Architecture with Structured Data
slug: idea-mcp-agent-architecture
status: draft
author: dev-kit:evidence-plan
date: 2026-08-13
based_on: /tmp/mcp-agent-research.md
---

# MCP-based Agent Architecture with Structured Data

## Summary

Adopt the **Model Context Protocol (MCP)** as the open standard for the
agent's tool surface, declare all tool inputs in **JSON Schema** generated
from a single source of truth (Zod for TypeScript, Pydantic for Python),
and use **stdio** for local tools + **Streamable HTTP** for remote ones.
Archidraw's existing 9-tool MCP server is a working reference
implementation that the rest of the stack should mirror.

## Background

- The agent layer needs to call external tools (file ops, MCP servers,
  REST APIs) and emit structured data (reports, evidence) — both have
  well-defined schema requirements.
- Without a single tool standard, every LLM client re-implements tool
  glue. Anthropic's MCP and OpenAI's function calling share JSON Schema
  semantics but differ in transport and state model.
- `/tmp/mcp-agent-research.md` (Phase 1 output) collected 20+ cited
  sources on MCP architecture, transport, schema conventions, and
  archidraw's reference implementation.

## Current state

archidraw already implements a canonical MCP architecture:

- `packages/schema/src/zod.ts` is the single source of truth for element
  types, generated into both TypeScript types and JSON Schema for the
  MCP `inputSchema`.
- `packages/mcp-server/src/tools.ts` registers 9 tools (create_element,
  update_element, delete_element, query_elements, group_elements,
  align_elements, get_scene, clear_scene, export_scene) using
  `@modelcontextprotocol/sdk` stdio transport.
- `packages/store/src/` provides `MemorySceneStore` and
  `SqliteSceneStore` implementing the same `SceneStore` interface.
- `packages/bridge/` provides an HTTP+SSE bridge for GUI↔MCP sync,
  with `SceneStore.subscribe(callback)` decoupling state from transport.
- `packages/gui/` consumes the bridge as an SSE client.

What is missing for a "best practice" architecture:
- No tool-level input fuzzing or rate limiting (2026-04-15 OX Security
  RCE advisory on stdio MCP applies).
- No parallel-tool-call batching at the LLM layer (only sequential
  tool invocations).
- No streaming partial results back to the LLM (current responses are
  full-or-nothing).

## Proposed change

### 1. Standardize on MCP for all agent tool surfaces

- Use MCP for any new tool the agent needs (file ops, web fetch,
  evidence verification, skill invocation).
- Transport selection: **stdio** for local (subprocess spawned by
  client), **Streamable HTTP** for remote (the 2025-11+ recommended
  default, replacing pure-SSE).
- Reference: archidraw's stdio MCP server is the canonical pattern.
  Future remote tools should follow the Streamable HTTP design.

### 2. Single source of truth for tool schema

- **TypeScript** — Zod (current archidraw choice). The Zod schema
  produces both `z.infer<>` TypeScript types and the JSON Schema
  for MCP `inputSchema` via `zod-to-json-schema`.
- **Python** — Pydantic v2 (parity for any Python-side tools).
- **Never** duplicate the schema in the LLM prompt and the runtime
  validator. Drift causes silent failures.

### 3. Tool surface design rules

- **snake_case verbs** — `create_element`, `query_elements`,
  `update_scene`. Names that read as natural-language commands.
- **One tool, one job** — no `do_everything` mega-tools. Archidraw
  already does this (9 separate tools).
- **Limit tool count per server** to ~10–20 to reduce LLM selection
  pressure.
- **Plain-language parameter descriptions** with type, format, and
  constraints. The LLM reads the description to decide how to call.
- **JSON-serializable return values** — no class instances, no
  functions. Archidraw's `structuredContent` already follows this.

### 4. Strict mode + parallel tool calls

- **Anthropic** — set `strict: true` on every tool definition to
  guarantee schema-conforming arguments.
- **OpenAI** — use **Structured Outputs** for final response, with
  `response_format: { type: "json_schema", schema: ... }`.
- **Parallel tool calls** — when the agent issues 3 independent
  queries (e.g. read 3 different files), it should call all 3 in
  one LLM response, not 3 sequential round-trips. Saves 2 round-trips
  per parallel batch.

### 5. Transport-decoupled state

- The store (`SceneStore` in archidraw) exposes `subscribe(callback)`.
  The MCP server, the SSE bridge, and any future WebSocket transport
  all attach via `subscribe` without coupling to the transport.
- This means swapping `stdio` for `Streamable HTTP` does NOT change
  store code. The transport adapter is the only thing that changes.

### 6. Security hardening (post 2026-04-15 RCE advisory)

- **Zod-validate every tool input at the MCP server boundary.** No
  passing raw JSON to business logic.
- **Rate-limit** per-tool per-client (e.g. 10 calls/sec for file ops).
- **Origin check** for HTTP transports: only the expected host's CORS
  origins accepted.
- **Audit log** of every tool invocation with: timestamp, tool name,
  arguments hash, caller identity. Stored in a tamper-evident log.

## Pros

- **Reuse across LLM clients** — MCP servers work with Claude Code,
  Codex, and any future client without per-client glue.
- **Single schema source** — Zod (TS) and Pydantic (Python) eliminate
  drift between LLM-facing schema and runtime validator.
- **Strict mode catches bad arguments at the model layer**, not at
  the business-logic layer, so the agent retries with a corrected
  call rather than crashing the tool.
- **Decoupled state** — same store feeds stdio MCP, HTTP SSE bridge,
  and future transports with no code changes.
- **Parallel calls** — measurable latency win (Anthropic docs cite
  ~3x speedup for 3 independent tool calls).

## Cons

- **stdio MCP is a known RCE vector** (2026-04-15 OX Security
  advisory). Production deployments need validation + sandboxing.
- **Strict mode** is supported by Anthropic + OpenAI but NOT by older
  OSS models. If we add OSS local-model support, we lose this
  guarantee.
- **Transport negotiation** for MCP can be fragile when both stdio
  and HTTP+SSE need to coexist in one client (e.g. Claude Code
  supports both but with different lifecycle semantics).
- **Tool count creep** — without discipline, the tool surface will
  grow beyond the LLM's effective selection accuracy (Anthropic
  recommends <20 tools per server).
- **JSON-Patch delta pattern** (archidraw's bridge) requires the
  client to apply patches in order, with no built-in reconnection
  resync. A reconnect during a patch burst can lose intermediate
  state. Need to add resync-on-reconnect (full `get_scene` then
  replay).

## Limitations

- **Not a research paper** — this is operational architecture.
  No benchmarks or empirical comparisons vs LangChain / OpenAI
  Assistants API were run.
- **Assumes MCP stays the standard** — if Anthropic deprecates MCP
  (no signal of this), the cross-client benefit evaporates.
- **Zod-only on the TS side** — if the agent gains Python
  components, the Pydantic mirror is required to keep schemas in
  sync (a real risk).
- **Anthropic's `writing-tools-for-agents` post is dated 2025-09-11**.
  Their guidance may evolve; re-check at next major Anthropic
  release.
- **archidraw is the only reference implementation in scope.** Other
  MCP servers (per the Firecrawl "10 best MCP servers" list) may
  follow different conventions worth comparing.

## References

- Phase 1 research: `/tmp/mcp-agent-research.md` (20+ cited sources)
- archidraw MCP server: `packages/mcp-server/src/tools.ts`
- archidraw schema: `packages/schema/src/zod.ts`
- Anthropic — Writing effective tools for AI agents (2025-09-11):
  https://www.anthropic.com/engineering/writing-tools-for-agents
- MCP Architecture (2026-07-28 spec):
  https://modelcontextprotocol.io/docs/2026-07-28/learn/architecture
- MCP Tools spec: https://modelcontextprotocol.io/specification/2026-07-28/server/tools
- OpenAI Function calling:
  https://developers.openai.com/api/docs/guides/function-calling
- CSA: MCP STDIO RCE (2026-04-15):
  https://labs.cloudsecurityalliance.org/research/csa-research-note-mcp-rce-design-vulnerability-20260423-csa/
