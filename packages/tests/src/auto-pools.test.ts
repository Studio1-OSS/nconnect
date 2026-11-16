import { describe, expect, test } from "vitest";
import { getDefaultModel } from "../../models/src/index.js";
import {
  AUTO_MODEL_ALIAS,
  AUTO_MODEL_ID,
  autoCandidates,
  autoModelDefinition,
  autoPools,
  autoSettingsFromEnv,
  pickAutoModel,
} from "../../cli/src/lib/auto-model.js";
import { chatAutoSignals } from "../../cli/src/lib/auto-routing.js";
import { claudeAutoSignals } from "../../cli/src/lib/claude/auto-routing.js";
import { resolveClaudeRequestRoute } from "../../cli/src/lib/claude/request-routing.js";
import { resolveAutoRequest } from "../../cli/src/lib/daemon/chat-passthrough.js";

const GLM_FLASH = getDefaultModel().id;
const GLM_53 = "zai-org/GLM-5.3";
const K3 = "moonshotai/Kimi-K3";
const ids = (pool: Array<{ id: string }>) => pool.map((model) => model.id);

describe("Auto's model pools", () => {
  test("each tier has one default model, and every one holds 1M tokens", () => {
    const pools = autoPools({});
    expect(ids(pools.fast)).toEqual([GLM_FLASH]);
    expect(ids(pools.balanced)).toEqual([GLM_53]);
    expect(ids(pools.strong)).toEqual([K3]);
    expect(autoCandidates({}).balanced.id).toBe(GLM_53);
    for (const pool of Object.values(pools)) {
      expect(pool[0]?.limit.context).toBeGreaterThanOrEqual(1_000_000);
    }
  });

  test("no default tier names a model Nebius has retired", () => {
    const retired = ["deepseek-ai/DeepSeek-V4-Flash-0731", "moonshotai/Kimi-K2.6"];
    for (const pool of Object.values(autoPools({}))) {
      expect(ids(pool).some((id) => retired.includes(id))).toBe(false);
    }
  });

  test("a tier takes a list of ids, aliases and wildcards, in the order given", () => {
    const pools = autoPools({ strongModel: `nebius-kimi-k3, ${GLM_53}`, fastModel: "*flash*" });
    expect(ids(pools.strong)).toEqual([K3, GLM_53]);
    expect(pools.fast.length).toBeGreaterThan(1);
    expect(pools.fast.every((model) => /flash/i.test(model.id))).toBe(true);
    // A wildcard is case-insensitive and can match on the provider.
    expect(
      ids(autoPools({ balancedModel: "MOONSHOTAI/*" }).balanced).every((id) =>
        id.startsWith("moonshotai/"),
      ),
    ).toBe(true);
  });

  test("a tier whose list matches nothing keeps its defaults", () => {
    expect(ids(autoPools({ balancedModel: "nope/none, also-*-nothing" }).balanced)).toEqual([
      GLM_53,
    ]);
  });

  test("the exclude list always wins, across every tier", () => {
    const pools = autoPools({ excludedModels: "zai-org/*" });
    for (const pool of Object.values(pools)) {
      expect(pool.some((model) => model.id.startsWith("zai-org/"))).toBe(false);
      expect(pool.length).toBeGreaterThan(0);
    }
    // Fast and balanced lose their only model, so they borrow from strong.
    expect(ids(pools.fast)).toEqual([K3]);
    expect(ids(pools.balanced)).toEqual([K3]);
    // Excluding everything still leaves a model to serve the request.
    expect(autoPools({ excludedModels: "*" }).fast[0]?.id).toBe(GLM_FLASH);
    // Excluding a tier's only model leaves it to borrow from its neighbour.
    expect(autoPools({ excludedModels: K3 }).strong[0]?.id).toBe(GLM_53);
  });

  test("the allow list narrows a tier, and is ignored where it would empty one", () => {
    const pools = autoPools({ allowModels: "moonshotai/*", balancedModel: "moonshotai/*" });
    expect(ids(pools.balanced).every((id) => id.startsWith("moonshotai/"))).toBe(true);
    expect(ids(pools.strong)).toEqual([K3]);
    // Nothing in the fast tier is from that provider: the allow list is
    // ignored there rather than leaving the tier with no model.
    expect(pools.fast[0]?.id).toBe(GLM_FLASH);
  });

  test("exclude beats allow", () => {
    const pools = autoPools({ allowModels: "moonshotai/*", excludedModels: K3 });
    expect(ids(pools.strong)).not.toContain(K3);
  });

  test("settings are read from the environment", () => {
    expect(
      autoSettingsFromEnv({
        NCONNECT_AUTO_MODELS: "moonshotai/*",
        NCONNECT_AUTO_EXCLUDED_MODELS: "*k2.6",
      }),
    ).toEqual({ allowModels: "moonshotai/*", excludedModels: "*k2.6" });
  });
});

