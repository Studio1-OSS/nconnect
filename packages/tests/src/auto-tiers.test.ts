import { describe, expect, test } from "vitest";
import { GLM_5_2, getDefaultModel } from "../../models/src/index.js";
import {
  AUTO_MODEL_ALIAS,
  AUTO_MODEL_ID,
  autoCandidates,
  autoModelDefinition,
  autoSettingsFromEnv,
  validAutoSettings,
} from "../../cli/src/lib/auto-model.js";
import { chatAutoSignals, decideAuto, type AutoSignals } from "../../cli/src/lib/auto-routing.js";
import { claudeAutoSignals } from "../../cli/src/lib/claude/auto-routing.js";
import {
  resolveClaudeRequestRoute,
  servedModelName,
} from "../../cli/src/lib/claude/request-routing.js";
import { nebiusReasoningEffort } from "../../cli/src/lib/claude/translate-request.js";
import {
  resolveCodexRequestModel,
  toChatPayload,
  EMPTY_CODEX_TOOL_TRANSLATION,
} from "../../cli/src/lib/codex/translate-request.js";
import type { ResponsesRequest } from "../../cli/src/lib/codex/wire-types.js";
import { resolveAutoRequest } from "../../cli/src/lib/daemon/chat-passthrough.js";
import { buildSession } from "../../cli/src/lib/daemon/state.js";
import { formatModelSplit } from "../../cli/src/lib/proxied-session.js";
import type { AnthropicMessage } from "../../cli/src/lib/claude/wire-types.js";

const FAST = getDefaultModel().id;
const BALANCED = "zai-org/GLM-5.3";
const STRONG = "moonshotai/Kimi-K3";
const base: AutoSignals = { prompt: "do the thing", toolErrors: 0 };

describe("three tiers", () => {
  test("a decider's reading picks fast, balanced or strong", () => {
    expect(decideAuto({ ...base, difficulty: 0.05 })).toEqual({
      tier: "fast",
      reason: "decider_routine",
    });
    expect(decideAuto({ ...base, difficulty: 0.5 })).toMatchObject({
      tier: "balanced",
      reason: "decider_moderate",
    });
    expect(decideAuto({ ...base, difficulty: 0.95 })).toMatchObject({
      tier: "strong",
      reason: "decider_hard",
    });
  });

  test("the keyword rules use the middle tier for weaker evidence", () => {
    expect(decideAuto({ ...base, prompt: "debug the crash" }).tier).toBe("strong");
    // Length alone says less than a hard-work word does.
    expect(decideAuto({ ...base, prompt: "x".repeat(4000) })).toMatchObject({
      tier: "balanced",
      reason: "long_prompt",
    });
    expect(decideAuto(base).tier).toBe("fast");
  });

  test("each tier lands on its own model", () => {
    const { fast, balanced, strong } = autoCandidates({});
    expect([fast.id, balanced.id, strong.id]).toEqual([FAST, BALANCED, STRONG]);
    const session = {
      modelId: AUTO_MODEL_ALIAS,
      targetModelId: AUTO_MODEL_ID,
      modelDefinition: autoModelDefinition({}),
    };
    const route = (text: string) =>
      resolveClaudeRequestRoute(
        {
          model: AUTO_MODEL_ALIAS,
          tools: [{ name: "Bash" }],
          messages: [{ role: "user", content: text }],
        },
        session,
        {},
      ).targetModel.definition.id;
    expect(route("fix the typo")).toBe(FAST);
    expect(route(`implement this spec ${"detail ".repeat(600)}`)).toBe(BALANCED);
    expect(route("debug the crash")).toBe(STRONG);
  });
});

