"""Tests for templates/ci/scripts/extract-verdict.py.

Verifies the verdict extraction contract that review.yml + security
post-steps rely on (issue #244, boilerplate-web PR #19 verification;
issue #612, consumer silent-Approve bug; issue #625, MINIMAX provider
drops assistant stream):

  1. Missing file     → exit 0, empty stdout
  2. HTML file        → exit 0, empty stdout (network error page)
  3. JSONL no verdict → exit 0, prints "PARSE_FAILED" (issue #612)
  4. JSONL one Approve verdict → exit 0, prints "Approve"
  5. JSONL two verdicts (last wins) → exit 0, prints last verdict
  6. Bad usage        → exit 2 (missing arg)

Issue #612 contract: distinguish "I couldn't read the file"
(missing / HTML / unreadable / suspiciously small → stdout="") from
"the file existed but had no recognizable `Verdict:` line"
(stout="PARSE_FAILED"). The latter is hard-failed by the severity
gate so a real review failure can't be papered over as Approve.

Issue #625 contract: when the execution-file verdict is empty OR
PARSE_FAILED AND a PR-comments file is provided as the second arg,
fall back to scanning that file for `Verdict: <value>` lines. The
caller is responsible for filtering by run_id (defeats #244 stale-
comment flap). The file verdict still wins when present.
"""
from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "extract-verdict.py"

# (2026-08-22) A06 review round 4: import the freshness helper directly
# so the unit test below can exercise the pure function without
# needing a live `gh` CLI or a hermetic fixture. The script imports
# these from the same module; if the helper's contract drifts the
# subprocess tests below still gate but the unit assertion below
# fires first.
import importlib.util as _importlib_util
_spec = _importlib_util.spec_from_file_location(
    "extract_verdict_module", SCRIPT
)
_ev_module = _importlib_util.module_from_spec(_spec)
_spec.loader.exec_module(_ev_module)
_is_fresh_enough = _ev_module._is_fresh_enough

# Sentinel emitted by extract-verdict.py when the file existed with
# parseable content but no assistant message contained a `Verdict:`
# line. The severity gate's PARSE_FAILED branch hard-fails the gate
# on this string; see review.yml lines ~766-794 and ~600-630 for the
# review + security post-step wiring.
PARSE_FAILED = "PARSE_FAILED"


def _write_jsonl(path: Path, messages: list[dict]) -> None:
    """Write a JSON-lines stream (one JSON object per line)."""
    with path.open("w", encoding="utf-8") as fh:
        for msg in messages:
            fh.write(json.dumps(msg) + "\n")


def _assistant_msg(text: str) -> dict:
    """Mimic a claude-code SDK assistant message with a single text block."""
    return {
        "type": "assistant",
        "message": {
            "role": "assistant",
            "content": [{"type": "text", "text": text}],
        },
    }


def _run(args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        capture_output=True,
        text=True,
        check=False,
    )


def test_missing_file(tmp_path: Path) -> None:
    target = tmp_path / "nope.json"
    assert not target.exists()
    result = _run([str(target)])
    assert result.returncode == 0
    assert result.stdout == ""


def test_html_file(tmp_path: Path) -> None:
    target = tmp_path / "err.html"
    target.write_text("<html><body>404 Not Found</body></html>", encoding="utf-8")
    result = _run([str(target)])
    assert result.returncode == 0
    assert result.stdout == ""


def test_suspiciously_small_file(tmp_path: Path) -> None:
    """A file with content but < 10 chars is treated as missing.

    This is the size threshold the script uses to bail early (guards
    against partial-write races where the action started writing but
    didn't finish). Treated as the no-file path so the caller's
    tolerance kicks in.
    """
    target = tmp_path / "tiny.json"
    target.write_text("{}", encoding="utf-8")
    result = _run([str(target)])
    assert result.returncode == 0
    assert result.stdout == ""


