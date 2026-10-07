import { isClaudeCompactionRequest } from "./compaction.js";
import type { AnthropicContentBlock, AnthropicMessagesRequest } from "./wire-types.js";

/**
 * Per-task routing for the "Auto" model.
 *
 * Auto runs each task on one of two models: a fast, cheap one for routine
 * work and a strong one for work that needs it. The strong model costs about
 * 20x more per token, so it has to be earned by a signal in the request
 * itself. Everything is decided locally from the conversation Claude Code
 * already sends: no extra model call, no added latency, and the same request
 * always routes the same way.
 *
 * A "task" is everything since the user's last typed prompt. The decision is
 * derived from that span of history, so the tool-calling turns that follow a
 * prompt stay on the model the prompt was routed to - the model does not flip
 * mid-task - without the proxy keeping any state of its own.
 *
 * Signals that earn the strong model, checked in order:
 * - Claude Code is in plan mode.
 * - The request asks for high reasoning effort.
 * - The prompt asks for deep thinking ("ultrathink", "think hard").
 * - The prompt names work that is hard to get right: debugging, root-cause
 *   analysis, architecture, refactors, migrations, concurrency, security or
 *   performance work.
 * - The prompt is long, such as a pasted spec or stack trace.
 * - The task is stuck: several tool calls have failed since the prompt.
 */

export type AutoTier = "fast" | "strong";

export type AutoDecision = {
  tier: AutoTier;
  /** Short machine-readable cause, for debug logs and tests. */
  reason:
    | "routine"
    | "compaction"
    | "plan_mode"
    | "high_effort"
    | "deep_thinking"
    | "hard_task"
    | "long_prompt"
    | "stuck";
};

/** Typed prompt length, in characters, past which a task counts as hard. */
export const AUTO_LONG_PROMPT_CHARS = 3_000;
/** Failed tool calls within one task that mark it as stuck. */
export const AUTO_STUCK_TOOL_ERRORS = 3;

/** What Claude Code tells the model while plan mode is on (verified on 2.1.292). */
const PLAN_MODE_MARKERS = ["Plan mode is active", "Plan mode still active"] as const;
const PLAN_EXIT_TOOL = "ExitPlanMode";

const DEEP_THINKING =
  /\bultrathink\b|\bthink\s+(?:very\s+|really\s+|much\s+)?(?:hard(?:er)?|deep(?:ly|er)?|carefully|step[- ]by[- ]step)\b/i;

const HARD_TASK = new RegExp(
  [
    String.raw`\broot[- ]cause`,
    String.raw`\bdebug(?:ging)?\b`,
    String.raw`\bdiagnos(?:e|is|ing)\b`,
    String.raw`\binvestigat(?:e|ing|ion)\b`,
    String.raw`\bfigure\s+out\b`,
    String.raw`\bwhy\s+(?:is|are|does|do|did|isn't|doesn't|won't|can't)\b`,
    String.raw`\brace\s+condition`,
    String.raw`\bdeadlock`,
    String.raw`\bmemory\s+leak`,
    String.raw`\bconcurren(?:cy|t)\b`,
    String.raw`\bflaky\b`,
    String.raw`\barchitect(?:ure|ural)?\b`,
    String.raw`\bredesign\b`,
    String.raw`\brefactor(?:ing)?\b`,
    String.raw`\bmigrat(?:e|ion|ing)\b`,
    String.raw`\btrade-?offs?\b`,
    String.raw`\bsecurity\s+(?:audit|review|issue|hole|vulnerabilit)`,
    String.raw`\bvulnerabilit(?:y|ies)\b`,
    String.raw`\bperformance\s+(?:regression|bottleneck|problem|issue)`,
    String.raw`\boptimi[sz](?:e|ation|ing)\b`,
    String.raw`\balgorithm`,
  ].join("|"),
  "i",
);

const HIGH_EFFORTS = new Set(["high", "max", "xhigh"]);

const REMINDER_SPAN = /<system-reminder>[\s\S]*?<\/system-reminder>/g;

function blocksOf(content: string | AnthropicContentBlock[]): AnthropicContentBlock[] {
  return typeof content === "string" ? [{ type: "text", text: content }] : content;
}

/** What the user typed in a message: its text with Claude Code's reminders removed. */
function typedText(blocks: readonly AnthropicContentBlock[]): string {
  return blocks
    .map((block) => (block.type === "text" ? block.text.replace(REMINDER_SPAN, "") : ""))
    .join("\n")
    .trim();
}

function hasPlanMarker(text: string): boolean {
  return PLAN_MODE_MARKERS.some((marker) => text.includes(marker));
}

function requestedEffort(body: AnthropicMessagesRequest): string | undefined {
  // Claude Code 2.1.292 sends its effort level as `output_config.effort`.
  const value =
    body.output_config?.effort ?? body.reasoning_effort ?? body.effort ?? body.thinking?.effort;
  return typeof value === "string" ? value.toLowerCase() : undefined;
}

export function decideAutoTier(
  body: AnthropicMessagesRequest,
  isCompactionRequest = false,
): AutoDecision {
  // A compaction request is a long summarising job with a long prompt; it is
  // exactly what the cheap model is for, so settle it before the size check.
  // The proxy rewrites the compaction prompt before routing, so its own flag
  // is the reliable signal; the prompt check covers an untouched request.
  if (isCompactionRequest || isClaudeCompactionRequest(body)) {
    return { tier: "fast", reason: "compaction" };
  }

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
    const typed = typedText(blocks);
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

  if (planMarkerAt > planExitAt) {
    return { tier: "strong", reason: "plan_mode" };
  }
  const effort = requestedEffort(body);
  if (effort && HIGH_EFFORTS.has(effort)) {
    return { tier: "strong", reason: "high_effort" };
  }
  if (DEEP_THINKING.test(prompt)) {
    return { tier: "strong", reason: "deep_thinking" };
  }
  if (HARD_TASK.test(prompt)) {
    return { tier: "strong", reason: "hard_task" };
  }
  if (prompt.length >= AUTO_LONG_PROMPT_CHARS) {
    return { tier: "strong", reason: "long_prompt" };
  }
  if (toolErrors >= AUTO_STUCK_TOOL_ERRORS) {
    return { tier: "strong", reason: "stuck" };
  }
  return { tier: "fast", reason: "routine" };
}
