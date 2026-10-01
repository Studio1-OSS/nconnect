/**
 * How much prior reasoning to replay on each turn.
 *
 * Every turn resends the conversation, and for a reasoning model that includes
 * the reasoning from earlier turns. On a long agentic session that is a large
 * and steadily growing share of the input tokens - which you pay for on every
 * subsequent turn. Some of it earns its keep (the model can follow its own
 * earlier chain); much of it is dead weight once a tool result has landed.
 *
 * - `full` (default): replay all prior reasoning, and let the model template
 *   keep it. Unchanged from previous releases.
 * - `interleaved`: replay prior reasoning but set `clear_thinking`, delegating
 *   active-turn retention to the model's own template.
 * - `off`: send no historical reasoning at all. Cheapest; the model sees only
 *   messages and tool results.
 *
 * Current-turn reasoning and live reasoning output are never affected.
 */

export const REASONING_HISTORY_ENV = "NCONNECT_REASONING_HISTORY";

export const REASONING_HISTORY_MODES = ["off", "interleaved", "full"] as const;

export type ReasoningHistoryMode = (typeof REASONING_HISTORY_MODES)[number];

/** `full` keeps the pre-existing behavior, so upgrading changes nothing. */
export const DEFAULT_REASONING_HISTORY_MODE: ReasoningHistoryMode = "full";

export function isReasoningHistoryMode(value: unknown): value is ReasoningHistoryMode {
  return REASONING_HISTORY_MODES.includes(value as ReasoningHistoryMode);
}

/**
 * Read the configured mode. Throws on an unrecognized value rather than
 * silently falling back: a typo here quietly changes what every turn costs.
 */
export function resolveReasoningHistoryMode(
  env: NodeJS.ProcessEnv = process.env,
): ReasoningHistoryMode {
  const raw = env[REASONING_HISTORY_ENV]?.trim();
  if (!raw) {
    return DEFAULT_REASONING_HISTORY_MODE;
  }
  const normalized = raw.toLowerCase();
  if (isReasoningHistoryMode(normalized)) {
    return normalized;
  }
  throw new Error(
    `${REASONING_HISTORY_ENV} must be one of: ${REASONING_HISTORY_MODES.join(", ")}. ` +
      `Received ${JSON.stringify(raw)}.`,
  );
}

export type ReasoningHistoryPolicy = {
  /** Whether prior turns' reasoning is replayed to the model. */
  includeHistoricalReasoning: boolean;
  /** Whether to ask the model template to drop retained thinking. */
  clearThinking: boolean;
};

export function reasoningHistoryPolicy(mode?: ReasoningHistoryMode): ReasoningHistoryPolicy {
  const effective = mode ?? DEFAULT_REASONING_HISTORY_MODE;
  return {
    includeHistoricalReasoning: effective !== "off",
    clearThinking: effective !== "full",
  };
}

/**
 * The policy in effect for this process, read from the environment.
 *
 * Prefer this over `reasoningHistoryPolicy()` with no argument: that returns
 * the DEFAULT policy and silently ignores the env var, which looks identical
 * at the call site and quietly disables the whole feature.
 */
export function currentReasoningHistoryPolicy(
  env: NodeJS.ProcessEnv = process.env,
): ReasoningHistoryPolicy {
  return reasoningHistoryPolicy(resolveReasoningHistoryMode(env));
}
