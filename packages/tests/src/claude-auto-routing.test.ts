import { describe, expect, test } from "vitest";
import { GLM_5_2, KIMI_K2_6, getDefaultModel } from "../../models/src/index.js";
import { decideAutoTier } from "../../cli/src/lib/claude/auto-routing.js";
import {
  AUTO_MODEL_ALIAS,
  AUTO_MODEL_ID,
  autoCandidates,
  autoModelSelection,
  getClaudeSupportedModels,
  isAutoModel,
  resolveClaudeModel,
} from "../../cli/src/lib/claude/defaults.js";
import { buildClaudeEnv, claudeTierModels } from "../../cli/src/lib/claude/core.js";
import { resolveClaudeRequestRoute } from "../../cli/src/lib/claude/request-routing.js";
import type {
  AnthropicMessage,
  AnthropicMessagesRequest,
} from "../../cli/src/lib/claude/wire-types.js";

const KIMI_K3_ID = "moonshotai/Kimi-K3";
const reminder = (text: string) => `<system-reminder>\n${text}\n</system-reminder>`;
const user = (text: string): AnthropicMessage => ({ role: "user", content: text });
const toolCall = (id: string, name = "Bash"): AnthropicMessage => ({
  role: "assistant",
  content: [{ type: "tool_use", id, name, input: {} }],
});
const toolResult = (id: string, isError = false, extraText?: string): AnthropicMessage => ({
  role: "user",
  content: [
    { type: "tool_result", tool_use_id: id, content: isError ? "failed" : "ok", is_error: isError },
    ...(extraText ? [{ type: "text" as const, text: extraText }] : []),
  ],
});
const decide = (messages: AnthropicMessage[], extra: Partial<AnthropicMessagesRequest> = {}) =>
  decideAutoTier({ model: AUTO_MODEL_ALIAS, messages, ...extra });

