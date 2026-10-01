import { spawn } from "node:child_process";
import { OPENCODE_DEFAULT_MODEL, OPENCODE_PROVIDER_ID } from "../opencode/defaults.js";
import { buildOpencodeConfigJson, buildOpencodeEnv } from "../opencode/core.js";
import { resolveNebiusApiKey } from "../nebius-core.js";
import { defineHarness } from "../harness-types.js";
import { HARNESS } from "../harness.js";
import type { HarnessContext, HarnessResult } from "../harness-types.js";

/**
 * Strips any `--model`/`-m`/`--model=` from passthrough args so a user can't
 * override the Nebius default. Parallel to Claude's
 * `claudeArgsWithoutModelOverrides`.
 */
function opencodeArgsWithoutModelOverrides(args: string[]): string[] {
  const sanitized: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === undefined) {
      continue;
    }
    if (arg === "--model" || arg === "-m") {
      i += 1;
      continue;
    }
    if (arg.startsWith("--model=")) {
      continue;
    }
    sanitized.push(arg);
  }
  return sanitized;
}

export default defineHarness({
  id: HARNESS.OPENCODE,
  label: "OpenCode",

  async run(ctx: HarnessContext): Promise<HarnessResult> {
    const apiKey = await resolveNebiusApiKey({
      apiKey: ctx.apiKey,
      home: ctx.home,
    });
    if (!apiKey) {
      throw new Error("No Nebius API key found. Pass --api-key or set NEBIUS_API_KEY.");
    }

    const modelId = ctx.main ?? OPENCODE_DEFAULT_MODEL;
    const configJson = buildOpencodeConfigJson({ modelId });
    const env = buildOpencodeEnv({ apiKey, configJson });

    if (process.env.NCONNECT_DEBUG === "1") {
      process.stderr.write(`[nconnect opencode] custom model: ${modelId}\n`);
      process.stderr.write(`[nconnect opencode] config: ${JSON.stringify(configJson)}\n`);
    }

    // Force our model via the CLI flag (highest precedence). Relying on the
    // injected config's `model` field alone is not enough: OpenCode merges the
    // user's own global config (~/.config/opencode), whose `model` default
    // otherwise wins and routes to the wrong provider. `-m provider/model` on
    // the CLI overrides that for both the TUI and `run`.
    const modelSelector = `${OPENCODE_PROVIDER_ID}/${modelId}`;
    const opencodeArgs = [
      "--model",
      modelSelector,
      ...opencodeArgsWithoutModelOverrides(ctx.passthrough ?? []),
    ];

    const child = spawn("opencode", opencodeArgs, {
      env,
      stdio: "inherit",
    });

    const result = await new Promise<{ status: number | null; signal: NodeJS.Signals | null }>(
      (resolve, reject) => {
        child.on("error", reject);
        child.on("exit", (status, signal) => resolve({ status, signal }));
      },
    );

    if (typeof result.status === "number") {
      process.exitCode = result.status;
    }
    return {};
  },
});