describe("cost preference", () => {
  test("slides where a decider's reading changes tier", () => {
    const tier = (difficulty: number, costTier: "low" | "medium" | "high") =>
      decideAuto({ ...base, difficulty }, { costTier }).tier;
    // A plainly moderate task: balanced unless the user leans capable.
    expect([tier(0.5, "low"), tier(0.5, "medium"), tier(0.5, "high")]).toEqual([
      "balanced",
      "balanced",
      "strong",
    ]);
    // Fairly hard: only "low" holds out for more evidence.
    expect([tier(0.75, "low"), tier(0.75, "medium"), tier(0.75, "high")]).toEqual([
      "balanced",
      "strong",
      "strong",
    ]);
    // Slightly more than routine: only "high" pays for the middle tier.
    expect([tier(0.25, "low"), tier(0.25, "medium"), tier(0.25, "high")]).toEqual([
      "fast",
      "fast",
      "balanced",
    ]);
    // Unmistakably hard or routine: every setting agrees.
    expect(new Set([tier(1, "low"), tier(1, "medium"), tier(1, "high")])).toEqual(
      new Set(["strong"]),
    );
    expect(new Set([tier(0, "low"), tier(0, "medium"), tier(0, "high")])).toEqual(
      new Set(["fast"]),
    );
  });

  test("shifts the keyword rules the same way", () => {
    const keyword = { ...base, prompt: "refactor the parser" };
    const long = { ...base, prompt: "y".repeat(4000) };
    expect(decideAuto(keyword, { costTier: "low" }).tier).toBe("balanced");
    expect(decideAuto(keyword, { costTier: "high" }).tier).toBe("strong");
    expect(decideAuto(long, { costTier: "low" }).tier).toBe("fast");
    expect(decideAuto(long, { costTier: "high" }).tier).toBe("strong");
  });

  test("never overrides what the user asked for outright", () => {
    expect(decideAuto({ ...base, planMode: true, difficulty: 0 }, { costTier: "low" }).tier).toBe(
      "strong",
    );
    expect(decideAuto({ ...base, prompt: "ultrathink" }, { costTier: "low" }).tier).toBe("strong");
  });
});

describe("reasoning effort", () => {
  test("is suggested on the first turn of a harder task, by tier", () => {
    expect(decideAuto({ ...base, difficulty: 0.5 }).effort).toBe("low");
    expect(decideAuto({ ...base, difficulty: 0.75 }).effort).toBe("medium");
    expect(decideAuto({ ...base, difficulty: 0.95 }).effort).toBe("high");
    expect(decideAuto({ ...base, planMode: true }).effort).toBe("high");
    expect(decideAuto({ ...base, difficulty: 0.05 }).effort).toBeUndefined();
  });

  test("is left alone on follow-up turns, so the tool loop stays fast", () => {
    expect(decideAuto({ ...base, difficulty: 0.95, taskTurns: 1 })).toEqual({
      tier: "strong",
      reason: "decider_hard",
    });
  });

  test("can be switched off", () => {
    expect(decideAuto({ ...base, difficulty: 0.95 }, { effort: false }).effort).toBeUndefined();
  });

  test("reaches Claude Code requests on models that take an effort", () => {
    const k3 = autoCandidates({}).strong;
    const body = { messages: [{ role: "user" as const, content: "x" }] };
    expect(nebiusReasoningEffort(body, k3, "high")).toBe("high");
    // Without a suggestion the default is unchanged.
    expect(nebiusReasoningEffort(body, k3)).toBe(nebiusReasoningEffort(body, k3, undefined));
    // An explicit effort on the request still wins.
    expect(nebiusReasoningEffort({ ...body, effort: "low" }, k3, "high")).toBe("low");
  });

  test("reaches Codex requests, without overriding a user who chose high", () => {
    const options = {
      modelId: AUTO_MODEL_ID,
      targetModelId: AUTO_MODEL_ID,
      modelName: "Auto",
      modelDefinition: autoModelDefinition({}),
    };
    const request = (extra: Partial<ResponsesRequest> = {}) =>
      ({
        model: AUTO_MODEL_ID,
        input: [
          {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "debug the crash" }],
          },
        ],
        ...extra,
      }) as ResponsesRequest;
    const payload = (body: ResponsesRequest) =>
      toChatPayload(
        body,
        options,
        false,
        EMPTY_CODEX_TOOL_TRANSLATION,
        resolveCodexRequestModel(body, options),
        100,
      );
    expect(payload(request()).reasoning_effort).toBe("medium");
    expect(payload(request({ reasoning: { effort: "high" } })).reasoning_effort).toBe("max");
  });

  test("reaches passthrough harnesses only where they set none", () => {
    const session = { modelDefinition: autoModelDefinition({}) };
    const body = { model: AUTO_MODEL_ID, messages: [{ role: "user", content: "debug the crash" }] };
    expect(resolveAutoRequest(body, session).body).toMatchObject({
      model: STRONG,
      reasoning_effort: "medium",
    });
    expect(
      resolveAutoRequest({ ...body, reasoning_effort: "low" }, session).body.reasoning_effort,
    ).toBe("low");
    // A routine task gets no effort field at all.
    const easy = resolveAutoRequest(
      { ...body, messages: [{ role: "user", content: "fix the typo" }] },
      session,
    ).body;
    expect("reasoning_effort" in easy).toBe(false);
  });
});