def test_jsonl_no_verdict_emits_parse_failed(tmp_path: Path) -> None:
    """Issue #612: assistant message but no `Verdict:` line → PARSE_FAILED.

    Pre-#612 this returned empty stdout, which made the workflow
    silently default to Approve (the consumer bug). Now the sentinel
    hard-fails the gate so the user MUST fix the prompt contract.
    """
    target = tmp_path / "agent.json"
    _write_jsonl(
        target,
        [
            {"type": "init"},
            _assistant_msg("Looking at the diff now..."),
            {"type": "result"},
        ],
    )
    result = _run([str(target)])
    assert result.returncode == 0
    assert result.stdout.strip() == PARSE_FAILED


def test_jsonl_only_non_assistant_messages(tmp_path: Path) -> None:
    """JSONL with only init/result (no assistant messages) → PARSE_FAILED.

    The agent ran (file existed, was parseable JSON) but produced no
    assistant text at all. Same outcome as no-Verdict: hard-fail.
    """
    target = tmp_path / "agent.json"
    _write_jsonl(
        target,
        [
            {"type": "init"},
            {"type": "result"},
        ],
    )
    result = _run([str(target)])
    assert result.returncode == 0
    assert result.stdout.strip() == PARSE_FAILED


def test_jsonl_only_garbled_lines(tmp_path: Path) -> None:
    """File has content but no parseable JSON lines → PARSE_FAILED.

    Distinct from the no-file path (which returns "" so the caller's
    tolerance for genuinely-missing files still applies).
    """
    target = tmp_path / "agent.json"
    target.write_text("not json\nalso not json\n{broken\n", encoding="utf-8")
    result = _run([str(target)])
    assert result.returncode == 0
    assert result.stdout.strip() == PARSE_FAILED


def test_jsonl_assistant_with_bold_wrapped_verdict(tmp_path: Path) -> None:
    """Bold-wrapped `**Verdict:**` (PR-comment format) is NOT recognized.

    extract-verdict.py only matches the non-bold `Verdict:` form (the
    contract the agent's prompt requires). Bold-wrapped is what the
    PR-comment renderer emits, which the gate's separate comment-body
    parser (`maintenance_gate.py:extract_verdict`) handles. Keeping
    the two parsers distinct avoids the silent-Approve bug from
    issue #612 — if we silently accepted bold-wrapped here, a
    wrapper change that flips one form to the other would still
    silently pass.
    """
    target = tmp_path / "agent.json"
    _write_jsonl(
        target,
        [
            _assistant_msg("**Verdict:** Approve"),
        ],
    )
    result = _run([str(target)])
    assert result.returncode == 0
    assert result.stdout.strip() == PARSE_FAILED


def test_jsonl_single_approve(tmp_path: Path) -> None:
    target = tmp_path / "agent.json"
    _write_jsonl(
        target,
        [
            {"type": "init"},
            _assistant_msg("Review complete.\nVerdict: Approve"),
            {"type": "result"},
        ],
    )
    result = _run([str(target)])
    assert result.returncode == 0
    assert result.stdout.strip() == "Approve"


def test_jsonl_last_verdict_wins(tmp_path: Path) -> None:
    """Two assistant messages with verdicts — the LAST one wins."""
    target = tmp_path / "agent.json"
    _write_jsonl(
        target,
        [
            _assistant_msg("First draft:\nVerdict: Approve"),
            _assistant_msg("Revised:\nVerdict: Changes Requested"),
        ],
    )
    result = _run([str(target)])
    assert result.returncode == 0
    assert result.stdout.strip() == "Changes Requested"


def test_jsonl_all_three_verdicts(tmp_path: Path) -> None:
    """Exercise the full enum — last one wins regardless of order."""
    target = tmp_path / "agent.json"
    _write_jsonl(
        target,
        [
            _assistant_msg("Verdict: Approve"),
            _assistant_msg("Verdict: Blocked"),
        ],
    )
    result = _run([str(target)])
    assert result.returncode == 0
    assert result.stdout.strip() == "Blocked"


