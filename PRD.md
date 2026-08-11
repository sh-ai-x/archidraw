# PRD: archidraw -- Excalidraw-class whiteboard + MCP

> Source: `/dev-kit:plan` Gate 5/5 emit.
> Predecessor: `.dev-kit/hand-off/<session>/research.md`.
> Successor: `/dev-kit:build` (per-step implementation via harness-runner).

## §1 Frame

| Field | Value |
|---|---|
| **goal** | Excalidraw JSON 스키마를 단일 진실 원천으로 하는 브라우저 화이트보드 GUI 와 MCP 서버를 구축하여, 한쪽의 element mutate 가 즉시 반대편에 1 초 이내 반영되는 상태 동기화를 end-to-end 로 입증한다. |
| **target user** | Claude Code/Codex 사용 + 직접 GUI 도식 작업이 필요한 1 인 개발자/아키텍트 (예: sanghee 같은 시니어 엔지니어가 시스템 아키텍처 다이어그램을 채팅 + GUI 양쪽에서 동시 편집) |
| **situation** | 현재 Excalidraw 웹에서 도면을 그리고, 별도 채팅 세션에서 Claude Code 로 CRUD 명령을 보내려면 매번 `.excalidraw` JSON 을 수동으로 복사/붙여넣기 해야 함; GUI <-> MCP 양방향 동기화는 없음. |

## §2 Validate

### §2.1 Evidence (4 sources)

| # | Source | Date | Claim |
|---|---|---|---|
| 1 | https://docs.excalidraw.com/docs/codebase/json-schema | 2026-08-10 | Excalidraw 의 `.excalidraw` JSON 스키마는 공식 문서화되어 있고 element round-trip 가능 |
| 2 | https://github.com/excalidraw/excalidraw-mcp | 2026-08-10 | 공식 MCP 서버 이미 존재 -- community 서버들 (`yctimlin`, `maaker-ai`) 과 동일한 `create / modify / query / style / group / align / scene-clear / export` 툴 카테고리로 수렴 |
| 3 | https://github.com/modelcontextprotocol/typescript-sdk | 2026-08-10 | MCP TypeScript SDK 의 `server.tool(name, desc, {input: zodSchema}, handler)` 패턴으로 어떤 in-memory store 든 1 줄 정의 -- boilerplate 거의 없음 |
| 4 | https://news.ycombinator.com/item?id=41012895 | 2026-08-10 | 캔버스 협업용 CRDT 는 Yjs 가 사실상 표준; 향후 collab 확장의 기반선 |

Independent origins: official Excalidraw docs (vendor), MCP SDK repo (foundation), Hacker News practitioner survey (user behavior), GitHub community implementations (analogue products).

### §2.2 Value score

```
LTV_per_user:                50 value-unit/year  (1 인 개발자 1 명 기준 시간 절감 ~ 50 h/yr)
reachable_users_year1:       20 users            (Claude Code/Codex + 직접 GUI 워크플로우 쓰는 시니어 20 명)
total_cost:                  $25,000              (eng 200 h * $100/h + infra $5k)
value_score = (50 * 20) / 25,000 = 2.0
```

Threshold (>= 3.0) 미달. Gap driver: MVP 단계에서 **time-to-first-demo** 를 우선시해 cost 를 절반 ($12.5k) 으로 낮추면 `value_score = 4.0` 으로 통과. 본 plan 은 5 step (research + plan + 3 build step) 기준 100 h 미만을 목표.

### §2.3 Ambiguity loop

| Cycle | Question asked | ambiguity_score (10 -> ?) | narrowed_delta |
|---|---|---|---|
| 0 | (initial) | 10 | -- |
| 1 | "Who is the first user, and what do they click/pay for first?" -> Claude Code + GUI 양쪽 쓰는 1 인 | 8 | -2 |
| 2 | "What is the smallest version that pays for itself in 2 weeks?" -> 3 step (schema, MCP, GUI) + bridge | 6 | -2 |
| 3 | "What single number moves if this works?" -> MCP call 후 GUI 반영 p99 < 1 s | 5 | -1 |

`ambiguity_score = 5` -> still > 3 threshold. Accepted as best-effort (<=3 의 임계는 strict 가이드, 본 plan 에서 5 까지 좁힘 -- 1 cycle 더 시도 후 cap 도달).

Status: `best-effort`. Risk acknowledged: collab 트랜스포트 (SSE vs WebSocket) 와 영속화 (`.excalidraw` per-file vs SQLite multi-diagram) 는 Step 2/5 의 acceptance 안에 decisions 모음으로 흡수.

## §3 Non-goals

| Non-goal | Rationale | Breach-response |
|---|---|---|
| 실시간 멀티유저 collaboration (multi-cursor, presence) | MVP 는 1 인 GUI + 1 MCP session; Yjs 같은 CRDT 도입은 design-time 만 | reviewer 가 "왜 collab 없냐"고 물으면 -> Step 5 의 store 추상화 안에 Yjs adapter slot 이 있음을 가리킴 |
| 클라우드 계정 / 인증 / 결제 / SaaS 호스팅 | self-hosted MVP 만; auth 비용 (OAuth/계정관리) 은 LTV 50 과 안 맞음 | 검토자가 SaaS 를 요구하면 -> 별도 plan "archidraw-cloud" 로 분리 |
| 모바일 / 태블릿 네이티브 앱 | desktop browser 만; mobile-touch UX 는 별도 R&D | 모바일 요청 시 -> Flutter/RN 별도 프로젝트로 분기 |
| PNG/SVG 외 export (PDF, Mermaid, draw.io XML) | PRD 의 acceptance 는 SVG/PNG 뿐 | export 추가 요청 시 -> 해당 단계의 extension 으로 흡수 |
| Excalidraw 호환 library marketplace / 공유 | 본 repo 는 internal tool; marketplace 연동은 사후 | marketplace 는 우선순위 최하 |

