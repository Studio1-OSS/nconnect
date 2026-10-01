# nconnect

Run your local coding agents on [Nebius Token Factory](https://tokenfactory.nebius.com/) open models. One install, and **Claude Code**, **Codex**, **OpenCode**, **Pi**, **Prime Agent**, **Hermes**, **DeepSeek Harness**, and **Grok Build** all talk to open-weight models (Kimi K3, Kimi K2.6, Qwen 3.5, DeepSeek V4, MiniMax M3) instead of their default backends.

---

> Want to try open models from Nebius? You can register for the [Nebius Builder Program](https://dub.sh/AIStudio), and you can also discover 100+ AI projects built using open models on [awesome-ai-apps](https://github.com/Arindam200/awesome-ai-apps).

---

Checkout this Youtube video tutorial: [K3 with Any Harness](https://www.youtube.com/watch?v=u8c_exTe2To)

```bash
curl -fsSL https://nebius-tf-relay.vercel.app/install.sh | sh
```

Then:

```bash
nebiusrelay claude     # Claude Code on Nebius models (alias: nclaude)
```

---

## What it does

Nebius Token Factory serves open models over an OpenAI-compatible API. It does **not** speak the Anthropic Messages API (Claude Code) or the OpenAI Responses API (Codex). nconnect runs a small local daemon that translates those wire formats to Nebius `/chat/completions` on the fly, so your agent believes it is talking to its native backend while every token is served by Nebius.

- **Proxied harnesses** (Claude Code, Codex): a local daemon translates each request/response, tracks cost, retries transient failures, trims context to fit, and emulates native web search.
- **Spawned harnesses** (OpenCode, Pi, Prime Agent, Hermes, DeepSeek Harness, Grok Build): launched with a generated provider config pointed at Nebius, no proxy needed (they already speak Nebius's OpenAI-compatible format).

Nothing about your agent install changes. The relay injects a base URL and API key per session and writes nothing permanent to your agent's config.

## Install

The one-liner installs the `nebiusrelay`, `nclaude`, `nopencode`, `ncodex`, `npi`, `nprime`, `nhermes`, `ndeepseek`, and `ngrok` commands to `~/.nebiusrelay/bin/` and installs [Bun](https://bun.sh) for you if it isn't already present:

```bash
curl -fsSL https://nebius-tf-relay.vercel.app/install.sh | sh
```

First run walks you through configuration (or run it directly):

```bash
nebiusrelay configure
```

You'll be asked for two keys:

| Key                | Where to get it                                          | Required?                     |
| ------------------ | -------------------------------------------------------- | ----------------------------- |
| **Nebius API key** | <https://tokenfactory.nebius.com/?modals=create-api-key> | Yes                           |
| **Tavily API key** | <https://app.tavily.com>                                 | Optional (enables web search) |

Both are stored in `~/.nebiusrelay/` and never leave your machine. You can also set `NEBIUS_API_KEY` / `TAVILY_API_KEY` in the environment instead.

If the underlying agent CLI (Claude Code, Codex, etc.) isn't installed, the relay prints its official install command and exits. It never installs agents for you.

## Usage

Pick a tool interactively:

```bash
nebiusrelay
```

Or launch one directly (each has a short alias):

```bash
nebiusrelay claude       # alias: nclaude
nebiusrelay codex        # alias: ncodex
nebiusrelay opencode     # alias: nopencode
nebiusrelay pi           # alias: npi
nebiusrelay prime        # alias: nprime  (PrimeIntellect Prime Agent)
nebiusrelay hermes       # alias: nhermes  (Nous Research; `hermes desktop` for the app)
nebiusrelay deepseek     # alias: ndeepseek (DeepSeek Harness, alpha)
nebiusrelay grok         # alias: ngrok    (Grok Build's UI, on Nebius models)
nebiusrelay chatgpt      # alpha: ChatGPT Desktop session with restore (alias: codex-app)
```

Any extra arguments are passed straight through to the underlying agent:

```bash
nclaude -p "explain this repo"
ncodex exec "add a test for the parser"
```

## Other commands

```bash
nebiusrelay usage --last 7d   # local spend by model and tool (never uploaded)
nebiusrelay update            # update to the latest release now
nebiusrelay daemon install    # start the daemon at login (macOS launchd / Linux systemd)
nebiusrelay daemon status     # show auto-start status
nebiusrelay daemon uninstall  # stop starting it at login
```

## Models

The model list is **fetched live** from Nebius (`GET /v1/models?verbose=true`) at startup, so every model Nebius serves is available and each model's vision support comes straight from the API's modality field, never a hand-maintained list. Results are cached in `~/.nebiusrelay/` and fall back to a bundled snapshot when offline. The default coding model is **GLM 5.3 Flash** (Z.ai) - a 1M-context hybrid reasoner priced at $0.15/$0.50 per M, roughly 20x cheaper on input than the previous Kimi K3 default; switch inside your agent or with `--model`.

Featured flagships:

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

Claude Code and Codex are text-native; image blocks are auto-routed to a vision-capable model (Kimi K2.6, then Qwen2.5-VL). OpenCode uses a dedicated `@vision` subagent pinned to the vision flagship. Run `scripts/list-nebius-models.mjs` (with `NEBIUS_API_KEY` set) to print the raw catalog Nebius serves.

## Web search

Claude Code and Codex expose a native `web_search` tool. The relay backs it with [Tavily](https://tavily.com): if a Tavily key is configured, searches return real results with citations. Without one, a search returns a clear "TAVILY_API_KEY not set" message instead of failing silently. Nebius has no hosted search tool, so this is how agents get live web access.

## Docs

Full documentation: <https://nebius-tf-relay.vercel.app/docs>

## Changelog

User-visible changes are recorded in [CHANGELOG.md](CHANGELOG.md).

## Configuration & env vars

| Variable                           | Effect                                                                                                                                                                                 |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEBIUS_API_KEY`                   | Nebius Token Factory key (or set via `configure`).                                                                                                                                     |
| `TAVILY_API_KEY`                   | Enables web search (or set via `configure`).                                                                                                                                           |
| `NEBIUS_BASE_URL`                  | Override the API base (default `https://api.tokenfactory.nebius.com/v1`).                                                                                                              |
| `NEBIUSRELAY_REASONING_EFFORT`     | `none`\|`low`\|`medium`\|`high`\|`max`. Default `none` for speed; raise for harder tasks.                                                                                              |
| `NEBIUSRELAY_FALLBACK_MODEL`       | Model to fail over to when the target model returns no response headers (down/overloaded). Default `moonshotai/Kimi-K2.6`; set `off` to disable.                                       |
| `NEBIUSRELAY_DISABLE_AUTOUPDATE=1` | Stop the installed binary from self-updating.                                                                                                                                          |
| `NEBIUSRELAY_TELEMETRY_URL`        | Opt in to telemetry by pointing at your own collector. Off by default.                                                                                                                 |
| `NEBIUSRELAY_METER=1`              | Route the spawned harnesses (Pi, Prime, Hermes, DeepSeek, Grok) through the daemon, so they get cost metering, model fallback and retries. Off by default.                             |
| `NEBIUSRELAY_CACHE_READ_RATIO`     | Price of a cached input token as a fraction of the input price. Default `1` (Nebius publishes no cached rate, so cost is an upper bound).                                              |
| `NEBIUSRELAY_REASONING_HISTORY`    | `full` (default) \| `interleaved` \| `off`. How much of previous turns' reasoning is replayed each turn. `off` is cheapest on long sessions; current-turn reasoning is never affected. |
| `NEBIUSRELAY_CODEX_MEMORY_MODEL`   | Model used to summarize Codex task traces for durable memory. Defaults to MiniMax M3.                                                                                                  |

### Metering the spawned harnesses

Claude and Codex are proxied, so the daemon meters every turn. The other
harnesses hold the key and call Nebius directly, which is why they report
`$0.00`. `NEBIUSRELAY_METER=1` points them at the daemon instead:

```bash
NEBIUSRELAY_METER=1 npi --print "..."
# nconnect ▸ Launching Pi Code with Nebius Token Factory.
# [nebiusrelay cost] session total: $0.0056 (1,518 in, 69 out)
```

They then share the same client as everyone else — automatic model fallback,
the per-model circuit breaker and transient-fault retries — and the real Nebius
key stays inside the daemon (the harness only ever sees a local session token).
If the daemon is unreachable the launcher says so and connects directly, so
metering can never be the reason a session fails to start.

The installed binary keeps itself up to date from `nebius-tf-relay.vercel.app`, throttled to once an hour, and swallows every failure. Dev/source runs never self-update.

## For AI agents

An LLM-readable doc is published at <https://nebius-tf-relay.vercel.app/llms.txt>. If you are an agent asked to install, configure, or drive nebiusrelay (including headless), read that first. It covers install, configure, every command, the models, and headless usage patterns.

## Local development

Monorepo: pnpm workspaces + Turbo. `packages/cli` (the relay), `packages/models` (the catalog), `packages/tests`, and `site/` (the install/update host and landing page UI).

```bash
pnpm install                       # from repo root
pnpm -F @nebiusrelay/cli build     # build the CLI
pnpm dev                           # rebuild on change (run relay commands from another terminal)
pnpm test                          # offline test suite
```

Run the built CLI directly, or through the workspace bin (closest to how users invoke it):

```bash
node packages/cli/dist/bin/nebiusrelay.js help
pnpm -F @nebiusrelay/cli exec nebiusrelay help
```

Testing commands and live-smoke notes are in [TESTING.md](TESTING.md).

### Publishing

The install one-liner, the auto-updating bundle, and `llms.txt` are served from the static site in `site/`:

```bash
pnpm build:site        # builds the CLI bundle + latest.json + the site
# deploy site/ to Vercel (or any static host)
```

`scripts/build-bundle.sh` writes `site/public/nebiusrelay.js` (the installed bundle) and `site/public/latest.json` (the self-update manifest). Cut a release with `pnpm bump-version`, rebuild, and redeploy so installed binaries pick it up.

## License

MIT licensed. See [LICENSE](LICENSE).