def test_missing_arg() -> None:
    result = _run([])
    assert result.returncode == 2
    assert "usage:" in result.stderr


def test_garbled_jsonl_with_valid_message(tmp_path: Path) -> None:
    """Garbled lines are skipped; valid assistant messages still parsed."""
    target = tmp_path / "agent.json"
    content = (
        "this is not json\n"
        + json.dumps(_assistant_msg("Verdict: Approve"))
        + "\n"
        + "{broken\n"
    )
    target.write_text(content, encoding="utf-8")
    result = _run([str(target)])
    assert result.returncode == 0
    assert result.stdout.strip() == "Approve"


def test_non_assistant_messages_ignored(tmp_path: Path) -> None:
    """User / result / tool messages mentioning Verdict are NOT parsed."""
    target = tmp_path / "agent.json"
    _write_jsonl(
        target,
        [
            {"type": "user", "content": "Verdict: Blocked (joke)"},
            {"type": "tool_use", "content": "Verdict: Changes Requested"},
            _assistant_msg("Verdict: Approve"),
        ],
    )
    result = _run([str(target)])
    assert result.returncode == 0
    assert result.stdout.strip() == "Approve"


# ---------------------------------------------------------------------------
# Issue #625: PR-comments fallback tests (MINIMAX provider drops the
# assistant stream from claude-execution-output.json but the agent still
# posts the verdict as a `gh pr comment` body). The caller filters by
# run_id; this contract just verifies the LAST-WINS extraction logic.
# ---------------------------------------------------------------------------


def _write_comments(path: Path, bodies: list[str]) -> None:
    """Write a PR-comments JSON file (array of {body} objects)."""
    path.write_text(
        json.dumps([{"body": b} for b in bodies]),
        encoding="utf-8",
    )


def test_comments_fallback_when_execution_file_missing(tmp_path: Path) -> None:
    """Issue #625: MINIMAX provider path — no execution file, but the
    agent posted the verdict as a PR comment body. The caller filtered
    by run_id; we just scan the file for the LAST Verdict: line."""
    target = tmp_path / "nope.json"  # does not exist
    comments = tmp_path / "comments.json"
    _write_comments(
        comments,
        [
            "<!-- dev-kit-verdict-audit --> run=12345 job=review ...\n",
            "Verdict: Approve\n\n## review summary...\n",
            "<!-- dev-kit-verdict-audit --> run=12345 job=review status=success verdict=Approve source=agent-pr-comment\n",
        ],
    )
    result = _run([str(target), str(comments)])
    assert result.returncode == 0
    assert result.stdout.strip() == "Approve"


def test_comments_fallback_when_execution_file_parse_failed(tmp_path: Path) -> None:
    """Issue #625: MINIMAX execution file has no assistant blocks
    (PARSE_FAILED), but the agent's PR-comment body has the verdict.
    Fall back to comments; should NOT propagate PARSE_FAILED."""
    target = tmp_path / "agent.json"
    _write_jsonl(
        target,
        [
            {"type": "preset", "content": "system preset"},
            {"type": "system", "subtype": "init"},
            {"type": "result", "subtype": "success"},
        ],
    )
    comments = tmp_path / "comments.json"
    _write_comments(
        comments,
        [
            "<!-- dev-kit-verdict-audit --> run=99 job=review ...\n",
            "Verdict: Changes Requested\n\n## review summary\n",
        ],
    )
    result = _run([str(target), str(comments)])
    assert result.returncode == 0
    assert result.stdout.strip() == "Changes Requested"


def test_file_verdict_wins_over_comments(tmp_path: Path) -> None:
    """Strict superset of pre-#625 behavior: anthropic provider
    produces an assistant message with the verdict; the comments
    file may have stale / different data — the FILE wins."""
    target = tmp_path / "agent.json"
    _write_jsonl(
        target,
        [_assistant_msg("Verdict: Approve")],
    )
    comments = tmp_path / "comments.json"
    _write_comments(
        comments,
        ["Verdict: Blocked\n\n<!-- stale from previous run -->\n"],
    )
    result = _run([str(target), str(comments)])
    assert result.returncode == 0
    assert result.stdout.strip() == "Approve"


