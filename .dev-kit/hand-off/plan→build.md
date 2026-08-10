# Hand-off: plan → build

| Field | Value |
|---|---|
| From | `/dev-kit:plan` |
| To | `/dev-kit:build` |
| Phase | `archidraw-mvp` |
| Branch base | `plan/archidraw-mvp` |
| Status | best-effort (ambiguity_score = 5 ≥ threshold 3; approved by user) |

## Artifacts produced

- `PRD.md` — 6 sections (Frame, Validate, Non-goals, Phase plan, AC, Hand-off)
- `phases/archidraw-mvp/index.json` — 7 steps, status pending
- `phases/archidraw-mvp/step<N>.md` (N=1..7) — Read first / Task / AC / Verification / Don't
- `.dev-kit/decision-log.md` — gates captured
- `.dev-kit/loop-log.json` — 4-cycle narrowing
- `docs/proposals/archidraw/archidraw-mvp.yaml` — proposal source (auto-emit on Gate 5)

## Steps recap

| N | name | owner | deps |
|---|---|---|---|
| 1 | schema | backend-architect | — |
| 2 | store | backend-architect | step-1 |
| 3 | mcp | backend-architect | step-1, step-2 |
| 4 | gui | frontend-developer | step-1 |
| 5 | bridge | backend-architect | step-2, step-3, step-4 |
| 6 | e2e | general-purpose | step-3, step-4, step-5 |
| 7 | release | backend-architect | step-1..6 |

## Build runner contract

- Each step = one worktree (`<worktree_base>-step<N>`) + one build invocation
- Per step commit protocol: `feat(archidraw-mvp): step N — <name>` (body-less; N subject is the cross-walk anchor)
- `chore(archidraw-mvp): step N output` (no-op when nothing new)
- Runner transitions `index.json` step status `unimplemented → pending → in_progress → completed`
- Runner refuses without `.dev-kit/ci-config.json` marker (CI was installed 2026-08-10 on PR #1)

## Open decisions absorbed into acceptance

- step 2 영속화: `.excalidraw` per-file vs SQLite multi-diagram → SQLite 만 (단일 truth)
- step 5 bridge transport: SSE default, WebSocket adapter 는 post-MVP
- step 4 acceptance 1 차선: 6 툴 + delete 만, undo/redo + erase 는 post-MVP

## Next step

`/dev-kit:build` (invoked manually by operator). Build runner reads `phases/archidraw-mvp/index.json` + `phases/archidraw-mvp/step<N>.md`; PRD.md is the human-readable companion, not consumed by the runner.