describe("auto routing rules", () => {
  test("routine work stays on the fast model", () => {
    for (const prompt of [
      "rename the foo variable to bar",
      "add a test for the parser",
      "run the tests and commit",
      "what does this function return?",
    ]) {
      expect(decide([user(prompt)]), prompt).toEqual({ tier: "fast", reason: "routine" });
    }
  });

  test("hard-task wording earns the strong model", () => {
    for (const prompt of [
      "Debug why the daemon dies on startup",
      "find the root cause of the flaky upload test",
      "there is a race condition in the session store",
      "Refactor the routing module into smaller pieces",
      "why does the proxy return 401 after a restart?",
      "plan the migration from sqlite to postgres",
    ]) {
      expect(decide([user(prompt)]), prompt).toEqual({ tier: "strong", reason: "hard_task" });
    }
  });

  test("asking for deep thinking earns the strong model", () => {
    expect(decide([user("ultrathink about this change")]).reason).toBe("deep_thinking");
    expect(decide([user("Think hard before you edit anything")]).reason).toBe("deep_thinking");
    // "think" on its own is ordinary speech.
    expect(decide([user("I think the button should be blue")]).tier).toBe("fast");
  });

  test("an explicit high effort earns the strong model", () => {
    expect(decide([user("tidy this up")], { effort: "high" })).toEqual({
      tier: "strong",
      reason: "high_effort",
    });
    expect(decide([user("tidy this up")], { effort: "low" }).tier).toBe("fast");
  });

  test("a long typed prompt earns the strong model, but injected context does not", () => {
    expect(decide([user(`Implement this spec. ${"detail ".repeat(600)}`)]).reason).toBe(
      "long_prompt",
    );
    // CLAUDE.md and friends arrive as reminders; they say nothing about the task.
    const injected: AnthropicMessage = {
      role: "user",
      content: [
        { type: "text", text: reminder(`Refactor notes. ${"context ".repeat(2000)}`) },
        { type: "text", text: "fix the typo in the readme" },
      ],
    };
    expect(decide([injected])).toEqual({ tier: "fast", reason: "routine" });
  });

  test("ignores the system-role messages Claude Code places in the conversation", () => {
    // Captured shape (Claude Code 2.1.292): ~10K characters of environment
    // text, which would otherwise read as a long, keyword-rich prompt.
    const environment = {
      role: "system",
      content: [
        { type: "text", text: `# Environment\nDebug and refactor notes. ${"x".repeat(9000)}` },
      ],
    } as unknown as AnthropicMessage;
    expect(decide([user("Reply with exactly: OK"), environment])).toEqual({
      tier: "fast",
      reason: "routine",
    });
  });

  test("reads the effort level where Claude Code sends it", () => {
    expect(decide([user("tidy this up")], { output_config: { effort: "high" } }).reason).toBe(
      "high_effort",
    );
    // Medium is Claude Code's default and must not escalate every request.
    expect(decide([user("tidy this up")], { output_config: { effort: "medium" } }).tier).toBe(
      "fast",
    );
  });

  test("the tool-calling turns of a task stay on the model its prompt was routed to", () => {
    const hard = [user("debug the failing login flow"), toolCall("a"), toolResult("a")];
    expect(decide(hard).tier).toBe("strong");
    expect(decide([...hard, toolCall("b"), toolResult("b")]).tier).toBe("strong");

    const easy = [user("list the files"), toolCall("a"), toolResult("a")];
    expect(decide(easy).tier).toBe("fast");
  });

  test("a new prompt starts a new task", () => {
    const history = [
      user("debug the failing login flow"),
      toolCall("a"),
      toolResult("a"),
      { role: "assistant", content: "Fixed." } as AnthropicMessage,
    ];
    expect(decide([...history, user("thanks, now bump the version")])).toEqual({
      tier: "fast",
      reason: "routine",
    });
  });

  test("repeated tool failures within a task escalate it", () => {
    const failing = [
      user("update the lockfile"),
      toolCall("a"),
      toolResult("a", true),
      toolCall("b"),
      toolResult("b", true),
    ];
    expect(decide(failing).tier).toBe("fast");
    const stuck = [...failing, toolCall("c"), toolResult("c", true)];
    expect(decide(stuck)).toEqual({ tier: "strong", reason: "stuck" });
    // The failures belonged to that task; the next prompt starts clean.
    expect(decide([...stuck, user("ok, skip that and format the file")]).tier).toBe("fast");
  });

  test("plan mode uses the strong model until the plan is approved", () => {
    const planning: AnthropicMessage[] = [
      {
        role: "user",
        content: [
          { type: "text", text: reminder("Plan mode is active. Do not edit files.") },
          { type: "text", text: "add a settings page" },
        ],
      },
    ];
    expect(decide(planning)).toEqual({ tier: "strong", reason: "plan_mode" });

    const rejected = [...planning, toolCall("exit1", "ExitPlanMode"), toolResult("exit1", true)];
    expect(decide(rejected).reason).toBe("plan_mode");

    const approved = [...planning, toolCall("exit2", "ExitPlanMode"), toolResult("exit2")];
    expect(decide(approved)).toEqual({ tier: "fast", reason: "routine" });

    // Claude Code 2.1.292 carries the notice in a system-role message instead.
    const viaSystem = [
      user("add a settings page"),
      {
        role: "system",
        content: [
          { type: "text", text: `# Environment\n${"x".repeat(5000)}\nPlan mode is active.` },
        ],
      } as unknown as AnthropicMessage,
    ];
    expect(decide(viaSystem)).toEqual({ tier: "strong", reason: "plan_mode" });

    // Entering plan mode again later counts again.
    const again = [
      ...approved,
      toolResult("x", false, reminder("Plan mode still active; keep planning.")),
    ];
    expect(decide(again).reason).toBe("plan_mode");
  });

  test("compaction is fast-model work even though its prompt is long", () => {
    const prompt = `CRITICAL: Respond with TEXT ONLY. Do NOT call any tools.
Your entire response must be plain text: an <analysis> block followed by a <summary> block.
Your task is to create a detailed summary of the conversation so far. ${"x".repeat(4000)}`;
    expect(decide([user("debug it"), user(prompt)])).toEqual({
      tier: "fast",
      reason: "compaction",
    });
    // The proxy rewrites that prompt before routing and passes its own flag.
    expect(decideAutoTier({ messages: [user(`refactor ${"x".repeat(4000)}`)] }, true).reason).toBe(
      "compaction",
    );
  });
});

