<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="site/public/nconnect-white.svg" />
  <source media="(prefers-color-scheme: light)" srcset="site/public/nconnect-black.svg" />
  <img src="site/public/nconnect-black.svg" alt="NConnect" width="360" />
</picture>

<br />
<br />

**Run the coding agents you already use on open models from [Nebius Token Factory](https://tokenfactory.nebius.com/).**

One install. Claude Code, Codex, OpenCode and more, served by Kimi, GLM, Qwen, DeepSeek and MiniMax.

[![License: MIT](https://img.shields.io/badge/license-MIT-3fb97f.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.16.1-3fb97f.svg)](CHANGELOG.md)
[![Powered by Nebius Token Factory](https://img.shields.io/badge/powered%20by-Nebius%20Token%20Factory-111111.svg)](https://tokenfactory.nebius.com/)

[Install](#install) · [Usage](#usage) · [Models](#models) · [Docs](https://nconnect.sh/docs) · [Video tutorial](https://www.youtube.com/watch?v=u8c_exTe2To) · [Changelog](CHANGELOG.md)

</div>

---

## Quick start

```bash
curl -fsSL https://nconnect.sh/install.sh | sh
nconnect claude      # Claude Code on Nebius models (alias: nclaude)
```

That's it. Your agent install is untouched: NConnect injects a base URL and API key per session and writes nothing permanent to your agent's config.

## Supported agents

| Agent                | Command             | Alias       | How it connects |
| -------------------- | ------------------- | ----------- | --------------- |
| **Claude Code**      | `nconnect claude`   | `nclaude`   | Proxied         |
| **Codex**            | `nconnect codex`    | `ncodex`    | Proxied         |
| **Unreal Agent**     | `nconnect unreal`   | `nunreal`   | Proxied         |
| **OpenCode**         | `nconnect opencode` | `nopencode` | Direct          |
| **Pi**               | `nconnect pi`       | `npi`       | Direct          |
| **Prime Agent**      | `nconnect prime`    | `nprime`    | Direct          |
| **Hermes**           | `nconnect hermes`   | `nhermes`   | Direct          |
| **DeepSeek Harness** | `nconnect deepseek` | `ndeepseek` | Direct (alpha)  |
| **Grok Build**       | `nconnect grok`     | `ngrok`     | Direct          |

## Why NConnect

Nebius Token Factory serves open models over an OpenAI-compatible API. It does **not** speak the Anthropic Messages API (Claude Code) or the OpenAI Responses API (Codex and Unreal Agent). NConnect closes that gap.

- **Protocol translation.** A small local daemon translates each request and response to Nebius `/chat/completions` on the fly, so your agent believes it is talking to its native backend.
- **Cost metering.** Every turn is priced. See local spend by model and tool with `nconnect usage`; nothing is uploaded.
- **Resilience.** Transient failures are retried, and a down or overloaded model fails over to a fallback model.
- **Context fitting.** Requests are trimmed to fit each model's context window.
- **Native web search emulation.** `web_search` is backed by [Tavily](https://tavily.com), with citations.
- **Vision routing.** Image blocks are auto-routed to a vision-capable model.
- **Keys stay local.** Your keys live in `~/.nconnect/` and never leave your machine.

**Proxied** harnesses (Claude Code, Codex, Unreal Agent) go through the daemon. **Direct** harnesses already speak Nebius's OpenAI-compatible format, so they launch with a generated provider config and no proxy.

## Install

The one-liner installs the `nconnect` command and the short aliases above to `~/.nconnect/bin/`, and installs [Bun](https://bun.sh) if it isn't already present:

```bash
curl -fsSL https://nconnect.sh/install.sh | sh
```

Then configure (the first run also walks you through this):

```bash
nconnect configure
```

| Key                | Where to get it                                          | Required?                     |
| ------------------ | -------------------------------------------------------- | ----------------------------- |
| **Nebius API key** | <https://tokenfactory.nebius.com/?modals=create-api-key> | Yes                           |
| **Tavily API key** | <https://app.tavily.com>                                 | Optional (enables web search) |

You can also set `NEBIUS_API_KEY` / `TAVILY_API_KEY` in the environment instead.

> NConnect never installs agents for you. If the underlying agent CLI (Claude Code, Codex, etc.) is missing, it prints the official install command and exits.

## Usage

Pick an agent interactively:

```bash
nconnect
```

Or launch one directly. Extra arguments pass straight through to the agent:

```bash
nclaude -p "explain this repo"
ncodex exec "add a test for the parser"
nconnect hermes desktop       # Hermes desktop app
nconnect chatgpt              # alpha: ChatGPT Desktop session with restore (alias: codex-app)
```

### Other commands

```bash
nconnect models            # live lineup: model ids, context, prices, Claude tiers
nconnect usage --last 7d   # local spend by model and tool (never uploaded)
nconnect update            # update to the latest release now
nconnect daemon install    # start the daemon at login (macOS launchd / Linux systemd)
nconnect daemon status     # show auto-start status
nconnect daemon uninstall  # stop starting it at login
```

<details>
<summary><b>Unreal Agent setup</b></summary>

<br />

Unreal Agent's runner only speaks the OpenAI Responses API, which Nebius does not serve, so `nunreal` is proxied like Codex. Install the runner with `go install github.com/unreallabsai/unreal-agent/cmd/unreal-agent-runner@latest` (Go 1.27+) or grab a prebuilt binary from its [releases page](https://github.com/unreallabsai/unreal-agent/releases).

Put `--model <id>` before the runner's own flags to pick the Nebius model; everything else (`-p`, `-workspace`, a JSON request) passes straight through.

</details>

## Models

The catalog is **fetched live** from Nebius (`GET /v1/models?verbose=true`) at startup, so every model Nebius serves is available, and vision support comes from the API's modality field rather than a hand-maintained list. Results are cached in `~/.nconnect/` and fall back to a bundled snapshot when offline.

The default coding model is **GLM 5.3 Flash** (Z.ai): a 1M-context hybrid reasoner at $0.15 / $0.50 per M tokens, roughly 20x cheaper on input than the previous Kimi K3 default. Switch inside your agent or with `--model`.

### Auto: a model per task

`nconnect --model auto <harness>` lets NConnect pick the model for each task instead of using one model for everything. It works with every harness: Claude Code, Codex, ChatGPT Desktop, Claude Desktop, OpenCode, Pi, Prime, Hermes, DeepSeek Harness, Grok Build and Unreal Agent.

```bash
nconnect --model auto claude
nconnect --model auto codex
nconnect --model auto opencode
```

Auto chooses between three tiers:

| Tier     | Model         | Input price per M tokens | Used for                       |
| -------- | ------------- | ------------------------ | ------------------------------ |
| Fast     | GLM 5.3 Flash | $0.15                    | Routine work                   |
| Balanced | GLM 5.3       | $1.40                    | Work that takes some thought   |
| Strong   | Kimi K3       | $3.00                    | Work that is hard to get right |

A task is everything since your last prompt, so the tool calls that follow a prompt stay on the tier that prompt earned. Claude Code, Codex and Unreal remember Auto, so later launches stay on it until you pass another `--model`.

How a task gets its tier:

- **You asked outright.** Plan mode in Claude Code, an effort level above the default (max in Claude Code, high in Codex), or asking for deep thinking ("ultrathink", "think hard") goes to the strong tier.
- **Keyword rules** (the default). A hard-work word such as debug, root cause, refactor, migrate or race condition earns the strong tier. A long prompt, such as a pasted spec, earns the balanced tier.
- **A model's judgement**, if you turn on a decider (next section). It is far more accurate than keywords.
- **A stuck task** escalates: three or more failed tool calls since the prompt.

Options, all set in the environment you launch from:

| Setting                     | What it does                                                                                                                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NCONNECT_AUTO_COST_TIER`   | `low`, `medium` (default) or `high`. `low` asks for more evidence before paying for a bigger model; `high` asks for less.                                                                                                                  |
| `NCONNECT_AUTO_PER_TURN=on` | Off by default. Once a task is two turns in and nothing is failing, its follow-up turns run one tier down: a strong model reads the problem and plans, a cheaper one carries the plan out. A failed tool call sends the next turn back up. |
| `NCONNECT_AUTO_EFFORT=off`  | By default Auto also raises the reasoning effort on the first turn of a harder task, for models that take one. This turns that off.                                                                                                        |
| Tier models                 | `NCONNECT_AUTO_FAST_MODEL`, `NCONNECT_AUTO_BALANCED_MODEL` and `NCONNECT_AUTO_STRONG_MODEL` replace the model for a tier.                                                                                                                  |

To see what Auto picked: the cost line printed when a session ends lists each model it ran on (`[nconnect cost] by model: Kimi K3 $0.0840 · GLM 5.3 $0.0815`), and `nconnect usage` shows the same split over time. Responses also carry the name of the model that ran, though Claude Code keeps showing "Auto" in its own display.

Routing is decided inside the NConnect daemon. A harness's own background calls, such as Codex's memory agent, always use the fast model. OpenCode, Pi, Prime, Hermes, DeepSeek Harness and Grok Build normally talk to Nebius directly; on Auto they go through the daemon, so it must be running.

#### Smarter Auto: let a model judge the task (optional)

By default Auto guesses how hard a task is from keywords and prompt length. That misses most hard tasks, which rarely contain a word like "debug", and it cannot tell a moderate task from a routine one. You can have a model make that one judgement instead. It applies to Auto only, and your explicit signals (plan mode, a raised effort level, asking to think hard) still win.

| `NCONNECT_AUTO_DECIDER` | What judges the task                                                          | Needs                                                | Where your prompt goes              |
| ----------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------- |
| unset                   | Keyword rules                                                                 | nothing                                              | nowhere                             |
| `nebius`                | A small Nebius model, answering in one token                                  | nothing extra                                        | Nebius, as the request already does |
| `jev`                   | [Jev](https://typesafe.ai), TypeSafe's hosted decision model                  | `TYPESAFE_API_KEY`                                   | TypeSafe                            |
| `laya`                  | [Laya](https://github.com/NandhaKishorM/laya), an open model you run yourself | `pip install "laya[serve]"` and `laya-serve` running | stays on your machine               |

```bash
NCONNECT_AUTO_DECIDER=nebius nconnect --model auto claude
TYPESAFE_API_KEY=... NCONNECT_AUTO_DECIDER=jev nconnect --model auto codex
NCONNECT_AUTO_DECIDER=laya nconnect --model auto opencode
```

The decider is asked once per prompt you type. The tool calls that follow reuse the answer, so a task stays on one model and only its first request waits. If the decider is slow, down or has no answer, the keyword rules decide.

On a set of 34 labelled prompts (12 routine, 10 moderate, 12 hard), written to include cases keywords get wrong:

| Decider                | Exact tier, of 34        | Off by two tiers | Typical wait |
| ---------------------- | ------------------------ | ---------------- | ------------ |
| Keyword rules          | 11                       | 13               | none         |
| `nebius` (Gemma 3 27B) | 31                       | 1                | about 0.5 s  |
| `jev` (1.13.0)         | 31                       | 0                | about 0.4 s  |
| `laya`                 | not measured on this set | not measured     | about 50 ms  |

Laya is asked a two-way question, routine or hard, because given three options it called nearly everything moderate. On an earlier two-way set it got 25 of 28; its answers sit close to the middle, so expect it to use the balanced tier often.

That is a small set and it measures agreement with labels, not whether routing saves money on real work. A confident claim inside a prompt ("this is a trivial one-line change") can talk every model-based decider into a cheaper tier.

Other settings: `NCONNECT_AUTO_DECIDER_MODEL` (the Nebius model, Jev model or Laya checkpoint), `NCONNECT_AUTO_DECIDER_URL` (the Jev or Laya endpoint; Laya defaults to `http://127.0.0.1:8000/v1/systemone`), `NCONNECT_AUTO_DECIDER_TIMEOUT_MS` (default 2500), and `LAYA_API_KEY` for a protected Laya server.

| Model                         | Best for                     | Context | Vision |
| ----------------------------- | ---------------------------- | ------- | ------ |
| **GLM 5.3 Flash** _(default)_ | Fast, very low cost, agentic | 1M      | Yes    |
| Kimi K3                       | Frontier coding + agentic    | 1M      | Yes    |
| Kimi K2.6                     | Vision flagship              | 262K    | Yes    |
| Kimi K2.7 Code                | Coding                       | 262K    | No     |
| MiniMax M3                    | Fast, cheap                  | 196K    | No     |
| Qwen 3.5 397B                 | General / coding flagship    | 262K    | No     |
| DeepSeek V4 Flash             | Fast DeepSeek V4             | 1M      | No     |
| DeepSeek V4 Pro               | Long-context reasoning       | 1M      | No     |
| Qwen2.5-VL 72B                | Vision fallback              | 32K     | Yes    |

Claude Code and Codex send images straight to a vision-capable model, such as the default GLM 5.3 Flash or Kimi K3, so the model sees the image itself. When Claude Code is on a text-only model, a vision model (Kimi K2.6, then Qwen2.5-VL) describes each image as text first. Claude Code keeps the 8 most recent images as images and describes older ones once; set `NCONNECT_CLAUDE_IMAGES=describe` to always describe. OpenCode uses a dedicated `@vision` subagent pinned to the vision flagship. Run `scripts/list-nebius-models.mjs` (with `NEBIUS_API_KEY` set) to print the raw catalog.

## Claude Desktop (beta)

`nconnect claude-desktop` points the Claude desktop app at Nebius models, on macOS and Linux:

```bash
nconnect claude-desktop                      # default model: GLM 5.3 Flash
nconnect claude-desktop --model auto         # or any model id
nconnect claude-desktop status
nconnect claude-desktop off                  # switch back
```

It uses Claude Desktop's own third-party inference mode with a gateway that points at the local NConnect daemon. That mode has a separate profile, so your Anthropic login, chats and settings are untouched and come back with `off`. Quit and reopen Claude Desktop after switching either way. The daemon must be running while you use the app; `nconnect daemon install` starts it at login.

Two things to know:

- Claude Desktop refuses gateway models whose names are not Anthropic's. NConnect turns that check off with the app's `unstableDisableModelVerification` setting, so the picker shows the real Nebius model names. The setting is marked unstable, so a Claude Desktop update may remove it and stop this from working.
- Check that using Claude Desktop with non-Anthropic models fits Anthropic's terms for your use before relying on it.

## Ask about an image

`nconnect image describe` sends an image and a question to a vision model, straight from the terminal:

```bash
nconnect image describe screenshot.png
nconnect image describe error.png "What is the error message?"
nconnect image describe diagram.webp --model moonshotai/Kimi-K3 --json
```

It reads PNG, JPEG, GIF and WebP files, or an http(s) image URL. The default model is GLM 5.3 Flash; `--model` takes any model that accepts images. The answer goes to stdout and a one-line token and cost receipt to stderr, so the output pipes cleanly. `--json` prints the answer, model, token counts and cost as JSON. Each call also shows up in `nconnect usage` under the tool `image`.

Nebius Token Factory does not serve image-generation models, so there is no `image generate` or `image edit`.

## Web search

Claude Code and Codex expose a native `web_search` tool. Nebius has no hosted search, so NConnect backs the tool with [Tavily](https://tavily.com). With a Tavily key configured, searches return real results with citations; without one, the agent gets a clear "TAVILY_API_KEY not set" message instead of a silent failure.

## Configuration

<details>
<summary><b>Environment variables</b></summary>

<br />

| Variable                        | Effect                                                                                                                                                                                                                                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NEBIUS_API_KEY`                | Nebius Token Factory key (or set via `configure`).                                                                                                                                                                                                                                                                       |
| `TAVILY_API_KEY`                | Enables web search (or set via `configure`).                                                                                                                                                                                                                                                                             |
| `NEBIUS_BASE_URL`               | Override the API base (default `https://api.tokenfactory.nebius.com/v1`).                                                                                                                                                                                                                                                |
| `NCONNECT_REASONING_EFFORT`     | `none`\|`low`\|`medium`\|`high`\|`max`. Default `none` for speed; raise for harder tasks.                                                                                                                                                                                                                                |
| `NCONNECT_FALLBACK_MODEL`       | Model to fail over to when the target model returns no response headers (down/overloaded). Default `moonshotai/Kimi-K2.6`; set `off` to disable.                                                                                                                                                                         |
| `NCONNECT_DISABLE_AUTOUPDATE=1` | Stop the installed binary from self-updating.                                                                                                                                                                                                                                                                            |
| `NCONNECT_TELEMETRY_URL`        | Opt in to telemetry by pointing at your own collector. Off by default.                                                                                                                                                                                                                                                   |
| `NCONNECT_METER=1`              | Route the spawned harnesses (Pi, Prime, Hermes, DeepSeek, Grok) through the daemon, so they get cost metering, model fallback and retries. Off by default.                                                                                                                                                               |
| `NCONNECT_CACHE_READ_RATIO`     | Price of a cached input token as a fraction of the input price. Default `1` (Nebius publishes no cached rate, so cost is an upper bound).                                                                                                                                                                                |
| `NCONNECT_MODELS_DEV`           | `off` to stop enriching the model catalog with [models.dev](https://models.dev/providers/nebius) metadata (tool/reasoning flags, release dates for ordering). The live Nebius list is always the source of what exists.                                                                                                  |
| `NCONNECT_BACKGROUND_MODEL`     | Model for Claude Code's background calls - the auto-mode safety classifier (one per shell command, normally sent to the expensive Sonnet tier) and the session title. Default: the catalog default (GLM 5.3 Flash); `off` keeps Claude Code's own choice. Read when the daemon starts (`nconnect daemon stop` to apply). |
| `NCONNECT_CLAUDE_IMAGES`        | `describe` makes Claude Code always turn images into a text description from a vision model, even when the selected model can see. By default, vision-capable models receive images directly.                                                                                                                            |
| `NCONNECT_AUTO_DECIDER`         | `nebius`, `jev` or `laya`: let a model judge how hard each Auto task is, instead of keyword rules. See "Smarter Auto" above.                                                                                                                                                                                             |
| `NCONNECT_AUTO_FAST_MODEL`      | Model for Auto's fast tier. Default: the catalog default, GLM 5.3 Flash.                                                                                                                                                                                                                                                 |
| `NCONNECT_AUTO_BALANCED_MODEL`  | Model for Auto's balanced tier. Default: GLM 5.3.                                                                                                                                                                                                                                                                        |
| `NCONNECT_AUTO_STRONG_MODEL`    | Model for Auto's strong tier. Default: Kimi K3.                                                                                                                                                                                                                                                                          |
| `NCONNECT_AUTO_COST_TIER`       | `low`, `medium` (default) or `high`: how readily Auto pays for a bigger model.                                                                                                                                                                                                                                           |
| `NCONNECT_AUTO_PER_TURN`        | `on` lets the follow-up turns of a task run one tier down. Off by default.                                                                                                                                                                                                                                               |
| `NCONNECT_AUTO_EFFORT`          | `off` stops Auto raising reasoning effort on the first turn of a harder task.                                                                                                                                                                                                                                            |
| `NCONNECT_REASONING_HISTORY`    | `full` (default) \| `interleaved` \| `off`. How much of previous turns' reasoning is replayed each turn. `off` is cheapest on long sessions; current-turn reasoning is never affected.                                                                                                                                   |
| `NCONNECT_CODEX_MEMORY_MODEL`   | Model used to summarize Codex task traces for durable memory. Defaults to MiniMax M3.                                                                                                                                                                                                                                    |

</details>

<details>
<summary><b>Metering the direct harnesses</b></summary>

<br />

Claude Code and Codex are proxied, so the daemon meters every turn. The direct harnesses hold the key and call Nebius themselves, which is why they report `$0.00`. `NCONNECT_METER=1` points them at the daemon instead:

```bash
NCONNECT_METER=1 npi --print "..."
# [nconnect cost] session total: $0.0056 (1,518 in, 69 out)
```

They then share the same client as everyone else (model fallback, the per-model circuit breaker, transient-fault retries), and the real Nebius key stays inside the daemon; the harness only sees a local session token. If the daemon is unreachable, the launcher says so and connects directly, so metering can never stop a session from starting.

</details>

The installed binary keeps itself up to date, throttled to once an hour, and swallows every failure. Set `NCONNECT_DISABLE_AUTOUPDATE=1` to opt out. Dev/source runs never self-update.

## For AI agents

An LLM-readable guide is published at <https://nconnect.sh/llms.txt>. If you are an agent asked to install, configure, or drive NConnect (including headless), read that first. It covers install, configuration, every command, the models, and headless usage patterns.

## Contributing

Monorepo: pnpm workspaces + Turbo.

| Path              | What it is                                            |
| ----------------- | ----------------------------------------------------- |
| `packages/cli`    | The relay (CLI and daemon)                            |
| `packages/models` | The model catalog                                     |
| `packages/tests`  | Offline and live test suites                          |
| `site/`           | The install and update host, plus the landing page UI |

```bash
pnpm install                       # from repo root
pnpm -F @nconnect/cli build     # build the CLI
pnpm dev                           # rebuild on change (run commands from another terminal)
pnpm test                          # offline test suite
```

Run the built CLI directly, or through the workspace bin (closest to how users invoke it):

```bash
node packages/cli/dist/bin/nconnect.js help
pnpm -F @nconnect/cli exec nconnect help
```

Testing commands and live-smoke notes are in [TESTING.md](TESTING.md).

<details>
<summary><b>Publishing</b></summary>

<br />

The install one-liner, the auto-updating bundle, and `llms.txt` are served from the static site in `site/`:

```bash
pnpm build:site        # builds the CLI bundle + latest.json + the site
# deploy site/ to Vercel (or any static host)
```

`scripts/build-bundle.sh` writes `site/public/nconnect.js` (the installed bundle) and `site/public/latest.json` (the self-update manifest). Cut a release with `pnpm bump-version`, rebuild, and redeploy so installed binaries pick it up.

</details>

## Resources

- [Documentation](https://nconnect.sh/docs)
- [Video tutorial: K3 with Any Harness](https://www.youtube.com/watch?v=u8c_exTe2To)
- [Changelog](CHANGELOG.md)
- [Nebius Builder Program](https://dub.sh/AIStudio) and [awesome-ai-apps](https://github.com/Arindam200/awesome-ai-apps) (100+ projects built on open models)

## Upgrading from nebiusrelay

NConnect was previously published as Nebius TF Relay (`nebiusrelay`). Existing installs update themselves: the first run after the update moves your settings and usage history from `~/.nebiusrelay` to `~/.nconnect`, keeps the old `nebiusrelay` and `n*` commands working, and prints a one-line notice. `NEBIUSRELAY_*` environment variables are still honoured. If you had `nebiusrelay daemon install` set up, run `nconnect daemon install` once to re-enable auto-start under the new name.

## License

[MIT](LICENSE)
