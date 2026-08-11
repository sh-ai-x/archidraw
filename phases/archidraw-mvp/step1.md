# Step 1 -- schema

Status: pending

## Read first

- `PRD.md` §1 Frame, §2 Validate, §3 Non-goals, §5 AC row 1
- `phases/archidraw-mvp/index.json` step 1 (files list)
- Reference: https://docs.excalidraw.com/docs/codebase/json-schema
- Reference: https://github.com/coleam00/excalidraw-diagram-skill/blob/main/references/json-schema.md

## Task

`@archidraw/schema` npm 워크스페이스 패키지를 만들어 Excalidraw element 의 strict TypeScript 타입과 zod 스키마를 export 한다.

- `Element` 타입을 union 으로 (`rectangle | ellipse | diamond | arrow | line | freedraw | text | image | group`).
- 각 element 공통 필드 (`id`, `type`, `x`, `y`, `width`, `height`, `angle`, `strokeColor`, `backgroundColor`, `fillStyle`, `strokeWidth`, `strokeStyle`, `roughness`, `opacity`, `groupIds`, `frameId`, `index`, `roundness`, `seed`, `versionNonce`, `isDeleted`, `boundElements`, `updated`, `link`, `locked`) 정의.
- type 별 추가 필드: `arrow` 는 `points`, `startBinding`, `endBinding`, `startArrowhead`, `endArrowhead`; `text` 는 `fontSize`, `fontFamily`, `text`, `textAlign`, `verticalAlign`, `containerId`, `originalText`, `lineHeight`, `baseline`; `freedraw` 는 `points`, `simulatePressure`, `lastCommittedPoint`.
- `ExcalidrawScene` 타입: `{ type: 'excalidraw', version: number, source: string, elements: Element[], appState: AppState, files: Record<string, ImageFile> }`.
- zod: `ExcalidrawElementSchema` (passthrough for extension fields like `seed`), `ExcalidrawSceneSchema`, `CreateElementInputSchema`, `UpdateElementInputSchema`, `DeleteElementInputSchema`, `QueryElementsInputSchema`.
- `roundtrip.test.ts`: element 100 개 생성 -> `JSON.stringify` -> `JSON.parse` -> deep-equal 통과.

## Acceptance criteria

- `@archidraw/schema` 빌드 + typecheck + test 통과
- 100 element round-trip test pass
- `dist/index.d.ts` 가 모든 타입 export

## Verification & status update

```bash
pnpm --filter @archidraw/schema build
pnpm --filter @archidraw/schema typecheck
pnpm --filter @archidraw/schema test
```

Exit code 0 expected. `phases/archidraw-mvp/index.json` 의 step 1 status 를 `pending -> in_progress -> completed` 로 전이. 커밋: `feat(archidraw-mvp): step 1 -- schema`.

## Don't

- Excalidraw core React 컴포넌트 의존 추가 금지 (`@excalidraw/excalidraw` 등) -- schema 는 데이터 표현만
- 별도 ORM/DB 라이브러리 도입 금지 (영속화는 step 2 의 책임)
- `seed` 필드를 zod 가 strip 하지 않게 passthrough 유지 (hand-drawn 비주얼 위해)
