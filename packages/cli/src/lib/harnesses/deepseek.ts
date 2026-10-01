import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { resolveCodexModel } from "../codex/defaults.js";
import {
  buildDeepseekLaunchSpec,
  createDeepseekHomeOverlay,
  resolveDeepseekPatchPath,
  writeDeepseekPatch,
} from "../deepseek/core.js";
import { HARNESS } from "../harness.js";
import { defineHarness, type HarnessContext, type HarnessResult } from "../harness-types.js";
import { resolveNebiusApiKey, resolveNebiusBaseUrl } from "../nebius-core.js";
import { meteredEndpoint } from "../metered-spawn.js";

export default defineHarness({
  id: HARNESS.DEEPSEEK,
  label: "DeepSeek Harness (alpha)",

  async run(ctx: HarnessContext): Promise<HarnessResult> {
    const apiKey = await resolveNebiusApiKey({ apiKey: ctx.apiKey, home: ctx.home });
    if (!apiKey) {
      throw new Error("No Nebius API key found. Pass --api-key or set NEBIUS_API_KEY.");
    }

    const selectedModel = resolveCodexModel(ctx.main);
    const endpoint = await meteredEndpoint({
      agent: HARNESS.DEEPSEEK,
      apiKey,
      baseUrl: resolveNebiusBaseUrl(),
      model: selectedModel.definition,
    });
    const baseUrl = endpoint.baseUrl;
    const nativeDeepseekApiKey = process.env.DEEPSEEK_API_KEY;
    const patchPath = resolveDeepseekPatchPath(selectedModel, baseUrl, process.env);
    await writeDeepseekPatch(patchPath, selectedModel, baseUrl, nativeDeepseekApiKey);
    // dsh remembers the last model picked in its web UI and that setting
    // outranks our --patch, so --model was silently ignored. Run against a
    // throwaway home with that override removed; the real ~/.dsh is untouched.
    const nativeHome = process.env.DSH_HOME?.trim() || join(ctx.home || homedir(), ".dsh");
    const dshHome = createDeepseekHomeOverlay(nativeHome);
    const launch = buildDeepseekLaunchSpec({
      apiKey: endpoint.apiKey,
      baseUrl,
      patchPath,
      passthrough: ctx.passthrough ?? [],
    });

    if (process.env.NCONNECT_DEBUG === "1") {
      process.stderr.write(`[nconnect deepseek] model: ${selectedModel.id}\n`);
      process.stderr.write(`[nconnect deepseek] patch: ${patchPath}\n`);
    }

    process.stderr.write(
      `NConnect ▸ Launching DeepSeek Harness with Nebius Token Factory (${selectedModel.definition.name}). Alpha.\n`,
    );
    const child = spawn(launch.binary, launch.args, {
      env: { ...launch.env, DSH_HOME: dshHome },
      stdio: "inherit",
    });
    const result = await new Promise<{ status: number | null }>((resolve) => {
      child.on("error", (err) => {
        process.stderr.write(`NConnect ▸ Failed to launch ${launch.binary}: ${err.message}.\n`);
        resolve({ status: 1 });
      });
      child.on("exit", (status) => resolve({ status }));
    });

    await endpoint.finish();
    rmSync(dshHome, { recursive: true, force: true });
    if (typeof result.status === "number") {
      process.exitCode = result.status;
    }
    return {};
  },
});
