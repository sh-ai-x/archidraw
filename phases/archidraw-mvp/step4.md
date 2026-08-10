# Step 4 — gui

Status: pending

## Read first

- Step 1 (`@archidraw/schema`) 의 타입을 import
- `PRD.md` §5 AC row 4
- Reference: https://github.com/rough-stuff/rough
- Reference: https://github.com/steveruizok/perfect-freehand

## Task

`@archidraw/gui` npm 워크스페이스 패키지. Vite + React + TypeScript 무한 캔버스.

- 진입점 `main.tsx` + `<App>` → `<Canvas>` + 좌측 `<Toolbar>` + `<Renderer>`.
- 줌/팬: wheel zoom (0.1 ~ 8x), space+drag pan, viewport transform matrix.
- 툴바: select / rectangle / ellipse / diamond / arrow / line / freedraw / text / erase (총 9 툴 — 1 차선: select/rect/ellipse/arrow/text/freedraw 6 종 + delete; erase 는 post-MVP).
- 렌더링: `roughjs/lib/rough.cjs` 에서 `rough.canvas()` + `rc.rectangle/ellipse/line/path` 직접 사용. `perfect-freehand` 는 freedraw 전용. seed 를 element 에 보존 → 같은 모양 반복 가능.
- element 선택: hit-test (bounding box + arrow endpoint tolerance).
- element 이동: drag delta 가 store 의 `updateElement(id, {x, y, ...})` 호출. store API 가 없으면 step 1+2 의 SceneStore 인터페이스를 in-browser mock 으로 호출.
- element 삭제: Backspace/Delete → store 의 `deleteElement(id)`.
- localStorage persistence: scene JSON 자동 저장 (`localStorage['archidraw:scene']`), 페이지 리로드 시 복원.
- 키바인딩: `V` select, `R` rectangle, `O` ellipse, `A` arrow, `T` text, `P` freedraw, `Cmd/Ctrl+Z` undo, `Cmd/Ctrl+Shift+Z` redo (1 차선 MVP 는 undo/redo 없이 다음 단계로 이월).
- bridge-client.ts: step 5 의 SSE 구독 stub (no-op 가능).

## Acceptance criteria

- `npm run -w @archidraw/gui dev` → `localhost:5173` 에서 부팅
- `pnpm --filter @archidraw/gui test` (vitest) exit 0
  - select → drag → release 가 store 의 `updateElement` 호출
  - Backspace 가 store 의 `deleteElement` 호출
  - 새로고침 후 마지막 scene 복원
- Playwright 시각 회귀 1 케이스 (canvas snapshot PNG vs golden)
- gzipped 번들 ≤ 500 KB

## Verification & status update

```bash
pnpm --filter @archidraw/gui build
pnpm --filter @archidraw/gui test
npx playwright test --config packages/gui/playwright.config.ts
```

Exit 0. 커밋: `feat(archidraw-mvp): step 4 — gui`.

## Don't

- `@excalidraw/excalidraw` 컴포넌트 import 금지 — 직접 rough.js 렌더
- 상태관리 라이브러리 (Redux/Zustand 등) 도입 금지 — React useReducer + Context 만
- chart 라이브러리 / icon pack 도입 금지 — SVG 직접 그림