describe("per-turn stepping (opt-in)", () => {
  const hard = { ...base, difficulty: 0.95 };

  test("is off by default: a task stays on the tier it earned", () => {
    expect(decideAuto({ ...hard, taskTurns: 6 }).tier).toBe("strong");
  });

  test("steps follow-up turns down one tier once the task is under way", () => {
    const on = { perTurn: true };
    expect(decideAuto({ ...hard, taskTurns: 0 }, on).tier).toBe("strong");
    expect(decideAuto({ ...hard, taskTurns: 1 }, on).tier).toBe("strong");
    expect(decideAuto({ ...hard, taskTurns: 2 }, on)).toEqual({
      tier: "balanced",
      reason: "decider_hard",
      steppedDown: true,
    });
    // One step only: a strong task never drops to the fast model.
    expect(decideAuto({ ...hard, taskTurns: 30 }, on).tier).toBe("balanced");
    expect(decideAuto({ ...base, difficulty: 0.5, taskTurns: 3 }, on).tier).toBe("fast");
  });

  test("goes back up when the last turn failed, and never steps a task the user pinned", () => {
    const on = { perTurn: true };
    expect(decideAuto({ ...hard, taskTurns: 4, lastTurnFailed: true }, on).tier).toBe("strong");
    expect(decideAuto({ ...base, planMode: true, taskTurns: 9 }, on).tier).toBe("strong");
    expect(decideAuto({ ...base, prompt: "think hard about it", taskTurns: 9 }, on).tier).toBe(
      "strong",
    );
    expect(decideAuto({ ...base, toolErrors: 3, taskTurns: 9 }, on)).toEqual({
      tier: "strong",
      reason: "stuck",
    });
  });

  test("the readers count turns and report the last turn's failures", () => {
    const call = { role: "assistant", content: null, tool_calls: [{ id: "c" }] };
    const chat = chatAutoSignals({
      messages: [
        { role: "user", content: "old task" },
        call,
        { role: "tool", content: "Error: nope" },
        { role: "user", content: "new task" },
        call,
        { role: "tool", content: "Error: boom" },
        call,
        { role: "tool", content: "ok" },
      ],
    });
    expect(chat).toMatchObject({
      prompt: "new task",
      taskTurns: 2,
      toolErrors: 1,
      lastTurnFailed: false,
    });

    const use = (id: string): AnthropicMessage => ({
      role: "assistant",
      content: [{ type: "tool_use", id, name: "Bash", input: {} }],
    });
    const result = (id: string, bad: boolean): AnthropicMessage => ({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: id, content: "x", is_error: bad }],
    });
    const claude = claudeAutoSignals({
      messages: [
        { role: "user", content: "task" },
        use("a"),
        result("a", false),
        use("b"),
        result("b", true),
      ],
    });
    expect(claude).toMatchObject({ taskTurns: 2, toolErrors: 1, lastTurnFailed: true });
  });
});

