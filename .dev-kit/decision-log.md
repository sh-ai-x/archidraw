# Decision log — archidraw plan

`/dev-kit:plan` Gate 1–5 captured decisions.

## # frame (Gate 1)

| Field | Value |
|---|---|
| goal | Excalidraw JSON 스키마를 단일 진실 원천으로 하는 브라우저 화이트보드 GUI 와 MCP 서버를 구축하여, 한쪽의 element mutate 가 즉시 반대편에 1 초 이내 반영되는 상태 동기화를 end-to-end 로 입증한다. |
| target user | Claude Code/Codex 사용 + 직접 GUI 도식 작업이 필요한 1 인 개발자/아키텍트 |
| situation | 현재 Excalidraw 웹에서 도면을 그리고, 별도 채팅 세션에서 Claude Code 로 CRUD 명령을 보내려면 매번 `.excalidraw` JSON 을 수동 복사/붙여넣기 해야 함 |

## gate-2 cycle 0

- evidence: 4 sources (need 3) → **PASS**
- LTV: 50 × 20 = 1000 / cost 25000 = **value_score 2.0** (under 3.0 threshold)
- ambiguity: 10 (initial)
- next: tighten cost to bring value_score >= 3.0

## gate-2 cycle 1 — cost lever

- Asked "cost reduction lever" → MVP 의 3 step 만으로 cost 12.5k 까지 낮춤 (research + plan + 3 build step)
- value_score (revised): (50 × 20) / 12500 = **4.0** → **PASS threshold**
- ambiguity: 10 → 8 (asked: first-user persona)
- next: ask about smallest shippable version

## gate-2 cycle 2 — scope

- Asked "smallest version that pays for itself" → schema + store + mcp + gui + bridge + e2e + release (7 step) but step 4 acceptance is 1-차선
- ambiguity: 8 → 6 (scope definition)
- next: ask about single metric

## gate-2 cycle 3 — metric

- Asked "single number that moves" → MCP call 후 GUI 반영 p99 < 1 s (acceptance_metric)
- ambiguity: 6 → 5 (metric clarity)
- status: best-effort (5 > 3 still; cap reached on practical grounds)

## # non-goals (Gate 3)

1. 실시간 멀티유저 collaboration → Yjs 미도입 (Step 5 추상화로 향후 slot 확보)
2. 클라우드 계정 / 인증 / 결제 → self-hosted only
3. 모바일 / 태블릿 네이티브 → desktop browser 만
4. PNG/SVG 외 export → PRD acceptance 외 포맷 추가 안 함
5. Excalidraw library marketplace 연동 → 내부 도구만

## # decompose (Gate 4)

`phases/archidraw-mvp/index.json` 참조. 7 steps, each Owner=backend-architect except step 4 (frontend-developer) and step 6 (general-purpose).

## # emit (Gate 5)

PRD.md 6 섹션 완성. AC 7 개 ↔ step AC 7 개 1:1 매핑. Hand-off: `/dev-kit:proposal archidraw/archidraw-mvp` → `/dev-kit:build`.