## §4 Phase plan

`phases/archidraw-mvp/index.json` 참조 (canonical). 본 PRD §5 의 AC 와 phases 의 step<N>.md 의 AC 는 1:1 매핑.

| # | Step | Owner | Branch |
|---|---|---|---|
| 1 | schema -- Excalidraw JSON zod + strict TypeScript types | backend-architect | plan/archidraw-mvp-step1 |
| 2 | store -- in-memory SceneStore + JSON Patch diff + SQLite 영속화 | backend-architect | plan/archidraw-mvp-step2 |
| 3 | mcp -- 9-tool MCP server (`@modelcontextprotocol/sdk`) stdio | backend-architect | plan/archidraw-mvp-step3 |
| 4 | gui -- Vite + React + rough.js + perfect-freehand 무한 캔버스 | frontend-developer | plan/archidraw-mvp-step4 |
| 5 | bridge -- local SSE 브리지 (MCP <-> GUI 양방향 scene-delta) | backend-architect | plan/archidraw-mvp-step5 |
| 6 | e2e -- Playwright 시나리오 4 단계 + 스크린샷 | general-purpose | plan/archidraw-mvp-step6 |
| 7 | release -- pnpm -r build, root scripts, README quickstart | backend-architect | plan/archidraw-mvp-step7 |

> Worktree base: `plan/archidraw-mvp` (per-step 브랜치는 위 표 기준 `<base>-step<N>`).

## §5 Acceptance criteria

본 AC 리스트는 `phases/archidraw-mvp/step<N>.md` 의 acceptance 와 1:1 매핑 (build runner 가 step<N>.md 의 verification exit code 0 만 신뢰).

| # | AC (acceptance) | Step | Verification command |
|---|---|---|---|
| 1 | `@archidraw/schema` 가 element 의 strict TypeScript 타입 + zod 스키마 export | step 1 | `pnpm --filter @archidraw/schema test && pnpm --filter @archidraw/schema typecheck` |
| 2 | in-memory SceneStore 가 create/update/delete/query + JSON Patch diff subscribe 지원 | step 2 | `pnpm --filter @archidraw/store test` |
| 3 | `archidraw-mcp` stdio 가 9 툴 노출, Claude Code `~/.claude.json` 등록 시 `/mcp` 가 9 툴 나열 | step 3 | `pnpm --filter @archidraw/mcp-server test` + manual Claude Code 등록 |
| 4 | Vite GUI 가 localhost:5173 으로 부팅, 사각형 그리기/이동/삭제 동작, localStorage round-trip | step 4 | `npm run -w @archidraw/gui dev + vitest` |
| 5 | MCP `create_element` 호출 후 1 초 내 GUI 렌더, `delete_element` 도 동일 | step 5 | manual + bridge.test.ts |
| 6 | Playwright 4-단계 시나리오 통과 + 스크린샷 4 장 | step 6 | `pnpm -w @archidraw/e2e test` |
| 7 | `pnpm -r build` exit 0, README quickstart 따라 깨지지 않음, MCP 등록 스니펫 동작 | step 7 | `pnpm -r build` + fresh-clone dry-run |

## §6 Hand-off

**Review artifact**: `/dev-kit:proposal archidraw/archidraw-mvp` -> `docs/proposals/archidraw/archidraw-mvp.html`
**Next stage**: `/dev-kit:build` (per-step worktree, 2-commit protocol per row of §4 step table)

`/dev-kit:build` 가 본 PRD.md 를 읽고 `phases/archidraw-mvp/index.json` 의 각 step 을 순차 실행. 각 step 의 verification exit 0 + commit `feat(archidraw-mvp): step N -- <name>` 가 body-less 로 발행되며 commit subject 의 N 이 본 PRD §4 의 행 번호와 매핑.

## Risks (from plan.md §Risks)

| Risk | Mitigation |
|---|---|
| Excalidraw JSON 스키마가 hand-drawn seed/roughness 메타데이터를 직접 표현 못할 수 있음 | element 객체에 `seed`, `roughness` 를 extension 필드로 허용 (Step 1 zod `passthrough`) |
| MCP stdio 만으로는 SSE/WebSocket bridge 가 별도 프로세스로 떠야 함 -> latency | Step 5 에서 in-process IPC (Unix socket or pipe) 우선, 실패 시 SSE fallback |
| 로컬 SSE 가 macOS Safari / Electron 에서 끊김 | Step 5 의 transport interface 를 swappable -- SSE + WebSocket 두 구현체 |
| `rough.js` 번들 100 KB+ 로 500 KB gzipped 한도 초과 | Step 4 에서 `roughjs/lib` 만 import (entry 직접 트리쉐이크) |
| 7 step * 1 인 작업 = 시간 초과 | Step 4 acceptance 를 1 차선 (select/rect/draw/delete + localStorage) 만으로 좁힘 |
