import { describe, expect, test } from "vitest";
import { GLM_5_2, getDefaultModel } from "../../models/src/index.js";
import { AUTO_MODEL_ID, autoModelDefinition } from "../../cli/src/lib/auto-model.js";
import {
  chatAutoSignals,
  decideAuto,
  looksLikeToolError,
  typedPromptText,
} from "../../cli/src/lib/auto-routing.js";
import { codexModelCatalog } from "../../cli/src/lib/codex/catalog.js";
import { resolveCodexRequestModel } from "../../cli/src/lib/codex/translate-request.js";
import type { ResponsesRequest } from "../../cli/src/lib/codex/wire-types.js";
import { resolveAutoRequest } from "../../cli/src/lib/daemon/chat-passthrough.js";
import { buildOpencodeConfigJson } from "../../cli/src/lib/opencode/core.js";

const KIMI_K3_ID = "moonshotai/Kimi-K3";
const FAST_ID = getDefaultModel().id;
const autoSession = { modelDefinition: autoModelDefinition() };
const plainSession = { modelDefinition: GLM_5_2 };
const decide = (messages: unknown[], extra: Record<string, unknown> = {}) =>
  decideAuto(chatAutoSignals({ messages, ...extra }));
const user = (content: unknown) => ({ role: "user", content });
const tool = (content: string) => ({ role: "tool", tool_call_id: "c", content });
const call = { role: "assistant", content: null, tool_calls: [{ id: "c" }] };

describe("auto routing for chat-completions harnesses", () => {
  test("routes on the user's words, as text or as content parts", () => {
    expect(decide([user("add a test for the parser")])).toEqual({
      tier: "fast",
      reason: "routine",
    });
    expect(decide([user("debug the failing login flow")]).reason).toBe("hard_task");
    expect(decide([user([{ type: "text", text: "find the root cause of this" }])]).tier).toBe(
      "strong",
    );
    expect(decide([user("ultrathink about the design")]).reason).toBe("deep_thinking");
    expect(decide([user("tidy up")], { reasoning_effort: "high" }).reason).toBe("high_effort");
    expect(
      decide([{ role: "system", content: "Debug and refactor. ".repeat(500) }, user("hi")]),
    ).toEqual({ tier: "fast", reason: "routine" });
  });

  test("ignores context a harness injects around the prompt", () => {
    // Shapes captured from Codex 2026-10 through NConnect.
    const plugins = user(
      `<recommended_plugins>\n${"debug refactor ".repeat(120)}\n</recommended_plugins>`,
    );
    const environment = user("<environment_context>\n  <cwd>/repo</cwd>\n</environment_context>");
    expect(decide([plugins, environment, user("Reply with exactly: OK")])).toEqual({
      tier: "fast",
      reason: "routine",
    });
    // An injected block after the prompt does not replace the prompt.
    expect(decide([user("debug the crash"), call, tool("ok"), environment]).tier).toBe("strong");
    expect(typedPromptText("<system-reminder>x</system-reminder>\nfix the typo")).toBe(
      "fix the typo",
    );
  });

  test("keeps a task on one model and starts over at the next prompt", () => {
    const hard = [user("investigate the memory leak"), call, tool("ok"), call, tool("ok")];
    expect(decide(hard).tier).toBe("strong");
    expect(
      decide([...hard, { role: "assistant", content: "Done." }, user("now bump the version")]),
    ).toEqual({ tier: "fast", reason: "routine" });
  });

  test("escalates a task whose tool calls keep failing", () => {
    const failing = (n: number) => [
      user("update the lockfile"),
      ...Array.from({ length: n }, () => [call, tool("Error: command not found")]).flat(),
    ];
    expect(decide(failing(2)).tier).toBe("fast");
    expect(decide(failing(3))).toEqual({ tier: "strong", reason: "stuck" });
  });

  test("recognises a failed tool call without treating file contents as one", () => {
    expect(looksLikeToolError('{"output":"boom","metadata":{"exit_code":1}}')).toBe(true);
    expect(looksLikeToolError('{"output":"fine","metadata":{"exit_code":0}}')).toBe(false);
    expect(looksLikeToolError("Exit code: 2\nnpm ERR!")).toBe(true);
    expect(looksLikeToolError("Error: ENOENT: no such file")).toBe(true);
    expect(looksLikeToolError("Traceback (most recent call last):\n  File")).toBe(true);
    expect(looksLikeToolError("[tool_result error]\nfailed")).toBe(true);
    // A file that merely mentions errors is a successful read.
    expect(looksLikeToolError("function handleError(error) {\n  throw new Error('x');\n}")).toBe(
      false,
    );
    expect(looksLikeToolError("")).toBe(false);
  });
});

