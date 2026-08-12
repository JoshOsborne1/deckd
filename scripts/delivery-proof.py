#!/usr/bin/env python3
"""delivery-proof.py — deterministic, fail-closed delivery proof for bounded code changes.

Read-only verifier (except its external output directory). Validates a
repository-owned WORKFLOW.md contract, confirms exact Git revisions, runs the
declared commands, and writes one bounded JSON evidence record plus full
stdout/stderr logs outside the repository.

Python 3.13 standard library only. No network, no shell execution, no sqlite3.

Usage:
    python scripts/delivery-proof.py \
      --repo <absolute-repo> \
      --workflow <absolute-WORKFLOW.md> \
      --base-sha <40-hex> \
      --candidate-sha <40-hex> \
      --task-id <Hermes-task-id> \
      --output-dir <absolute-directory-outside-repo>
"""

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

SCHEMA_VERSION = 1
ALLOWED_TOP_LEVEL_KEYS = {
    "schema_version",
    "goal",
    "allowed_paths",
    "commands",
    "reviewer_profile",
    "production_requires_approval",
}
ALLOWED_COMMAND_KEYS = {"argv", "timeout_seconds"}
FENCE_RE = re.compile(r"^```delivery-json\s*$", re.MULTILINE)
FENCE_END_RE = re.compile(r"^```\s*$", re.MULTILINE)
SUMMARY_CAP_BYTES = 4096
MAX_COMMAND_TIMEOUT = 1800


def normalize_git_path(path: str) -> str:
    """Normalize a git-reported path to forward-slash POSIX form.

    Some Windows Git configs report backslash paths from diff --name-only.
    """
    return path.replace("\\", "/")


def run_git(repo: Path, *args, timeout: int = 60) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", "-C", str(repo), *args],
        capture_output=True,
        text=True,
        timeout=timeout,
    )


def resolve_sha(repo: Path, sha: str) -> str | None:
    """Return the full 40-hex SHA if sha resolves to exactly one commit."""
    proc = run_git(repo, "rev-parse", "--verify", "--quiet", f"{sha}^{{commit}}")
    if proc.returncode != 0:
        return None
    full = proc.stdout.strip()
    if not re.fullmatch(r"[0-9a-f]{40}", full):
        return None
    return full


def is_ancestor(repo: Path, ancestor: str, descendant: str) -> bool:
    proc = run_git(repo, "merge-base", "--is-ancestor", ancestor, descendant)
    return proc.returncode == 0


def head_sha(repo: Path) -> str | None:
    proc = run_git(repo, "rev-parse", "HEAD")
    if proc.returncode != 0:
        return None
    return proc.stdout.strip()


def worktree_clean(repo: Path) -> bool:
    proc = run_git(repo, "status", "--porcelain")
    return proc.returncode == 0 and proc.stdout.strip() == ""


def changed_files(repo: Path, base: str, candidate: str) -> list[str]:
    proc = run_git(repo, "diff", "--name-only", f"{base}..{candidate}")
    if proc.returncode != 0:
        raise RuntimeError(f"git diff --name-only failed: {proc.stderr.strip()}")
    return [normalize_git_path(p) for p in proc.stdout.splitlines() if p.strip()]


