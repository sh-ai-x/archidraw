// @vitest-environment jsdom
import {describe, expect, it} from "vitest";

// scripts/extract-verdict.py의 작성자 필터 강화 테스트
// 스크립트가 Python이므로, Python 서브프로세스를 생성하지 않고
// 로직을 단위 테스트할 수 있도록 관련 순수 헬퍼를 TypeScript로
// 재구현했다. Python 스크립트가 동일한 로직을 미러링한다.
type Comment = {
  body: string;
  created_at?: string;
  createdAt?: string;
  user: {login: string; id: number} | null;
};

// "Verdict:" 댓글을 작성할 수 있는 GitHub 사용자 ID 화이트리스트.
// 209825114 = claude[bot] (AI 리뷰어/시큐리티)
// 285987422 = sh-ai-x   (운영자, 오버라이드 / 재-베르딕트 댓글용)
// 그 외 (새로운 `claude*` 접두사 포함)는 모두 거부된다.
const TRUSTED_AUTHOR_IDS = new Set<number>([209825114, 285987422]);

const passesAuthorFilter = (c: Comment): boolean => {
  if (!c.user) return false;
  return TRUSTED_AUTHOR_IDS.has(c.user.id);
};

describe("extract-verdict 작성자 강화 (A01 major)", () => {
  it("claude[bot]을 숫자 ID로 수락한다 (login 접두사가 아님)", () => {
    const c: Comment = {
      body: "Verdict: Approve",
      user: {login: "claude[bot]", id: 209825114},
    };
    expect(passesAuthorFilter(c)).toBe(true);
  });
  it("sh-ai-x (운영자)를 숫자 ID로 수락한다", () => {
    const c: Comment = {
      body: "Verdict: Changes Requested",
      user: {login: "sh-ai-x", id: 285987422},
    };
    expect(passesAuthorFilter(c)).toBe(true);
  });
  it("스푸핑된 claude* 접두사 계정을 거부한다 (claude-attacker)", () => {
    const c: Comment = {
      body: "Verdict: Approve",
      user: {login: "claude-attacker", id: 999999},
    };
    expect(passesAuthorFilter(c)).toBe(false);
  });
  it("github-actions[bot]을 거부한다 (감사 댓글은 verdict를 포함하지 않음)", () => {
    const c: Comment = {
      body: "<!-- audit -->",
      user: {login: "github-actions[bot]", id: 41898282},
    };
    expect(passesAuthorFilter(c)).toBe(false);
  });
  it("user가 null이거나 누락된 경우를 거부한다", () => {
    expect(passesAuthorFilter({body: "x", user: null})).toBe(false);
  });
});