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

| Model                         | Best for                     | Context | Vision |
| ----------------------------- | ---------------------------- | ------- | ------ |
| **GLM 5.3 Flash** _(default)_ | Fast, very low cost, agentic | 1M      | No     |
| Kimi K3                       | Frontier coding + agentic    | 1M      | No     |
| Kimi K2.6                     | Vision flagship              | 262K    | Yes    |
| Kimi K2.7 Code                | Coding                       | 262K    | No     |
| MiniMax M3                    | Fast, cheap                  | 196K    | No     |
| Qwen 3.5 397B                 | General / coding flagship    | 262K    | No     |
| DeepSeek V4 Flash             | Fast DeepSeek V4             | 1M      | No     |
| DeepSeek V4 Pro               | Long-context reasoning       | 1M      | No     |
| Qwen2.5-VL 72B                | Vision fallback              | 32K     | Yes    |

Claude Code and Codex are text-native, so image blocks are auto-routed to a vision-capable model (Kimi K2.6, then Qwen2.5-VL). OpenCode uses a dedicated `@vision` subagent pinned to the vision flagship. Run `scripts/list-nebius-models.mjs` (with `NEBIUS_API_KEY` set) to print the raw catalog.

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
