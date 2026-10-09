import { beforeEach, describe, expect, test, vi } from "vitest";
import { GLM_5_2, getDefaultModel } from "../../models/src/index.js";
import {
  autoDeciderFromEnv,
  clearAutoDeciderCache,
  decidedDifficulty,
  primeAutoDecider,
  setAutoDeciderClock,
  type AutoDeciderConfig,
} from "../../cli/src/lib/auto-decider.js";
import { decideAuto } from "../../cli/src/lib/auto-routing.js";
import {
  AUTO_MODEL_ALIAS,
  AUTO_MODEL_ID,
  autoModelDefinition,
} from "../../cli/src/lib/auto-model.js";
import { resolveClaudeRequestRoute } from "../../cli/src/lib/claude/request-routing.js";
import {
  codexAutoPrompt,
  resolveCodexRequestModel,
} from "../../cli/src/lib/codex/translate-request.js";
import type { ResponsesRequest } from "../../cli/src/lib/codex/wire-types.js";
import { resolveAutoRequest } from "../../cli/src/lib/daemon/chat-passthrough.js";
import { buildSession } from "../../cli/src/lib/daemon/state.js";

const KIMI_K3_ID = "moonshotai/Kimi-K3";
const FAST_ID = getDefaultModel().id;
const context = { nebiusApiKey: "nebius-key", nebiusBaseUrl: "https://nebius.test/v1/" };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const nebiusAnswer = (a: number, b: number, c: number) =>
  json({
    choices: [
      {
        logprobs: {
          content: [
            {
              top_logprobs: [
                { token: "A", logprob: Math.log(a) },
                { token: " B", logprob: Math.log(b) },
                { token: "C", logprob: Math.log(c) },
                { token: "The", logprob: -20 },
              ],
            },
          ],
        },
      },
    ],
  });
const systemOneAnswer = (hard: number) =>
  json({
    answers: {
      tier: {
        choice: hard >= 0.5 ? "hard" : "routine",
        probabilities: { routine: 1 - hard, hard },
      },
    },
  });
// A prompt the keyword rules get wrong in each direction.
const HARD_NO_KEYWORD = "users get logged out randomly on mobile but not desktop";
const EASY_WITH_KEYWORD = "fix the typo in docs/debugging.md";

beforeEach(() => clearAutoDeciderCache());

describe("choosing a decider", () => {
  test("the default is the keyword rules", () => {
    expect(autoDeciderFromEnv({})).toEqual({});
    expect(autoDeciderFromEnv({ NCONNECT_AUTO_DECIDER: "rules" })).toEqual({});
  });

  test("reads each of the three, with their settings", () => {
    expect(autoDeciderFromEnv({ NCONNECT_AUTO_DECIDER: "nebius" }).config).toEqual({
      kind: "nebius",
    });
    expect(
      autoDeciderFromEnv({ NCONNECT_AUTO_DECIDER: "Jev", TYPESAFE_API_KEY: "ts-key" }).config,
    ).toEqual({ kind: "jev", apiKey: "ts-key" });
    expect(
      autoDeciderFromEnv({
        NCONNECT_AUTO_DECIDER: "laya",
        NCONNECT_AUTO_DECIDER_URL: "http://box:9000/v1/systemone",
        NCONNECT_AUTO_DECIDER_MODEL: "typed-decisions",
        NCONNECT_AUTO_DECIDER_TIMEOUT_MS: "800",
      }).config,
    ).toEqual({
      kind: "laya",
      url: "http://box:9000/v1/systemone",
      model: "typed-decisions",
      timeoutMs: 800,
    });
  });

  test("a choice that cannot work falls back to the rules and says why", () => {
    const noKey = autoDeciderFromEnv({ NCONNECT_AUTO_DECIDER: "jev" });
    expect(noKey.config).toBeUndefined();
    expect(noKey.problem).toMatch(/needs TYPESAFE_API_KEY/);
    expect(autoDeciderFromEnv({ NCONNECT_AUTO_DECIDER: "magic" }).problem).toMatch(/Unknown/);
  });
});

