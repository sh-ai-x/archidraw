# Step 1 — Security hardening (post 2026-04-15 RCE advisory)

> Phase B of `mcp-agent-arch` plan.

## Status

- **Status**: todo
- **Phase**: B
- **Estimate**: 120 min
- **Depends on**: none (parallel to step 0)
- **Owner**: dev-kit:build (TDD-gated)

## Read first

1. [CSA Research Note: MCP STDIO RCE (2026-04-15)](https://labs.cloudsecurityalliance.org/research/csa-research-note-mcp-rce-design-vulnerability-20260423-csa/) — the specific vulnerability class
2. `../../docs/proposals/agent-arch-mcp/idea-mcp-agent-architecture.html` §proposed_change item 6
3. `packages/mcp-server/src/server.ts` — current server lifecycle
4. `packages/bridge/src/server.ts` — current HTTP+SSE bridge
5. Step 0 output: confirm the tool surface is final before adding security

## Task

Apply 4 mitigations to close the 2026-04-15 RCE attack surface:

1. **Input validation** at MCP server boundary — Zod `safeParse` returns a structured `{ ok: false, error: { code, message, path } }` on bad input (no exceptions thrown across the wire)
2. **Per-tool per-client rate limit** — configurable, default 10/sec; returns 429 with `Retry-After` header
3. **Origin check** on the HTTP+SSE bridge — only `http://localhost:5173` (dev) and the configured prod origin accepted
4. **Tamper-evident audit log** — append-only file with hash chain (each line = `hash(prev_hash + timestamp + tool + args_hash + caller_id)`); rotated daily

## Acceptance criteria

- [ ] Every tool input passes through Zod `safeParse` before reaching the store; malformed inputs return `MCP_INVALID_INPUT` error code with the Zod path
- [ ] Rate limit: send 100 calls in 1s to one tool, observe HTTP 429 from the 11th onward
- [ ] Origin check: a `fetch` from `http://evil.com` to the bridge's `/events` returns 403
- [ ] Audit log file grows by 1 line per tool invocation; the hash chain is verifiable (a Python script in `tests/` can re-validate it)
- [ ] Fuzz test: 50 random inputs per tool, no panics, no unbounded memory/CPU, all bad inputs return `MCP_INVALID_INPUT`
- [ ] Pentest smoke: try `{"id":"../../etc/passwd"}` as `create_element` input — rejected with proper error
- [ ] Audit log survives crash (the test force-kills the server mid-write, restarts, verifies the line is either complete or absent — never partial)

## Verification

```bash
cd /Users/sanghee/dev/archidraw
pnpm --filter @archidraw/mcp-server test
# Expected: existing tests + 50 fuzz tests per tool all pass

# Rate limit integration
for i in {1..100}; do echo "call $i"; done | xargs -P 50 -I{} curl -X POST http://localhost:5174/publish

# Audit log hash chain verification
python3 tests/verify_audit_chain.py .dev-kit/audit.log
# Expected: "chain valid, N lines"

# Origin check
curl -X POST -H "Origin: http://evil.com" http://localhost:5174/publish
# Expected: 403 Forbidden
```

## Don't

- Don't log the full argument payload (PII risk); log only the argument hash
- Don't write the audit log in a way that blocks the request thread (use async append)
- Don't add network calls for rate-limit storage (use in-memory token bucket per client)
- Don't break the existing 9-tool surface (security is additive)
- Don't ship without fuzz tests (the 50-fuzzed-input test is the DoD)
