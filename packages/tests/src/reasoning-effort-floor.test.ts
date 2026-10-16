import { describe, expect, test } from "vitest";
import {
  acceptsReasoningEffort,
  findModelById,
  getDefaultModel,
  maximumReasoningEffort,
  minimumReasoningEffort,
  MUSE_SPARK_OPEN,
  noReasoningTemplateArgs,
} from "../../models/src/index.js";
import { nebiusReasoningEffort } from "../../cli/src/lib/claude/translate-request.js";
import type { AnthropicMessagesRequest } from "../../cli/src/lib/claude/wire-types.js";
import {
  EMPTY_CODEX_TOOL_TRANSLATION,
  resolveCodexRequestModel,
  toChatPayload,
} from "../../cli/src/lib/codex/translate-request.js";
import type { ResponsesRequest } from "../../cli/src/lib/codex/wire-types.js";

const FLASH = "zai-org/GLM-5.3-Flash";
const body = {} as AnthropicMessagesRequest;

/**
 * GLM 5.3 Flash still reasons at `reasoning_effort: "none"` but does not route
 * it to `reasoning_content` - it emits the whole chain-of-thought into
 * `content`, ending with a stray `</think>`. Since "none" is our default
 * effort, making this model the default meant every Claude reply began with
 * the model's private reasoning. Measured live before the fix:
 *   content: "The user wants me to say exactly ...</think>HELLO"
 */
describe("reasoning-effort floor", () => {
  test("the default model declares a floor above none", () => {
    expect(minimumReasoningEffort(FLASH)).toBe("low");
    expect(getDefaultModel().id).toBe(FLASH);
  });

  test("GLM 5.3 ignores none, so it is raised to low, which does stop it", () => {
    expect(acceptsReasoningEffort("zai-org/GLM-5.3")).toBe(true);
    expect(minimumReasoningEffort("zai-org/GLM-5.3")).toBe("low");
  });

  test("DeepSeek V4 Flash 0731 degenerates at none, so it is raised to low", () => {
    const id = "deepseek-ai/DeepSeek-V4-Flash-0731";
    expect(acceptsReasoningEffort(id)).toBe(true);
    expect(minimumReasoningEffort(id)).toBe("low");
  });

  test("Kimi K2.6 turns reasoning off through its template at effort none", () => {
    expect(noReasoningTemplateArgs("moonshotai/Kimi-K2.6", "none")).toEqual({ thinking: false });
    expect(noReasoningTemplateArgs("moonshotai/Kimi-K2.6", "high")).toEqual({});
    expect(noReasoningTemplateArgs("moonshotai/Kimi-K3", "none")).toEqual({});
  });

  test("models without the quirk are unconstrained", () => {
    expect(minimumReasoningEffort("moonshotai/Kimi-K3")).toBeUndefined();
    expect(minimumReasoningEffort("zai-org/GLM-5.2")).toBeUndefined();
  });

  test("the default effort is raised to the floor for the affected model", () => {
    const flash = findModelById(FLASH);
    expect(flash).toBeDefined();
    expect(acceptsReasoningEffort(FLASH)).toBe(true);
    // Our default is "none", which is exactly what leaks.
    expect(nebiusReasoningEffort(body, flash!)).toBe("low");
  });

  test("an explicit none is also raised, since the leak is the same either way", () => {
    const flash = findModelById(FLASH)!;
    const explicit = { reasoning_effort: "none" } as unknown as AnthropicMessagesRequest;
    expect(nebiusReasoningEffort(explicit, flash)).toBe("low");
  });

  test("higher efforts pass through untouched", () => {
    const flash = findModelById(FLASH)!;
    for (const effort of ["low", "medium", "max"]) {
      const req = { reasoning_effort: effort } as unknown as AnthropicMessagesRequest;
      expect(nebiusReasoningEffort(req, flash)).toBe(effort);
    }
  });

  test("an unaffected model still gets the fast none default", () => {
    const k3 = findModelById("moonshotai/Kimi-K3");
    expect(k3).toBeDefined();
    expect(nebiusReasoningEffort(body, k3!)).toBe("none");
  });
});

/**
 * Muse Spark Open answers both "none" and "max" with a 400: "Unsupported
 * reasoning_effort ... Expected one of: low, medium, high, xhigh". Measured on
 * Nebius, 2026-10-16. "none" is our default and "max" is what a raised effort
 * becomes, so without bounds both the default and the deepest setting fail.
 */
describe("Muse Spark Open effort bounds", () => {
  const MUSE = MUSE_SPARK_OPEN.id;

  test("takes an effort, floored at low and capped at xhigh", () => {
    expect(MUSE).toBe("meta-models/muse-spark-open");
    expect(acceptsReasoningEffort(MUSE)).toBe(true);
    expect(minimumReasoningEffort(MUSE)).toBe("low");
    expect(maximumReasoningEffort(MUSE)).toBe("xhigh");
    expect(maximumReasoningEffort("moonshotai/Kimi-K3")).toBeUndefined();
  });

  test("Claude Code requests never send none or max", () => {
    const at = (effort?: string) =>
      nebiusReasoningEffort(
        (effort ? { reasoning_effort: effort } : {}) as unknown as AnthropicMessagesRequest,
        MUSE_SPARK_OPEN,
      );
    expect(at()).toBe("low");
    expect(at("none")).toBe("low");
    expect(at("medium")).toBe("medium");
    expect(at("max")).toBe("xhigh");
    expect(at("xhigh")).toBe("xhigh");
    expect(nebiusReasoningEffort({} as AnthropicMessagesRequest, MUSE_SPARK_OPEN, "max")).toBe(
      "xhigh",
    );
  });

  test("Codex requests never send none or max", () => {
    const options = {
      modelId: MUSE,
      targetModelId: MUSE,
      modelName: MUSE_SPARK_OPEN.name,
      modelDefinition: MUSE_SPARK_OPEN,
    };
    const effortFor = (effort?: string) => {
      const body = {
        model: MUSE,
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
    expect(effortFor()).toBe("low");
    expect(effortFor("none")).toBe("low");
    expect(effortFor("high")).toBe("xhigh");
    expect(effortFor("xhigh")).toBe("xhigh");
  });

  test("other models keep max", () => {
    const k3 = findModelById("moonshotai/Kimi-K3")!;
    const req = { reasoning_effort: "max" } as unknown as AnthropicMessagesRequest;
    expect(nebiusReasoningEffort(req, k3)).toBe("max");
  });
});
