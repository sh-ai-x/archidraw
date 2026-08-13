# Step 0 — Reference compliance audit

> Phase A of `mcp-agent-arch` plan.

## Status

- **Status**: todo
- **Phase**: A
- **Estimate**: 60 min
- **Depends on**: none
- **Owner**: dev-kit:build (TDD-gated)

## Read first

1. `PRD.md` §1 (frame) + §2 (evidence) — overall goal and cited sources
2. `../../docs/proposals/agent-arch-mcp/idea-mcp-agent-architecture.html` — Phase 2 proposal
3. `/tmp/mcp-agent-research.md` — full cited research
4. `packages/mcp-server/src/tools.ts` — current 9-tool surface (read in full, take notes)
5. `packages/schema/src/zod.ts` — single-source-of-truth schema

## Task

Audit `packages/mcp-server/src/tools.ts` against Anthropic's "Writing effective tools for AI agents" (2025-09-11) checklist. Fix any gaps in place. Establish archidraw's MCP server as the canonical pattern for any new agent tools.

## Acceptance criteria

- [ ] All 9 tools pass review against the checklist:
  - snake_case verb names (✓ for archidraw already)
  - One tool, one job (✓)
  - Plain-language parameter descriptions with type/format/constraints
  - JSON-serializable return values
  - Tool count ≤ 20 (✓ — 9 tools)
- [ ] All tools have strict-mode equivalents: Zod schema rejects any input that the JSON Schema would reject
- [ ] No hand-written JSON Schema duplicates — every `inputSchema` is generated from the Zod source
- [ ] Fuzz test: 100 random invalid inputs per tool, all return a structured error (no crashes, no panics)
- [ ] Docs updated: a comment in `tools.ts` references the Anthropic post + archidraw's role as the canonical pattern

## Verification

```bash
cd /Users/sanghee/dev/archidraw
pnpm --filter @archidraw/mcp-server test
# Expected: 3/3 pass (existing) + new fuzz tests

# Manual code review against checklist
grep -c "inputSchema" packages/mcp-server/src/tools.ts  # should be 9 (one per tool)
grep -c "z\\." packages/mcp-server/src/tools.ts            # heavy Zod usage expected
```

## Don't

- Don't redesign the tool surface (Phase B handles security; this is audit-only)
- Don't add new tools (the canonical 9 are sufficient for the archidraw use case)
- Don't change transports (stdio stays; Streamable HTTP migration is Phase D, out of scope)
- Don't rewrite the Zod schema — only verify it's the single source of truth
