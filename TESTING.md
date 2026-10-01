# Testing

Use these checks when changing the Claude local proxy or CLI launch path.

## Regression-First Debugging

When a user reports a concrete agent/proxy failure, do not start with the fix. First turn the report into a red-capable regression at the closest stable seam.

Use this loop:

1. Capture the exact failing prompt, command, trace row, or session artifact.
2. Add a focused test that reproduces the bad protocol shape or output. The test should fail on the current code for the same reason the user saw.
3. Run only that focused test and confirm it fails.
4. Patch the smallest proxy or launcher boundary that makes the regression pass.
5. Run the focused test again, then the relevant typecheck/build.
6. Re-run a live smoke using the user's original pattern when the bug depends on real Codex, Claude, OpenCode, Pi, or Nebius behavior.

For Codex proxy bugs, prefer `packages/tests/src/CodexProxyApi.test.ts` for deterministic protocol regressions before doing a live `ncodex -- exec ...` smoke. Examples of patterns that need regression coverage:

- parallel `multi_agent_v1` calls must stay in one assistant tool-call group before their tool outputs;
- more than five parallel subagent calls must preserve all call IDs and outputs;
- native `web_search` must not leak back to Codex as an unsupported client tool, including when it appears in the same parallel group as client tools;
- function-shaped tools named `web_search` still count as proxy-native search tools.

If a correct automated seam does not exist, document that explicitly in the bug notes and use the smallest live command as the temporary regression signal.

## Setup

Install dependencies and build the CLI:

```bash
pnpm install
pnpm -F @nconnect/cli build
```

For local development, keep TypeScript rebuilding in one terminal:

```bash
pnpm dev
```

Run smoke tests from another terminal.

Quick local checks:

```bash
pnpm -F @nconnect/cli typecheck
pnpm -F @nconnect/cli test
```

## Manual Harness Launches

Use these commands for quick live launches while validating a harness manually.

### OpenCode

OpenCode uses ephemeral Nebius settings: `nconnect opencode` injects the Nebius provider config only for that launch, so there is no `on`/`off` flow and no OpenCode config rewrite. OpenCode's own local session history can still persist normally.

```bash
export NEBIUS_API_KEY="..."

pnpm -F @nconnect/cli exec nconnect opencode
```

### Claude Code

Claude Code uses ephemeral Nebius settings. `nconnect` does not write `~/.claude/settings.json` and there is no `claude on/off` flow to remember; Claude Code's own session/history behavior is left intact.

Launch Claude Code through the local Nebius proxy:

```bash
export NEBIUS_API_KEY="..."

pnpm -F @nconnect/cli exec nconnect claude
```

Pass arguments through to `claude` after the harness name:

```bash
pnpm -F @nconnect/cli exec nconnect claude --help
pnpm -F @nconnect/cli exec nconnect claude --version
```

The Claude local proxy defaults to Nebius GLM-5.2 (`zai-org/GLM-5.2`) and can route Claude Code through any curated Nebius model in the repo's shared model list.
Pick a backend for one launch:

```bash
pnpm -F @nconnect/cli exec nconnect --main nebius-glm-5-2 claude
pnpm -F @nconnect/cli exec nconnect --main nebius-kimi-k2-7-code claude
pnpm -F @nconnect/cli exec nconnect --main Qwen/Qwen3.5-397B-A17B claude
```

### Codex

Codex uses ephemeral Nebius settings. `nconnect` launches the terminal `codex` CLI with per-run config flags and a local Responses-compatible proxy that translates Codex traffic to Nebius chat completions, while leaving Codex's own session/history behavior intact.

Launch Codex through Nebius:

```bash
export NEBIUS_API_KEY="..."

pnpm -F @nconnect/cli exec nconnect codex
```

Run Codex headlessly through Nebius:

```bash
pnpm -F @nconnect/cli exec nconnect codex exec "Say hi"
ncodex exec "Say hi"
```

### Codex App

