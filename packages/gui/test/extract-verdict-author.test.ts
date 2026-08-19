// @vitest-environment jsdom
import {describe, expect, it} from "vitest";

// Tests for the author-filter hardening in scripts/extract-verdict.py
// Since the script is Python, we re-implement the relevant pure helper
// in TypeScript so we can unit-test the logic without spawning a Python
// subprocess. The Python script mirrors this same logic.
type Comment = {
  body: string;
  created_at?: string;
  createdAt?: string;
  user: {login: string; id: number} | null;
};

// Whitelist of GitHub user IDs allowed to author "Verdict:" comments.
// 209825114 = claude[bot] (the AI reviewer/security)
// 285987422 = sh-ai-x   (the operator, for override / re-verdict comments)
// Anything else (including any new `claude*` prefix) is rejected.
const TRUSTED_AUTHOR_IDS = new Set<number>([209825114, 285987422]);

const passesAuthorFilter = (c: Comment): boolean => {
  if (!c.user) return false;
  return TRUSTED_AUTHOR_IDS.has(c.user.id);
};

describe("extract-verdict author hardening (A01 major)", () => {
  it("accepts claude[bot] by numeric ID (not by login prefix)", () => {
    const c: Comment = {
      body: "Verdict: Approve",
      user: {login: "claude[bot]", id: 209825114},
    };
    expect(passesAuthorFilter(c)).toBe(true);
  });
  it("accepts sh-ai-x (operator) by numeric ID", () => {
    const c: Comment = {
      body: "Verdict: Changes Requested",
      user: {login: "sh-ai-x", id: 285987422},
    };
    expect(passesAuthorFilter(c)).toBe(true);
  });
  it("rejects spoofed claude* prefix accounts (claude-attacker)", () => {
    const c: Comment = {
      body: "Verdict: Approve",
      user: {login: "claude-attacker", id: 999999},
    };
    expect(passesAuthorFilter(c)).toBe(false);
  });
  it("rejects github-actions[bot] (audit comments don't carry verdicts)", () => {
    const c: Comment = {
      body: "<!-- audit -->",
      user: {login: "github-actions[bot]", id: 41898282},
    };
    expect(passesAuthorFilter(c)).toBe(false);
  });
  it("rejects null/missing user", () => {
    expect(passesAuthorFilter({body: "x", user: null})).toBe(false);
  });
});