import type { ModelDefinition } from "@nconnect/models";
import { autoCandidates, type AutoCostTier, type AutoSettings } from "./auto-model.js";

/**
 * Per-task routing for the "Auto" model, shared by every harness.
 *
 * Auto runs each task on one of three models: a fast, cheap one for routine
 * work, a balanced one for work that takes some thought, and a strong one for
 * work that is hard to get right. The strong model costs about 20x the fast
 * one per token, so a bigger model has to be earned by a signal in the
 * request itself.
 *
 * A "task" is everything since the user's last typed prompt. The decision is
 * derived from that span of history, so the tool-calling turns that follow a
 * prompt stay on the tier the prompt earned without the daemon keeping any
 * state of its own. (Per-turn stepping, off by default, lets those follow-up
 * turns run one tier down - see decideAuto.)
 *
 * Each wire format has a small reader that turns a request into the same
 * `AutoSignals`; the decision itself is one function, checked in this order:
 * - A compaction goes to the fast model.
 * - The user asked for the strong model outright: plan mode (Claude Code
 *   only; others do not say), an effort level above the default, or a
 *   request to think hard.
 * - A decider read the prompt (auto-decider.ts): its difficulty reading
 *   picks the tier, with the cost tier sliding the thresholds.
 * - Otherwise keyword rules: a hard-work word (debug, refactor, migrate...)
 *   earns the strong model, a long prompt the balanced one.
 * - A task where tool calls keep failing escalates to the strong model.
 *
 * Auto also suggests a reasoning effort for the first turn of a harder task.
 */

export type AutoTier = "fast" | "balanced" | "strong";

export type AutoEffort = "low" | "medium" | "high";

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
    | "stuck"
    | "harness_call"
    | "decider_hard"
    | "decider_moderate"
    | "decider_routine";
  /** Reasoning effort Auto suggests for this request, where the model takes one. */
  effort?: AutoEffort;
  /** True when a follow-up turn runs a tier below the one its task was given. */
  steppedDown?: true;
};

/**
 * For a request that did not ask for Auto but landed on an Auto session
 * because it named a model Nebius does not serve. Those are the harness's own
 * background calls - Codex runs a memory agent as "gpt-5.4", Claude Desktop
 * asks for Claude model names - not the user's task. Their prompts are long
 * and full of words like "debug", so judging them by the task rules sends
 * every one to the strong model. They go to the fast model instead.
 */
export const AUTO_HARNESS_CALL: AutoDecision = { tier: "fast", reason: "harness_call" };

/** What a request says about the current task, whatever its wire format. */
export type AutoSignals = {
  /** The user's last typed prompt, without context the harness injected. */
  prompt: string;
  /** Failed tool calls since that prompt. */
  toolErrors: number;
  planMode?: boolean;
  /** Reasoning effort the request asks for, if any. */
  effort?: string | undefined;
  /** A history-summarising request: long by nature, and cheap-model work. */
  compaction?: boolean;
  /**
   * An optional decider's reading of the task, from 0 (routine) through 0.5
   * (moderate) to 1 (hard) - see auto-decider.ts. When present it replaces
   * the keyword and length guesses below.
   */
  difficulty?: number | undefined;
  /** Assistant turns already taken on this task; 0 on its first request. */
  taskTurns?: number | undefined;
  /** Whether the most recent tool results included a failure. */
  lastTurnFailed?: boolean | undefined;
};

/** Typed prompt length, in characters, past which a task counts as involved. */
export const AUTO_LONG_PROMPT_CHARS = 3_000;
/** Failed tool calls within one task that mark it as stuck. */
export const AUTO_STUCK_TOOL_ERRORS = 3;
/** Turns a task runs on its own tier before follow-ups may step down. */
export const AUTO_STEP_DOWN_AFTER_TURNS = 2;

/**
 * Where a decider's difficulty reading turns into a tier: below the first
 * number is fast, from the second up is strong, between them balanced. The
 * cost tier slides both lines - "low" asks for more evidence before paying
 * for a bigger model, "high" for less.
 */
export const AUTO_DIFFICULTY_THRESHOLDS: Record<AutoCostTier, readonly [number, number]> = {
  low: [0.45, 0.85],
  medium: [0.3, 0.7],
  high: [0.2, 0.5],
};

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

/** The tier a task earns, before per-turn stepping and effort are applied. */
function taskTier(signals: AutoSignals, costTier: AutoCostTier): AutoDecision {
  if (signals.planMode) {
    return { tier: "strong", reason: "plan_mode" };
  }
  const effort = signals.effort?.toLowerCase();
  if (effort && HIGH_EFFORTS.has(effort)) {
    return { tier: "strong", reason: "high_effort" };
  }
  if (DEEP_THINKING.test(signals.prompt)) {
    return { tier: "strong", reason: "deep_thinking" };
  }
  const stuck = signals.toolErrors >= AUTO_STUCK_TOOL_ERRORS;
  if (signals.difficulty !== undefined) {
    // A model read the prompt: trust it over keywords. A task that keeps
    // failing still escalates, whatever it looked like at the start.
    const [toBalanced, toStrong] = AUTO_DIFFICULTY_THRESHOLDS[costTier];
    if (signals.difficulty >= toStrong) {
      return { tier: "strong", reason: "decider_hard" };
    }
    if (stuck) {
      return { tier: "strong", reason: "stuck" };
    }
    return signals.difficulty >= toBalanced
      ? { tier: "balanced", reason: "decider_moderate" }
      : { tier: "fast", reason: "decider_routine" };
  }
  // Keyword rules. A hard-work keyword is the stronger hint; length alone is
  // weak evidence, so it earns the middle tier unless the user leans capable.
  if (HARD_TASK.test(signals.prompt)) {
    return { tier: costTier === "low" ? "balanced" : "strong", reason: "hard_task" };
  }
  if (stuck) {
    return { tier: "strong", reason: "stuck" };
  }
  if (signals.prompt.length >= AUTO_LONG_PROMPT_CHARS && costTier !== "low") {
    return { tier: costTier === "high" ? "strong" : "balanced", reason: "long_prompt" };
  }
  return { tier: "fast", reason: "routine" };
}

