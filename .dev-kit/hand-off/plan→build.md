---
status: ok
date: 2026-08-13
from: dev-kit:evidence-plan
to: dev-kit:build
plan: mcp-agent-arch
prd: ../../PRD.md
phase_index: ../../phases/mcp-agent-arch/index.json
---

# Hand-off: plan -> build

## Plan summary

**Phase**: `mcp-agent-arch`
**PRD**: `PRD.md` (6 sections, all DoD)
**Value score**: 4.0/5.0
**Ambiguity score**: 2.0/10 (cycle 1, no unresolved)

## Steps (in execution order)

1. **step0** — Reference compliance audit (Phase A, 60 min)
2. **step1** — Security hardening (Phase B, 120 min, parallel to step0)
3. **step2** — Cross-client verification + docs (Phase C, 90 min, depends on step0+step1)

## Iron Laws the build must respect

- **L1** — every claim from the research phase carries `url` + `fetched_at` + `source_type` (already enforced in `/tmp/mcp-agent-research.md`).
- **L4** — no TODO placeholders in the plan artifacts.
- **tdd-guard** — every step requires a failing test before production code.

## TDD gates (per step)

- `step0` — before: write a fuzz test that calls each tool with 100 invalid inputs. Pass when no panics, all return structured errors.
- `step1` — before: write fuzz + rate-limit + origin tests. Pass when all 4 mitigations active and verified.
- `step2` — before: run the cross-client smoke (5 tool calls x 3 clients). Pass when all calls succeed.

## Decision log

- **Chose**: stdio for local, SSE for HTTP+SSE bridge (not Streamable HTTP yet)
  **Why**: Streamable HTTP is the 2026-07-28 spec; archidraw uses legacy SSE which still works. Migration deferred to a Phase D.
- **Chose**: Zod for schema source of truth (not hand-written JSON Schema)
  **Why**: archidraw already uses Zod; drift between LLM-facing schema and runtime validator is the main failure mode.
- **Chose**: in-memory rate limiter per client (not Redis-backed)
  **Why**: local-only deployment; no need for cross-process coordination yet.

## Reference implementation

archidraw `packages/mcp-server/src/tools.ts` is the canonical pattern. New agent tools should mirror:
- Zod-derives-inputSchema (no hand-written JSON Schema)
- One tool, one job
- snake_case verb names
- Plain-language descriptions
- JSON-serializable return values
