# Step 2 — Cross-client verification + README docs

> Phase C of `mcp-agent-arch` plan.

## Status

- **Status**: todo
- **Phase**: C
- **Estimate**: 90 min
- **Depends on**: step 0 (canonical pattern) + step 1 (security in place)
- **Owner**: dev-kit:build

## Read first

1. `PRD.md` §4 phase C — acceptance criteria
2. Step 0 + Step 1 outputs — confirm the server is in its final shape
3. `README.md` (current) — find the "MCP integration" section if it exists, or where to add it
4. `CONTRIBUTING.md` (current) — find the security section

## Task

Verify the archidraw MCP server works with Claude Code, Codex, and one other MCP client. Document the integration so any agent engineer can copy-paste a working setup.

## Acceptance criteria

- [ ] `claude mcp add archidraw /path/to/archidraw/packages/mcp-server/dist/index.js --transport stdio` registers the server
- [ ] `claude` lists the 9 tools when asked "what tools are available?"
- [ ] At least 5 end-to-end tool calls succeed: create, query, update, delete, get_scene
- [ ] `codex mcp add archidraw /path/to/archidraw/packages/mcp-server/dist/index.js` does the same
- [ ] `codex` lists the 9 tools; 5+ tool calls succeed
- [ ] A third client (Continue.dev or Cline) registers and runs at least 1 tool call successfully
- [ ] README has a "MCP integration" section with:
  - One-line install for each client
  - Example conversation: "add a rectangle" → tool call → result
  - Architecture diagram (the 3-process stack: MCP / Bridge / GUI)
  - Pointer to `/docs/architecture.md`
- [ ] CONTRIBUTING.md links to the 2026-04-15 RCE runbook (or the runbook itself is in the repo)

## Verification

```bash
cd /Users/sanghee/dev/archidraw
pnpm --filter @archidraw/mcp-server build
node packages/mcp-server/dist/index.js --db /tmp/test.db < /dev/null
# Should: respond to initialize, list 9 tools, exit cleanly on EOF

# In a separate shell:
claude mcp add archidraw -- node $(pwd)/packages/mcp-server/dist/index.js --db /tmp/test.db
claude -p "list the tools you have available"
claude -p "create a 200x150 red rectangle at position 100,100"
claude -p "query all elements"
claude -p "delete the rectangle"
claude -p "show the current scene"
# All 5+ calls should succeed
```

## Don't

- Don't change the MCP server source (steps 0/1 already finalized it)
- Don't document features that don't work (only document what was verified)
- Don't write generic "this is how MCP works" content — link to the MCP spec instead
- Don't add client-specific install instructions beyond Claude Code, Codex, Continue.dev (any others are user-contributed)
- Don't skip the third-client verification — it catches drift between the two major clients