def diff_binary(repo: Path, base: str, candidate: str) -> bytes:
    proc = run_git(repo, "diff", "--binary", f"{base}..{candidate}")
    if proc.returncode != 0:
        raise RuntimeError(f"git diff --binary failed: {proc.stderr.strip()}")
    return proc.stdout.encode("utf-8", errors="replace")


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def parse_workflow(workflow_path: Path) -> dict:
    """Parse and validate the single delivery-json fence. Fail-closed."""
    text = workflow_path.read_text(encoding="utf-8")
    starts = [m.start() for m in FENCE_RE.finditer(text)]
    if len(starts) != 1:
        raise ValueError(
            f"workflow must contain exactly one delivery-json fence, found {len(starts)}"
        )
    start = starts[0]
    end_match = FENCE_END_RE.search(text, start + len("```delivery-json"))
    if end_match is None:
        raise ValueError("delivery-json fence is not closed")
    raw = text[start + len("```delivery-json") : end_match.start()]
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"delivery-json fence is not valid JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError("delivery-json must be a JSON object")

    unknown = set(data) - ALLOWED_TOP_LEVEL_KEYS
    if unknown:
        raise ValueError(f"unknown top-level keys: {sorted(unknown)}")
    if data.get("schema_version") != SCHEMA_VERSION:
        raise ValueError(
            f"schema_version must be integer {SCHEMA_VERSION}, got {data.get('schema_version')!r}"
        )
    goal = data.get("goal")
    if not isinstance(goal, str) or not goal.strip():
        raise ValueError("goal must be a non-empty string")

    allowed = data.get("allowed_paths")
    if not isinstance(allowed, list) or not allowed:
        raise ValueError("allowed_paths must be a non-empty list")
    for pattern in allowed:
        if not isinstance(pattern, str) or not pattern:
            raise ValueError("every allowed_paths entry must be a non-empty string")
        if ":" in pattern and re.match(r"^[A-Za-z]:", pattern):
            raise ValueError(f"absolute drive path not allowed: {pattern!r}")
        if pattern.startswith("/") or "\\" in pattern:
            raise ValueError(f"absolute or backslash path not allowed: {pattern!r}")
        if ".." in pattern.split("/"):
            raise ValueError(f"'..' segment not allowed: {pattern!r}")
        if "\x00" in pattern:
            raise ValueError("NUL byte not allowed in allowed_paths")

    commands = data.get("commands")
    if not isinstance(commands, list) or not commands:
        raise ValueError("commands must be a non-empty list")
    parsed_commands = []
    for cmd in commands:
        if not isinstance(cmd, dict):
            raise ValueError("every command must be an object")
        unknown_cmd = set(cmd) - ALLOWED_COMMAND_KEYS
        if unknown_cmd:
            raise ValueError(f"unknown command keys: {sorted(unknown_cmd)}")
        argv = cmd.get("argv")
        if not isinstance(argv, list) or not argv:
            raise ValueError("command argv must be a non-empty list")
        if not all(isinstance(item, str) and item for item in argv):
            raise ValueError("every argv item must be a non-empty string")
        timeout = cmd.get("timeout_seconds")
        if not isinstance(timeout, int) or isinstance(timeout, bool):
            raise ValueError("timeout_seconds must be an integer")
        if not 1 <= timeout <= MAX_COMMAND_TIMEOUT:
            raise ValueError(
                f"timeout_seconds must be 1..{MAX_COMMAND_TIMEOUT}, got {timeout}"
            )
        parsed_commands.append({"argv": list(argv), "timeout_seconds": timeout})

    reviewer = data.get("reviewer_profile")
    if not isinstance(reviewer, str) or not reviewer.strip():
        raise ValueError("reviewer_profile is required")
    if data.get("production_requires_approval") is not True:
        raise ValueError("production_requires_approval must be literal true")

    return {
        "goal": goal.strip(),
        "allowed_paths": list(allowed),
        "commands": parsed_commands,
        "reviewer_profile": reviewer.strip(),
        "production_requires_approval": True,
    }


