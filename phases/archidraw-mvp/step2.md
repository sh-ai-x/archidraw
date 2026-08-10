# Step 2 — store

Status: pending

## Read first

- Step 1 (`@archidraw/schema`) 의 exported 타입 사용
- `PRD.md` §5 AC row 2

## Task

`@archidraw/store` npm 워크스페이스 패키지. in-memory SceneStore + JSON Patch diff subscribe + SQLite 영속화 (선택).

- `SceneStore` 인터페이스: `createElement(input)`, `updateElement(id, patch)`, `deleteElement(id)`, `queryElements(filter?)`, `getScene()`, `clearScene()`, `subscribe(callback)`, `unsubscribe(callback)`.
- `MemorySceneStore` 구현: 위 인터페이스 + 내부 `Map<id, Element>` + 매 변경 시 JSON Patch (RFC 6902) 형식 diff 를 subscriber 들에게 emit.
- `SqliteSceneStore`: `better-sqlite3` (또는 동등) 사용, WAL mode, table `elements (id PK, scene_id, data JSONB, updated_at)` + `scenes (id PK, name, created_at)`. `--db <path>` 로 활성화.
- `diff.ts`: deep-diff 유틸 (필드 단위 patch); array mutation 은 `add/remove/replace` op 만 emit (full rewrites 금지).
- `index.ts` 가 `MemorySceneStore` 를 default export, `SqliteSceneStore` 는 optional named export.

## Acceptance criteria

- `pnpm --filter @archidraw/store test` exit 0
- `memory.test.ts` — create/update/delete 후 `getScene()` 가 정확히 반영
- `patches.test.ts` — subscribe 콜백이 정확한 op(add/remove/replace) 와 path 를 받음
- `disk.test.ts` — SQLite 영속화 후 프로세스 재시작으로 동일 scene 복원

## Verification & status update

```bash
pnpm --filter @archidraw/store test
```

Exit 0. 커밋: `feat(archidraw-mvp): step 2 — store`.

## Don't

- CRDT 도입 금지 (collab 확장은 별도 phase)
- 외부 pub/sub (Redis, NATS) 금지 — in-process EventEmitter 만
- Race condition 방어를 위한 mutex 는 허용 (`async-mutex` 등) 단, dead-lock 회피를 위해 lock-free read 는 유지
