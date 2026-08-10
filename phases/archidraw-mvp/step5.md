# Step 5 — bridge

Status: pending

## Read first

- Step 2 의 `subscribe` API + JSON Patch 포맷
- Step 3 의 MCP server 의 `bridgePublisher`
- Step 4 의 `bridge-client.ts` stub
- `PRD.md` §5 AC row 5

## Task

`@archidraw/bridge` npm 워크스페이스 패키지. MCP ↔ GUI 양방향 scene-delta 동기화.

- `transport.ts`: `BridgeTransport` 인터페이스 (`publish(delta)`, `subscribe(onDelta)`, `start()`, `stop()`).
- `server.ts` SSE 구현:
  - HTTP 서버, `GET /events` SSE endpoint, `POST /publish` HTTP endpoint, 기본 포트 5174.
  - `archidraw://localhost:5174/events` 처럼 외부에서 도달 가능.
  - 단방향 push (server → GUI) 만 — GUI → server 는 POST `/publish` 또는 step 3 의 IPC.
- `publisher.ts`: in-process singleton. `MemorySceneStore.subscribe` 콜백이 `publish(delta)` 호출 → transport 가 fan-out.
- `mcp-server/src/bridge-publisher.ts`: step 3 의 store 를 `publisher` 에 wire. `--bridge-url` 플래그로 transport endpoint 주입 가능.
- GUI `bridge-client.ts` (step 4 에서 no-op 였던 곳 채우기): 페이지 로드 시 `new EventSource('http://localhost:5174/events')`, 수신한 delta 를 local scene 에 patch 적용.

## Acceptance criteria

- `pnpm --filter @archidraw/bridge test` exit 0
- `sse.test.ts`: SSE client 가 1 초 이내 첫 delta 수신
- 수동: GUI 띄우고 MCP `create_element` 호출 → 1 초 내 element 표시
- 양방향 (GUI 액션 → MCP) 은 step 3 의 IPC 훅을 통해 검증 (smoke test)

## Verification & status update

```bash
pnpm --filter @archidraw/bridge test
```

Exit 0. 커밋: `feat(archidraw-mvp): step 5 — bridge`.

## Don't

- CORS preflight 우회를 위한 wildcard origin 추가 금지 — `http://localhost:5173` 단일 allow
- 인증/토큰 추가 금지 (로컬호스트 전용)
- Stream multiplexing (element + cursor 동시) 도입 금지 — element-delta 만
