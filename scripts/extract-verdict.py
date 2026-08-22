#!/usr/bin/env python3
"""
extract-verdict.py — extract the LLM review/security verdict from
anthropics/claude-code-action@v1's output file, with a PR-comments
fallback for providers that drop the assistant stream.

ROOT-CAUSE FIX (issue #244, boilerplate-web PR #17/#19): the previous
post-script extracted the verdict by grepping PR comments for
"Verdict: <value>". That works ONLY when the agent actually posts a
comment with a "Verdict:" line. When the agent posts an inline comment
(mcp__github_inline_comment) or no comment at all, the post-script
falls back to a stale comment from a previous run, causing the
severity gate to flip-flop between Approve / Changes Requested /
Blocked on every push.

This script reads the agent's full output (saved by the action to
$RUNNER_TEMP/claude-execution-output.json or
/home/runner/work/_temp/claude-execution-output.json) and extracts the
LAST assistant text that contains "Verdict: <value>". The action's
output is a JSON-lines stream of messages (init, user, assistant,
result, etc.). The assistant messages contain the model's text output;
the verdict appears in the FINAL assistant message per the prompt
contract.

ISSUE #625 — MINIMAX PROVIDER FALLBACK
The MINIMAX provider (CI_REVIEW_PROVIDER=minimax, via
https://api.minimax.io/anthropic) drops the assistant-message stream
from `claude-execution-output.json` — the file is parseable JSONL but
contains only `type: "preset"`, `type: "system"` init, and
`type: "result"` summary messages. The agent DOES post the verdict as
a PR comment body, but `extract()` returns PARSE_FAILED because there
is no assistant text block.

This script accepts an optional SECOND argument — a path to a JSON file
containing the PR comments for the current run (already filtered by
the caller to ONLY include comments whose body contains the current
`run=<GITHUB_RUN_ID>`). If the execution-file extraction returns
empty OR PARSE_FAILED, the script falls back to scanning those
comments for `Verdict: <value>`. The run-id filter is what defeats
the #244 stale-comment flap: by construction only comments posted in
THIS run are candidates.

CONTRACT (issue #612, consumer PR silent-Approve bug):
  - file missing / HTML / unreadable / suspiciously small → stdout=""
    (caller treats as the genuine "no-file" path; tolerance is
    appropriate because it usually means a transient filesystem /
    network problem)
  - file exists, parseable JSON, but no assistant message contains a
    recognizable `Verdict:` line → stdout="PARSE_FAILED"
    (the agent ran and produced JSON output, but did not emit the
    verdict contract — caller hard-fails the gate so the user MUST
    fix the prompt contract instead of silently letting Approve pass;
    see review.yml gate's `PARSE_FAILED` branch for the remediation
    message)
  - file exists, parseable JSON, with `Verdict:` in an assistant
    message → stdout=verdict (last one wins)
  - NEW (issue #625): if the file verdict is empty OR PARSE_FAILED
    AND a PR-comments file is provided as the second argument, fall
    back to scanning those comments for the verdict. The PR-comments
    file must be filtered by run_id by the caller (otherwise the
    #244 stale-comment flap returns).

The "PARSE_FAILED" sentinel is what enables the gate to distinguish
"agent ran but didn't follow the verdict contract" from "agent's output
file is genuinely missing" — the two failure modes deserve different
treatment (hard-fail vs. tolerance).

Robustness:
- If the file is missing, exits 0 with no output (caller falls back).
- If the file is HTML (e.g. 404 from a redirect), exits 0 with no
  output (caller falls back). Detected by checking the first non-blank
  character.
- If the file is parseable JSON but no Verdict, exits 0 with the
  PARSE_FAILED sentinel (caller hard-fails the gate — see CONTRACT
  above; this is the fix for the consumer silent-Approve bug).
- If the file is unreadable, exits 0 with no output (caller falls back).
- If a PR-comments file is provided and the file verdict is empty /
  PARSE_FAILED, scan those comments for the LAST `Verdict:` line.
  Caller is responsible for filtering by run_id (#244 defeat).
- Returns exit 0 (not 1) on "not found" or "parse failed" so the
  bash || true at the call site can stay simple.

Usage:
  python3 extract-verdict.py <path-to-claude-execution-output.json>
                             [<path-to-pr-comments-this-run.json>]

Prints the verdict (Approve|Blocked|Changes Requested), the sentinel
`PARSE_FAILED`, or nothing (empty stdout = caller falls back to no-file
path). Exits 0 always.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

VERDICT_RE = re.compile(r'Verdict:\s*(Approve|Blocked|Changes Requested)\b')

# Sentinel emitted when the agent's output file exists and is parseable
# JSONL but no assistant message contains a `Verdict:` line. The
# review.yml severity gate has a dedicated branch that hard-fails with
# a remediation message when this sentinel shows up in the verdict
# output (see the `PARSE_FAILED` arm of the combined verdict gate).
PARSE_FAILED = "PARSE_FAILED"


def extract(path: Path) -> str:
    """Read the agent's execution file and extract the LAST `Verdict: <value>`.

    Returns "" if the file is missing / HTML / unreadable / suspiciously small.
    Returns PARSE_FAILED if the file is parseable JSONL but contains no
    recognizable `Verdict:` line in any assistant message.
    Returns the verdict string otherwise.
    """
    if not path.exists():
        return ""
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""
    # Bail early if the file looks like an HTML error page (network
    # failure, 404, etc.). JSON-lines from claude-code-action NEVER
    # starts with '<'. The 1KB peek is enough to detect any HTML/XML
    # payload.
    peek = text.lstrip()[:1024]
    if peek.startswith("<") or peek.lower().startswith("<?xml"):
        return ""
    # Also bail if the file is suspiciously small or empty.
    if len(text) < 10:
        return ""
    last_verdict = ""
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        # Bail on any non-{ line — JSON-lines is strict.
        if not line.startswith("{"):
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not isinstance(msg, dict):
            continue
        if msg.get("type") != "assistant":
            continue
        # Content can be in `message.content` (list of content blocks,
        # claude-code SDK) or directly in `content` (string, some
        # wrappers).
        content = msg.get("message", {}).get("content")
        if content is None:
            content = msg.get("content")
        texts: list[str] = []
        if isinstance(content, list):
            for block in content:
                if isinstance(block, dict) and block.get("type") == "text":
                    texts.append(str(block.get("text", "")))
                elif isinstance(block, str):
                    texts.append(block)
        elif isinstance(content, str):
            texts.append(content)
        for t in texts:
            m = VERDICT_RE.search(t)
            if m:
                last_verdict = m.group(1)
    # Issue #612 fix: file passed the basic shape checks (exists, not
    # HTML, has content) but no assistant message contained a
    # recognizable `Verdict:` line. Either the JSONL was garbled, the
    # agent didn't emit a verdict, or the wrapper changed format — in
    # all cases we cannot trust a missing-verdict default. Emit the
    # PARSE_FAILED sentinel so the gate hard-fails with the dedicated
    # remediation message instead of silently defaulting to Approve
    # (the old consumer-facing bug). The no-file / HTML / unreadable
    # cases above still return "" so the caller can keep its genuine
    # no-file tolerance path.
    if not last_verdict:
        return PARSE_FAILED
    return last_verdict


def extract_from_comments(path: Path) -> str:
    """Issue #625: scan PR-comments JSON for the LAST `Verdict:` line.

    The CALLER is responsible for filtering by run_id — otherwise the
    #244 stale-comment flap returns (this is exactly what the old
    `gh pr comment --jq` grep did, and it broke boilerplate-web PR #18
    by picking up a stale `Verdict: Changes Requested` from a previous
    push). The review.yml wrapper builds the comments file with:

        gh api .../issues/$PR_NUMBER/comments \\
            --jq '.[] | select(.body | contains("run=$RUN_ID")) | {body: .body}'

    so only comments from THIS run are candidates.

    Expected JSON shape: array of objects with a `body` string field.
    Tolerant of unknown shapes — returns "" on any parse error so the
    caller's no-file fallback still works.

    Returns the LAST `Verdict: <value>` line found, or "" if none.
    """
    if not path.exists():
        return ""
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""
    text = text.strip()
    if not text:
        return ""
    try:
        comments = json.loads(text)
    except json.JSONDecodeError:
        return ""
    if not isinstance(comments, list):
        return ""
    last_verdict = ""
    for comment in comments:
        if not isinstance(comment, dict):
            continue
        body = comment.get("body", "")
        if not isinstance(body, str):
            continue
        # Scan each comment body for a verdict line. The agent's
        # summary comment body starts with a single-line "Verdict:"
        # preamble followed by the review content; the audit comment
        # has no verdict line at all. The regex is the same as the
        # execution-file path so the verdict semantics match.
        m = VERDICT_RE.search(body)
        if m:
            last_verdict = m.group(1)
    return last_verdict


def _is_fresh_enough(created_at: str, freshness_limit) -> bool:
    """A06 review round 4 (2026-08-22): helper used by the comment-
    fallback path to discard verdicts older than `freshness_limit`.

    Returns True when `created_at` cannot be parsed (tolerate unknown
    formats rather than silently dropping) OR when the parsed
    timestamp is strictly greater than the cutoff. Returns False only
    when a parseable, OLDER-than-cutoff timestamp shows the comment
    is stale.
    """
    if not created_at:
        return True
    try:
        from datetime import datetime, timezone
        ts = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
    except (ValueError, ImportError):
        return True
    return ts >= freshness_limit


def _auto_fetch_pr_comments_verdict() -> str:
    """Issue #625 auto-fetch: when no comments file is provided on the
    command line, fetch the PR's comments via the `gh` CLI and scan
    them for the LAST `Verdict: <value>` line, filtered by author
    (whitelisted GitHub user IDs — see TRUSTED_AUTHOR_IDS below) and
    cutoff timestamp (defeats the #244 stale-comment flap — without
    the cutoff, a previous run's verdict would win and the gate would
    flip-flop on every push).

    Requires the `gh` CLI in PATH plus `GITHUB_TOKEN` (or `GH_TOKEN`)
    and `PR_NUMBER` env vars set. Returns "" on any failure (CLI
    missing, non-zero exit, network error, no matching comment) so
    the caller's no-file / PARSE_FAILED tolerance still works.

    This is the fix for PR #48 / PR #49 where the AI agents run on
    the PR but the action's output envelope format change means
    extract-verdict.py cannot parse the verdict from the file. The
    AI does post the verdict as a PR comment, but the review.yml
    gate in origin/main does not pass a comments file. Without this
    fallback the gate hard-fails with PARSE_FAILED; with this
    fallback the comment verdict is recovered.
    """
    import os
    import subprocess
    import tempfile

    pr_number = os.environ.get("PR_NUMBER") or os.environ.get("GITHUB_PR_NUMBER")
    if not pr_number:
        return ""
    cutoff = (
        os.environ.get("VERDICT_COMMENT_CUTOFF")
        or os.environ.get("GITHUB_HEAD_COMMIT_TIMESTAMP")
        or ""
    )
    # In GitHub Actions the cutoff is usually NOT set as an env var
    # directly — review.yml builds it from `github.event.head_commit
    # .timestamp || github.event.pull_request.updated_at`. Read the
    # event JSON when available so we still filter stale comments
    # without requiring workflow-file changes.
    if not cutoff:
        event_path = os.environ.get("GITHUB_EVENT_PATH")
        if event_path and Path(event_path).exists():
            try:
                with Path(event_path).open(encoding="utf-8") as fh:
                    event = json.loads(fh.read())
                cutoff = (
                    (event.get("head_commit") or {}).get("timestamp")
                    or (event.get("pull_request") or {}).get("updated_at")
                    or ""
                )
            except (OSError, json.JSONDecodeError):
                pass
    # gh api needs the repo coordinates. Pull owner/repo from `gh repo
    # view --json nameWithOwner` so this works in any clone, not just
    # the canonical archidraw repo.
    try:
        repo_proc = subprocess.run(
            ["gh", "repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"],
            capture_output=True,
            text=True,
            timeout=15,
        )
        if repo_proc.returncode != 0 or not repo_proc.stdout.strip():
            return ""
        repo = repo_proc.stdout.strip()
    except (subprocess.TimeoutExpired, subprocess.SubprocessError, FileNotFoundError, OSError):
        return ""
    # Fetch all comments for the PR. Use --paginate so multi-page
    # results are concatenated.
    try:
        comments_proc = subprocess.run(
            [
                "gh", "api",
                f"/repos/{repo}/issues/{pr_number}/comments",
                "--paginate",
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if comments_proc.returncode != 0:
            return ""
        raw = comments_proc.stdout.strip()
    except (subprocess.TimeoutExpired, subprocess.SubprocessError, FileNotFoundError, OSError):
        return ""
    if not raw:
        return ""
    # gh api with --paginate on a list endpoint emits JSONL (one
    # object per line). Accept either JSONL or a JSON array.
    try:
        if raw.startswith("["):
            comments_all = json.loads(raw)
        else:
            comments_all = [json.loads(line) for line in raw.splitlines() if line.strip()]
    except json.JSONDecodeError:
        return ""
    # A01 review (2026-08-19): author was previously filtered by login
    # prefix `claude*`, which any attacker can satisfy by registering
    # `claude-evil-fork`. Pin to specific GitHub user IDs instead —
    # these are not centrally reserved but cannot be impersonated without
    # compromising the upstream account. Whitelist:
    #   209825114 — claude[bot]         (the AI reviewer/security)
    #   285987422 — sh-ai-x (operator)  (override / re-verdict comments)
    TRUSTED_AUTHOR_IDS = {209825114, 285987422}
    # Two-pass filter: first pass keeps only comments strictly newer
    # than the cutoff (#244 stale-comment flap protection); if that
    # pass yields zero comments, fall back to scanning ALL claude[bot]
    # comments regardless of cutoff. The fallback recovers the verdict
    # when the current run's agent failed to post a verdict comment
    # (e.g. MiniMax envelope drop → post-summary default-approve →
    # agent_ran=true but no fresh `Verdict:` comment was posted) —
    # without the fallback, the gate would hard-fail with
    # PARSE_FAILED even though the previous run produced a real
    # verdict. Issue: PR #48 / runs after 32352323012.
    filtered: list[dict] = []
    for c in comments_all:
        if not isinstance(c, dict):
            continue
        user = c.get("user")
        author_id = user.get("id") if isinstance(user, dict) else None
        if not isinstance(author_id, int) or author_id not in TRUSTED_AUTHOR_IDS:
            continue
        created_at = c.get("created_at", "") or c.get("createdAt", "")
        body = c.get("body", "")
        if not isinstance(body, str):
            continue
        if cutoff and created_at and created_at >= cutoff:
            filtered.append({"body": body, "createdAt": created_at})
    if not filtered and cutoff:
        # Fallback: no comments newer than cutoff (typical when the
        # agent's run did not post a verdict comment, e.g. envelope
        # drop). Scan ALL trusted-author comments and take the LAST
        # verdict. Stale-comment flap (#244) is bounded because the
        # push that triggered THIS workflow run advanced updated_at,
        # so any earlier-push verdict reflects a strictly older
        # commit — the human gate (REVIEW_REQUIRED / CHANGES_REQUESTED
        # on the PR) is the authoritative merge block, not the
        # severity gate verdict.
        #
        # A06 review round 4 (2026-08-22) stale-verdict hardening: the
        # previous fallback scanned ALL trusted-author comments without
        # ANY time gate, which let a comment from a previous push's run
        # leak back as "Changes Requested" on a current run that
        # produced no fresh verdict. Add a 4-hour freshness cap so the
        # fallback only fires for verdicts recent enough to plausibly
        # reflect the current commit. Still bounded by
        # `cutoff` (push-time freshness) for the primary path; the
        # 4h cap is the secondary safety net for the case where the
        # agent ran and skipped its own comment. The human gate
        # remains the authoritative merge block (REVIEW_REQUIRED /
        # CHANGES_REQUESTED on the PR).
        from datetime import datetime, timedelta, timezone
        freshness_limit = datetime.now(tz=timezone.utc) - timedelta(hours=4)
        for c in comments_all:
            if not isinstance(c, dict):
                continue
            user = c.get("user")
            author_id = user.get("id") if isinstance(user, dict) else None
            if not isinstance(author_id, int) or author_id not in TRUSTED_AUTHOR_IDS:
                continue
            created_at = c.get("created_at", "") or c.get("createdAt", "")
            body = c.get("body", "")
            if not isinstance(body, str):
                continue
            # ISO-8601 parse for the 4-hour freshness check via the
            # pure `_is_fresh_enough` helper (covered by
            # tests/test_extract_verdict.py::TestFreshnessFilter).
            if not _is_fresh_enough(created_at, freshness_limit):
                continue
            filtered.append({"body": body, "createdAt": created_at})
    if not filtered:
        return ""
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", delete=False, encoding="utf-8"
        ) as fh:
            json.dump(filtered, fh)
            tmp_path = Path(fh.name)
    except OSError:
        return ""
    try:
        return extract_from_comments(tmp_path)
    finally:
        try:
            tmp_path.unlink()
        except OSError:
            pass


def main() -> int:
    if len(sys.argv) not in (2, 3):
        print(
            f"usage: {sys.argv[0]} <claude-execution-output.json> "
            f"[<pr-comments-this-run.json>]",
            file=sys.stderr,
        )
        return 2
    file_path = Path(sys.argv[1])
    verdict = extract(file_path)

    # Issue #625 fallback: if the execution-file verdict is empty or
    # PARSE_FAILED, AND a PR-comments file is provided, scan those
    # comments for the verdict. Caller MUST have filtered by run_id
    # (see extract_from_comments docstring for the rationale).
    if (not verdict or verdict == PARSE_FAILED) and len(sys.argv) >= 3:
        comments_path = Path(sys.argv[2])
        comments_verdict = extract_from_comments(comments_path)
        if comments_verdict:
            verdict = comments_verdict
    elif (not verdict or verdict == PARSE_FAILED) and len(sys.argv) < 3:
        # No comments file provided AND file verdict is empty /
        # PARSE_FAILED. Auto-fetch the PR's claude-authored comments
        # via `gh` CLI as a recovery path (issue #625 follow-up).
        # Wrapped in try/except so any gh / network failure is a
        # silent no-op rather than a script crash.
        try:
            auto_verdict = _auto_fetch_pr_comments_verdict()
            if auto_verdict:
                verdict = auto_verdict
        except Exception as exc:
            # A09-1 (2026-08-19): log to stderr (the `2>/dev/null`
            # wrapper in review.yml drops it, but a CI run with the
            # default would surface it) so an expired GITHUB_TOKEN or
            # network failure isn't silently degrading the gate to
            # "no verdict → Approve". Exception type + message only,
            # never the full traceback (the body might embed attacker-
            # controlled text from a malformed PR comment).
            print(
                f"extract-verdict: auto-fetch failed "
                f"({type(exc).__name__}: {exc})",
                file=sys.stderr,
            )

    # ALWAYS print to stdout (empty if not found). Caller uses stdout
    # to decide whether to use the file verdict or fall back.
    if verdict:
        print(verdict)
    return 0


if __name__ == "__main__":
    sys.exit(main())