Codex App support is an alpha feature. Unlike `nconnect codex`, it persistently patches Codex's user config so the desktop app can use nconnect's local Responses-compatible proxy. The config stays active until you run `--restore`, similar to `ollama launch codex-app`. If Codex App is already open, nconnect asks before restarting it so the new profile can load.

```bash
export NEBIUS_API_KEY="..."

pnpm -F @nconnect/cli exec nconnect codex-app
pnpm -F @nconnect/cli exec nconnect codex-app --model moonshotai/Kimi-K2.7-Code
```

Restore the previous Codex config:

```bash
pnpm -F @nconnect/cli exec nconnect codex-app --restore
```

Backups live under `~/.nconnect/backup/codex-app/`. The managed model catalog lives under `~/.codex/` so Codex Desktop can load it, and the session lock lives under `~/.nconnect/codex-app/`.

### Pi Code

Pi Code uses ephemeral Nebius settings with persistent sessions. `nconnect pi` uses Pi's official Nebius provider (`together`) and a temporary `PI_CODING_AGENT_DIR` for per-run model config, while pointing `PI_CODING_AGENT_SESSION_DIR` at the normal local Pi sessions folder. It does not write Pi config, and Pi sessions can still be resumed normally.

Launch Pi Code through Nebius:

```bash
export NEBIUS_API_KEY="..."

pnpm -F @nconnect/cli exec nconnect pi
pnpm -F @nconnect/cli exec nconnect picode
npi
```

Run Pi Code headlessly through Nebius:

```bash
pnpm -F @nconnect/cli exec nconnect pi -p "Say hi"
npi -p "Say hi"
```

## Claude Code Headless Smoke Tests

Claude support must be tested headlessly before testing the interactive UI. Headless mode makes proxy failures reproducible and prints a JSON result.

Use debug logs while working on the proxy:

```bash
export NCONNECT_DEBUG=1
```

Basic chat, no tools:

```bash
pnpm -F @nconnect/cli exec nconnect claude -- \
  --print \
  --output-format json \
  --no-session-persistence \
  --permission-mode bypassPermissions \
  "Reply with exactly: hi"
```

Expected result:

- The proxy receives `HEAD /`.
- The proxy receives `GET /v1/models?limit=1000`.
- The proxy receives `POST /v1/messages?beta=true`.
- The JSON result has `"is_error": false`.
- The final result is `hi`.

Tool-use smoke test:

```bash
pnpm -F @nconnect/cli exec nconnect claude -- \
  --print \
  --output-format json \
  --no-session-persistence \
  --permission-mode bypassPermissions \
  "Read README.md and answer in one sentence what this project does."
```

Expected result:

- The proxy receives at least one request with `toolCount` greater than `0`.
- The debug log shows a `Read` or `Bash` tool call with non-empty JSON arguments.
- Claude Code does not print `Invalid tool parameters`.
- The JSON result has `"is_error": false`.
- The answer is based on the root `README.md`.

Repo-context smoke test:

```bash
pnpm -F @nconnect/cli exec nconnect claude -- \
  --print \
  --output-format json \
  --no-session-persistence \
  --permission-mode bypassPermissions \
  "what is this project about?"
```

This broader prompt may take more turns because GLM can overuse tools. It should still finish without a Nebius API error.

## What These Tests Cover

The basic chat test catches:

- Claude Code model discovery failures.
- Local proxy routing bugs.
- Nebius model ID problems.
- Basic Anthropic-to-Nebius message conversion problems.

The tool-use test catches:

- OpenAI function-tool schema conversion bugs.
- Nebius `tool_calls` to Anthropic `tool_use` conversion bugs.
- Streaming `tool_use` bugs. Claude Code expects tool inputs to arrive as `input_json_delta` events.
- Anthropic `tool_result` to OpenAI `tool` message conversion bugs.

The repo-context test catches:

- Multi-turn tool loops.
- Large tool-result payloads.
- Reasoning preservation across tool calls.

## Direct Nebius API Probe

When the proxy behavior is unclear, test Nebius directly before changing the proxy:

```bash
curl https://api.tokenfactory.nebius.com/v1/chat/completions \
  -H "Authorization: Bearer $NEBIUS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "zai-org/GLM-5.2",
    "messages": [
      { "role": "user", "content": "Reply with exactly: hi" }
    ],
    "reasoning_effort": "high",
    "chat_template_kwargs": { "clear_thinking": false },
    "max_tokens": 256
  }'
```

GLM-5.2 returns preserved reasoning in `choices[0].message.reasoning`. Keep that reasoning unmodified when sending it back in later turns.

## Codex Desktop App-Server Model List Probe

Codex Desktop renders its model picker from the app-server JSON-RPC method `model/list`, not directly from the provider's raw `/v1/models` response. When debugging `nconnect codex-app`, verify the real app-server contract before changing Desktop config again.

First make sure `~/.codex/config.toml` points at the NConnect Codex App provider and that the local NConnect daemon is reachable:

```bash
/Applications/Codex.app/Contents/Resources/codex doctor --json
```

If the app-server protocol changed, regenerate the local TypeScript bindings in `/tmp` and inspect the method/parameter shapes:

```bash
/Applications/Codex.app/Contents/Resources/codex app-server generate-ts --out /tmp/codex-app-server-ts
rg "model/list|ModelListParams|InitializeParams|ClientInfo|InitializeCapabilities" /tmp/codex-app-server-ts -g "*.ts"
```

Then query the same app-server mode Desktop uses:

```bash
node --input-type=module -e '
import { spawn } from "node:child_process";

const child = spawn("/Applications/Codex.app/Contents/Resources/codex", ["app-server", "--stdio"], {
  stdio: ["pipe", "pipe", "pipe"],
});

let buffer = "";
let id = 1;
const pending = new Map();

child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => process.stderr.write(chunk));
child.stdout.on("data", (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    if (message.id !== undefined && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  }
});

function request(method, params) {
  const requestId = id++;
  child.stdin.write(JSON.stringify({ id: requestId, method, params }) + "\n");
  return new Promise((resolve, reject) => {
    pending.set(requestId, resolve);
    setTimeout(() => reject(new Error("timeout waiting for " + method)), 10000).unref();
  });
}

function notify(method, params) {
  child.stdin.write(JSON.stringify({ method, params }) + "\n");
}

try {
  await request("initialize", {
    clientInfo: {
      name: "nconnect-debug",
      title: "NConnect Debug",
      version: "0.5.26",
    },
    capabilities: {
      experimentalApi: true,
      requestAttestation: false,
      optOutNotificationMethods: [],
    },
  });

  const response = await request("model/list", { limit: 100, cursor: null, includeHidden: true });
  const models = response.result?.data ?? [];
  console.log(JSON.stringify({
    count: models.length,
    models: models.map((model) => ({
      id: model.id,
      model: model.model,
      displayName: model.displayName,
      hidden: model.hidden,
      isDefault: model.isDefault,
    })),
  }, null, 2));
} finally {
  child.kill("SIGTERM");
}
'
```

Expected result for `nconnect codex-app` is the visible Nebius catalog models, starting with the current default model. If this probe is correct but Desktop still shows stale or missing models, the bug is in the running Desktop process or frontend state, not the Codex app-server model manager.

Also verify the active NConnect daemon session route returns the same catalog without calling Nebius:

```bash
node --input-type=module -e '
import { readFileSync } from "node:fs";

const raw = readFileSync(process.env.HOME + "/.codex/config.toml", "utf8");
const baseUrl = raw.match(/base_url\s*=\s*"([^"]+)"/)?.[1];
if (!baseUrl) throw new Error("missing NConnect codex-app base_url");

const response = await fetch(baseUrl + "/models");
const body = await response.json();
const models = body.data ?? body.models ?? [];
console.log(JSON.stringify({
  status: response.status,
  count: models.length,
  ids: models.map((model) => model.id ?? model.slug),
}, null, 2));
'
```