describe("showing what Auto picked", () => {
  const options = { modelId: AUTO_MODEL_ALIAS };
  const k3 = { alias: "nebius-kimi-k3", definition: autoCandidates({}).strong };

  test("a request for Auto is answered under the name of the model that ran", () => {
    expect(servedModelName({ model: AUTO_MODEL_ALIAS }, options, k3)).toBe("nebius-kimi-k3");
  });

  test("every other request keeps the name it asked for", () => {
    expect(servedModelName({ model: "nebius-glm-5-2" }, options, k3)).toBe("nebius-glm-5-2");
    // A harness's own call under a made-up name is not relabelled.
    expect(servedModelName({ model: "claude-haiku-4-5" }, options, k3)).toBe("claude-haiku-4-5");
  });

  test("Codex is told the real model too", () => {
    const codexOptions = {
      modelId: AUTO_MODEL_ID,
      targetModelId: AUTO_MODEL_ID,
      modelName: "Auto",
      modelDefinition: autoModelDefinition({}),
    };
    const body = {
      model: AUTO_MODEL_ID,
      input: [
        {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "debug the crash" }],
        },
      ],
    } as ResponsesRequest;
    expect(resolveCodexRequestModel(body, codexOptions).targetModelId).toBe(STRONG);
  });
});

describe("the end-of-session cost line", () => {
  test("names each model the session ran on, most expensive first", () => {
    expect(
      formatModelSplit([
        { model: FAST, costUsd: 0.0008 },
        { model: STRONG, costUsd: 0.0412 },
        { model: BALANCED, costUsd: 0.0031 },
      ]),
    ).toBe("[nconnect cost] by model: Kimi K3 $0.0412 · GLM 5.3 $0.0031 · GLM 5.3 Flash $0.0008");
  });

  test("says nothing for a session on a single model", () => {
    expect(formatModelSplit([{ model: FAST, costUsd: 0.01 }])).toBeUndefined();
    expect(formatModelSplit(undefined)).toBeUndefined();
  });
});

describe("Auto settings travel with the launch", () => {
  test("are read from the environment", () => {
    expect(autoSettingsFromEnv({})).toEqual({});
    expect(
      autoSettingsFromEnv({
        NCONNECT_AUTO_COST_TIER: "LOW",
        NCONNECT_AUTO_BALANCED_MODEL: GLM_5_2.id,
        NCONNECT_AUTO_EFFORT: "off",
        NCONNECT_AUTO_PER_TURN: "on",
      }),
    ).toEqual({ costTier: "low", balancedModel: GLM_5_2.id, effort: false, perTurn: true });
    // An unknown cost tier is ignored rather than guessed at.
    expect(autoSettingsFromEnv({ NCONNECT_AUTO_COST_TIER: "cheapest" })).toEqual({});
  });

  test("a session uses its launcher's settings, and ignores malformed ones", () => {
    const registration = {
      token: "t",
      apiKey: "k",
      modelLabel: "Auto",
      modelId: AUTO_MODEL_ALIAS,
      targetModelId: AUTO_MODEL_ID,
      modelDefinition: autoModelDefinition({}),
      agent: "claude" as const,
    };
    const session = buildSession({
      ...registration,
      autoSettings: { costTier: "high", perTurn: true },
    });
    expect(session.autoSettings).toEqual({ costTier: "high", perTurn: true });
    expect((session.options as { autoSettings?: unknown }).autoSettings).toEqual({
      costTier: "high",
      perTurn: true,
    });
    expect(validAutoSettings({ costTier: "free", effort: "yes", fastModel: 3 })).toBeUndefined();
    expect(validAutoSettings("high")).toBeUndefined();
  });
});