describe("the Auto model", () => {
  const session = {
    modelId: AUTO_MODEL_ALIAS,
    targetModelId: AUTO_MODEL_ID,
    modelDefinition: autoModelSelection().definition,
  };

  test("is selectable by name without displacing a real model", () => {
    for (const name of ["auto", "Auto", AUTO_MODEL_ALIAS, AUTO_MODEL_ID]) {
      expect(isAutoModel(name), name).toBe(true);
      expect(resolveClaudeModel(name).definition.id).toBe(AUTO_MODEL_ID);
    }
    expect(isAutoModel("nebius-kimi-k3")).toBe(false);
    expect(isAutoModel(undefined)).toBe(false);
    // Not a Nebius model: it must never fill one of Claude Code's tiers.
    expect(getClaudeSupportedModels().some((m) => m.definition.id === AUTO_MODEL_ID)).toBe(false);
    for (const tier of Object.values(claudeTierModels(AUTO_MODEL_ALIAS))) {
      expect(tier.definition.id).not.toBe(AUTO_MODEL_ID);
    }
  });

  test("chooses between the default model and Kimi K3, and fits either", () => {
    const { fast, strong } = autoCandidates({});
    expect(fast.id).toBe(getDefaultModel().id);
    expect(strong.id).toBe(KIMI_K3_ID);
    const auto = autoModelSelection({}).definition;
    expect(auto.name).toBe("Auto");
    expect(auto.limit.context).toBe(Math.min(fast.limit.context, strong.limit.context));
    expect(auto.limit.output).toBe(Math.min(fast.limit.output, strong.limit.output));
  });

  test("the two models can be overridden", () => {
    const { fast, strong } = autoCandidates({
      NCONNECT_AUTO_FAST_MODEL: GLM_5_2.id,
      NCONNECT_AUTO_STRONG_MODEL: KIMI_K2_6.anthropicAlias ?? "",
    });
    expect(fast.id).toBe(GLM_5_2.id);
    expect(strong.id).toBe(KIMI_K2_6.id);
    // An unknown name falls back rather than breaking every request.
    expect(autoCandidates({ NCONNECT_AUTO_STRONG_MODEL: "nope/none" }).strong.id).toBe(KIMI_K3_ID);
  });

  test("a request for Auto is always routed to a real model", () => {
    const route = (body: AnthropicMessagesRequest) => resolveClaudeRequestRoute(body, session, {});
    const tools = [{ name: "Bash", input_schema: {} }];

    const easy = route({ model: AUTO_MODEL_ALIAS, tools, messages: [user("fix the typo")] });
    expect(easy.targetModel.definition.id).toBe(getDefaultModel().id);
    expect(easy.auto).toEqual({ tier: "fast", reason: "routine" });

    const hard = route({ model: AUTO_MODEL_ALIAS, tools, messages: [user("debug the crash")] });
    expect(hard.targetModel.definition.id).toBe(KIMI_K3_ID);
    expect(hard.auto?.tier).toBe("strong");

    // A model name the harness made up falls back to the session, which is
    // Auto. That is the harness's own call, not the user's task: fast model,
    // whatever its prompt says.
    const unknown = route({ model: "claude-unknown", tools, messages: [user("debug the crash")] });
    expect(unknown.targetModel.definition.id).toBe(getDefaultModel().id);
    expect(unknown.auto).toEqual({ tier: "fast", reason: "harness_call" });
  });

  test("an explicit model is never rerouted", () => {
    const route = resolveClaudeRequestRoute(
      { model: GLM_5_2.anthropicAlias ?? GLM_5_2.id, messages: [user("debug the crash")] },
      session,
      {},
    );
    expect(route.targetModel.definition.id).toBe(GLM_5_2.id);
    expect(route.auto).toBeUndefined();
  });

  test("background calls under Auto go to a real model with offloading on or off", () => {
    const title: AnthropicMessagesRequest = {
      model: AUTO_MODEL_ALIAS,
      stream: true,
      system: "You are naming a coding session so the user can pick it out.",
      messages: [user("<session>debug the crash</session>")],
    };
    const on = resolveClaudeRequestRoute(title, session, {});
    expect(on.targetModel.definition.id).toBe(getDefaultModel().id);
    const off = resolveClaudeRequestRoute(title, session, { NCONNECT_BACKGROUND_MODEL: "off" });
    expect(off.targetModel.definition.id).toBe(getDefaultModel().id);
    expect(off.targetModel.definition.id).not.toBe(AUTO_MODEL_ID);
  });

  test("launching with Auto selects it in Claude Code with the 1M hint", () => {
    const env = buildClaudeEnv({
      apiKey: "k",
      baseUrl: "https://example.test/v1",
      modelId: AUTO_MODEL_ALIAS,
      modelName: "Auto",
      proxyUrl: "http://127.0.0.1:7878/session/t",
      authToken: "tok",
    });
    expect(env.ANTHROPIC_MODEL).toBe(`${AUTO_MODEL_ALIAS}[1m]`);
    expect(env.ANTHROPIC_CUSTOM_MODEL_OPTION).toBe(AUTO_MODEL_ALIAS);
    expect(env.ANTHROPIC_CUSTOM_MODEL_OPTION_NAME).toBe("Auto");
    expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).not.toContain(AUTO_MODEL_ALIAS);
  });
});
