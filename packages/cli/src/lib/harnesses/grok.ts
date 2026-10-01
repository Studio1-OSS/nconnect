import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveCodexModel } from "../codex/defaults.js";
import {
  buildGrokIdentityRule,
  buildGrokLaunchEnvironment,
  grokArgsWithNebiusIdentity,
  startGrokModelCatalogServer,
} from "../grok/core.js";
import { HARNESS } from "../harness.js";
import { defineHarness, type HarnessContext, type HarnessResult } from "../harness-types.js";
import { resolveNebiusApiKey, resolveNebiusBaseUrl } from "../nebius-core.js";
import { meteredEndpoint } from "../metered-spawn.js";

export default defineHarness({
  id: HARNESS.GROK,
  label: "Grok Build",

  async run(ctx: HarnessContext): Promise<HarnessResult> {
    const apiKey = await resolveNebiusApiKey({ apiKey: ctx.apiKey, home: ctx.home });
    if (!apiKey) {
      throw new Error("No Nebius API key found. Pass --api-key or set NEBIUS_API_KEY.");
    }

    const selectedModel = resolveCodexModel(ctx.main);
    const endpoint = await meteredEndpoint({
      agent: HARNESS.GROK,
      apiKey,
      baseUrl: resolveNebiusBaseUrl(),
      model: selectedModel.definition,
    });
    const baseUrl = endpoint.baseUrl;
    // Isolated, empty auth file: Grok must use the Nebius key we supply rather
    // than the user's own xAI login, and their real auth file stays untouched.
    const temporaryAuthDirectory = mkdtempSync(join(tmpdir(), "nconnect-grok-auth-"));
    const authPath = join(temporaryAuthDirectory, "no-auth.json");
    let catalogServer: Awaited<ReturnType<typeof startGrokModelCatalogServer>> | undefined;
    try {
      catalogServer = await startGrokModelCatalogServer(baseUrl);
      const args = [
        "--model",
        selectedModel.id,
        ...grokArgsWithNebiusIdentity(
          ctx.passthrough ?? [],
          buildGrokIdentityRule(selectedModel.definition),
        ),
      ];
      const env = buildGrokLaunchEnvironment({
        inheritedEnv: process.env,
        apiKey: endpoint.apiKey,
        authPath,
        baseUrl,
        modelsListUrl: catalogServer.modelsListUrl,
        selectedModel: selectedModel.definition,
      });

      if (process.env.NCONNECT_DEBUG === "1") {
        process.stderr.write(`[nconnect grok] model: ${selectedModel.id}\n`);
        process.stderr.write(`[nconnect grok] inference: ${baseUrl}\n`);
        process.stderr.write(`[nconnect grok] model catalog: ${catalogServer.modelsListUrl}\n`);
        process.stderr.write(`[nconnect grok] auth isolation: ${authPath}\n`);
      }

      process.stderr.write(
        `NConnect ▸ Launching Grok Build with Nebius Token Factory (${selectedModel.definition.name}). Not xAI.\n`,
      );
      const child = spawn("grok", args, { env, stdio: "inherit" });
      const result = await new Promise<{ status: number | null; signal: NodeJS.Signals | null }>(
        (resolve) => {
          child.on("error", (err) => {
            process.stderr.write(`NConnect ▸ Failed to launch grok: ${err.message}.\n`);
            resolve({ status: 1, signal: null });
          });
          child.on("exit", (status, signal) => resolve({ status, signal }));
        },
      );
      process.exitCode = typeof result.status === "number" ? result.status : result.signal ? 1 : 0;
    } finally {
      try {
        await endpoint.finish();
        await catalogServer?.close();
      } finally {
        rmSync(temporaryAuthDirectory, { recursive: true, force: true });
      }
    }
    return {};
  },
});
