# Step 3 -- mcp

Status: pending

## Read first

- Step 1 (`@archidraw/schema`) 의 zod 스키마를 MCP 툴 input 으로 그대로 재사용
- Step 2 (`@archidraw/store`) 인터페이스
- `PRD.md` §5 AC row 3
- Reference: https://github.com/modelcontextprotocol/typescript-sdk
- Reference: https://github.com/yctimlin/mcp_excalidraw (툴 카테고리 참고)

## Task

`@archidraw/mcp-server` npm 워크스페이스 패키지. `@modelcontextprotocol/sdk` 의 `McpServer` 위에 9 개 툴을 stdio 트랜스포트로 노출.

- 툴 9 종:
  - `create_element` -- input: zod `{ type, x, y, width, height, ... element fields }`, returns `{ id }`
  - `update_element` -- input: `{ id, patch: Partial<element> }`, returns `{ id, updated }`
  - `delete_element` -- input: `{ id }`, returns `{ id }`
  - `query_elements` -- input: `{ filter?: { type?, ids?, bounds? } }`, returns `{ elements: Element[] }`
  - `group_elements` -- input: `{ ids: string[], groupId: string }`, returns `{ groupId }`
  - `align_elements` -- input: `{ ids: string[], alignment: 'left'|'center'|'right'|'top'|'middle'|'bottom' }`, returns `{ aligned: number }`
  - `get_scene` -- input: `{}`, returns `Scene`
  - `clear_scene` -- input: `{ confirm: true }`, returns `{ cleared: number }`
  - `export_scene` -- input: `{ format: 'json'|'svg'|'png' }`, returns `{ format, data: string | base64 }`
- 모든 input 은 zod 로 runtime validation; 실패 시 MCP error code `-32602` (Invalid params).
- `--db <path>` CLI 플래그로 `SqliteSceneStore` 선택; 미지정 시 in-memory.
- 매 변경 시 `bridgePublisher` (step 5) 로 scene-delta push.
- `bin/archidraw-mcp` 진입점.

## Acceptance criteria

- `pnpm --filter @archidraw/mcp-server test` exit 0
- `mcp-smoke.test.ts`: MCP 클라이언트 SDK 로 stdio 통해 9 툴 각 1 회 호출 성공
- 수동: Claude Code `~/.claude.json` 의 `mcpServers.archidraw = { command: "archidraw-mcp", args: ["--db", "/tmp/archidraw.db"] }` 등록 후 `/mcp` 가 9 툴 나열

## Verification & status update

```bash
pnpm --filter @archidraw/mcp-server build
pnpm --filter @archidraw/mcp-server test
```

Exit 0. 커밋: `feat(archidraw-mvp): step 3 -- mcp`.

## Don't

- 인증 / OAuth 추가 금지 (MCP 자체가 클라이언트 책임)
- HTTP/SSE 트랜스포트 추가 금지 (stdio 만; WebSocket 은 step 5 에서 별도)
- element 의 binary `points` 인코딩 시 압축 시도 금지 (raw array 그대로)
