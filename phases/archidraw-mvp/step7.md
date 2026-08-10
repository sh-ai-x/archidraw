# Step 7 — release

Status: pending

## Read first

- Step 1–6 모두 완료 상태 (status: completed)
- `PRD.md` §6 Hand-off

## Task

릴리스 패키징. `pnpm` 모노레포 root 설정 + README 작성.

- root `package.json`:
  - `"workspaces": ["packages/*", "e2e"]`
  - scripts: `dev:gui`, `dev:mcp`, `dev:bridge`, `e2e`, `build`
- `pnpm-workspace.yaml`: 6 packages + e2e 등록
- `.npmrc`: `shamefully-hoist=false`, `auto-install-peers=true`
- `README.md`:
  - 1-줄 설명 + 데모 GIF/스크린샷
  - **Quickstart**: `pnpm i && pnpm build && pnpm dev:gui`
  - **MCP 등록** (Claude Code `~/.claude.json`):
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
  - **Try this prompt**: "Open localhost:5173, then in Claude Code: `Create a rectangle named 'auth' at 200,200`. Confirm the rectangle appears in the GUI."
  - **Architecture**: 1 다이어그램 (GUI ↔ bridge ↔ MCP)
- `docs/architecture.md`: 레이어드 설명 (schema/store/MCP/GUI/bridge + e2e)
- `docs/quickstart-mcp.md`: Claude Code 외 클라이언트 (Zed, Continue) 등록 스니펫

## Acceptance criteria

- `pnpm -r build` exit 0 (모든 워크스페이스 빌드)
- `pnpm dev:gui` 가 5173 부팅, `pnpm dev:bridge` 가 5174 부팅, `pnpm dev:mcp` 가 stdio 대기
- README 의 MCP 스니펫을 그대로 `~/.claude.json` 에 붙여넣고 `/mcp` 가 9 툴 표시
- README 의 "Try this prompt" 가 실제 시나리오로 동작

## Verification & status update

```bash
pnpm -r build
bash -n docs/quickstart-mcp.md   # shell snippet syntax only (markdown shell fence 검증)
```

Exit 0. 커밋: `feat(archidraw-mvp): step 7 — release`.

## Don't

- Docker / docker-compose 추가 금지 (사용자가 직접 host 환경 구성)
- GitHub Actions workflow 추가 금지 (CI 셋업은 별도 phase)
- 버전 자동 bump / release-please 도입 금지 (semver 수동)
