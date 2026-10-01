import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { NEBIUS_BASE_URL } from "@nconnect/models";
import { getCodexSupportedModels, resolveCodexModel } from "../codex/defaults.js";
import { HARNESS } from "../harness.js";
import { defineHarness, type HarnessContext, type HarnessResult } from "../harness-types.js";
import { resolveNebiusApiKey } from "../nebius-core.js";
import { meteredEndpoint } from "../metered-spawn.js";

const PI_PROVIDER_ID = "nebius";
function piSupportedModels(): string {
  return getCodexSupportedModels()
    .map((model) => model.id)
    .join(",");
}

const VALUE_FLAGS = new Set(["--api-key", "--provider", "--model", "--models"]);

function piArgsWithoutNConnectOverrides(args: string[]): string[] {
  const sanitized: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === undefined) {
      continue;
    }
    if (VALUE_FLAGS.has(arg)) {
      i += 1;
      continue;
    }
    if (
      arg.startsWith("--api-key=") ||
      arg.startsWith("--provider=") ||
      arg.startsWith("--model=") ||
      arg.startsWith("--models=")
    ) {
      continue;
    }
    sanitized.push(arg);
  }
  return sanitized;
}

function writePiModelsJson(agentDir: string, apiKey: string, baseUrl: string): void {
  const models = getCodexSupportedModels().map(({ definition }) => ({
    id: definition.id,
    name: definition.name,
    reasoning: definition.reasoning,
    input: definition.modalities.input,
    contextWindow: definition.limit.context,
    maxTokens: definition.limit.output,
    cost: {
      input: definition.cost.input,
      output: definition.cost.output,
      cacheRead: definition.cost.cache_read ?? 0,
      cacheWrite: 0,
    },
  }));

  writeFileSync(
    join(agentDir, "models.json"),
    `${JSON.stringify(
      {
        providers: {
          [PI_PROVIDER_ID]: {
            // Nebius is not a Pi built-in provider, so declare it as a custom
            // OpenAI-compatible provider: baseUrl + api="openai-completions"
            // route Pi's requests through the Nebius Token Factory endpoint.
            baseUrl,
            api: "openai-completions",
            apiKey,
            // Nebius runs on vLLM, which does not understand the OpenAI
            // "developer" role; send the system prompt as a system message.
            compat: { supportsDeveloperRole: false },
            models,
          },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

export default defineHarness({
  id: HARNESS.PI,
  label: "Pi Code",

  async run(ctx: HarnessContext): Promise<HarnessResult> {
    const apiKey = await resolveNebiusApiKey({
      apiKey: ctx.apiKey,
      home: ctx.home,
    });
    if (!apiKey) {
      throw new Error("No Nebius API key found. Pass --api-key or set NEBIUS_API_KEY.");
    }

    const agentDir = mkdtempSync(join(tmpdir(), "nconnect-pi-"));
    const sessionDir =
      process.env.PI_CODING_AGENT_SESSION_DIR ??
      join(ctx.home || homedir(), ".pi", "agent", "sessions");
    const selectedModel = resolveCodexModel(ctx.main);
    const endpoint = await meteredEndpoint({
      agent: HARNESS.PI,
      apiKey,
      baseUrl: NEBIUS_BASE_URL,
      model: selectedModel.definition,
    });
    writePiModelsJson(agentDir, endpoint.apiKey, endpoint.baseUrl);
    const supportedModels = piSupportedModels();
    const args = [
      "--provider",
      PI_PROVIDER_ID,
      "--model",
      selectedModel.id,
      "--models",
      supportedModels,
      "--api-key",
      endpoint.apiKey,
      "--no-approve",
      "--no-extensions",
      "--no-skills",
      "--no-prompt-templates",
      "--no-themes",
      ...piArgsWithoutNConnectOverrides(ctx.passthrough ?? []),
    ];

    if (process.env.NCONNECT_DEBUG === "1") {
      process.stderr.write(`[nconnect pi] provider: ${PI_PROVIDER_ID}\n`);
      process.stderr.write(`[nconnect pi] model: ${selectedModel.id}\n`);
      process.stderr.write(`[nconnect pi] models: ${supportedModels}\n`);
      process.stderr.write(`[nconnect pi] temp config dir: ${agentDir}\n`);
      process.stderr.write(`[nconnect pi] session dir: ${sessionDir}\n`);
    }

    process.stderr.write(`NConnect ▸ Launching Pi Code with Nebius Token Factory.\n`);
    const child = spawn("pi", args, {
      env: {
        ...process.env,
        PI_CODING_AGENT_DIR: agentDir,
        PI_CODING_AGENT_SESSION_DIR: sessionDir,
        NEBIUS_API_KEY: endpoint.apiKey,
      },
      stdio: "inherit",
    });

    const result = await new Promise<{ status: number | null; signal: NodeJS.Signals | null }>(
      (resolve) => {
        child.on("error", (err) => {
          process.stderr.write(`NConnect ▸ Failed to launch pi: ${err.message}.\n`);
          resolve({ status: 1, signal: null });
        });
        child.on("exit", (status, signal) => resolve({ status, signal }));
      },
    );

    await endpoint.finish();
    try {
      rmSync(agentDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }

    if (typeof result.status === "number") {
      process.exitCode = result.status;
    }
    return {};
  },
});
