import { findModelById, getDefaultModel } from "@nconnect/models";
import { resolveTargetModel } from "./translate-response.js";
import type { AnthropicMessagesRequest, ResolvedClaudeModel } from "./wire-types.js";

/**
 * Send Claude Code's background calls to a cheap model.
 *
 * Besides the user's turns, Claude Code makes calls of its own that never
 * appear in the conversation, and it sends them to a fixed tier rather than
 * the model the user picked:
 *
 * - **Auto-mode safety classifier.** In `--permission-mode auto`, every shell
 *   command is judged by a "monitor for autonomous AI coding agents" call that
 *   carries the session transcript as input. Claude Code sends it to the
 *   Sonnet tier - with NConnect's menu that is Kimi K3, the most expensive
 *   model offered - even when the session runs on GLM 5.3 Flash. Its input
 *   grows with the session, once per command.
 * - **Session title.** One call per session to the Haiku tier.
 *
 * Both are short, tool-less judgements that a fast model handles well, so
 * they go to `NCONNECT_BACKGROUND_MODEL` (default: the catalog default, GLM
 * 5.3 Flash). The model's own reasoning floor still applies - GLM 5.3 Flash
 * leaks `</think>` into its text with reasoning fully off, which a safety
 * verdict cannot afford. `NCONNECT_BACKGROUND_MODEL=off` restores Claude
 * Code's own choice. Every other request is untouched.
 *
 * Detection keys off the prompts Claude Code itself writes for these calls
 * (verified against Claude Code 2.1.289), plus their shape: no tools, and for
 * the classifier, not streamed.
 */

export const BACKGROUND_MODEL_ENV = "NCONNECT_BACKGROUND_MODEL";

export type ClaudeRequestKind = "auto_mode_classifier" | "session_title" | "standard";

export type ClaudeRequestRoute = {
  targetModel: ResolvedClaudeModel;
  kind: ClaudeRequestKind;
};

type ClaudeModelOptions = Parameters<typeof resolveTargetModel>[1];

const CLASSIFIER_SYSTEM_MARKER = "monitor for autonomous AI coding agents";
const CLASSIFIER_VERDICT_MARKERS = ["<block>yes", "<block>no"] as const;
/** Current wording (2.1.289+) and the earlier one, still sent by older Claude Code. */
const TITLE_SYSTEM_MARKERS = [
  "You are naming a coding session",
  "Generate a concise, sentence-case title",
] as const;

function systemText(system: AnthropicMessagesRequest["system"]): string {
  if (typeof system === "string") {
    return system;
  }
  return (system ?? []).map((block) => (block.type === "text" ? block.text : "")).join("\n");
}

export function classifyClaudeRequest(body: AnthropicMessagesRequest): ClaudeRequestKind {
  if (body.tools?.length) {
    return "standard";
  }
  const system = systemText(body.system);
  if (
    body.stream !== true &&
    (system.includes(CLASSIFIER_SYSTEM_MARKER) ||
      CLASSIFIER_VERDICT_MARKERS.every((marker) => system.includes(marker)))
  ) {
    return "auto_mode_classifier";
  }
  if (TITLE_SYSTEM_MARKERS.some((marker) => system.includes(marker))) {
    return "session_title";
  }
  return "standard";
}

/** The model background calls go to, or undefined when offloading is off. */
export function backgroundModel(
  env: NodeJS.ProcessEnv = process.env,
): ResolvedClaudeModel | undefined {
  const configured = env[BACKGROUND_MODEL_ENV]?.trim();
  if (configured && ["off", "false", "0", "none"].includes(configured.toLowerCase())) {
    return undefined;
  }
  // Unconfigured: the live catalog's default (which may differ from the pinned
  // DEFAULT_MODEL_ID when that model is absent), not a fixed id.
  const definition = configured ? findModelById(configured) : getDefaultModel();
  return definition ? { alias: definition.anthropicAlias ?? definition.id, definition } : undefined;
}

/**
 * Whether a request reflects the user's model choice, and so should be
 * remembered for the next launch. Background calls carry a fixed tier Claude
 * Code picked itself (the classifier asks for the Sonnet tier on every shell
 * command), so recording them would overwrite the user's pick - with the most
 * expensive model in the menu. True whether or not offloading is enabled.
 */
export function isUserModelChoice(body: AnthropicMessagesRequest): boolean {
  return classifyClaudeRequest(body) === "standard";
}

export function resolveClaudeRequestRoute(
  body: AnthropicMessagesRequest,
  options: ClaudeModelOptions,
  env: NodeJS.ProcessEnv = process.env,
): ClaudeRequestRoute {
  const requested = resolveTargetModel(body.model, options);
  const kind = classifyClaudeRequest(body);
  if (kind === "standard") {
    return { targetModel: requested, kind };
  }
  const background = backgroundModel(env);
  return { targetModel: background ?? requested, kind };
}
