# Changelog

User-visible changes to NConnect, newest first. This changelog starts at
0.14.0; earlier release history remains in Git.

## Unreleased

### Changed

- Renamed the project to NConnect. The CLI is now `nconnect` (the `nclaude`,
  `ncodex`, ... aliases are unchanged), env vars use the `NCONNECT_` prefix and
  local state lives in `~/.nconnect`.
- The model picker now lists new Nebius models newest-first (by models.dev
  release date) right after the curated flagships, instead of alphabetically at
  the end. Capability flags the Nebius API does not publish - whether a model
  calls tools or reasons, its output cap - are filled from
  [models.dev](https://models.dev/providers/nebius). Nebius remains the source
  of truth for which models exist, their context window and vision support.
  Models that cannot call tools are kept out of the picker. models.dev is
  cached for a day and never blocks a launch; `NCONNECT_MODELS_DEV=off`
  disables it.

## 0.16.5 - 2026-10-06

### Fixed

- Claude Code's `/model` menu no longer shows Anthropic's "Fable 5.1".
  Claude Code 2.1.289 added a fourth tier (`ANTHROPIC_DEFAULT_FABLE_MODEL`)
  that NConnect did not fill, so the row advertised a model you were not
  getting - choosing it silently fell back to your session model. The Fable
  tier now maps to a distinct Nebius model (GLM 5.3 with the current catalog).

## Unreleased

### Changed

- Claude Code's background calls now run on a cheap model. In
  `--permission-mode auto`, Claude Code judges every shell command with a
  safety-classifier call that carries the session transcript and goes to the
  Sonnet tier - Kimi K3, the most expensive model in the menu - whatever
  model the session uses. That classifier and the session-title call now go to
  `NCONNECT_BACKGROUND_MODEL` (default: GLM 5.3 Flash, keeping its reasoning
  floor so verdicts stay clean). In a measured auto-mode session this cut the
  cost about 3x. `NCONNECT_BACKGROUND_MODEL=off` restores the old behaviour.

## 0.16.4 - 2026-10-04

### Fixed

- Stale command links from older installs no longer shadow the new commands.
  The installer used to skip an existing `nclaude` (etc.) it did not create,
  so a link into an old `~/.nebiuslink/bin` or `~/.nebiusrelay/bin` ahead on
  PATH kept running an old bundle forever. The installer now replaces links
  and wrappers left by any previous generation of this tool, and the
  migration repoints such PATH links on start for auto-update users who
  never re-run the installer.

## 0.16.3 - 2026-10-04

### Fixed

- The nebiusrelay → NConnect migration finishes its install step on a later
  run too. If something else (a dev build, a fresh `nconnect` alongside) had
  already marked the migration done, an updated legacy install kept running
  from `~/.nebiusrelay/bin` with its old wrappers and never updated again.
  The bundle install and wrapper rewrite are now checked on every start.

## 0.16.2 - 2026-10-04

### Fixed

- Existing `nebiusrelay` installs now migrate to NConnect automatically. The
  first run after the rebrand carries `~/.nebiusrelay` (API keys, preferences,
  usage history, harness state) over to `~/.nconnect`, installs the bundle at
  its new location, rewrites the old `nebiusrelay`/`n*` wrappers to run it,
  stops the old daemon and removes the old login service. Before this, an
  updated install lost its configuration and stopped updating.
- `NEBIUSRELAY_*` environment variables keep working as their `NCONNECT_*`
  equivalents when the new name is unset.
- `nebius-tf-relay.vercel.app` redirects to `nconnect.sh`, and the old bundle
  URL `/nebiusrelay.js` serves the current bundle again.

## 0.16.1 - 2026-09-23

### Fixed

- `nunreal` in a terminal now prints readable output - the assistant's replies
  and the tools it calls - instead of the runner's raw JSON event log. Piped
  output is unchanged, so scripts still get the JSONL.
- `nunreal -- -workspace <dir>` with no task asks for one instead of waiting
  silently on stdin; only `-p` or a positional JSON request counts as a task.

## 0.16.0 - 2026-09-23

### Added

- Unreal Agent (`nconnect unreal`, alias `nunreal`): Unreal Labs' async-first
  harness. Its runner speaks only the OpenAI Responses API, so it is proxied
  through the daemon like Codex and gets the same cost metering, retries and
  model fallback. Configured entirely through env vars for the run; the Nebius
  key stays inside the daemon.
  A bare `nunreal` (or picking it from the launcher menu) asks for the task
  instead of waiting silently on stdin.

## 0.15.4 - 2026-09-11

### Added

- GLM 5.3 (`zai-org/GLM-5.3`) and DeepSeek V4 Pro 0813
  (`deepseek-ai/DeepSeek-V4-Pro-0813`) in the shared model catalog, with Claude
  aliases and offline fallback metadata verified against Nebius's verbose API.
  Live pricing and context limits take precedence when available. The default
  remains GLM 5.3 Flash.
- Updated landing-page and documentation model lists, model-selection examples,
  and the LLM-readable guide's default-model and Codex flag guidance.

## 0.15.3 - 2026-09-07

### Fixed

- `nconnect configure` no longer crashes on untouched or navigation-key
  password input (#3). The Clack patch initializes password state, guards empty
  rendering, and keeps Bun readline input masked instead of echoing secrets.
- `ncodex --model` and `-m` honor the requested model. Invalid explicit model
  names fail clearly rather than silently selecting a remembered/default model.
- Codex image-file arguments and literal prompt separators are preserved, and
  both string and nested image URLs survive Responses-to-chat translation.
  Image input still requires a vision-capable model and native harness support.
- The installer works with POSIX shells without `pipefail`, including dash.

### Added

- Regression coverage for configure/password input, Codex model and image
  arguments, request image translation, and repeat installs of all eight wrappers.
- Documentation for Codex vision-model selection and image-file attachments.

## 0.15.2 - 2026-09-01

### Fixed

- Long contexts recover instead of failing. 0.15.1 taught the retry to read
  Nebius's error, but it still could not land: the "input tokens" figure in that
  error is not measured, it is back-computed from the `max_tokens` you sent.
  Every observed case satisfied `reported_input = ceiling + 1 - requested_output`
  exactly, so as the retry clamped output the reported input grew to match and
  the request looked like a near-miss forever. The relay now prefers its own
  measurement of the payload whenever that is larger, and widens its safety
  margin on each attempt so the ladder converges rather than re-trying the same
  near-miss until it gives up.
- A second Nebius phrasing is understood: `your prompt contains at least N input
tokens`, plus the machine-readable `(parameter=input_tokens, value=N)` tail.

## 0.15.1 - 2026-08-31

### Fixed

- Context overflow now recovers instead of failing the turn. Nebius phrases its
  error with "of" and "from the input messages"; the parser recognised neither
  wording, so the reactive context-fit retry could not read the ceiling and gave
  up. Any turn that exceeded the window
  returned a hard 500 where the proxy should have clamped `max_tokens` and
  retried silently. All four known phrasings (Nebius, vLLM, Kimi/Moonshot
  parenthetical, and `request resolved to`) are now pinned by tests.
- `ndeepseek --model X` is honored again. dsh persists the model last picked in
  its web UI to `$DSH_HOME/settings.yaml`, and that setting outranks the config
  the relay generates - so the model you asked for was silently ignored while
  the banner still announced it. Measured: a run launched as GLM 5.3 Flash
  billed at DeepSeek V4 Pro's rate. The relay now runs against a throwaway
  `DSH_HOME` with only that override removed; your real `~/.dsh` is untouched.

### Added

- `ndeepseek --profile <name>`, so `--profile headless "task"` answers one task
  and exits. Previously the relay always booted dsh's web UI, which cannot be
  scripted.

## 0.15.0 - 2026-08-29

### Changed

- **GLM 5.3 Flash is the new default model** (Z.ai, via Nebius Token Factory):
  1M context at $0.15/$0.50 per M, against Kimi K3's $3.00/$15.00. On a measured
  Codex turn, $0.0129 versus $0.1200. Kimi K3 remains one `--model` away.
  Existing installs keep whatever model they last used; the new default applies
  to fresh ones.

### Fixed

- GLM 5.3 Flash leaked its chain-of-thought into replies. At
  `reasoning_effort: "none"` - the relay's default, chosen for speed - the model
  still reasons but does not route it to `reasoning_content`, emitting the whole
  chain into `content` ending in a stray `</think>`. Effort is now floored per
  model; `low` is both clean and cheaper here (11 reasoning tokens versus 27).

## 0.14.3 - 2026-08-27

### Added

- `nconnect chatgpt off` (also `codex off`, `restore`, or bare
  `nconnect off`) disables the relay-managed `~/.codex/config.toml` and
  restores your previous profile. The managed config is shared by ChatGPT
  Desktop and the Codex CLI, so disabling from either fixes both. `--restore`
  still works.
- `NCONNECT_REASONING_HISTORY=off|interleaved|full` controls how much of
  previous turns' reasoning is replayed. On a long session that is a large and
  growing share of input tokens. Default stays `full`, so upgrading changes
  nothing.

### Fixed

- Harnesses that write no persistent config now refuse `off`/`restore` with a
  clear error. Previously the verb was forwarded to the harness as a prompt -
  `nconnect codex off` launched Codex with "off" as the task.
- Disabling when nothing is managed is a friendly no-op rather than a
  missing-backup error.

## 0.14.2 - 2026-08-27

### Fixed

- `nconnect usage` counts sessions that are still running. It required an end
  timestamp, and ChatGPT Desktop registers without a pid so it never ends while
  the app is open - its spend was permanently invisible.
- Session cost survives a daemon restart. Proxied sessions only persisted cost
  at exit, so a restart lost whatever was in flight. Cost is now flushed after
  each response and for every live session on shutdown.
- A dead-pid session is closed out with its recorded spend instead of `$0.0000`,
  which used to overwrite real totals rather than merely fail to save them.
- Spawned harnesses are attributed to their model in `usage`. Model ids were
  persisted only for proxied sessions, so every Pi/Prime/Hermes/DeepSeek/Grok
  session was filed under "unknown".

## 0.14.1 - 2026-08-18

### Fixed

- The interactive launcher lists all eight harnesses. It enumerated five by
  hand, so Hermes, DeepSeek and Grok shipped with wrappers and docs but never
  appeared in the menu. It now derives from the harness registry.

## 0.14.0 - 2026-08-17

### Added

- **Cost metering for the spawned harnesses** (`NCONNECT_METER=1`, opt-in).
  Pi, Prime, Hermes, DeepSeek and Grok hold the API key and call Nebius
  directly, so none of the proxied path reached them: no per-turn cost, no model
  fallback, no circuit breaker, no retries. They can now route through the
  daemon, which also keeps the real Nebius key out of the harness - it only ever
  sees a local session token. If the daemon is unreachable the launcher says so
  and connects directly.
- Codex durable memory (`/v1/memories/trace_summarize`). The endpoint used to
  404, so Codex retained nothing between sessions.
- `NCONNECT_CACHE_READ_RATIO` to price cached input tokens.

### Changed

- Cached input tokens are billed at the full input rate rather than zero.
  **Reported costs will rise** - the spend is unchanged, the accounting was
  wrong. Nebius serves cached prompts but publishes no cached price, so zero was
  an under-report; on a long agentic session most input tokens are cache hits.

### Fixed

- Ctrl-C now prints the session cost and releases the session. Several harnesses
  have no other way to exit, so a run ended with no cost line and the session
  sat registered until the daemon reaped it - the tokens looked free.
