import { describe, expect, test } from "vitest";
import { GLM_5_2, getDefaultModel } from "../../models/src/index.js";
import {
  backgroundModel,
  classifyClaudeRequest,
  isUserModelChoice,
  resolveClaudeRequestRoute,
} from "../../cli/src/lib/claude/request-routing.js";
import type { AnthropicMessagesRequest } from "../../cli/src/lib/claude/wire-types.js";

const session = {
  modelId: GLM_5_2.anthropicAlias ?? GLM_5_2.id,
  targetModelId: GLM_5_2.id,
  modelDefinition: GLM_5_2,
};

// Shapes captured from Claude Code 2.1.289 through NConnect.
const classifier: AnthropicMessagesRequest = {
  model: "nebius-kimi-k3",
  max_tokens: 2112,
  system:
    "You are a security monitor for autonomous AI coding agents.\n\nAnswer <block>yes</block> or <block>no</block>.",
  messages: [{ role: "user", content: "<transcript>…</transcript>" }],
};
const title: AnthropicMessagesRequest = {
  model: "nebius-kimi-k2-7-code",
  max_tokens: 32000,
  stream: true,
  system: [{ type: "text", text: "You are naming a coding session so the user can pick it out." }],
  messages: [{ role: "user", content: "<session>fix the bug</session>" }],
};
const mainTurn: AnthropicMessagesRequest = {
  model: "nebius-glm-5-2",
  max_tokens: 32000,
  stream: true,
  system: "You are an interactive agent that helps users with software engineering tasks.",
  tools: [{ name: "Bash", input_schema: { type: "object" } }],
  messages: [{ role: "user", content: "fix the bug" }],
};

describe("Claude background-call routing", () => {
  test("recognises the auto-mode classifier and the session title, and nothing else", () => {
    expect(classifyClaudeRequest(classifier)).toBe("auto_mode_classifier");
    expect(classifyClaudeRequest(title)).toBe("session_title");
    expect(classifyClaudeRequest(mainTurn)).toBe("standard");
    // A streamed, tool-less request mentioning the marker is not the classifier.
    expect(classifyClaudeRequest({ ...classifier, stream: true })).toBe("standard");
    // Anything carrying tools is a real turn, whatever its prompt says.
    expect(
      classifyClaudeRequest({ ...classifier, tools: [{ name: "Bash", input_schema: {} }] }),
    ).toBe("standard");
  });

  test("background calls go to the default cheap model; real turns keep their model", () => {
    const env = {};
    expect(resolveClaudeRequestRoute(classifier, session, env).targetModel.definition.id).toBe(
      getDefaultModel().id,
    );
    expect(resolveClaudeRequestRoute(title, session, env).targetModel.definition.id).toBe(
      getDefaultModel().id,
    );
    expect(resolveClaudeRequestRoute(mainTurn, session, env).targetModel.definition.id).toBe(
      GLM_5_2.id,
    );
  });

  test("NCONNECT_BACKGROUND_MODEL picks the model, or turns offloading off", () => {
    const pinned = { NCONNECT_BACKGROUND_MODEL: GLM_5_2.id };
    expect(resolveClaudeRequestRoute(classifier, session, pinned).targetModel.definition.id).toBe(
      GLM_5_2.id,
    );
    expect(backgroundModel({ NCONNECT_BACKGROUND_MODEL: "off" })).toBeUndefined();
    const off = resolveClaudeRequestRoute(classifier, session, {
      NCONNECT_BACKGROUND_MODEL: "off",
    });
    expect(off.kind).toBe("auto_mode_classifier");
    expect(off.targetModel.definition.id).not.toBe(getDefaultModel().id);
    // An unknown id falls back to Claude Code's own choice rather than failing.
    expect(backgroundModel({ NCONNECT_BACKGROUND_MODEL: "nope/not-a-model" })).toBeUndefined();
  });

  test("background calls never become the remembered model", () => {
    // The classifier asks for the Sonnet tier (Kimi K3) on every shell
    // command; recording it would make the next launch start on Kimi K3.
    expect(isUserModelChoice(classifier)).toBe(false);
    expect(isUserModelChoice(title)).toBe(false);
    expect(isUserModelChoice(mainTurn)).toBe(true);
  });

  test("unconfigured, the background model is the live catalog default", () => {
    expect(backgroundModel({})?.definition.id).toBe(getDefaultModel().id);
  });
});
