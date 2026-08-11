# Step 6 -- e2e

Status: pending

## Read first

- Step 3 (MCP), Step 4 (GUI), Step 5 (bridge) 의 AC
- `PRD.md` §5 AC row 6

## Task

`e2e/` 디렉토리. Playwright 기반 end-to-end 시나리오.

- `playwright.config.ts`: headless chromium, base URL `http://localhost:5173`, MCP 서버는 별도 child process (`archidraw-mcp --db /tmp/e2e.db`), bridge 는 5174 포트.
- 시나리오 4 단계 (각 단계별 스크린샷):
  1. GUI 로 사각형 1 개 그림 (`page.click('[data-tool=rect]')` + drag) -> screenshot `01-drawn.png`
  2. MCP `query_elements` 호출 -> 1 개 요소 반환 확인 -> screenshot `02-queried.png`
  3. MCP `update_element` 로 좌표 변경 -> GUI 가 1 초 내 반영 -> screenshot `03-updated.png`
  4. MCP `delete_element` -> GUI 가 사라짐 -> screenshot `04-deleted.png`
- `report.md`: 시나리오별 assertion 결과 + step 2 의 element 반환값 캡처.

## Acceptance criteria

- `pnpm -w @archidraw/e2e test` exit 0
- 4 단계 시나리오 모두 pass
- 4 장 스크린샷이 `e2e/screenshots/` 에 저장

## Verification & status update

```bash
pnpm -w @archidraw/e2e test
```

Exit 0. 커밋: `feat(archidraw-mvp): step 6 -- e2e`.

## Don't

- 비결정적 timing 의존 (예: hard sleep 5 s) 금지 -- Playwright `expect(...).toHaveScreenshot` 의 자동 retry 사용
- 외부 네트워크 호출 금지 -- 모든 자산은 test fixture
- CI matrix (multi-browser) 도입 금지 -- chromium only (post-MVP)
