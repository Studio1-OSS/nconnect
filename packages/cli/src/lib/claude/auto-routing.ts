import type { ModelDefinition } from "@nconnect/models";
import { decidedDifficulty, type AutoDeciderConfig } from "../auto-decider.js";
import type { AutoSettings } from "../auto-model.js";
import {
  autoTargetModel,
  decideAuto,
  typedPromptText,
  type AutoDecision,
  type AutoSignals,
} from "../auto-routing.js";
import { isClaudeCompactionRequest } from "./compaction.js";
import type { AnthropicContentBlock, AnthropicMessagesRequest } from "./wire-types.js";

/**
 * Reads a Claude Code request for the shared Auto rules (../auto-routing.ts).
 * Claude Code is the one harness that reports failed tool calls explicitly
 * and says when it is in plan mode, so both are read exactly here.
 */

export type { AutoDecision, AutoTier } from "../auto-routing.js";

/** What Claude Code tells the model while plan mode is on (verified on 2.1.292). */
const PLAN_MODE_MARKERS = ["Plan mode is active", "Plan mode still active"] as const;
const PLAN_EXIT_TOOL = "ExitPlanMode";

function blocksOf(content: string | AnthropicContentBlock[]): AnthropicContentBlock[] {
  return typeof content === "string" ? [{ type: "text", text: content }] : content;
}

function hasPlanMarker(text: string): boolean {
  return PLAN_MODE_MARKERS.some((marker) => text.includes(marker));
}

/**
 * Effort levels that mean the user asked for more thought. "high" is not one
 * of them: it is what Claude Code sends on every request when the user has
 * set nothing at all (verified on 2.1.138, bundled with Claude Desktop, and
 * on 2.1.294, both with a fresh config). Counting it sent every Auto request
 * from a default install to the strong model. Only a level above that
 * default is a choice.
 */
const EFFORT_ABOVE_DEFAULT = new Set(["max", "xhigh"]);

function requestedEffort(body: AnthropicMessagesRequest): string | undefined {
  // Claude Code sends its effort level as `output_config.effort`.
  const value =
    body.output_config?.effort ?? body.reasoning_effort ?? body.effort ?? body.thinking?.effort;
  return typeof value === "string" && EFFORT_ABOVE_DEFAULT.has(value.toLowerCase())
    ? value
    : undefined;
}

export function claudeAutoSignals(
  body: AnthropicMessagesRequest,
  isCompactionRequest = false,
): AutoSignals {
  let prompt = "";
  let toolErrors = 0;
  let taskTurns = 0;
  let lastTurnFailed = false;
  let images = false;
  let chars = 0;
  const isImage = (block: unknown) => {
    const type = (block as { type?: unknown } | null)?.type;
    return type === "image" || type === "url";
  };
  let planMarkerAt = -1;
  let planExitAt = -1;
  const planExitCalls = new Set<string>();

  (body.messages ?? []).forEach((message, index) => {
    const blocks = blocksOf(message.content);
    if (message.role === "assistant") {
      taskTurns += 1;
      for (const block of blocks) {
        if (block.type === "tool_use" && block.name === PLAN_EXIT_TOOL) {
          planExitCalls.add(block.id);
        }
      }
      return;
    }
    // Claude Code also places `system`-role messages in the conversation:
    // environment details, thousands of characters long. They are never a
    // prompt, but since 2.1.292 they are where the plan-mode notice lives
    // (earlier versions attach it to the user turn as a reminder).
    if ((message.role as string) !== "user") {
      if (blocks.some((block) => block.type === "text" && hasPlanMarker(block.text))) {
        planMarkerAt = index;
      }
      return;
    }
    const typed = typedPromptText(
      blocks.map((block) => (block.type === "text" ? block.text : "")).join("\n"),
    );
    if (typed) {
      // A new prompt starts a new task: earlier failures belong to the last one.
      prompt = typed;
      toolErrors = 0;
      taskTurns = 0;
      lastTurnFailed = false;
      images = false;
    }
    // Images the task carries: pasted by the user, or returned by a tool
    // (Read on a screenshot).
    for (const block of blocks) {
      if (block.type === "text") {
        chars += block.text.length;
      } else if (isImage(block)) {
        images = true;
      } else if (block.type === "tool_result") {
        if (typeof block.content === "string") {
          chars += block.content.length;
        } else if (Array.isArray(block.content)) {
          for (const inner of block.content) {
            if (isImage(inner)) {
              images = true;
            } else if (typeof (inner as { text?: unknown })?.text === "string") {
              chars += (inner as { text: string }).text.length;
            }
          }
        }
      }
    }
    // A user turn that carries tool results reports on the assistant turn
    // before it; whether any of them failed is what the next turn inherits.
    if (blocks.some((block) => block.type === "tool_result")) {
      lastTurnFailed = blocks.some((block) => block.type === "tool_result" && block.is_error);
    }
    for (const block of blocks) {
      if (block.type === "text") {
        if (hasPlanMarker(block.text)) {
          planMarkerAt = index;
        }
      } else if (block.type === "tool_result") {
        if (block.is_error) {
          toolErrors += 1;
        } else if (planExitCalls.has(block.tool_use_id)) {
          // The user approved the plan; a rejected exit comes back as an error.
          planExitAt = index;
        }
      }
    }
  });

  return {
    prompt,
    toolErrors,
    taskTurns,
    lastTurnFailed,
    images,
    contextTokens: Math.ceil(chars / 4),
    planMode: planMarkerAt > planExitAt,
    effort: requestedEffort(body),
    // A compaction request is a long summarising job with a long prompt. The
    // proxy rewrites that prompt before routing, so its own flag is the
    // reliable signal; the prompt check covers an untouched request.
    compaction: isCompactionRequest || isClaudeCompactionRequest(body),
  };
}

/** A Claude Code request for Auto: the tier decision and the model it lands on. */
export function resolveClaudeAuto(
  body: AnthropicMessagesRequest,
  isCompactionRequest = false,
  decider?: AutoDeciderConfig,
  settings: AutoSettings = {},
): { auto: AutoDecision; model: ModelDefinition } {
  const signals = claudeAutoSignals(body, isCompactionRequest);
  const auto = decideAuto(
    { ...signals, difficulty: decidedDifficulty(decider, signals.prompt) },
    settings,
  );
  return { auto, model: autoTargetModel(auto, settings, signals) };
}

export function decideAutoTier(
  body: AnthropicMessagesRequest,
  isCompactionRequest = false,
  decider?: AutoDeciderConfig,
  settings: AutoSettings = {},
): AutoDecision {
  const signals = claudeAutoSignals(body, isCompactionRequest);
  return decideAuto(
    { ...signals, difficulty: decidedDifficulty(decider, signals.prompt) },
    settings,
  );
}
