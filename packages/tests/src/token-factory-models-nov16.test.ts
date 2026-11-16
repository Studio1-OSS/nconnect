import { describe, expect, test } from "vitest";
import {
  acceptsReasoningEffort,
  buildCatalog,
  DEFAULT_MODEL_ID,
  GPT_OSS_120B,
  INKLING_2_SMALL,
  NEMOTRON_3_NANO,
  noReasoningTemplateArgs,
  requiresSingleSystemMessage,
  resolveModelByKeys,
  SELECTABLE_MODELS,
  SNAPSHOT_CATALOG,
  type ModelDefinition,
} from "../../models/src/index.js";
import { nebiusReasoningEffort } from "../../cli/src/lib/claude/translate-request.js";
import type { AnthropicMessagesRequest } from "../../cli/src/lib/claude/wire-types.js";
import {
  EMPTY_CODEX_TOOL_TRANSLATION,
  resolveCodexRequestModel,
  toChatPayload,
} from "../../cli/src/lib/codex/translate-request.js";
import type { ResponsesRequest } from "../../cli/src/lib/codex/wire-types.js";

// Models added to Nebius Token Factory by 2026-11-16. Every quirk asserted here
// was measured against the live API that day.

const aliasAndId: ReadonlyArray<(model: ModelDefinition) => string | null | undefined> = [
  (model) => model.anthropicAlias,
  (model) => model.id,
];

const claudeEffort = (model: ModelDefinition, effort?: string) =>
  nebiusReasoningEffort(
    (effort ? { reasoning_effort: effort } : {}) as unknown as AnthropicMessagesRequest,
    model,
  );

const codexEffort = (model: ModelDefinition, effort?: string) => {
  const options = {
    modelId: model.id,
    targetModelId: model.id,
    modelName: model.name,
    modelDefinition: model,
  };
  const body = {
    model: model.id,
    input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "hi" }] }],
    ...(effort ? { reasoning: { effort } } : {}),
  } as unknown as ResponsesRequest;
  return toChatPayload(
    body,
    options,
    false,
    EMPTY_CODEX_TOOL_TRANSLATION,
    resolveCodexRequestModel(body, options),
    100,
  ).reasoning_effort;
};