def test_comments_fallback_returns_empty_if_nothing(tmp_path: Path) -> None:
    """Both file missing and comments empty → empty stdout (no-file
    tolerance path), NOT PARSE_FAILED. PARSE_FAILED is reserved for
    'agent ran and produced parseable content but no verdict'."""
    target = tmp_path / "nope.json"
    comments = tmp_path / "comments.json"
    _write_comments(comments, ["<!-- just an audit comment, no verdict -->\n"])
    result = _run([str(target), str(comments)])
    assert result.returncode == 0
    assert result.stdout == ""


def test_comments_fallback_last_wins(tmp_path: Path) -> None:
    """Multiple comments with verdicts — LAST one wins (mirrors the
    file-path 'last assistant message wins' semantics)."""
    target = tmp_path / "nope.json"
    comments = tmp_path / "comments.json"
    _write_comments(
        comments,
        [
            "Verdict: Approve\n",
            "Verdict: Changes Requested\n",
            "Verdict: Blocked\n",
        ],
    )
    result = _run([str(target), str(comments)])
    assert result.returncode == 0
    assert result.stdout.strip() == "Blocked"


def test_comments_file_malformed_returns_empty(tmp_path: Path) -> None:
    """Tolerate malformed JSON / non-list shapes — returns empty so
    the caller's no-file tolerance still applies. Never raises."""
    target = tmp_path / "nope.json"
    comments = tmp_path / "comments.json"
    comments.write_text("{not valid json at all", encoding="utf-8")
    result = _run([str(target), str(comments)])
    assert result.returncode == 0
    assert result.stdout == ""


def test_comments_file_missing_returns_empty(tmp_path: Path) -> None:
    """Caller forgot to pass the file — empty stdout, no exception."""
    target = tmp_path / "nope.json"
    result = _run([str(target), str(tmp_path / "missing.json")])
    assert result.returncode == 0
    assert result.stdout == ""


# ---------------------------------------------------------------------------
# Issue #625 follow-up: auto-fetch PR comments when no comments file is
# passed AND the file verdict is empty / PARSE_FAILED. When the cutoff
# filter excludes every claude[bot] verdict (e.g. agent envelope drop —
# the verdict comments are from previous runs, all earlier than
# pull_request.updated_at), the script falls back to scanning ALL
# trusted-author comments and returns the LAST verdict.
#
# These tests run against the live sh-ai-x/archidraw repo (the same
# fixture the production review.yml uses), gated on `gh` being
# authenticated. Skip when not — they're integration tests, not pure
# unit tests. The sh-ai-x/archidraw owner runs them locally; CI can
# add them behind an env-flag if a hermetic fixture is built.
# ---------------------------------------------------------------------------


def _gh_auth_available() -> bool:
    """Best-effort check: `gh auth status` exits 0 when authenticated."""
    import subprocess as _sp
    try:
        proc = _sp.run(
            ["gh", "auth", "status", "--hostname", "github.com"],
            capture_output=True, text=True, timeout=10,
        )
        return proc.returncode == 0
    except (FileNotFoundError, _sp.TimeoutExpired, OSError):
        return False


