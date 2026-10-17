import { describe, expect, test } from "vitest";
import {
  DEFAULT_REASONING_HISTORY_MODE,
  REASONING_HISTORY_ENV,
  currentReasoningHistoryPolicy,
  reasoningHistoryPolicy,
  resolveReasoningHistoryMode,
} from "../../cli/src/lib/reasoning-history.js";
import {
  NO_REASONING_RECORDED,
  toOpenAIMessages,
} from "../../cli/src/lib/claude/translate-request.js";
import type { ModelDefinition } from "@nconnect/models";
import type { AnthropicMessagesRequest } from "../../cli/src/lib/claude/wire-types.js";

const env = (mode: string) => ({ [REASONING_HISTORY_ENV]: mode });

describe("reasoning history mode", () => {
  // Upgrading must not silently change what any turn costs.
  test("defaults to full, preserving previous behavior", () => {
    expect(resolveReasoningHistoryMode({})).toBe("full");
    expect(DEFAULT_REASONING_HISTORY_MODE).toBe("full");
    expect(currentReasoningHistoryPolicy({})).toEqual({
      includeHistoricalReasoning: true,
      clearThinking: false,
    });
  });

  test("each mode maps to its documented policy", () => {
    expect(currentReasoningHistoryPolicy(env("full"))).toEqual({
      includeHistoricalReasoning: true,
      clearThinking: false,
    });
    expect(currentReasoningHistoryPolicy(env("interleaved"))).toEqual({
      includeHistoricalReasoning: true,
      clearThinking: true,
    });
    expect(currentReasoningHistoryPolicy(env("off"))).toEqual({
      includeHistoricalReasoning: false,
      clearThinking: true,
    });
  });

  test("case and whitespace are tolerated", () => {
    expect(resolveReasoningHistoryMode(env("  OFF  "))).toBe("off");
  });

  // A typo would quietly change spend on every turn, so fail loudly instead.
  test("an unrecognized value throws rather than falling back", () => {
    expect(() => resolveReasoningHistoryMode(env("ful"))).toThrow(/must be one of/);
    expect(() => resolveReasoningHistoryMode(env("none"))).toThrow(REASONING_HISTORY_ENV);
  });

  // The no-argument form returns the DEFAULT, not the environment's mode -
  // easy to reach for by mistake, and it would disable the feature silently.
  test("the explicit-mode form ignores the environment by design", () => {
    expect(reasoningHistoryPolicy("off").includeHistoricalReasoning).toBe(false);
    expect(reasoningHistoryPolicy().includeHistoricalReasoning).toBe(true);
  });
});

describe("what Claude actually sends", () => {
  const body = {
    model: "x",
    messages: [
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "PRIOR-REASONING" },
          { type: "text", text: "answer" },
        ],
      },
      { role: "user", content: "next" },
    ],
  } as unknown as AnthropicMessagesRequest;

  const replays = (mode?: Parameters<typeof toOpenAIMessages>[2]): boolean =>
    JSON.stringify(toOpenAIMessages(body, undefined, mode)).includes("PRIOR-REASONING");

  test("full and interleaved replay prior reasoning; off drops it", () => {
    expect(replays("full")).toBe(true);
    expect(replays("interleaved")).toBe(true);
    expect(replays("off")).toBe(false);
  });

  test("the current turn's own content always survives", () => {
    const sent = JSON.stringify(toOpenAIMessages(body, undefined, "off"));
    expect(sent).toContain("answer");
    expect(sent).toContain("next");
  });
});

// Reflection Beam refuses a request when any earlier assistant turn lacks reasoning. Under Auto a
// task can start on another model and escalate to Beam, so some turns carry none of Beam's own.
describe("models that require reasoning on every assistant turn", () => {
  const beam = { id: "reflection/beam", name: "Beam" } as unknown as ModelDefinition;
  const other = { id: "moonshotai/Kimi-K2.6", name: "Kimi K2.6" } as unknown as ModelDefinition;
  const mixed = {
    model: "x",
    messages: [
      { role: "user", content: "fix the bug" },
      // A turn another model produced: a tool call and no thinking block.
      {
        role: "assistant",
        content: [{ type: "tool_use", id: "t1", name: "Read", input: { path: "a.py" } }],
      },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "print(1)" }] },
      // A turn Beam produced, with its own reasoning.
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "BEAM-OWN" },
          { type: "text", text: "done" },
        ],
      },
      { role: "user", content: "thanks" },
    ],
  } as unknown as AnthropicMessagesRequest;
  const assistants = (target: ModelDefinition, mode?: Parameters<typeof toOpenAIMessages>[2]) =>
    toOpenAIMessages(mixed, target, mode).filter((m) => m.role === "assistant") as Array<{
      reasoning_content?: string;
    }>;

  test("a turn with no reasoning is labelled, not left empty and not invented", () => {
    const [foreign, own] = assistants(beam);
    expect(foreign.reasoning_content).toBe(NO_REASONING_RECORDED);
    expect(own.reasoning_content).toBe("BEAM-OWN");
  });

  test("Beam's own reasoning is sent even when history reasoning is off", () => {
    expect(assistants(beam, "off")[1].reasoning_content).toBe("BEAM-OWN");
  });

  test("other models are unchanged", () => {
    const [foreign, own] = assistants(other);
    expect(foreign.reasoning_content).toBeUndefined();
    expect(own.reasoning_content).toBe("BEAM-OWN");
    expect(assistants(other, "off")[1].reasoning_content).toBeUndefined();
  });

  test("user and tool messages never get a label", () => {
    const labelled = toOpenAIMessages(mixed, beam).filter(
      (m) => (m as { reasoning_content?: string }).reasoning_content,
    );
    expect(labelled.every((m) => m.role === "assistant")).toBe(true);
  });
});