describe("the passthrough used by Pi, Prime, Hermes, DeepSeek, Grok and OpenCode", () => {
  test("replaces Auto with the real model for the task and nothing else", () => {
    const body = {
      model: AUTO_MODEL_ID,
      stream: true,
      temperature: 0.2,
      messages: [user("fix the typo")],
    };
    const easy = resolveAutoRequest(body, autoSession);
    expect(easy.body).toEqual({ ...body, model: FAST_ID });
    expect(easy.auto).toEqual({ tier: "fast", reason: "routine" });
    // The harness's own body object is not mutated.
    expect(body.model).toBe(AUTO_MODEL_ID);

    const hard = resolveAutoRequest({ ...body, messages: [user("debug the crash")] }, autoSession);
    expect(hard.body.model).toBe(KIMI_K3_ID);
  });

  test("leaves a request for a real model untouched, even on an Auto session", () => {
    const body = { model: GLM_5_2.id, messages: [user("debug the crash")] };
    const routed = resolveAutoRequest(body, autoSession);
    expect(routed.body).toBe(body);
    expect(routed.auto).toBeUndefined();
    expect(resolveAutoRequest({ model: "auto-ish/other" }, plainSession).auto).toBeUndefined();
  });

  test("sends a harness's own call under an unknown model name to the fast model", () => {
    const routed = resolveAutoRequest(
      { model: "summarizer-internal", messages: [user("debug and refactor everything")] },
      autoSession,
    );
    expect(routed.body.model).toBe(FAST_ID);
    expect(routed.auto).toEqual({ tier: "fast", reason: "harness_call" });
  });
});

describe("Codex, ChatGPT Desktop and Unreal on Auto", () => {
  const options = {
    modelId: AUTO_MODEL_ID,
    targetModelId: AUTO_MODEL_ID,
    modelName: "Auto",
    modelDefinition: autoModelDefinition(),
  };
  const request = (text: string, extra: Partial<ResponsesRequest> = {}): ResponsesRequest =>
    ({
      model: AUTO_MODEL_ID,
      instructions: "You are Codex.",
      input: [{ type: "message", role: "user", content: [{ type: "input_text", text }] }],
      ...extra,
    }) as ResponsesRequest;

  test("routes each task to a real model", () => {
    const easy = resolveCodexRequestModel(request("Reply with exactly: OK"), options);
    expect(easy.targetModelId).toBe(FAST_ID);
    expect(easy.auto).toEqual({ tier: "fast", reason: "routine" });
    // What gets remembered for the next launch is Auto, not this task's model.
    expect(easy.requestedModelId).toBe(AUTO_MODEL_ID);

    const hard = resolveCodexRequestModel(request("Debug why the build hangs"), options);
    expect(hard.targetModelId).toBe(KIMI_K3_ID);
    expect(hard.definition.id).toBe(KIMI_K3_ID);

    const effort = resolveCodexRequestModel(
      request("tidy up", { reasoning: { effort: "high" } }),
      options,
    );
    expect(effort.auto?.reason).toBe("high_effort");
  });

  test("ignores the effort level from Unreal, which sends high on every request", () => {
    const unreal = { ...options, agent: "unreal" };
    const body = request("Reply with exactly: OK", { reasoning: { effort: "high" } });
    expect(resolveCodexRequestModel(body, unreal).auto).toEqual({
      tier: "fast",
      reason: "routine",
    });
    expect(resolveCodexRequestModel(request("Debug the crash"), unreal).targetModelId).toBe(
      KIMI_K3_ID,
    );
    // Codex sends what the user picked, so there it counts.
    expect(resolveCodexRequestModel(body, { ...options, agent: "codex" }).auto?.reason).toBe(
      "high_effort",
    );
  });

  test("sends Codex's own background agent to the fast model", () => {
    // Captured: Codex runs a memory agent as "gpt-5.4" with a long, keyword-rich prompt.
    const background = resolveCodexRequestModel(
      request("Debug, investigate and refactor the rollout summaries.", { model: "gpt-5.4" }),
      options,
    );
    expect(background.targetModelId).toBe(FAST_ID);
    expect(background.auto).toEqual({ tier: "fast", reason: "harness_call" });
  });

  test("does not touch a session that is not on Auto", () => {
    const pinned = resolveCodexRequestModel(request("Debug it", { model: GLM_5_2.id }), {
      ...options,
      modelId: GLM_5_2.id,
      targetModelId: GLM_5_2.id,
      modelDefinition: GLM_5_2,
    });
    expect(pinned.targetModelId).toBe(GLM_5_2.id);
    expect(pinned.auto).toBeUndefined();
  });

  test("offers Auto in the Codex picker, after the default", () => {
    const slugs = codexModelCatalog().models.map((model) => model.slug);
    expect(slugs[0]).toBe(FAST_ID);
    expect(slugs.filter((slug) => slug === AUTO_MODEL_ID)).toHaveLength(1);
  });
});

describe("OpenCode config", () => {
  test("talks to Nebius directly unless given the daemon route", () => {
    const direct = buildOpencodeConfigJson({}) as {
      provider: Record<string, { options: { baseURL: string } }>;
    };
    expect(direct.provider.nebius?.options.baseURL).toMatch(/^https:\/\//);
    const routed = buildOpencodeConfigJson({
      modelId: AUTO_MODEL_ID,
      baseUrl: "http://127.0.0.1:7878/session/t/v1",
    }) as { model: string; provider: Record<string, { options: { baseURL: string } }> };
    expect(routed.provider.nebius?.options.baseURL).toBe("http://127.0.0.1:7878/session/t/v1");
    expect(routed.model).toBe(`nebius/${AUTO_MODEL_ID}`);
  });
});