describe("asking each decider", () => {
  test("nebius: one token out, probability read from the token scores", async () => {
    const fetchImpl = vi.fn(async () => nebiusAnswer(0.1, 0.2, 0.7));
    const config: AutoDeciderConfig = { kind: "nebius" };
    await primeAutoDecider(config, HARD_NO_KEYWORD, { ...context, fetchImpl: fetchImpl as never });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://nebius.test/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer nebius-key");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ model: "google/gemma-3-27b-it", max_tokens: 1, logprobs: true });
    expect(body.messages[1].content).toBe(`Request: ${HARD_NO_KEYWORD}`);
    expect(body.messages[0].content).toContain("A, B or C");
    // Routine 0, moderate 0.5, hard 1, weighted by probability.
    expect(decidedDifficulty(config, HARD_NO_KEYWORD)).toBeCloseTo(0.5 * 0.2 + 0.7);
  });

  test("jev: a typed choice sent to TypeSafe with the user's key", async () => {
    const fetchImpl = vi.fn(async () => systemOneAnswer(0.97));
    const config: AutoDeciderConfig = { kind: "jev", apiKey: "ts-key" };
    await primeAutoDecider(config, HARD_NO_KEYWORD, { ...context, fetchImpl: fetchImpl as never });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.typesafe.ai/v1/systemone");
    // TypeSafe's key, never the Nebius one.
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer ts-key");
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("jev-latest");
    expect(body.state).toBe(`Request: ${HARD_NO_KEYWORD}`);
    expect(Object.keys(body.questions.tier.criteria)).toEqual(["routine", "moderate", "hard"]);
    expect(decidedDifficulty(config, HARD_NO_KEYWORD)).toBeCloseTo(0.97);
  });

  test("laya: the same question to a local server, with no key by default", async () => {
    const fetchImpl = vi.fn(async () => systemOneAnswer(0.2));
    const config: AutoDeciderConfig = { kind: "laya" };
    await primeAutoDecider(config, EASY_WITH_KEYWORD, {
      ...context,
      fetchImpl: fetchImpl as never,
    });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:8000/v1/systemone");
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    const body = JSON.parse(String(init.body));
    expect(body.state).toEqual({ body: `Request: ${EASY_WITH_KEYWORD}` });
    // Two options for Laya: with three it answers "moderate" to almost everything.
    expect(Object.keys(body.questions.tier.criteria)).toEqual(["routine", "hard"]);
    // Named explicitly: Laya's other checkpoints are much weaker at this.
    expect(body.model).toBe("typed-decisions");
    expect(decidedDifficulty(config, EASY_WITH_KEYWORD)).toBeCloseTo(0.2);
  });

  test("asks once per prompt, however many turns the task takes", async () => {
    const fetchImpl = vi.fn(async () => systemOneAnswer(0.9));
    const config: AutoDeciderConfig = { kind: "jev", apiKey: "k" };
    const ctx = { ...context, fetchImpl: fetchImpl as never };
    await Promise.all([
      primeAutoDecider(config, HARD_NO_KEYWORD, ctx),
      primeAutoDecider(config, HARD_NO_KEYWORD, ctx),
    ]);
    await primeAutoDecider(config, HARD_NO_KEYWORD, ctx);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await primeAutoDecider(config, "a different prompt", ctx);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test("a slow answer misses its first turn and is used from the next", async () => {
    const config: AutoDeciderConfig = { kind: "jev", apiKey: "k", timeoutMs: 20 };
    const slow = vi.fn(
      () =>
        new Promise<Response>((resolve) => setTimeout(() => resolve(systemOneAnswer(0.95)), 80)),
    );
    const ctx = { ...context, fetchImpl: slow as never };
    const started = Date.now();
    await primeAutoDecider(config, "slow", ctx);
    // The turn is not held up past the wait, and goes by the keyword rules.
    expect(Date.now() - started).toBeLessThan(70);
    expect(decidedDifficulty(config, "slow")).toBeUndefined();
    // A second turn arriving meanwhile does not start a second request.
    await primeAutoDecider(config, "slow", ctx);
    expect(slow).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(decidedDifficulty(config, "slow")).toBeCloseTo(0.95);
    await primeAutoDecider(config, "slow", ctx);
    expect(slow).toHaveBeenCalledTimes(1);
  });

  test("a request that never answers is abandoned, and a failing or unreadable one gives no answer", async () => {
    const config: AutoDeciderConfig = { kind: "jev", apiKey: "k", timeoutMs: 10 };
    const hang = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          );
        }),
    );
    await primeAutoDecider(config, "hung", {
      ...context,
      fetchImpl: hang as never,
      hardTimeoutMs: 40,
    });
    await new Promise((resolve) => setTimeout(resolve, 90));
    expect(decidedDifficulty(config, "hung")).toBeUndefined();
    // Recorded as "no answer": not asked again within the task.
    await primeAutoDecider(config, "hung", {
      ...context,
      fetchImpl: hang as never,
      hardTimeoutMs: 40,
    });
    expect(hang).toHaveBeenCalledTimes(1);

    const down = vi.fn(async () => json({ error: "nope" }, 503));
    await primeAutoDecider(config, "down", { ...context, fetchImpl: down as never });
    expect(decidedDifficulty(config, "down")).toBeUndefined();

    // A reasoning model that opens with prose instead of a letter.
    const prose = vi.fn(async () =>
      json({
        choices: [{ logprobs: { content: [{ top_logprobs: [{ token: "The", logprob: -0.1 }] }] } }],
      }),
    );
    await primeAutoDecider({ kind: "nebius" }, "prose", { ...context, fetchImpl: prose as never });
    expect(decidedDifficulty({ kind: "nebius" }, "prose")).toBeUndefined();
  });

  test("a failed answer is asked again later, a real answer is kept", async () => {
    const config: AutoDeciderConfig = { kind: "jev", apiKey: "k" };
    let time = 1_000_000;
    setAutoDeciderClock(() => time);
    const flaky = vi
      .fn()
      .mockImplementationOnce(async () => json({ error: "busy" }, 503))
      .mockImplementation(async () => systemOneAnswer(0.9));
    const ctx = { ...context, fetchImpl: flaky as never };
    await primeAutoDecider(config, "retry me", ctx);
    expect(decidedDifficulty(config, "retry me")).toBeUndefined();
    // Minutes later, still the same task: not asked again.
    time += 4 * 60_000;
    await primeAutoDecider(config, "retry me", ctx);
    expect(flaky).toHaveBeenCalledTimes(1);
    // Past the window: a new task with the same words gets a fresh answer.
    time += 2 * 60_000;
    await primeAutoDecider(config, "retry me", ctx);
    expect(flaky).toHaveBeenCalledTimes(2);
    expect(decidedDifficulty(config, "retry me")).toBeCloseTo(0.9);
    // A real answer does not expire.
    time += 24 * 60 * 60_000;
    await primeAutoDecider(config, "retry me", ctx);
    expect(flaky).toHaveBeenCalledTimes(2);
  });

  test("a dropped connection is retried once; a timeout or an HTTP error is not", async () => {
    const config: AutoDeciderConfig = { kind: "nebius" };
    const dropped = vi
      .fn()
      .mockImplementationOnce(async () => {
        throw new Error("The socket connection was closed unexpectedly.");
      })
      .mockImplementation(async () => nebiusAnswer(0.9, 0.05, 0.05));
    await primeAutoDecider(config, "stale socket", { ...context, fetchImpl: dropped as never });
    expect(dropped).toHaveBeenCalledTimes(2);
    expect(decidedDifficulty(config, "stale socket")).toBeCloseTo(0.075);

    const refused = vi.fn(async () => json({ error: "nope" }, 500));
    await primeAutoDecider(config, "server error", { ...context, fetchImpl: refused as never });
    expect(refused).toHaveBeenCalledTimes(1);

    const alwaysDropped = vi.fn(async () => {
      throw new Error("socket closed");
    });
    await primeAutoDecider(config, "still down", { ...context, fetchImpl: alwaysDropped as never });
    expect(alwaysDropped).toHaveBeenCalledTimes(2);
    expect(decidedDifficulty(config, "still down")).toBeUndefined();
  });

  test("a long prompt is clipped to its start and end", async () => {
    const fetchImpl = vi.fn(async () => systemOneAnswer(0.5));
    const long = `START ${"x".repeat(20_000)} END`;
    await primeAutoDecider({ kind: "jev", apiKey: "k" }, long, {
      ...context,
      fetchImpl: fetchImpl as never,
    });
    const state = JSON.parse(
      String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body),
    ).state as string;
    expect(state.length).toBeLessThan(6_200);
    expect(state).toContain("START");
    expect(state.endsWith("END")).toBe(true);
  });
});