describe("Nebius models added 2026-11-16", () => {
  const added: Array<[id: string, alias: string, name: string]> = [
    ["thinkingmachines/Inkling-2-Small", "nebius-inkling-2-small", "Inkling 2 Small"],
    ["nvidia/Nemotron-3-Ultra-550b-a55b", "nebius-nemotron-3-ultra", "Nemotron 3 Ultra"],
    ["nvidia/nemotron-3-super-120b-a12b", "nebius-nemotron-3-super", "Nemotron 3 Super"],
    ["nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B", "nebius-nemotron-3-nano", "Nemotron 3 Nano"],
    ["openai/gpt-oss-120b", "nebius-gpt-oss-120b", "gpt-oss 120B"],
    ["NousResearch/Hermes-4-405B", "nebius-hermes-4-405b", "Hermes 4 405B"],
    ["Qwen/Qwen3-235B-A22B-Instruct-2507", "nebius-qwen3-235b-instruct", "Qwen3 235B Instruct"],
    ["Qwen/Qwen3-30B-A3B-Instruct-2507", "nebius-qwen3-30b-instruct", "Qwen3 30B Instruct"],
  ];

  test.each(added)("%s is selectable by id and by its Claude alias", (id, alias, name) => {
    const model = SNAPSHOT_CATALOG.byId.get(id);
    expect(model?.name).toBe(name);
    expect(model?.tool_call).toBe(true);
    expect(resolveModelByKeys(SELECTABLE_MODELS, alias, aliasAndId, DEFAULT_MODEL_ID)?.id).toBe(id);
    expect(resolveModelByKeys(SELECTABLE_MODELS, id, aliasAndId, DEFAULT_MODEL_ID)?.id).toBe(id);
  });

  test("the embedding model Nebius added stays out of the chat catalog", () => {
    const live = buildCatalog([
      {
        id: "Qwen/Qwen3-Embedding-8B",
        architecture: { modality: "text->embedding" },
        pricing: { prompt: "0.00000001", completion: "0" },
      },
    ]);
    expect(live.byId.has("Qwen/Qwen3-Embedding-8B")).toBe(false);
  });

  test("Inkling 2 Small: images, 1M window, published prices, bundled", () => {
    expect(INKLING_2_SMALL.limit).toEqual({ context: 1_048_576, output: 131_072 });
    expect(INKLING_2_SMALL.attachment).toBe(true);
    expect(INKLING_2_SMALL.reasoning).toBe(true);
    expect(INKLING_2_SMALL.cost.input).toBeCloseTo(0.3);
    expect(INKLING_2_SMALL.cost.output).toBeCloseTo(1);
    expect(INKLING_2_SMALL.cost.cache_read).toBeCloseTo(0.06);
    // Bundled, so a catalog cached before Nebius listed it still offers it.
    expect(buildCatalog([]).byId.has(INKLING_2_SMALL.id)).toBe(true);
  });

  test("Inkling 2 Small still reasons at none, so none also sends thinking: false", () => {
    expect(acceptsReasoningEffort(INKLING_2_SMALL.id)).toBe(true);
    expect(claudeEffort(INKLING_2_SMALL, "none")).toBe("none");
    expect(noReasoningTemplateArgs(INKLING_2_SMALL.id, "none")).toEqual({ thinking: false });
    expect(noReasoningTemplateArgs(INKLING_2_SMALL.id, "high")).toEqual({});
    expect(claudeEffort(INKLING_2_SMALL, "max")).toBe("max");
  });

  test("gpt-oss 120B only ever gets low, medium or high", () => {
    expect(acceptsReasoningEffort(GPT_OSS_120B.id)).toBe(true);
    expect(claudeEffort(GPT_OSS_120B)).toBe("low");
    expect(claudeEffort(GPT_OSS_120B, "none")).toBe("low");
    expect(claudeEffort(GPT_OSS_120B, "medium")).toBe("medium");
    expect(claudeEffort(GPT_OSS_120B, "xhigh")).toBe("high");
    expect(claudeEffort(GPT_OSS_120B, "max")).toBe("high");
    for (const effort of [undefined, "none", "minimal", "low", "medium", "high", "xhigh", "max"]) {
      expect(["low", "medium", "high"]).toContain(codexEffort(GPT_OSS_120B, effort));
    }
  });

  test("Nemotron 3 Nano is raised from none to low, where it answers in content", () => {
    expect(acceptsReasoningEffort(NEMOTRON_3_NANO.id)).toBe(true);
    expect(claudeEffort(NEMOTRON_3_NANO)).toBe("low");
    expect(claudeEffort(NEMOTRON_3_NANO, "none")).toBe("low");
    expect(codexEffort(NEMOTRON_3_NANO, "none")).toBe("low");
    expect(claudeEffort(NEMOTRON_3_NANO, "max")).toBe("max");
  });

  test("Nemotron 3 Ultra and Super take every effort, none included", () => {
    for (const id of ["nvidia/Nemotron-3-Ultra-550b-a55b", "nvidia/nemotron-3-super-120b-a12b"]) {
      const model = SNAPSHOT_CATALOG.byId.get(id)!;
      expect(acceptsReasoningEffort(id)).toBe(true);
      expect(claudeEffort(model, "none")).toBe("none");
      expect(claudeEffort(model, "max")).toBe("max");
    }
  });

  test("models that do not reason are sent no effort", () => {
    for (const id of [
      "NousResearch/Hermes-4-405B",
      "Qwen/Qwen3-235B-A22B-Instruct-2507",
      "Qwen/Qwen3-30B-A3B-Instruct-2507",
    ]) {
      expect(acceptsReasoningEffort(id)).toBe(false);
      // Both Qwen3 Instruct templates accept a second system message.
      expect(requiresSingleSystemMessage(id)).toBe(false);
    }
  });
});
