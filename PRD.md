# PRD: MCP-based Agent Architecture

> Derived from `/dev-kit:evidence-plan` Phase 1 research + Phase 2 proposal.
> Phase 3 manual write (auto-emit from plan skill not available in this session).

## 1. Frame

**Goal**: Adopt Anthropic's Model Context Protocol (MCP) as the open standard for the agent's tool surface, with single-source-of-truth JSON Schema (Zod for TypeScript, Pydantic for Python), strict mode + parallel tool calls at the LLM layer, transport-decoupled state via the `subscribe()` pattern, and post-2026-04-15 RCE-advisory security hardening. Archidraw is the reference implementation; new agent code mirrors its 9-tool design.

**Target user**: Agent engineers integrating AI into developer tools. They need tool servers that work across Claude Code, Codex, and any future MCP client without per-client glue.

**Situation**: Today, every LLM client re-implements tool glue. Anthropic's MCP and OpenAI's function calling share JSON Schema semantics but differ in transport and state model. Without a single tool standard, agent code is fragmented and the schema drifts between LLM-facing definitions and runtime validators.

**Acceptance criteria**:
1. New agent tools in this repo are exposed as MCP servers (stdio for local, Streamable HTTP for remote) — verified by `gh`/`claude`/`codex` listing the server
2. Every tool's `inputSchema` is derived from a single Zod or Pydantic schema, NOT hand-written JSON Schema — verified by `grep -r "inputSchema:" packages/*/src` showing only generated references
3. All Anthropic tool definitions have `strict: true`; OpenAI final responses use Structured Outputs
4. Agent can issue parallel tool calls in a single LLM turn for independent operations
5. State is decoupled from transport: same store feeds stdio MCP + HTTP SSE bridge + future transports without code changes
6. Every MCP tool input is Zod-validated at the server boundary; bad input returns a structured error, not a crash
7. Reference: archidraw's 9-tool MCP server is the canonical pattern

**Non-goals**:
1. **Replace all existing tools in this repo with new MCP servers in one PR.** Migration is incremental; archidraw's existing tools are already MCP-compliant and stay as-is.
2. **Add OSS-local-model support that requires non-strict tool definitions.** Strict mode is required; OSS models without strict-mode support are out of scope until upstream Anthropic/OpenAI add equivalent guarantees.
3. **Replace archidraw's SSE bridge with full WebSocket duplex.** SSE is sufficient for one-way scene-delta fan-out. WS is a future transport choice, not a current one.
4. **Build a UI to view/manage the agent's tool surface.** Tool management is via `claude mcp add` / `codex mcp add`, not a custom UI.

## 2. Evidence

Cited in `/tmp/mcp-agent-research.md`. Key sources:
- [MCP Architecture (2026-07-28 spec)](https://modelcontextprotocol.io/docs/2026-07-28/learn/architecture) — primitives + transport
- [Anthropic: Writing effective tools for AI agents (2025-09-11)](https://www.anthropic.com/engineering/writing-tools-for-agents) — tool surface design rules
- [OpenAI: Function calling docs](https://developers.openai.com/api/docs/guides/function-calling) — JSON Schema + parallel calls
- [CSA: MCP STDIO RCE (2026-04-15)](https://labs.cloudsecurityalliance.org/research/csa-research-note-mcp-rce-design-vulnerability-20260423-csa/) — security imperative

Reference implementation: archidraw `packages/mcp-server/src/tools.ts` (9 tools, Zod-derived JSON Schema, stdio transport).

## 3. Validation

- **Value score**: 4.0/5.0. Single schema source eliminates drift (a real bug class). MCP cross-client reuse avoids per-LLM glue.
- **Ambiguity score**: 2.0/10. Scope is bounded: standardize on existing patterns (archidraw is the reference). New work is incremental.
- **Cumulative ambiguity after 1 cycle**: still 2.0/10 (no unresolved questions).

## 4. Phase decomposition

3 phases, each with explicit DoD. Run order: A → B → C. Phases A and B can be parallelized (independent surfaces); C depends on both.

### Phase A — Reference compliance audit

Audit archidraw's current MCP server against the best-practice checklist from Phase 1 research. Fix gaps in place. Establishes the canonical pattern for any new MCP servers in this repo.

DoD:
- [ ] `packages/mcp-server/src/tools.ts` tool list passes review against "Writing effective tools for AI agents"
- [ ] All 9 tools have `strict: true` equivalents
- [ ] Zod schema is the single source — no hand-written JSON Schema duplicates
- [ ] No runtime crashes from malformed inputs (test with 100 random invalid inputs per tool)
- [ ] Reference docs updated to mark archidraw MCP server as the canonical pattern

### Phase B — Security hardening (post 2026-04-15 RCE advisory)

Apply the 4 mitigations listed in the proposal: input validation, rate limiting, origin check, audit log.

DoD:
- [ ] Zod validation at the MCP server boundary returns structured error on bad input
- [ ] Per-tool per-client rate limit (configurable, default 10/sec)
- [ ] Origin check on HTTP+SSE transport (only expected host CORS)
- [ ] Audit log of every tool invocation: timestamp, tool, args hash, caller ID
- [ ] Tamper-evident log storage (append-only file with hash chain)
- [ ] Pentest: 50 fuzzed inputs per tool, verify no crash or unbounded resource use

### Phase C — Cross-client verification + docs

Verify the archidraw MCP server works with Claude Code, Codex, and one other client (e.g. Continue.dev). Document the integration in README.

DoD:
- [ ] `claude mcp add` registers the server, tools appear in `claude`'s tool list
- [ ] `codex mcp add` does the same
- [ ] At least 5 end-to-end tool calls succeed from each client
- [ ] README has a "MCP integration" section with copy-paste-ready commands
- [ ] A runbook for the 2026-04-15 RCE advisory is linked from CONTRIBUTING.md

## 5. Hand-off to build

Hand-off: `.dev-kit/hand-off/plan→build.md` (to be emitted by Gate 5/5).

Per `/dev-kit:plan` flow, the build phase would:
- Read this PRD + phases/mcp-agent-arch/{index.json, step<N>.md}
- Dispatch steps via `/dev-kit:build` with per-step sub-agents
- TDD-gate each step (must include regression test)
- Verify via `/dev-kit:build-verify` before declaring done

## 6. Open questions

- **Will Anthropic ship a "MCP Apps" / UI capability?** (rumored 2026-Q1). If yes, may need to add `resources` primitives for UI surfaces. [src:blog post 2026-01-26] — wait and reassess.
- **Should we adopt the new `2026-07-28` Streamable HTTP transport now, or wait?** Archidraw currently uses legacy SSE. Migration is a Phase D addition, not in scope.
- **Anthropic's `writing-tools-for-agents` post is 2025-09-11.** Re-check at next major release. Likely stable guidance but worth a refresh every 6 months.
