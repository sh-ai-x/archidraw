#!/usr/bin/env python3
"""
post-review-summary.py — fallback that guarantees a PR comment is posted
even when the upstream agent (claude-code-action via MiniMax or any
other provider) ran but did NOT itself call `gh pr comment`.

ROOT-CAUSE FIX (consumer sh-ai-x/archidraw PR #17/#18/#20/#21): the
existing workflow has the agent post its own verdict summary as a PR
comment via the prompt instructions, but MiniMax-routed runs (and other
provider quirks) routinely produce an agent output file with no
recognizable `Verdict: <value>` line and no PR comment — leaving
consumers with only the github-actions verdict-audit comment and a
`source=default-approve-empty-file` audit.

This script is a defensive post-step that:

1. Reads `$RUNNER_TEMP/claude-execution-output.json` (fallback path
   `/home/runner/work/_temp/claude-execution-output.json`) — the same
   envelope extract-verdict.py parses.
2. Extracts the LAST assistant text block.
3. If the text contains a recognizable `Verdict: Approve|Changes
   Requested|Blocked` line, posts the full text as a single PR comment
   via `gh pr comment` using the workflow's GITHUB_TOKEN. The body is
   prefixed with a `<!-- dev-kit-{job}-summary run=… -->` marker so a
   re-run on the same PR is idempotent (gh CLI rejects duplicate
   content within ~1 minute).
4. If the agent's text contains NO verdict line, posts the raw output
   plus a clear "no verdict detected" note, so consumers can see what
   the agent actually said and the gate's `default-approve-empty-file`
   source remains the canonical signal.

Usage (in workflow):
  python3 scripts/post-review-summary.py \
      --pr-number "$PR_NUMBER" \
      --job review \
      --output-file "$RUNNER_TEMP/claude-execution-output.json" \
      --run-id "$GITHUB_RUN_ID"

Exits 0 always. Failures fall back to a stderr note; the workflow
continues regardless so the extract-verdict.py step still runs and the
gate can still resolve.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

VERDICT_RE = re.compile(r'Verdict:\s*(Approve|Blocked|Changes Requested)\b')


def _candidate_paths(explicit):
    """Return the agent output paths to probe, in order."""
    paths = []
    if explicit:
        paths.append(Path(explicit))
    runner_temp = os.environ.get("RUNNER_TEMP")
    if runner_temp:
        paths.append(Path(runner_temp) / "claude-execution-output.json")
    paths.append(Path("/home/runner/work/_temp/claude-execution-output.json"))
    seen = set()
    out = []
    for p in paths:
        if p not in seen:
            seen.add(p)
            out.append(p)
    return out


def _load_last_assistant_text(path):
    """Read JSON-lines and return concatenated assistant text blocks."""
    if not path.exists():
        return ""
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        print(f"::warning::could not read {path}: {exc}", file=sys.stderr)
        return ""
    peek = text.lstrip()[:1024]
    if peek.startswith("<") or peek.lower().startswith("<?xml"):
        return ""
    if len(text) < 10:
        return ""
    blocks = []
    for line in text.splitlines():
        line = line.strip()
        if not line or not line.startswith("{"):
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not isinstance(msg, dict):
            continue
        if msg.get("type") != "assistant":
            continue
        content = msg.get("message", {}).get("content")
        if content is None:
            content = msg.get("content")
        if isinstance(content, list):
            for block in content:
                if isinstance(block, dict) and block.get("type") == "text":
                    blocks.append(str(block.get("text", "")))
                elif isinstance(block, str):
                    blocks.append(block)
        elif isinstance(content, str):
            blocks.append(content)
    return "\n\n".join(t for t in blocks if t.strip())


def _detect_verdict(assistant_text):
    """Return the LAST recognized verdict, or '' if none."""
    last = ""
    for m in VERDICT_RE.finditer(assistant_text):
        last = m.group(1)
    return last


def _post_comment(pr_number, body):
    """Invoke `gh pr comment` and return (exit_code, stdout_or_stderr)."""
    proc = subprocess.run(
        ["gh", "pr", "comment", pr_number, "--body", body],
        capture_output=True,
        text=True,
        check=False,
    )
    return proc.returncode, (proc.stderr or proc.stdout).strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[1] if __doc__ else "")
    parser.add_argument("--pr-number", required=True)
    parser.add_argument("--job", required=True, help="review | security")
    parser.add_argument("--output-file", default=None,
                        help="Path to claude-execution-output.json "
                             "(default: probe $RUNNER_TEMP + fallback)")
    parser.add_argument("--run-id", required=True)
    args = parser.parse_args()

    chosen = None
    assistant_text = ""
    for candidate in _candidate_paths(args.output_file):
        if candidate.exists():
            chosen = candidate
            assistant_text = _load_last_assistant_text(candidate)
            break
    if chosen is None:
        print("::notice::post-review-summary: no agent output file found; "
              "skipping comment post (extract step will record "
              "default-approve-no-file).")
        return 0

    marker = (
        f"<!-- dev-kit-{args.job}-summary "
        f"run={args.run_id} agent-output={chosen} -->"
    )
    verdict = _detect_verdict(assistant_text)

    if assistant_text.strip() and verdict:
        body = f"{marker}\n\n{assistant_text.strip()}\n"
        note = (f"::notice::post-review-summary: posting agent's last "
                f"assistant text as PR #{args.pr_number} comment "
                f"(detected verdict: {verdict}, source: {chosen}).")
    elif assistant_text.strip():
        body = (
            f"{marker}\n\n{assistant_text.strip()}\n\n"
            f"---\n\n"
            f"**Note:** post-review-summary.py could not detect a "
            f"`Verdict: Approve|Changes Requested|Blocked` line in the "
            f"agent's output. Severity gate defaulted to "
            f"`Approve source=default-approve-empty-file`.\n"
        )
        note = (f"::warning::post-review-summary: agent text found but "
                f"no verdict line; posting raw output to PR "
                f"#{args.pr_number} as a fallback.")
    else:
        body = (
            f"{marker}\n\n"
            f"**No review summary produced.**\n\n"
            f"The `{args.job}` agent ran but its output file "
            f"(`{chosen}`) contains no assistant text. This is almost "
            f"always a provider/install issue, not a clean PR.\n\n"
            f"Severity gate defaulted to `Approve "
            f"source=default-approve-empty-file`.\n"
        )
        note = (f"::warning::post-review-summary: agent output empty; "
                f"posting synthetic fallback to PR #{args.pr_number}.")

    print(note)
    code, output = _post_comment(args.pr_number, body)
    if code != 0:
        print(f"::warning::gh pr comment failed (exit={code}): {output}",
              file=sys.stderr)
        return 0
    print(f"::notice::post-review-summary: comment posted to PR "
          f"#{args.pr_number} ({output or 'no url'}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
