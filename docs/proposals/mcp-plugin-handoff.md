# MCP Plugin hand-off: archidraw as installable Claude Code / Codex plugin

## Why

archidraw is currently an MCP server (`packages/mcp-server/dist/index.js`, 9 tools, stdio transport) that requires manual registration via `~/.claude.json`:

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

The friction: every new user has to copy this snippet, replace `<clone>`, ensure `pnpm` is installed, ensure dependencies are built, and restart Claude Code. This is the same onboarding pain that `plugin-creator` was designed to solve for skills.

The goal: ship archidraw as a proper MCP plugin that users install with a single command, regardless of whether they use Claude Code or Codex. The plugin bundles the MCP server binary, the bridge, and a one-shot install command.

## Current state (archidraw v0.1.0)

- `packages/mcp-server/dist/index.js` — 9 MCP tools exposed via stdio
- `packages/schema/src/zod.ts` — single source of truth for inputSchema
- `packages/store/dist/` — SceneStore (Memory + Sqlite backends)
- `packages/bridge/dist/` — HTTP+SSE bridge at :5174
- `packages/gui/` — Vite frontend at :5173
- Public repo at `sh-ai-x/archidraw` (post PR #42)
- No `plugin.json` — install is manual

## What "MCP-style plugin" means in this context

The `/plugin-creator` skill (dev-harness-kit) emits dual-runtime skill bundles under `.claude/skills/` and `.codex/skills/`. That's for skills, not MCP servers.

For an MCP server plugin, the relevant standard is the Claude Code plugin manifest at `.claude-plugin/plugin.json` (per https://docs.claude.com/en/docs/claude-code/plugins). It supports MCP servers via the `mcpServers` field:

```json
{
  "name": "archidraw",
  "version": "0.1.0",
  "description": "Local-first whiteboard with MCP tools for scene CRUD",
  "mcpServers": {
    "archidraw": {
      "command": "archidraw-mcp",
      "args": ["--db", "${CLAUDE_PLUGIN_DATA}/archidraw.db"]
    }
  }
}
```

When users run `claude plugin install archidraw`, Claude Code copies the bundle to `~/.claude/plugins/archidraw/`, adds the `.claude-plugin/plugin.json` to its discovery path, and starts the MCP server automatically on session start. Codex has an equivalent (`.codex/` directory with `mcpServers` field).

## Proposed plan

This is a **3-phase rollout** with explicit DoD for each phase:

### Phase A — Standalone MCP plugin (v0.2.0)

**Scope**: ship archidraw as a single Claude Code plugin that bundles just the MCP server. Bridge + GUI stay optional / external.

**DoD**:
- `.claude-plugin/plugin.json` declares the `archidraw` MCP server
- `bin/archidraw-mcp` shim that resolves to the right node binary
- Optional `.codex/config.toml` block for Codex users
- `pnpm pack` produces a tarball installable via `claude plugin install archidraw.tar.gz`
- Smoke test: install in a fresh claude-code session, verify `create_element` tool appears
- No bridge / no GUI changes

**Files touched**:
- `package.json` (add `bin` field for `archidraw-mcp`)
- `packages/mcp-server/package.json` (set `bin` field)
- `.claude-plugin/plugin.json` (new — plugin manifest)
- `docs/install.md` (new — install instructions)
- `.codex/config.toml` (new — Codex config block)

### Phase B — Full local stack plugin (v0.3.0)

**Scope**: bundle the MCP server + bridge + GUI starter script. Install starts a daemon (`archidraw-bridge`) on port 5174 and (optionally) launches the GUI. Plugin auto-runs MCP via stdio.

**DoD**:
- `.claude-plugin/plugin.json` adds `archidraw-bridge` as a background service
- `bin/archidraw-up` starts the bridge on background launch
- `archidraw-gui` optional launcher (downloads prebuilt or runs dev)
- Stdout stream from MCP server + bridge SSE connected to the GUI's bridge-client
- Tested end-to-end: install plugin → MCP `create_element` → see rectangle in GUI

**Files touched**:
- `bin/archidraw-bridge` (new — bridge launcher)
- `bin/archidraw-up` (new — orchestrator)
- `.claude-plugin/plugin.json` (add background service entry)

### Phase C — Marketplace listing (v0.4.0)

**Scope**: publish to the Claude plugin marketplace and/or Codex's plugin catalog.

**DoD**:
- Plugin bundle passes `claude plugin validate` without warnings
- Listed in Claude Code marketplace under category "Development / Diagrams"
- README has marketplace badge + install command
- CHANGELOG tracks plugin version alongside library version

## What an install looks like (target)

After Phase A ships, a new user runs:

```bash
# Claude Code
claude plugin install archidraw
# or from a local file:
claude plugin install ./archidraw-0.2.0.tar.gz
```

Then in any Claude Code session:

```text
> Create a rectangle named "auth-flow" at 200, 200
[Tool call: create_element]
Created element rect-001 in the scene
> Open the GUI to see it
-> http://localhost:5173 (auto-launched by the plugin)
```

Zero manual config.

## Decisions the hand-off needs to resolve

These are open questions for whoever picks this up (could be a future me or another agent):

1. **Where does the plugin bundle live?** Options:
   - A) New repo `sh-ai-x/archidraw-plugin` with `plugin.json` + bin + tarball build
   - B) Sub-directory in current repo at `.claude-plugin/` + released as a separate archive
   - C) Monorepo `sh-ai-x/mcp-tools` with archidraw + future tools
2. **How is the MCP server distributed?** Currently requires `pnpm install && pnpm build` first. Options:
   - A) Ship prebuilt `archidraw-mcp` binaries (linux-x64, darwin-arm64, darwin-x64) via GitHub Releases
   - B) Run from source via `node --experimental-strip-types packages/mcp-server/dist/index.js`
   - C) Bundle via `pkg` / `bun build` to a single executable
3. **Does the bridge ship with the plugin or stay external?** Phase A says no (MCP only); Phase B says yes.
4. **Compatibility with Codex?** Codex has its own plugin format. Phase A targets Claude Code only; Phase C adds Codex.

## Iron Laws the hand-off respects

- **Single source of truth for the schema** (Zod in `packages/schema/src/zod.ts`) - already enforced, don't bypass
- **Transport-decoupled state** - the plugin must preserve `SceneStore.subscribe()` so the bridge (Phase B) can attach without changes
- **stdio for MCP, HTTP+SSE for bridge** - plugin must not collapse these into one transport

## Reference: related work already done

- PR #39 - detailed MCP architecture explanation (merged)
- PR #40 - README screenshot + text labels (merged)
- PR #41 - re-take screenshot after bridge subscription wired up (merged)
- PR #42 - bridge CORS allow 127.0.0.1 + localhost (merged)
- dev-harness-kit#647 - `/dev-kit:build` `claude -p` hang issue (open, separate from plugin plan)

## Suggested hand-off path

Whoever picks this up should:

1. Create branch `feat/mcp-plugin-phase-a` from `main`
2. Read this file + the merged PRs (#39, #40, #41, #42) for context
3. Use `/plugin-creator` (dev-harness-kit) if the standard plugin scaffold helps, but expect to write the `.claude-plugin/plugin.json` by hand because archidraw is an MCP server not a skill
4. Phase A first (MCP only) - no bridge, no GUI. Easier to verify.
5. Phase B once Phase A ships and is installable end-to-end.

The above plan was written in a hand-off session - no code committed. To resume:

```bash
cd /Users/sanghee/dev/archidraw
git checkout -b feat/mcp-plugin-phase-a main
# Follow phases A -> B -> C above
```
