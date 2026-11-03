import { describe, expect, test } from "vitest";
import {
  acceptsReasoningEffort,
  buildCatalog,
  DEEPSEEK_V4_1_FLASH_1017,
  findModelById,
  GLM_5_2,
  MINIMAX_M3_1_FLASH,
  maximumReasoningEffort,
  minimumReasoningEffort,
  NEMOTRON_3_5_SUPER_VL,
  QWEN_3_5_397B,
  QWEN_3_8_27B,
  REFLECTION_BEAM,
  requiresSingleSystemMessage,
  SELECTABLE_MODELS,
  VISION_MODELS,
} from "../../models/src/index.js";
import { CATALOG_SNAPSHOT } from "../../models/src/catalog-snapshot.js";
import { foldSystemMessages } from "../../cli/src/lib/system-messages.js";
import { CostTracker, hasPublishedCacheRead } from "../../cli/src/lib/cost.js";
import { formatUsageReport, summarizeUsage } from "../../cli/src/lib/usage-report.js";
import {
  nebiusReasoningEffort,
  toOpenAIMessages,
} from "../../cli/src/lib/claude/translate-request.js";
import type { AnthropicMessagesRequest } from "../../cli/src/lib/claude/wire-types.js";
import {
  EMPTY_CODEX_TOOL_TRANSLATION,
  resolveCodexRequestModel,
  toChatPayload,
} from "../../cli/src/lib/codex/translate-request.js";
import type { ResponsesRequest } from "../../cli/src/lib/codex/wire-types.js";

const body = {} as AnthropicMessagesRequest;
const KIMI_K3 = findModelById("moonshotai/Kimi-K3")!;

describe("the catalog lineup", () => {
  test("the new models have names and Claude aliases", () => {
    expect(DEEPSEEK_V4_1_FLASH_1017.anthropicAlias).toBe("nebius-deepseek-v4-1-flash-1017");
    expect(MINIMAX_M3_1_FLASH.anthropicAlias).toBe("nebius-minimax-m3-1-flash");
    expect(REFLECTION_BEAM.anthropicAlias).toBe("nebius-reflection-beam");
    expect(QWEN_3_8_27B.anthropicAlias).toBe("nebius-qwen-3-8-27b");
    expect(NEMOTRON_3_5_SUPER_VL.anthropicAlias).toBe("nebius-nemotron-3-5-super-vl");
    expect(REFLECTION_BEAM.limit.context).toBe(1_048_576);
    expect(REFLECTION_BEAM.limit.output).toBe(131_072);
    expect(QWEN_3_8_27B.limit.context).toBe(262_144);
  });

  test("the models Nebius retired are gone, even as bundled fallbacks", () => {
    const retired = ["deepseek-ai/DeepSeek-V4-Flash", "Qwen/Qwen2.5-VL-72B-Instruct"];
    const catalog = buildCatalog([]);
    for (const id of retired) {
      expect(catalog.byId.has(id)).toBe(false);
      expect(CATALOG_SNAPSHOT.some((row) => row.id === id)).toBe(false);
      expect(SELECTABLE_MODELS.some((model) => model.id === id)).toBe(false);
    }
  });

  test("the vision fallback after Kimi K2.6 is Nemotron 3.5 Super VL", () => {
    expect(VISION_MODELS.slice(0, 2).map((model) => model.id)).toEqual([
      "moonshotai/Kimi-K2.6",
      NEMOTRON_3_5_SUPER_VL.id,
    ]);
  });
});

describe("cached-input pricing", () => {
  test("the published rate is read per million tokens", () => {
    const catalog = buildCatalog([
      {
        id: "lab/cached",
        pricing: { prompt: "0.000001", input_cache_read: "0.0000002", completion: "0.000002" },
      },
    ]);
    expect(catalog.byId.get("lab/cached")?.cost.cache_read).toBeCloseTo(0.2);
  });

  test("a model with no published rate reports 0, so the cost tracker's fallback applies", () => {
    const catalog = buildCatalog([
      { id: "lab/unpriced", pricing: { prompt: "0.000001", input_cache_read: null } },
      { id: "lab/absent", pricing: { prompt: "0.000001" } },
    ]);
    expect(catalog.byId.get("lab/unpriced")?.cost.cache_read).toBe(0);
    expect(catalog.byId.get("lab/absent")?.cost.cache_read).toBe(0);
  });

  test("a published rate of 0 means free cached input, not an unknown rate", () => {
    const catalog = buildCatalog([
      { id: "lab/free-cache", pricing: { prompt: "0.000001", input_cache_read: "0" } },
      { id: "lab/unpriced", pricing: { prompt: "0.000001", input_cache_read: null } },
    ]);
    const free = catalog.byId.get("lab/free-cache")!;
    const unpriced = catalog.byId.get("lab/unpriced")!;
    expect(hasPublishedCacheRead(free)).toBe(true);
    expect(hasPublishedCacheRead(unpriced)).toBe(false);

    const tracker = new CostTracker(free);
    tracker.addUsage(10_000, 10_000, 0, free);
    expect(tracker.totals.costUsd).toBe(0);
  });

  test("the usage report warns only about cache hits priced by the fallback", () => {
    const row = (model: string) => ({
      model,
      sessions: 1,
      promptTokens: 1000,
      cachedTokens: 800,
      completionTokens: 10,
      costUsd: 0.01,
    });
    const report = (model: string) =>
      formatUsageReport(
        { ...summarizeUsage([], 0), sessions: 1, cachedTokens: 800, byModel: [row(model)] },
        "7d",
      );
    expect(report(REFLECTION_BEAM.name)).not.toContain("upper bound");
    expect(report("Auto")).toContain("upper bound");
  });

  test("the bundled snapshot carries cached rates", () => {
    expect(REFLECTION_BEAM.cost.cache_read).toBeCloseTo(0.05);
    expect(KIMI_K3.cost.cache_read).toBeCloseTo(0.3);
    expect(GLM_5_2.cost.cache_read).toBeCloseTo(0.14);
  });
});

