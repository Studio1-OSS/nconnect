# Auto routing benchmark

Does Auto pay for itself? This runs the same twelve coding tasks on three setups and compares cost and pass rate.

- **Agent:** Claude Code, launched through nconnect, headless, allowed to edit files and run Python.
- **Setups:** fast-only (GLM 5.3 Flash), strong-only (Kimi K3), and Auto with the Nebius decider.
- **Grading:** each task has hidden tests the agent never sees. A run passes only if all of them pass.
- **Cost:** what nconnect reports for the session.

## Result (9 October 2026, one run per cell)

| Setup                     | Passed   | Total cost | Total time |
| ------------------------- | -------- | ---------- | ---------- |
| Fast-only (GLM 5.3 Flash) | 11 of 12 | $0.24      | 6 min      |
| Strong-only (Kimi K3)     | 10 of 12 | $3.81      | 12 min     |
| Auto (Nebius decider)     | 11 of 12 | $3.74      | 14 min     |

On these tasks Auto did not pay for itself. The fast model alone passed as many tasks as Auto for about one sixteenth of the cost, and Auto cost about the same as running everything on the strong model.

| Task                                   | Level  | Fast-only        | Strong-only      | Auto             | Auto's agent turns by tier |
| -------------------------------------- | ------ | ---------------- | ---------------- | ---------------- | -------------------------- |
| Rename a function across files         | easy   | pass, $0.012     | pass, $0.142     | pass, $0.009     | fast x5                    |
| Add a CLI flag                         | easy   | pass, $0.007     | pass, $0.140     | pass, $0.007     | fast x4                    |
| Fix a NameError typo                   | easy   | pass, $0.012     | pass, $0.138     | pass, $0.213     | strong x6                  |
| Implement slugify                      | easy   | pass, $0.009     | pass, $0.139     | pass, $0.135     | balanced x5                |
| Implement a TTL + LRU cache            | medium | pass, $0.021     | pass, $0.112     | pass, $0.232     | balanced x6                |
| Parse durations                        | medium | pass, $0.050     | **fail**, $0.149 | **fail**, $0.175 | balanced x6                |
| Add cursor pagination                  | medium | pass, $0.022     | pass, $0.234     | pass, $0.299     | balanced x8                |
| Convert CSV to JSON Lines              | medium | pass, $0.011     | pass, $0.187     | pass, $0.508     | balanced x8, strong x5     |
| Find a rounding bug across three files | hard   | pass, $0.012     | pass, $1.409     | pass, $0.530     | strong x11                 |
| Fix interval merging                   | hard   | pass, $0.022     | pass, $0.338     | pass, $0.262     | strong x6                  |
| Fix a dependency resolver              | hard   | **fail**, $0.027 | pass, $0.706     | pass, $0.389     | fast x1, strong x8         |
| Fix a rate limiter                     | hard   | pass, $0.031     | **fail**, $0.119 | pass, $0.978     | strong x19                 |

## How to read it

- **The tasks are too easy to separate the models.** Each is one to three small files. The fast model failed one of twelve, which is within noise.
- **Pass rates are noisy.** Three of the four failing cells were run a second time: strong-only on the rate limiter passed, Auto on durations passed, and strong-only on durations failed again.
- **Cost is noisy too.** The same task on the same model cost $0.53 in one run and $1.41 in another, because the agent took more turns.
- **The durations task has an unfair hidden test.** It expected a space between a number and its unit ("1 h") to be accepted, which the docstring did not say. Whether that is what failed the two runs was not confirmed. The docstring is now explicit; the results above predate that.
- **The decider sent work up that did not need it.** It rated a one-character typo as hard and a five-line function as moderate. Every task it rated hard was also solved, or nearly, by the fast model.

What this does and does not show: it shows that Auto's routing works as designed and that on small, self-contained tasks the design costs money without buying quality. It does not show how Auto does on large repositories or long sessions, where a fast model is more likely to fail.

## Repository tasks (10 October 2026, stopped early)

A harder suite lives in `repo-tasks/`: eight real fixes from this repository's history. The agent gets the whole codebase as it was just before the fix, without git history, and an issue-style description. It is graded by the tests the real fix shipped with, written into the tree only after the agent stops. All eight fail before their fix and pass with it (`--validate`).

The run was stopped after four completed runs because of cost: the strong model spent about $5 a task here, so three trials of all eight tasks would have cost about $190.

| Task                                                                      | Fast-only            | Strong-only        | Auto               |
| ------------------------------------------------------------------------- | -------------------- | ------------------ | ------------------ |
| Auto reads Claude Code's default effort as a request for the strong model | pass, $0.08, 1 min   | pass, $4.99, 9 min | pass, $3.08, 6 min |
| `nconnect models` reports a bundled fallback as live (two packages)       | pass, $0.09, 1.5 min | not finished       | not run            |

During that run an agent ran a package install inside its work copy, which relinked this checkout's `node_modules` into a temporary directory. The agent is no longer allowed to run a package manager, and the prompts say so; the four results above predate that change.

Four runs settle nothing, but they point the same way as the small suite: the fast model solved both real fixes at about a sixtieth of the strong model's cost. Results are in `repo-results.json`.

```bash
python3 run.py --nconnect ../../../../site/nconnect.js --suite repo --validate
NEBIUS_API_KEY=... python3 run.py --nconnect ../../../../site/nconnect.js --suite repo --configs fast --trials 3 --out repo-results.json
```

`--budget 20` stops the run once the recorded cost passes that many dollars. The fast-only command above costs about $2; adding `strong` or `auto` costs about $5 and $3 per task per trial.

## Run it

```bash
pnpm build:bundle
NEBIUS_API_KEY=... python3 run.py --nconnect ../../../../site/nconnect.js --out results.json
```

Options: `--configs fast,balanced,strong,auto,auto-rules`, `--tasks e1-rename,h3-install-order`, `--trials 3`, `--keep-output`. Runs are one at a time. The full set took about half an hour and $8 of Nebius spend. A run resumes from an existing results file.

## Tasks

Each folder under `tasks/` holds `task.json` (level and prompt), `start/` (what the agent is given), `solution/` (a reference that passes) and `test_hidden.py`. Every starting state fails its tests and every reference solution passes.