describe("how a decider's answer is used", () => {
  const base = { prompt: "x", toolErrors: 0 };

  test("it replaces the keyword and length guesses", () => {
    expect(decideAuto({ ...base, prompt: HARD_NO_KEYWORD })).toEqual({
      tier: "fast",
      reason: "routine",
    });
    expect(decideAuto({ ...base, prompt: HARD_NO_KEYWORD, difficulty: 0.9 })).toMatchObject({
      tier: "strong",
      reason: "decider_hard",
    });
    expect(decideAuto({ ...base, prompt: HARD_NO_KEYWORD, difficulty: 0.5 })).toMatchObject({
      tier: "balanced",
      reason: "decider_moderate",
    });
    expect(decideAuto({ ...base, prompt: EASY_WITH_KEYWORD }).reason).toBe("hard_task");
    expect(decideAuto({ ...base, prompt: EASY_WITH_KEYWORD, difficulty: 0.02 })).toEqual({
      tier: "fast",
      reason: "decider_routine",
    });
    expect(decideAuto({ ...base, prompt: "y".repeat(5000), difficulty: 0.1 }).tier).toBe("fast");
  });

  test("the user's explicit signals and a stuck task still win", () => {
    expect(decideAuto({ ...base, difficulty: 0.01, planMode: true }).reason).toBe("plan_mode");
    expect(decideAuto({ ...base, difficulty: 0.01, effort: "max" }).reason).toBe("high_effort");
    expect(decideAuto({ ...base, prompt: "ultrathink", difficulty: 0.01 }).reason).toBe(
      "deep_thinking",
    );
    expect(decideAuto({ ...base, difficulty: 0.01, toolErrors: 3 }).reason).toBe("stuck");
    expect(decideAuto({ ...base, difficulty: 0.99, compaction: true }).reason).toBe("compaction");
  });

  test("no answer means the keyword rules decide, exactly as without a decider", () => {
    expect(decideAuto({ ...base, prompt: "debug the crash", difficulty: undefined }).reason).toBe(
      "hard_task",
    );
  });
});

