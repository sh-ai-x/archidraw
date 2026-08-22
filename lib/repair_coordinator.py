"""repair_coordinator — minimal no-op stub.

The auto-fix-pr.yml workflow invokes ``python3 -m repair_coordinator``
(via ``PYTHONPATH=$GITHUB_WORKSPACE/lib``) twice per repair wave: once
on ``repair_started`` and once on ``repair_finished``. The real
coordinator lands in a follow-up PR. Until then this stub lets the
workflow run end-to-end without a ``ModuleNotFoundError`` and exits
zero so the ``set -euo pipefail`` shell blocks succeed.

The CLI flags the workflow passes (``--event``, ``--parent-pr``,
``--current-pr``, ``--attempt``, ``--failure-signature``, ``--run-id``,
``--commit-sha``) are intentionally ignored: argparse is not used,
so Python silently drops any unknown argv.
"""


def main() -> int:
    """Return 0 so the workflow's ``set -euo pipefail`` blocks pass."""
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
