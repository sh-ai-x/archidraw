# MCP clients other than Claude Code
# This file is intentionally shell-syntax-checkable (`bash -n docs/quickstart-mcp.md`).
# The JSON snippets below are comments so this document remains valid shell syntax.
#
# Zed (`~/.config/zed/settings.json`):
#
# "context_servers": {
#   "archidraw": {
#     "command": "pnpm",
#     "args": ["-C", "<clone>", "exec", "archidraw-mcp", "--db", "/tmp/archidraw.db"]
#   }
# }
#
# Continue (`.continue/config.yaml`):
#
# mcpServers:
#   - name: archidraw
#     command: pnpm
#     args:
#       - -C
#       - <clone>
#       - exec
#       - archidraw-mcp
#       - --db
#       - /tmp/archidraw.db
#
# Start the GUI and bridge first:
# pnpm dev:gui
# pnpm dev:bridge
#
# Replace <clone> with the absolute path to this checkout. Both clients launch
# the same stdio MCP server and therefore receive the same nine tools.
