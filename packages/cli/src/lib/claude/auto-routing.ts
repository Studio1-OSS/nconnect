import {
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

function requestedEffort(body: AnthropicMessagesRequest): string | undefined {
  // Claude Code 2.1.292 sends its effort level as `output_config.effort`.
  const value =
    body.output_config?.effort ?? body.reasoning_effort ?? body.effort ?? body.thinking?.effort;
  return typeof value === "string" ? value : undefined;
}

export function claudeAutoSignals(
  body: AnthropicMessagesRequest,
  isCompactionRequest = false,
): AutoSignals {
  let prompt = "";
  let toolErrors = 0;
  let planMarkerAt = -1;
  let planExitAt = -1;
  const planExitCalls = new Set<string>();

  (body.messages ?? []).forEach((message, index) => {
    const blocks = blocksOf(message.content);
    if (message.role === "assistant") {
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
    planMode: planMarkerAt > planExitAt,
    effort: requestedEffort(body),
    // A compaction request is a long summarising job with a long prompt. The
    // proxy rewrites that prompt before routing, so its own flag is the
    // reliable signal; the prompt check covers an untouched request.
    compaction: isCompactionRequest || isClaudeCompactionRequest(body),
  };
}

export function decideAutoTier(
  body: AnthropicMessagesRequest,
  isCompactionRequest = false,
): AutoDecision {
  return decideAuto(claudeAutoSignals(body, isCompactionRequest));
}