describe("the decider in each request path", () => {
  const config: AutoDeciderConfig = { kind: "jev", apiKey: "k" };
  const prime = async (prompt: string, hard: number) =>
    primeAutoDecider(config, prompt, {
      ...context,
      fetchImpl: (async () => systemOneAnswer(hard)) as never,
    });
  const autoDef = autoModelDefinition();

  test("Claude Code", async () => {
    await prime(HARD_NO_KEYWORD, 0.95);
    const session = {
      modelId: AUTO_MODEL_ALIAS,
      targetModelId: AUTO_MODEL_ID,
      modelDefinition: autoDef,
    };
    const body = {
      model: AUTO_MODEL_ALIAS,
      tools: [{ name: "Bash" }],
      messages: [{ role: "user" as const, content: HARD_NO_KEYWORD }],
    };
    expect(
      resolveClaudeRequestRoute(body, { ...session, autoDecider: config }, {}).auto,
    ).toMatchObject({ tier: "strong", reason: "decider_hard" });
    // Without a decider on the session, the same request uses the rules.
    expect(resolveClaudeRequestRoute(body, session, {}).auto?.reason).toBe("routine");
  });

  test("Codex, ChatGPT Desktop and Unreal", async () => {
    const options = {
      modelId: AUTO_MODEL_ID,
      targetModelId: AUTO_MODEL_ID,
      modelName: "Auto",
      modelDefinition: autoDef,
      autoDecider: config,
    };
    const request = (text: string, model = AUTO_MODEL_ID) =>
      ({
        model,
        input: [{ type: "message", role: "user", content: [{ type: "input_text", text }] }],
      }) as ResponsesRequest;
    expect(codexAutoPrompt(request(HARD_NO_KEYWORD), options)).toBe(HARD_NO_KEYWORD);
    // The harness's own background agent is never shown to a decider.
    expect(codexAutoPrompt(request("anything", "gpt-5.4"), options)).toBeUndefined();
    expect(codexAutoPrompt(request("x", GLM_5_2.id), options)).toBeUndefined();

    await prime(HARD_NO_KEYWORD, 0.95);
    const routed = resolveCodexRequestModel(request(HARD_NO_KEYWORD), options);
    expect(routed.targetModelId).toBe(KIMI_K3_ID);
    expect(routed.auto?.reason).toBe("decider_hard");
  });

  test("the passthrough harnesses", async () => {
    await prime(EASY_WITH_KEYWORD, 0.03);
    const body = {
      model: AUTO_MODEL_ID,
      tools: [{ type: "function", function: { name: "bash" } }],
      messages: [{ role: "user", content: EASY_WITH_KEYWORD }],
    };
    const routed = resolveAutoRequest(body, { modelDefinition: autoDef, autoDecider: config });
    expect(routed.body.model).toBe(FAST_ID);
    expect(routed.auto).toEqual({ tier: "fast", reason: "decider_routine" });
    expect(resolveAutoRequest(body, { modelDefinition: autoDef }).body.model).toBe(KIMI_K3_ID);
  });

  test("a session carries the decider its launcher chose", () => {
    const registration = {
      token: "t",
      apiKey: "k",
      modelLabel: "Auto",
      modelId: AUTO_MODEL_ALIAS,
      targetModelId: AUTO_MODEL_ID,
      modelDefinition: autoDef,
      agent: "claude" as const,
    };
    const session = buildSession({ ...registration, autoDecider: { kind: "laya" } });
    expect(session.autoDecider).toEqual({ kind: "laya" });
    expect((session.options as { autoDecider?: unknown }).autoDecider).toEqual({ kind: "laya" });
    // Anything else in that field is ignored rather than trusted.
    expect(
      buildSession({ ...registration, autoDecider: { kind: "evil" } as never }).autoDecider,
    ).toBeUndefined();
    expect(buildSession(registration).autoDecider).toBeUndefined();
  });
});
