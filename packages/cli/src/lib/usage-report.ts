import { createSessionStore, type TrackedUsageSession } from "./daemon/storage.js";
import { CACHE_READ_RATIO_ENV, cacheReadRatio } from "./cost.js";

/**
 * Local spend reporting for `nconnect usage`.
 *
 * Everything here reads the session store the daemon already writes on your own
 * machine - no telemetry, no server call. Cost figures are the ones the proxy
 * metered per turn against the live Nebius catalog's per-token rates, so they
 * reconcile with the per-session cost banner printed when a session exits.
 */

export type UsageBreakdown = {
  sessions: number;
  promptTokens: number;
  cachedTokens: number;
  completionTokens: number;
  costUsd: number;
};

export type UsageSummary = UsageBreakdown & {
  since: number;
  /** How many of these sessions are still running (their spend can still grow). */
  activeSessions: number;
  byModel: Array<UsageBreakdown & { model: string }>;
  byHarness: Array<UsageBreakdown & { agent: string }>;
};

const EMPTY: UsageBreakdown = {
  sessions: 0,
  promptTokens: 0,
  cachedTokens: 0,
  completionTokens: 0,
  costUsd: 0,
};

function add(into: UsageBreakdown, session: TrackedUsageSession): UsageBreakdown {
  return {
    sessions: into.sessions + 1,
    promptTokens: into.promptTokens + session.promptTokens,
    cachedTokens: into.cachedTokens + session.cachedTokens,
    completionTokens: into.completionTokens + session.completionTokens,
    costUsd: into.costUsd + session.costUsd,
  };
}

/** Aggregate sessions into totals plus per-model and per-harness rows. */
export function summarizeUsage(
  sessions: readonly TrackedUsageSession[],
  since: number,
): UsageSummary {
  let totals: UsageBreakdown = { ...EMPTY };
  const models = new Map<string, UsageBreakdown>();
  const harnesses = new Map<string, UsageBreakdown>();
  let activeSessions = 0;

  for (const session of sessions) {
    if (session.active) {
      activeSessions += 1;
    }
    totals = add(totals, session);
    const model = session.modelName ?? session.modelId ?? "unknown";
    models.set(model, add(models.get(model) ?? { ...EMPTY }, session));
    harnesses.set(session.agent, add(harnesses.get(session.agent) ?? { ...EMPTY }, session));
  }

  const byCost = <T extends UsageBreakdown>(a: T, b: T): number => b.costUsd - a.costUsd;
  return {
    ...totals,
    since,
    activeSessions,
    byModel: [...models].map(([model, v]) => ({ model, ...v })).sort(byCost),
    byHarness: [...harnesses].map(([agent, v]) => ({ agent, ...v })).sort(byCost),
  };
}

/**
 * Parse a `--last` window like `7d`, `24h`, `30m` into milliseconds. Returns
 * undefined for anything unparseable so the caller can report a clear error
 * rather than silently reporting the wrong window.
 */
export function parseUsageWindowMs(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const match = value
    .trim()
    .toLowerCase()
    .match(/^(\d+)\s*([dhmw])$/);
  if (!match?.[1] || !match[2]) {
    return undefined;
  }
  const amount = Number.parseInt(match[1], 10);
  if (!Number.isFinite(amount) || amount <= 0) {
    return undefined;
  }
  const unitMs: Record<string, number> = {
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
  };
  const unit = unitMs[match[2]];
  return unit === undefined ? undefined : amount * unit;
}

function formatUsd(value: number): string {
  // Sub-cent totals are normal for single turns, so keep enough precision to
  // avoid printing a misleading "$0.00" for real spend.
  return value >= 0.01 ? `$${value.toFixed(2)}` : `$${value.toFixed(4)}`;
}

function formatTokens(value: number): string {
  return value.toLocaleString("en-US");
}

/** Render a human-readable report. Returns the exact text to print. */
export function formatUsageReport(summary: UsageSummary, windowLabel: string): string {
  if (summary.sessions === 0) {
    return (
      `No sessions in the last ${windowLabel}.\n` + `Run a turn through any harness and try again.`
    );
  }

  const lines: string[] = [];
  lines.push(`NConnect usage - last ${windowLabel}`);
  lines.push("");
  lines.push(
    `  ${summary.sessions} session(s)` +
      (summary.activeSessions > 0 ? ` (${summary.activeSessions} still running)` : "") +
      `   ${formatUsd(summary.costUsd)} total`,
  );
  lines.push(
    `  ${formatTokens(summary.promptTokens)} in` +
      (summary.cachedTokens > 0 ? ` (${formatTokens(summary.cachedTokens)} cached)` : "") +
      `   ${formatTokens(summary.completionTokens)} out`,
  );

  if (summary.byModel.length > 0) {
    lines.push("");
    lines.push("By model:");
    for (const row of summary.byModel) {
      lines.push(
        `  ${row.model.padEnd(28)} ${formatUsd(row.costUsd).padStart(10)}   ` +
          `${formatTokens(row.promptTokens)} in / ${formatTokens(row.completionTokens)} out`,
      );
    }
  }

  if (summary.byHarness.length > 0) {
    lines.push("");
    lines.push("By tool:");
    for (const row of summary.byHarness) {
      lines.push(
        `  ${row.agent.padEnd(28)} ${formatUsd(row.costUsd).padStart(10)}   ` +
          `${row.sessions} session(s)`,
      );
    }
  }

  if (summary.cachedTokens > 0 && cacheReadRatio() === 1) {
    lines.push("");
    lines.push("Cached input is priced at the full input rate: Nebius serves cached prompts");
    lines.push(
      `but publishes no cached price, so this total is an upper bound. Set ${CACHE_READ_RATIO_ENV}`,
    );
    lines.push("to your actual discount (e.g. 0.1) if you know it.");
  }

  lines.push("");
  lines.push("Local only - read from ~/.nconnect, never uploaded.");
  return lines.join("\n");
}

/** Load, aggregate and render usage for the given window. */
export async function buildUsageReport(windowMs: number, now = Date.now()): Promise<UsageSummary> {
  const store = await createSessionStore();
  try {
    const since = now - windowMs;
    return summarizeUsage(store.queryUsageSince(since), since);
  } finally {
    store.close();
  }
}