describe("picking a model for what the request needs", () => {
  test("a task with images gets a model that can see", () => {
    // Fast and strong already see: nothing changes.
    expect(pickAutoModel("fast", {}).id).toBe(GLM_FLASH);
    expect(pickAutoModel("fast", {}, { vision: true }).id).toBe(GLM_FLASH);
    expect(pickAutoModel("strong", {}, { vision: true }).id).toBe(K3);
    // GLM 5.3 reads no images, so a balanced image task moves up to Kimi K3.
    expect(pickAutoModel("balanced", {}).id).toBe(GLM_53);
    expect(pickAutoModel("balanced", {}, { vision: true }).id).toBe(K3);
  });

  test("when nothing in the tier fits, it looks a tier up before settling", () => {
    // A balanced tier with only a text-only model: an image task goes up.
    expect(pickAutoModel("balanced", { balancedModel: GLM_53 }, { vision: true }).id).toBe(K3);
    // Nothing anywhere can: the tier's first choice, and the image is described.
    const textOnly = { fastModel: GLM_53, balancedModel: GLM_53, strongModel: GLM_53 };
    expect(pickAutoModel("balanced", textOnly, { vision: true }).id).toBe(GLM_53);
  });

  test("a conversation too large for a candidate skips it", () => {
    const settings = { balancedModel: "Qwen/Qwen3.8-27B, zai-org/GLM-5.3" };
    const small = autoPools(settings).balanced[0]?.limit.context ?? 0;
    expect(small).toBeLessThan(1_000_000);
    // Qwen 3.8's window is too small for this conversation; GLM 5.3's is not.
    expect(pickAutoModel("balanced", settings, { contextTokens: small + 1 }).id).toBe(GLM_53);
    expect(pickAutoModel("balanced", settings, { contextTokens: small - 1 }).id).toBe(
      "Qwen/Qwen3.8-27B",
    );
    // With images too, nothing in the tier fits, so it looks a tier up.
    expect(pickAutoModel("balanced", settings, { vision: true, contextTokens: small + 1 }).id).toBe(
      K3,
    );
  });
});

describe("the readers report what a task needs", () => {
  test("Claude Code: a pasted image, an image a tool returned, and none", () => {
    const image = {
      type: "image" as const,
      source: { type: "base64", media_type: "image/png", data: "A".repeat(50_000) },
    };
    const pasted = claudeAutoSignals({
      messages: [{ role: "user", content: [{ type: "text", text: "what is this?" }, image] }],
    });
    expect(pasted.images).toBe(true);
    // Image data is not counted as text.
    expect(pasted.contextTokens).toBeLessThan(100);
    const fromTool = claudeAutoSignals({
      messages: [
        { role: "user", content: "read shot.png" },
        { role: "assistant", content: [{ type: "tool_use", id: "t", name: "Read", input: {} }] },
        { role: "user", content: [{ type: "tool_result", tool_use_id: "t", content: [image] }] },
      ],
    });
    expect(fromTool.images).toBe(true);
    // An image in an earlier task does not make this one an image task.
    const later = claudeAutoSignals({
      messages: [
        { role: "user", content: [{ type: "text", text: "what is this?" }, image] },
        { role: "assistant", content: "A red circle." },
        { role: "user", content: "now rename foo to bar" },
      ],
    });
    expect(later.images).toBe(false);
  });

  test("chat-completions harnesses", () => {
    const withImage = chatAutoSignals({
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "what is this?" },
            { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
          ],
        },
      ],
    });
    expect(withImage.images).toBe(true);
    expect(
      chatAutoSignals({ messages: [{ role: "user", content: "x".repeat(4000) }] }),
    ).toMatchObject({
      images: false,
      contextTokens: 1000,
    });
  });
});

describe("end to end", () => {
  const session = {
    modelId: AUTO_MODEL_ALIAS,
    targetModelId: AUTO_MODEL_ID,
    modelDefinition: autoModelDefinition({}),
  };
  const image = {
    type: "image" as const,
    source: { type: "base64", media_type: "image/png", data: "AAAA" },
  };
  const moderate = `implement this spec ${"detail ".repeat(600)}`;

  test("Claude Code: an image task goes to a model that can see", () => {
    const route = (content: unknown, autoSettings = {}) =>
      resolveClaudeRequestRoute(
        {
          model: AUTO_MODEL_ALIAS,
          tools: [{ name: "Bash" }],
          messages: [{ role: "user", content: content as never }],
        },
        { ...session, autoSettings },
        {},
      );
    expect(route(moderate).targetModel.definition.id).toBe(GLM_53);
    const withImage = route([{ type: "text", text: moderate }, image]);
    expect(withImage.auto?.tier).toBe("balanced");
    // GLM 5.3 reads no images, so the task moves up to Kimi K3.
    expect(withImage.targetModel.definition.id).toBe(K3);
    expect(route("rename foo to bar").targetModel.definition.id).toBe(GLM_FLASH);
    const quickImage = route([{ type: "text", text: "rename foo to bar" }, image]);
    expect(quickImage.auto?.tier).toBe("fast");
    expect(quickImage.targetModel.definition.id).toBe(GLM_FLASH);
    // The user's own pool is honoured.
    expect(
      route(moderate, { balancedModel: "deepseek-ai/DeepSeek-V4-Pro-0813" }).targetModel.definition
        .id,
    ).toBe("deepseek-ai/DeepSeek-V4-Pro-0813");
    expect(
      route("debug the crash", { excludedModels: "moonshotai/*" }).targetModel.definition.id,
    ).not.toMatch(/^moonshotai\//);
  });

  test("passthrough harnesses pick from the pool too", () => {
    const body = {
      model: AUTO_MODEL_ID,
      tools: [{ type: "function", function: { name: "bash" } }],
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: moderate },
            { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
          ],
        },
      ],
    };
    expect(resolveAutoRequest(body, { modelDefinition: autoModelDefinition({}) }).body.model).toBe(
      K3,
    );
    expect(
      resolveAutoRequest(body, {
        modelDefinition: autoModelDefinition({}),
        autoSettings: { excludedModels: K3 },
      }).body.model,
    ).toBe(GLM_FLASH);
  });
});
