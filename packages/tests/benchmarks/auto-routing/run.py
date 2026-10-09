#!/usr/bin/env python3
"""Run the Auto routing benchmark: the same coding tasks on several model setups.

Each task is a small project (tasks/<name>/start) and a prompt. The agent, Claude
Code launched through nconnect, works in a copy of the project. When it is done
the task's hidden tests (test_hidden.py, never shown to the agent) are copied in
and run. A run passes only if every hidden test passes.

    NEBIUS_API_KEY=... python3 run.py --nconnect ../../../../site/nconnect.js --out results.json

Runs are strictly one at a time. Cost is what nconnect reports for the session.
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent

CONFIGS = {
    "fast": {"model": "zai-org/GLM-5.3-Flash", "env": {}},
    "balanced": {"model": "zai-org/GLM-5.3", "env": {}},
    "strong": {"model": "moonshotai/Kimi-K3", "env": {}},
    "auto": {"model": "auto", "env": {"NCONNECT_AUTO_DECIDER": "nebius"}},
    "auto-rules": {"model": "auto", "env": {}},
}

# The agent may edit files and run Python; nothing else is pre-approved.
ALLOWED_TOOLS = "Read,Edit,Write,Glob,Grep,Bash(python3:*),Bash(python:*),Bash(ls:*),Bash(cat:*)"

TOTAL = re.compile(
    r"\[nconnect cost\] session total: \$([0-9.]+) \(([\d,]+) in(?: incl ([\d,]+) cached)?, ([\d,]+) out\)"
)
BY_MODEL = re.compile(r"\[nconnect cost\] by model: (.+)")
ROUTE = re.compile(r'auto route: (\{[^}]*\})')


def run_one(task, config, args, scratch, base_env):
    spec = json.loads((task / "task.json").read_text())
    work = Path(tempfile.mkdtemp(prefix=f"{task.name}-", dir=scratch))
    shutil.copytree(task / "start", work, dirs_exist_ok=True)
    env = {**base_env, **CONFIGS[config]["env"]}
    log = Path(env["NCONNECT_DEBUG_LOG"])
    offset = log.stat().st_size if log.exists() else 0
    command = [
        "bun", str(args.nconnect), "--model", CONFIGS[config]["model"], "claude",
        "-p", spec["prompt"], "--permission-mode", "acceptEdits", "--allowedTools", ALLOWED_TOOLS,
    ]
    started = time.time()
    timed_out = False
    try:
        done = subprocess.run(command, cwd=work, env=env, stdin=subprocess.DEVNULL,
                              capture_output=True, text=True, timeout=args.timeout)
        output = done.stdout + "\n" + done.stderr
    except subprocess.TimeoutExpired as error:
        timed_out = True
        output = "".join(part.decode(errors="replace") if isinstance(part, bytes) else (part or "")
                         for part in (error.stdout, error.stderr))
    seconds = round(time.time() - started, 1)
    if args.keep_output:
        (args.out.parent / f"{task.name}.{config}.log").write_text(output)

    shutil.copy(task / "test_hidden.py", work / "test_hidden.py")
    try:
        test = subprocess.run([sys.executable, "-m", "unittest", "-q", "test_hidden"], cwd=work,
                              capture_output=True, text=True, timeout=120)
        passed, verdict = test.returncode == 0, test.stderr.strip().splitlines()[-1:]
    except subprocess.TimeoutExpired:
        passed, verdict = False, ["hidden tests timed out"]

    total = TOTAL.search(output)
    by_model = BY_MODEL.search(output)
    routes = {}
    if log.exists():
        with log.open() as handle:
            handle.seek(offset)
            for found in ROUTE.findall(handle.read()):
                try:
                    route = json.loads(found)
                except ValueError:
                    continue
                key = f'{route.get("tier")}:{route.get("reason")}:{route.get("model")}'
                routes[key] = routes.get(key, 0) + 1
    shutil.rmtree(work, ignore_errors=True)
    return {
        "task": task.name, "level": spec["level"], "config": config, "passed": passed,
        "verdict": verdict[0] if verdict else "", "seconds": seconds, "timed_out": timed_out,
        "cost_usd": float(total.group(1)) if total else None,
        "input_tokens": int(total.group(2).replace(",", "")) if total else None,
        "cached_tokens": int((total.group(3) or "0").replace(",", "")) if total else None,
        "output_tokens": int(total.group(4).replace(",", "")) if total else None,
        "by_model": by_model.group(1) if by_model else None,
        "routes": routes,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--nconnect", type=Path, required=True, help="path to the built nconnect.js")
    parser.add_argument("--out", type=Path, default=HERE / "results.json")
    parser.add_argument("--configs", default="fast,strong,auto")
    parser.add_argument("--tasks", default="", help="comma-separated task names; default all")
    parser.add_argument("--trials", type=int, default=1)
    parser.add_argument("--timeout", type=int, default=600, help="seconds per run")
    parser.add_argument("--port", default="7899")
    parser.add_argument("--keep-output", action="store_true", help="save each run's agent output beside --out")
    args = parser.parse_args()
    args.nconnect = args.nconnect.resolve()
    if not os.environ.get("NEBIUS_API_KEY"):
        sys.exit("NEBIUS_API_KEY is not set")

    scratch = Path(tempfile.mkdtemp(prefix="auto-bench-"))
    base_env = {
        **{k: v for k, v in os.environ.items() if not k.startswith(("NCONNECT_", "CLAUDE"))},
        "NCONNECT_HOME": str(scratch / "nconnect"), "NEBIUSRELAY_HOME": str(scratch / "none"),
        "NCONNECT_PORT": args.port, "NCONNECT_DISABLE_AUTOUPDATE": "1", "NCONNECT_DEBUG": "1",
        "NCONNECT_DEBUG_LOG": str(scratch / "debug.log"), "CLAUDE_CONFIG_DIR": str(scratch / "claude"),
    }
    wanted = [name for name in args.tasks.split(",") if name]
    tasks = sorted(p for p in (HERE / "tasks").iterdir() if p.is_dir() and (not wanted or p.name in wanted))
    results = json.loads(args.out.read_text()) if args.out.exists() else []
    done = {(r["task"], r["config"], r.get("trial", 1)) for r in results}
    try:
        for trial in range(1, args.trials + 1):
            for task in tasks:
                for config in args.configs.split(","):
                    if (task.name, config, trial) in done:
                        continue
                    result = {**run_one(task, config, args, scratch, base_env), "trial": trial}
                    results.append(result)
                    args.out.write_text(json.dumps(results, indent=2) + "\n")
                    cost = "?" if result["cost_usd"] is None else f'${result["cost_usd"]:.4f}'
                    print(f'{task.name:20} {config:10} {"PASS" if result["passed"] else "FAIL"} '
                          f'{cost:>9} {result["seconds"]:>6}s {result["routes"] or ""}', flush=True)
    finally:
        # Stop the daemon this run started, by its port only, and remove the scratch space.
        listener = subprocess.run(["lsof", f"-tiTCP:{args.port}", "-sTCP:LISTEN"], capture_output=True, text=True)
        for pid in listener.stdout.split():
            subprocess.run(["kill", pid])
        shutil.rmtree(scratch, ignore_errors=True)


if __name__ == "__main__":
    main()
