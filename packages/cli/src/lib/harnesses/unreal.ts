import { resolveCodexModel } from "../codex/defaults.js";
import { extractCodexModelArg } from "../codex/launch-args.js";
import { runUnrealNebius } from "../unreal/core.js";
import { HARNESS } from "../harness.js";
import { defineHarness, type HarnessContext, type HarnessResult } from "../harness-types.js";
import { resolveNebiusApiKey, resolveNebiusBaseUrl } from "../nebius-core.js";
import { readAgentModelPreference, recordAgentModel } from "../model-preferences.js";

/** Resolve a model id, falling back to the catalog default if it is invalid. */
function resolveModelSafe(value: string | undefined) {
  try {
    return resolveCodexModel(value);
  } catch {
    return resolveCodexModel(undefined);
  }
}

export default defineHarness({
  id: HARNESS.UNREAL,
  label: "Unreal Agent",

  async run(ctx: HarnessContext): Promise<HarnessResult> {
    const apiKey = await resolveNebiusApiKey({
      apiKey: ctx.apiKey,
      home: ctx.home,
    });
    if (!apiKey) {
      throw new Error("No Nebius API key found. Pass --api-key or set NEBIUS_API_KEY.");
    }

    // Same precedence as Codex: explicit --model wins and is remembered,
    // otherwise the last model used for this tool, then the catalog default.
    const invocation = extractCodexModelArg(ctx.passthrough ?? []);
    const explicitModel = ctx.main ?? invocation.modelId;
    const selectedModel = explicitModel
      ? resolveCodexModel(explicitModel)
      : resolveModelSafe(await readAgentModelPreference("unreal"));
    if (explicitModel) {
      await recordAgentModel("unreal", selectedModel.id);
    }
    const result = await runUnrealNebius({
      apiKey,
      baseUrl: resolveNebiusBaseUrl(),
      modelId: selectedModel.id,
      args: invocation.args,
    });
    if (typeof result.status === "number") {
      process.exitCode = result.status;
    }
    return {};
  },
});