Codex Desktop has had a custom-provider picker bug where the frontend hides the model picker unless the provider reports auth as required: https://github.com/openai/codex/issues/10867. `nconnect codex-app` intentionally writes `requires_openai_auth = true` for the custom provider as a Desktop workaround. If Desktop prompts for login during manual testing, choose API key and enter any placeholder character; model traffic still goes to the configured local NConnect `base_url`.

## Notes

The Claude/Codex proxy and per-run Nebius settings are intentionally temporary. They should not write agent config files. Smoke tests should pass each agent's no-session flag, such as Claude's `--no-session-persistence` or Pi's `--no-session`, unless the behavior under test specifically needs persisted session state.

## Live Agent Gauntlet

The executable live suite is in `packages/tests`. It uses Vitest, real Claude/Codex/OpenCode CLI processes, and real Nebius inference; it does not mock the model provider.

Build once, then run any harness test file:

```bash
node_modules/.bin/tsc -p packages/cli/tsconfig.json
chmod +x packages/cli/dist/bin/nconnect.js
packages/tests/node_modules/.bin/vitest run --config packages/tests/vitest.config.ts packages/tests/src/Codex.test.ts
packages/tests/node_modules/.bin/vitest run --config packages/tests/vitest.config.ts packages/tests/src/Claude.test.ts
packages/tests/node_modules/.bin/vitest run --config packages/tests/vitest.config.ts packages/tests/src/OpenCode.test.ts
packages/tests/node_modules/.bin/vitest run --config packages/tests/vitest.config.ts packages/tests/src/Pi.test.ts
```

Each run writes JSON artifacts to `packages/tests/artifacts/`, including stdout/stderr for every scenario. Longer coding-task scenarios create disposable Git repos under `packages/tests/tmp/` and remove them when the suite finishes.

Current scenarios cover:

- Basic headless response.
- Streaming JSON/event output.
- Shell/read tool usage.
- Claude/Codex multi-step coding tasks in temporary Git repos, including edits and `node --test` verification.
- Long-context pressure with a final checksum assertion.
- Claude and Codex proxy hard context-limit retries with real Nebius requests that first exceed `input + max_tokens`, then succeed after the proxy lowers `max_tokens`.
- Codex reasoning-stream usage (`reasoning_output_tokens > 0`).
- Lighter OpenCode coverage for basic streaming, bash tools, and context pressure.
- Pi Code coverage for streaming JSON, bash tool calls, usage/cost accounting, and Nebius model-list vision metadata.

## Live Models Check

`packages/tests/src/livemodelscheck.test.ts` is the exhaustive real-inference model check. It is skipped by the normal suite unless `NCONNECT_LIVE_MODELS_CHECK=1` is set, because it launches real Claude Code and Codex CLI sessions and calls Nebius for every curated model.

Run it with:

```bash
pnpm -F @nconnect/tests test:live-models-check
```

The check runs one concurrent case per harness/model/probe tuple. Default concurrency is 6 and can be changed with:

```bash
VITEST_MAX_CONCURRENCY=3 pnpm -F @nconnect/tests test:live-models-check
```

For each curated `SELECTABLE_MODELS` entry it runs both harnesses through:

- Hello-world completion.
- Shell/tool call.
- Subagent delegation (`spawn_agent`/collab tool calls for Codex, `Task`/`Agent` stream events for Claude).

Claude also includes its Haiku-tier backend if it is not already in `SELECTABLE_MODELS`, because Claude Code may use that backend for built-in subagent work.

## GitHub Live Workflow

`.github/workflows/live-agent-gauntlet.yml` runs the same real-inference suite on a daily schedule, on pushes to `main` that touch integration code, and by manual dispatch. It requires a repository secret named `NEBIUS_API_KEY`.

The workflow installs the real agent CLIs explicitly:

```bash
npm install -g @anthropic-ai/claude-code @openai/codex opencode-ai @earendil-works/pi-coding-agent
```

This is intentionally a CI setup step, not something `nconnect` does silently on a user's machine.

## Tool Compatibility Audit

The current Claude/Codex tool compatibility notes live in `packages/cli/src/lib/TOOL_COMPATIBILITY.md`. Update that file whenever a new CLI version starts sending a different tool catalog.