def path_matches(pattern: str, path: str) -> bool:
    """Match a repository-relative POSIX path against a simple glob pattern."""
    import fnmatch

    return fnmatch.fnmatchcase(path, pattern)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def main() -> int:
    parser = argparse.ArgumentParser(description="Deterministic delivery proof")
    parser.add_argument("--repo", required=True)
    parser.add_argument("--workflow", required=True)
    parser.add_argument("--base-sha", required=True)
    parser.add_argument("--candidate-sha", required=True)
    parser.add_argument("--task-id", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()

    started_at = utc_now()
    failure_reasons: list[str] = []
    record: dict = {
        "schema_version": SCHEMA_VERSION,
        "operation_id": None,
        "task_id": args.task_id,
        "repo": None,
        "workflow_digest": None,
        "command_digest": None,
        "diff_digest": None,
        "base_sha": None,
        "candidate_sha": None,
        "head_before": None,
        "head_after": None,
        "clean_before": None,
        "clean_after": None,
        "changed_files": [],
        "commands": [],
        "verdict": "FAIL",
        "failure_reasons": [],
        "started_at": started_at,
        "ended_at": None,
    }

    def fail(reason: str) -> None:
        failure_reasons.append(reason)

    try:
        repo = Path(args.repo).resolve()
        workflow = Path(args.workflow).resolve()
        output_dir = Path(args.output_dir).resolve()

        if not repo.is_dir():
            fail(f"repo is not a directory: {repo}")
        if not workflow.is_file():
            fail(f"workflow is not a file: {workflow}")
        if not str(workflow).startswith(str(repo)):
            fail("workflow must be inside the repository")
        if str(output_dir).startswith(str(repo) + os.sep) or output_dir == repo:
            fail("output directory must be outside the repository")

        output_dir.mkdir(parents=True, exist_ok=True)
        record["repo"] = str(repo)

        # 1. Parse and validate the workflow contract.
        try:
            workflow_data = parse_workflow(workflow)
        except ValueError as exc:
            fail(f"workflow validation: {exc}")
            workflow_data = None

        if workflow_data is not None:
            record["workflow_digest"] = "sha256:" + sha256_hex(
                workflow.read_bytes()
            )
            record["command_digest"] = "sha256:" + sha256_hex(
                json.dumps(
                    workflow_data["commands"],
                    sort_keys=True,
                    separators=(",", ":"),
                ).encode("utf-8")
            )

        # 2. Resolve exact revisions.
        base = resolve_sha(repo, args.base_sha)
        candidate = resolve_sha(repo, args.candidate_sha)
        if base is None:
            fail(f"base_sha does not resolve to exactly one commit: {args.base_sha}")
        if candidate is None:
            fail(
                f"candidate_sha does not resolve to exactly one commit: {args.candidate_sha}"
            )
        if base and candidate:
            record["base_sha"] = base
            record["candidate_sha"] = candidate
            if not is_ancestor(repo, base, candidate):
                fail("base_sha is not an ancestor of candidate_sha")

        # 3. Candidate must equal HEAD and worktree must be clean before checks.
        head_before = head_sha(repo)
        record["head_before"] = head_before
        if head_before is None:
            fail("could not resolve HEAD")
        elif candidate is not None and head_before != candidate:
            fail("candidate_sha does not equal HEAD")
        clean_before = worktree_clean(repo)
        record["clean_before"] = clean_before
        if not clean_before:
            fail("worktree is dirty before checks")

        # 4. Changed files must stay inside allowed_paths.
        if base and candidate and workflow_data is not None:
            try:
                changed = changed_files(repo, base, candidate)
            except RuntimeError as exc:
                fail(str(exc))
                changed = []
            record["changed_files"] = changed
            for path in changed:
                if not any(path_matches(p, path) for p in workflow_data["allowed_paths"]):
                    fail(f"changed path outside allowed_paths: {path}")

        # 5. Execute each command with shell=False in the repository CWD.
        if workflow_data is not None:
            for cmd in workflow_data["commands"]:
                argv = cmd["argv"]
                record["commands"].append(argv)
                try:
                    proc = subprocess.run(
                        argv,
                        cwd=str(repo),
                        capture_output=True,
                        text=True,
                        timeout=cmd["timeout_seconds"],
                        shell=False,
                    )
                except subprocess.TimeoutExpired:
                    fail(
                        f"command timed out after {cmd['timeout_seconds']}s: {argv}"
                    )
                    continue
                except OSError as exc:
                    fail(f"command could not start {argv}: {exc}")
                    continue
                if proc.returncode != 0:
                    fail(f"command exited {proc.returncode}: {argv}")
                # Save full logs outside the repo regardless of outcome.
                safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", argv[0])
                log_stem = output_dir / f"{safe_name}-{len(record['commands'])}"
                (output_dir / f"{log_stem.name}.stdout.log").write_text(
                    proc.stdout, encoding="utf-8", errors="replace"
                )
                (output_dir / f"{log_stem.name}.stderr.log").write_text(
                    proc.stderr, encoding="utf-8", errors="replace"
                )

        # 6. Recheck candidate == HEAD and clean worktree after commands.
        head_after = head_sha(repo)
        record["head_after"] = head_after
        if head_after is None:
            fail("could not resolve HEAD after commands")
        elif candidate is not None and head_after != candidate:
            fail("HEAD moved during commands")
        clean_after = worktree_clean(repo)
        record["clean_after"] = clean_after
        if not clean_after:
            fail("worktree is dirty after commands")

        # 7. Diff digest for the exact revision range.
        if base and candidate:
            record["diff_digest"] = "sha256:" + sha256_hex(
                diff_binary(repo, base, candidate)
            )

        # 8. Stable operation ID from task, workflow, base and candidate.
        op_payload = json.dumps(
            {
                "task_id": args.task_id,
                "workflow_digest": record["workflow_digest"],
                "base_sha": record["base_sha"],
                "candidate_sha": record["candidate_sha"],
            },
            sort_keys=True,
            separators=(",", ":"),
        )
        record["operation_id"] = sha256_hex(op_payload.encode("utf-8"))

        record["verdict"] = "PASS" if not failure_reasons else "FAIL"
        record["failure_reasons"] = failure_reasons
        record["ended_at"] = utc_now()

        output_dir.mkdir(parents=True, exist_ok=True)
        record_path = output_dir / f"{record['operation_id']}.json"
        summary = json.dumps(record, indent=2, sort_keys=True)
        if len(summary.encode("utf-8")) > SUMMARY_CAP_BYTES:
            # Keep the record bounded: drop verbose fields, keep reasons.
            slim = dict(record)
            slim["changed_files"] = record["changed_files"][:50]
            slim["commands"] = record["commands"][:10]
            summary = json.dumps(slim, indent=2, sort_keys=True)
        record_path.write_text(summary, encoding="utf-8")

        if record["verdict"] == "PASS":
            print(f"PASS {record['operation_id']}")
            return 0
        print(f"FAIL {record['operation_id']}")
        for reason in failure_reasons:
            print(f"  - {reason}")
        return 1
    except Exception as exc:  # fail-closed on any unexpected error
        record["failure_reasons"] = failure_reasons or [f"unexpected error: {exc}"]
        record["ended_at"] = utc_now()
        try:
            output_dir.mkdir(parents=True, exist_ok=True)
            record_path = output_dir / f"error-{int(time.time())}.json"
            record_path.write_text(
                json.dumps(record, indent=2, sort_keys=True), encoding="utf-8"
            )
        except OSError:
            pass
        print(f"FAIL unexpected error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