def test_auto_fetch_falls_back_when_cutoff_excludes_all(
    tmp_path: Path, monkeypatch
) -> None:
    """PR #48 / runs after 32352323012: the agent's envelope drops the
    assistant stream so the file verdict is PARSE_FAILED AND no fresh
    `Verdict:` comment was posted in the current run. The cutoff
    (`pull_request.updated_at`) excludes every earlier claude[bot]
    verdict. The fallback pass must still recover the LAST verdict
    so the gate shows a real review decision (e.g. "Changes Requested")
    instead of hard-failing with PARSE_FAILED.

    Skipped when `gh` is not authenticated (local-only unit tests
    don't need network)."""
    if not _gh_auth_available():
        import pytest
        pytest.skip("gh CLI not authenticated; auto-fetch integration test skipped")
    event = tmp_path / "event.json"
    event.write_text(
        '{"pull_request": {"updated_at": "2099-01-01T00:00:00Z", '
        '"created_at": "2020-01-01T00:00:00Z"}}',
        encoding="utf-8",
    )
    target = tmp_path / "nope.json"  # does not exist → "" file verdict
    env = {
        "PR_NUMBER": "48",
        "GITHUB_EVENT_PATH": str(event),
    }
    result = subprocess.run(
        [sys.executable, str(SCRIPT), str(target)],
        capture_output=True, text=True, check=False,
        env={**__import__("os").environ, **env},
        timeout=60,
    )
    assert result.returncode == 0
    # PR #48's last claude[bot] verdict is "Changes Requested" — the
    # fallback must surface it instead of returning PARSE_FAILED or
    # empty stdout (which would let the gate default-to-Approve on
    # empty verdict and silently miss the reviewer feedback).
    assert result.stdout.strip() in {"Approve", "Blocked", "Changes Requested"}, (
        f"auto-fetch fallback returned unexpected verdict: "
        f"stdout={result.stdout!r} stderr={result.stderr!r}"
    )


# ---------------------------------------------------------------------------
# A06 review round 4 (2026-08-22): the comment-fallback path uses
# `_is_fresh_enough(created_at, freshness_limit)` to discard verdicts
# from earlier pushes. A stale "Changes Requested" verdict from a
# previous run would otherwise leak through and re-fail the gate even
# after the agent dropped its verdict on the current run. Pure unit
# tests for the helper.
# ---------------------------------------------------------------------------


class TestFreshnessFilter:
    """Pins the freshness contract so a future edit cannot widen the
    stale-verdict window without a corresponding test churn."""

    NOW = datetime(2026, 8, 22, 12, 0, 0, tzinfo=timezone.utc)
    FRESHNESS_LIMIT = NOW - timedelta(hours=4)

    def test_현재_시각_이내는_fresh로_판정된다(self) -> None:
        ts = (self.NOW - timedelta(minutes=10)).isoformat().replace("+00:00", "Z")
        assert _is_fresh_enough(ts, self.FRESHNESS_LIMIT) is True

    def test_정확히_4시간_이내는_stale로_판정된다(self) -> None:
        ts = (self.FRESHNESS_LIMIT - timedelta(seconds=1)).isoformat().replace("+00:00", "Z")
        assert _is_fresh_enough(ts, self.FRESHNESS_LIMIT) is False

    def test_4시간_이전_시각은_stale로_판정된다(self) -> None:
        ts = (self.NOW - timedelta(hours=8)).isoformat().replace("+00:00", "Z")
        assert _is_fresh_enough(ts, self.FRESHNESS_LIMIT) is False

    def test_빈_문자열은_fresh로_판정된다(self) -> None:
        # Tolerate missing timestamp rather than silently dropping —
        # the caller can decide via other signals (cutoff, author id).
        assert _is_fresh_enough("", self.FRESHNESS_LIMIT) is True

    def test_파싱_실패_문자열은_fresh로_판정된다(self) -> None:
        # Tolerate unknown formats; the helper returns True so the
        # comment flows through to the existing author-id / cutoff
        # gates.
        assert _is_fresh_enough("not-an-iso-8601-timestamp", self.FRESHNESS_LIMIT) is True

    def test_Z_접미사_UTC_타임스탬프를_처리한다(self) -> None:
        # claude[bot] / github-actions[bot] timestamps use the
        # Python json.dumps-serialized style: 2026-08-22T08:00:00Z.
        ts = (self.NOW - timedelta(hours=1)).isoformat().replace("+00:00", "Z")
        assert _is_fresh_enough(ts, self.FRESHNESS_LIMIT) is True