describe("reasoning effort bounds", () => {
  test("Beam takes an effort and is raised off none, which it rejects", () => {
    expect(acceptsReasoningEffort(REFLECTION_BEAM.id)).toBe(true);
    expect(minimumReasoningEffort(REFLECTION_BEAM.id)).toBe("low");
    expect(maximumReasoningEffort(REFLECTION_BEAM.id)).toBeUndefined();
    expect(nebiusReasoningEffort(body, REFLECTION_BEAM)).toBe("low");
    expect(nebiusReasoningEffort(body, REFLECTION_BEAM, "max")).toBe("max");
  });

  test("Qwen 3.8 keeps none and sends xhigh in place of max, which it rejects", () => {
    expect(acceptsReasoningEffort(QWEN_3_8_27B.id)).toBe(true);
    expect(minimumReasoningEffort(QWEN_3_8_27B.id)).toBeUndefined();
    expect(nebiusReasoningEffort(body, QWEN_3_8_27B)).toBe("none");
    expect(nebiusReasoningEffort(body, QWEN_3_8_27B, "max")).toBe("xhigh");
  });

  test("DeepSeek V4.1 Flash 1017 runs at none: it holds up where 0731 did not", () => {
    expect(minimumReasoningEffort(DEEPSEEK_V4_1_FLASH_1017.id)).toBeUndefined();
    expect(nebiusReasoningEffort(body, DEEPSEEK_V4_1_FLASH_1017)).toBe("none");
  });
});

describe("models that take one system message", () => {
  test("foldSystemMessages moves every system message to the start, in order", () => {
    expect(
      foldSystemMessages([
        { role: "system", content: "one" },
        { role: "user", content: "hi" },
        { role: "system", content: "two" },
        { role: "assistant", content: "hello" },
        { role: "system", content: "  " },
        { role: "user", content: "bye" },
      ]),
    ).toEqual([
      { role: "system", content: "one\n\ntwo" },
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
      { role: "user", content: "bye" },
    ]);
  });

  test("foldSystemMessages leaves a single leading system message alone", () => {
    const messages = [
      { role: "system", content: "one" },
      { role: "user", content: "hi" },
    ];
    expect(foldSystemMessages(messages)).toBe(messages);
  });

  test("foldSystemMessages moves a lone system message that is not first", () => {
    expect(
      foldSystemMessages([
        { role: "user", content: "hi" },
        { role: "system", content: "one" },
      ]),
    ).toEqual([
      { role: "system", content: "one" },
      { role: "user", content: "hi" },
    ]);
  });

  test("foldSystemMessages drops system messages with no text", () => {
    expect(
      foldSystemMessages([
        { role: "user", content: "hi" },
        { role: "system", content: null },
      ]),
    ).toEqual([{ role: "user", content: "hi" }]);
  });

  // The shape Claude Code sends: its environment block is a system-role message
  // after the first user turn.
  const claudeBody = {
    system: "You are an agent.",
    messages: [
      { role: "user", content: "fix it" },
      { role: "system", content: "# Environment" },
      { role: "user", content: "go on" },
    ],
  } as unknown as AnthropicMessagesRequest;

  test("Claude Code requests fold for the Qwen models", () => {
    for (const model of [QWEN_3_5_397B, QWEN_3_8_27B]) {
      expect(requiresSingleSystemMessage(model.id)).toBe(true);
      const messages = toOpenAIMessages(claudeBody, model);
      expect(messages.map((message) => message.role)).toEqual(["system", "user", "user"]);
      expect(messages[0]?.content).toContain("You are an agent.");
      expect(messages[0]?.content).toContain("# Environment");
    }
  });

  test("other models keep the system message where Claude Code put it", () => {
    expect(requiresSingleSystemMessage(KIMI_K3.id)).toBe(false);
    expect(toOpenAIMessages(claudeBody, KIMI_K3).map((message) => message.role)).toEqual([
      "system",
      "user",
      "system",
      "user",
    ]);
  });

  const codexPayload = (id: string) => {
    const definition = findModelById(id)!;
    const options = {
      modelId: id,
      targetModelId: id,
      modelName: definition.name,
      modelDefinition: definition,
    };
    const request = {
      model: id,
      instructions: "You are Codex.",
      input: [{ role: "user", content: [{ type: "input_text", text: "hi" }] }],
    } as unknown as ResponsesRequest;
    return toChatPayload(
      request,
      options as never,
      false,
      EMPTY_CODEX_TOOL_TRANSLATION,
      resolveCodexRequestModel(request, options as never),
      100,
    ) as { messages: Array<{ role: string }> };
  };

  test("Codex requests fold for the Qwen models and no others", () => {
    expect(codexPayload(QWEN_3_8_27B.id).messages.map((m) => m.role)).toEqual(["system", "user"]);
    expect(codexPayload(KIMI_K3.id).messages.map((m) => m.role)).toEqual([
      "system",
      "system",
      "user",
    ]);
  });
});