/** Reasons that are the user asking for the strong model outright. */
const USER_ASKED = new Set<AutoDecision["reason"]>(["plan_mode", "high_effort", "deep_thinking"]);

export function decideAuto(signals: AutoSignals, settings: AutoSettings = {}): AutoDecision {
  if (signals.compaction) {
    return { tier: "fast", reason: "compaction" };
  }
  const decision = taskTier(signals, settings.costTier ?? "medium");
  const firstTurn = (signals.taskTurns ?? 0) === 0;

  // Per-turn stepping (opt-in). A task's first turns - reading the problem and
  // planning - run on the tier it earned. Once it is under way and nothing is
  // failing, the follow-up turns are mostly carrying the plan out, so they
  // run one tier down. A failure on the last turn, a stuck task, or a user
  // who asked for the strong model outright keeps the task where it is.
  if (
    settings.perTurn === true &&
    decision.tier !== "fast" &&
    !USER_ASKED.has(decision.reason) &&
    decision.reason !== "stuck" &&
    (signals.taskTurns ?? 0) >= AUTO_STEP_DOWN_AFTER_TURNS &&
    signals.lastTurnFailed !== true
  ) {
    return {
      tier: decision.tier === "strong" ? "balanced" : "fast",
      reason: decision.reason,
      steppedDown: true,
    };
  }

  // Effort: more thought where the task is hard, and only on the turn that
  // reads the problem. Reasoning on every tool-calling turn is what makes a
  // session crawl, so follow-up turns keep the model's default.
  if (settings.effort !== false && firstTurn && decision.tier !== "fast") {
    const veryHard = USER_ASKED.has(decision.reason) || (signals.difficulty ?? 0) >= 0.9;
    return {
      ...decision,
      effort: decision.tier === "balanced" ? "low" : veryHard ? "high" : "medium",
    };
  }
  return decision;
}

/** The real model a decision lands on. */
export function autoTargetModel(
  decision: AutoDecision,
  settings: AutoSettings = {},
): ModelDefinition {
  return autoCandidates(settings)[decision.tier];
}

/**
 * Context a harness wraps around or beside the user's words: Claude Code's
 * reminders, Codex's environment and instruction blocks, and the like. It can
 * run to thousands of characters and says nothing about how hard the task is.
 */
const INJECTED_BLOCK =
  /<(system-reminder|environment_context|user_instructions|recommended_plugins|user_info|rules|permissions[ _]instructions|collaboration_mode|skills_instructions|turn_aborted|user_shell_command|subagent_notification|context|system|INSTRUCTIONS)\b[^>]*>[\s\S]*?<\/\1>/g;

/** Grok Build wraps the user's own words in this tag; the words are the prompt. */
const USER_QUERY = /<user_query>([\s\S]*?)<\/user_query>/g;

/** What the user typed, with injected context blocks removed. */
export function typedPromptText(text: string): string {
  return text.replace(INJECTED_BLOCK, "").replace(USER_QUERY, "$1").trim();
}

type ChatMessage = { role?: unknown; content?: unknown };

function chatText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((part) => {
      const text = (part as { text?: unknown } | null)?.text;
      return typeof text === "string" ? text : "";
    })
    .join("\n");
}

/**
 * Whether a tool result reports a failure. Chat completions has no error flag
 * on a tool message, so this reads the result itself: an exit code other than
 * zero where the harness reports one, otherwise text that opens as an error.
 * It is deliberately narrow - the word "error" somewhere in a file a tool
 * read is not a failed tool call.
 */
export function looksLikeToolError(content: string): boolean {
  const text = content.trim();
  if (!text) {
    return false;
  }
  const exit = text.match(/"?exit[_ ]?code"?\s*[:=]\s*(-?\d+)/i);
  if (exit) {
    return exit[1] !== "0";
  }
  return /^(?:\[?(?:tool_result )?error\]?\b|error:|failed\b|command failed|traceback \(most recent call last\))/i.test(
    text.slice(0, 200),
  );
}

/** Read an OpenAI chat-completions request (also what Codex is translated to). */
export function chatAutoSignals(body: {
  messages?: unknown;
  reasoning_effort?: unknown;
}): AutoSignals {
  let prompt = "";
  let toolErrors = 0;
  let taskTurns = 0;
  let lastTurnFailed = false;
  let inResults = false;
  const messages = Array.isArray(body.messages) ? (body.messages as ChatMessage[]) : [];
  for (const message of messages) {
    if (message?.role === "user") {
      const typed = typedPromptText(chatText(message.content));
      if (typed) {
        // A new prompt starts a new task: earlier failures belong to the last one.
        prompt = typed;
        toolErrors = 0;
        taskTurns = 0;
        lastTurnFailed = false;
      }
      inResults = false;
    } else if (message?.role === "assistant") {
      taskTurns += 1;
      inResults = false;
    } else if (message?.role === "tool") {
      // The results of one assistant turn arrive as a run of tool messages.
      if (!inResults) {
        lastTurnFailed = false;
        inResults = true;
      }
      if (looksLikeToolError(chatText(message.content))) {
        toolErrors += 1;
        lastTurnFailed = true;
      }
    }
  }
  return {
    prompt,
    toolErrors,
    taskTurns,
    lastTurnFailed,
    effort: typeof body.reasoning_effort === "string" ? body.reasoning_effort : undefined,
  };
}
