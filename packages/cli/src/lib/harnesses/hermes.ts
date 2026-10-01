import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getSelectableModels } from "@nconnect/models";
import { resolveCodexModel } from "../codex/defaults.js";
import { HARNESS } from "../harness.js";
import { defineHarness, type HarnessContext, type HarnessResult } from "../harness-types.js";
import {
  buildHermesLaunchSpec,
  createHermesHomeOverlay,
  resolveHermesCommand,
} from "../hermes/core.js";
import { resolveNebiusApiKey, resolveNebiusBaseUrl } from "../nebius-core.js";
import { meteredEndpoint } from "../metered-spawn.js";

export default defineHarness({
  id: HARNESS.HERMES,
  label: "Hermes Agent",

  async run(ctx: HarnessContext): Promise<HarnessResult> {
    const apiKey = await resolveNebiusApiKey({ apiKey: ctx.apiKey, home: ctx.home });
    if (!apiKey) {
      throw new Error("No Nebius API key found. Pass --api-key or set NEBIUS_API_KEY.");
    }

    const { mode, passthrough } = resolveHermesCommand(ctx.passthrough ?? []);
    const selectedModel = resolveCodexModel(ctx.main);
    // Route through the daemon when metering is on, so this session's spend is
    // tracked and it gets model fallback + retries like the proxied harnesses.
    const endpoint = await meteredEndpoint({
      agent: HARNESS.HERMES,
      apiKey,
      baseUrl: resolveNebiusBaseUrl(),
      model: selectedModel.definition,
    });
    const baseUrl = endpoint.baseUrl;
    // Put the selected model first: Hermes uses the first entry as the
    // provider's default_model.
    const modelIds = [
      selectedModel.id,
      ...getSelectableModels()
        .map((model) => model.id)
        .filter((id) => id !== selectedModel.id),
    ];

    const nativeHome = process.env.HERMES_HOME?.trim() || join(ctx.home || homedir(), ".hermes");
    const overlay = createHermesHomeOverlay(nativeHome, {
      apiKey: endpoint.apiKey,
      baseUrl,
      modelIds,
    });
    try {
      const launch = buildHermesLaunchSpec({
        mode,
        modelId: selectedModel.id,
        apiKey: endpoint.apiKey,
        baseUrl,
        hermesHome: overlay,
        passthrough,
      });

      if (process.env.NCONNECT_DEBUG === "1") {
        process.stderr.write(`[nconnect hermes] mode: ${mode}\n`);
        process.stderr.write(`[nconnect hermes] model: ${selectedModel.id}\n`);
        process.stderr.write(`[nconnect hermes] base URL: ${baseUrl}\n`);
        process.stderr.write(`[nconnect hermes] home overlay: ${overlay}\n`);
      }

      process.stderr.write(
        `NConnect ▸ Launching Hermes Agent${mode === "desktop" ? " Desktop" : ""} ` +
          `with Nebius Token Factory (${selectedModel.definition.name}).\n`,
      );
      const child = spawn(launch.binary, launch.args, { env: launch.env, stdio: "inherit" });
      const result = await new Promise<{ status: number | null; signal: NodeJS.Signals | null }>(
        (resolve) => {
          child.on("error", (err) => {
            process.stderr.write(`NConnect ▸ Failed to launch hermes: ${err.message}.\n`);
            resolve({ status: 1, signal: null });
          });
          child.on("exit", (status, signal) => resolve({ status, signal }));
        },
      );
      process.exitCode = typeof result.status === "number" ? result.status : result.signal ? 1 : 0;
    } finally {
      await endpoint.finish();
      rmSync(overlay, { recursive: true, force: true });
    }
    return {};
  },
});
