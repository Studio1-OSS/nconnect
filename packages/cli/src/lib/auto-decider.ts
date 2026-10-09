import { createHash } from "node:crypto";
import { writeProxyDebugLog } from "./proxy-debug.js";

/**
 * Optional model-based judgement for Auto routing.
 *
 * By default Auto guesses how hard a task is from keywords and prompt length
 * (auto-routing.ts). That misses most hard tasks, which rarely say "debug":
 * asked routine-or-hard on a 28-prompt labelled set, the rules got 13 right,
 * a Nebius-hosted model 26, and TypeSafe's Jev 28. The decider answers on
 * three levels - routine, moderate, hard - to match Auto's three tiers. A decider replaces that one guess - and only
 * that guess. It runs for Auto requests alone, and the user's explicit
 * signals (plan mode, a raised effort level, asking to think hard) still win.
 *
 * Three deciders, chosen with NCONNECT_AUTO_DECIDER:
 * - `nebius`: asks a small Nebius model for a one-letter answer and reads the
 *   probability from the token scores. No new vendor; the prompt goes where
 *   the request was going anyway.
 * - `jev`: TypeSafe's hosted System One model. Needs TYPESAFE_API_KEY, and
 *   sends the typed prompt to TypeSafe.
 * - `laya`: an open System One model the user runs themselves
 *   (`laya-serve`). The prompt stays on their machine.
 *
 * Jev and Laya share one wire format, so they share one client.
 *
 * The answer is cached per typed prompt. The tool-calling turns of a task
 * carry the same prompt, so a task costs one decider call, stays on one
 * model, and adds no delay after its first request. A decider that is slow,
 * down or unsure is recorded as "no answer" and the keyword rules decide.
 */

export type AutoDeciderKind = "nebius" | "jev" | "laya";

export type AutoDeciderConfig = {
  kind: AutoDeciderKind;
  /** Nebius model id, Jev model alias, or Laya checkpoint name. */
  model?: string | undefined;
  /** Endpoint for Jev or Laya. */
  url?: string | undefined;
  /** TypeSafe key for Jev; optional bearer token for a protected Laya server. */
  apiKey?: string | undefined;
  timeoutMs?: number | undefined;
};

export const AUTO_DECIDER_ENV = "NCONNECT_AUTO_DECIDER";
export const AUTO_DECIDER_MODEL_ENV = "NCONNECT_AUTO_DECIDER_MODEL";
export const AUTO_DECIDER_URL_ENV = "NCONNECT_AUTO_DECIDER_URL";
export const AUTO_DECIDER_TIMEOUT_ENV = "NCONNECT_AUTO_DECIDER_TIMEOUT_MS";

/** Gemma 3 27B: cheap, answers in one token, and the best Nebius model tested. */
export const DEFAULT_NEBIUS_DECIDER_MODEL = "google/gemma-3-27b-it";
export const DEFAULT_JEV_URL = "https://api.typesafe.ai/v1/systemone";
export const DEFAULT_LAYA_URL = "http://127.0.0.1:8000/v1/systemone";
/**
 * Laya's checkpoints differ a lot on this question. On the 28-prompt set:
 * typed-decisions 25 right, the English default 20, multilingual 13 (chance).
 * Left to itself the server picks by language, so name the good one.
 */
export const DEFAULT_LAYA_MODEL = "typed-decisions";
/** A decision is worth a short wait, not a stalled turn. */
export const DEFAULT_DECIDER_TIMEOUT_MS = 2_500;
/** Typed prompt sent to the decider; the start and the end carry the ask. */
const MAX_PROMPT_CHARS = 6_000;
const CACHE_ENTRIES = 500;

const INSTRUCTIONS =
  "You route coding requests to a model tier. Judge only how hard the request is to get right.";
const ROUTINE =
  "Small, well specified, low risk. One obvious change, a lookup, a rename, running a command.";
const MODERATE =
  "A contained piece of work that takes some thought but whose approach is clear: a new function or endpoint, a multi-step edit in one area, tests with several cases.";
const HARD =
  "Needs investigation, diagnosis, design, or reasoning across several files; the cause or the approach is not given.";

/**
 * Read the decider choice from the launcher's environment. Returns undefined
 * for the default (keyword rules) and for a choice that cannot work, with the
 * reason on `problem` so the launcher can say so once.
 */
export function autoDeciderFromEnv(env: NodeJS.ProcessEnv = process.env): {
  config?: AutoDeciderConfig;
  problem?: string;
} {
  const kind = env[AUTO_DECIDER_ENV]?.trim().toLowerCase();
  if (!kind || kind === "rules" || kind === "off") {
    return {};
  }
  const timeout = Number.parseInt(env[AUTO_DECIDER_TIMEOUT_ENV] ?? "", 10);
  const base = {
    ...(Number.isFinite(timeout) && timeout > 0 ? { timeoutMs: timeout } : {}),
    ...(env[AUTO_DECIDER_MODEL_ENV]?.trim() ? { model: env[AUTO_DECIDER_MODEL_ENV]?.trim() } : {}),
    ...(env[AUTO_DECIDER_URL_ENV]?.trim() ? { url: env[AUTO_DECIDER_URL_ENV]?.trim() } : {}),
  };
  if (kind === "nebius") {
    return { config: { kind, ...base } };
  }
  if (kind === "jev") {
    const apiKey = env.TYPESAFE_API_KEY?.trim();
    if (!apiKey) {
      return {
        problem: `${AUTO_DECIDER_ENV}=jev needs TYPESAFE_API_KEY. Auto is using its keyword rules.`,
      };
    }
    return { config: { kind, apiKey, ...base } };
  }
  if (kind === "laya") {
    const apiKey = env.LAYA_API_KEY?.trim();
    return { config: { kind, ...(apiKey ? { apiKey } : {}), ...base } };
  }
  return {
    problem: `Unknown ${AUTO_DECIDER_ENV} "${kind}". Use nebius, jev or laya. Auto is using its keyword rules.`,
  };
}

function clip(prompt: string): string {
  if (prompt.length <= MAX_PROMPT_CHARS) {
    return prompt;
  }
  const head = Math.floor(MAX_PROMPT_CHARS * 0.7);
  return `${prompt.slice(0, head)}\n[...]\n${prompt.slice(-(MAX_PROMPT_CHARS - head))}`;
}

type Fetch = typeof fetch;

export type DeciderContext = {
  /** The session's Nebius key and API root, for the `nebius` decider. */
  nebiusApiKey: string;
  nebiusBaseUrl: string;
  debug?: boolean | undefined;
  fetchImpl?: Fetch | undefined;
};

async function postJson(
  fetchImpl: Fetch,
  url: string,
  apiKey: string | undefined,
  body: unknown,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/** One token out; the probability of "hard" read from the token scores. */
async function askNebius(
  config: AutoDeciderConfig,
  prompt: string,
  context: DeciderContext,
  fetchImpl: Fetch,
  timeoutMs: number,
): Promise<number | undefined> {
  const json = (await postJson(
    fetchImpl,
    `${context.nebiusBaseUrl.replace(/\/+$/, "")}/chat/completions`,
    context.nebiusApiKey,
    {
      model: config.model ?? DEFAULT_NEBIUS_DECIDER_MODEL,
      messages: [
        {
          role: "system",
          content: `${INSTRUCTIONS}\nA = routine: ${ROUTINE}\nB = moderate: ${MODERATE}\nC = hard: ${HARD}\nAnswer with one letter: A, B or C.`,
        },
        { role: "user", content: `Request: ${prompt}` },
      ],
      max_tokens: 1,
      temperature: 0,
      logprobs: true,
      top_logprobs: 8,
    },
    timeoutMs,
  )) as {
    choices?: Array<{
      logprobs?: { content?: Array<{ top_logprobs?: Array<{ token: string; logprob: number }> }> };
    }>;
  };
  const tops = json.choices?.[0]?.logprobs?.content?.[0]?.top_logprobs ?? [];
  const mass = { A: 0, B: 0, C: 0 };
  for (const top of tops) {
    const token = top.token.trim();
    if (token === "A" || token === "B" || token === "C") {
      mass[token] += Math.exp(top.logprob);
    }
  }
  // A model that thinks out loud first never puts a letter in the first token.
  return difficultyFrom(mass.A, mass.B, mass.C);
}

/**
 * One number from three probabilities: 0 routine, 0.5 moderate, 1 hard. An
 * unsure answer lands between the levels instead of jumping to one of them.
 */
function difficultyFrom(routine: number, moderate: number, hard: number): number | undefined {
  const total = routine + moderate + hard;
  if (!(total > 0)) {
    return undefined;
  }
  return Math.min(1, Math.max(0, (0.5 * moderate + hard) / total));
}

/** Jev and Laya: a typed choice with a probability per option. */
async function askSystemOne(
  config: AutoDeciderConfig,
  prompt: string,
  fetchImpl: Fetch,
  timeoutMs: number,
): Promise<number | undefined> {
  const laya = config.kind === "laya";
  const json = (await postJson(
    fetchImpl,
    config.url ?? (laya ? DEFAULT_LAYA_URL : DEFAULT_JEV_URL),
    config.apiKey,
    {
      model: config.model ?? (laya ? DEFAULT_LAYA_MODEL : "jev-latest"),
      state: laya ? { body: `Request: ${prompt}` } : `Request: ${prompt}`,
      questions: {
        tier: {
          type: "choice",
          instructions: INSTRUCTIONS,
          // Laya is asked the two-way question. Given three options it calls
          // nearly everything "moderate" (13 of 34 right); given two, its
          // probability of "hard" spreads out and an unsure answer lands in
          // the middle tier on its own.
          criteria: laya
            ? { routine: ROUTINE, hard: HARD }
            : { routine: ROUTINE, moderate: MODERATE, hard: HARD },
        },
      },
    },
    timeoutMs,
  )) as { answers?: { tier?: { choice?: string; probabilities?: Record<string, number> } } };
  const tier = json.answers?.tier;
  const p = tier?.probabilities;
  const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
  const fromProbabilities = p
    ? difficultyFrom(num(p.routine), num(p.moderate), num(p.hard))
    : undefined;
  if (fromProbabilities !== undefined) {
    return fromProbabilities;
  }
  return tier?.choice === "hard"
    ? 1
    : tier?.choice === "moderate"
      ? 0.5
      : tier?.choice === "routine"
        ? 0
        : undefined;
}

type Cached = { difficulty: number | undefined; at: number };
/**
 * How long a "no answer" stands. Long enough that a task routes one way from
 * its first turn to its last; short enough that one slow moment does not
 * leave that prompt on the keyword rules for good.
 */
export const NO_ANSWER_TTL_MS = 5 * 60_000;
const cache = new Map<string, Cached>();
const inFlight = new Map<string, Promise<void>>();

function cacheKey(config: AutoDeciderConfig, prompt: string): string {
  return createHash("sha256")
    .update(`${config.kind}\n${config.model ?? ""}\n${config.url ?? ""}\n${prompt}`)
    .digest("hex");
}

/**
 * The decider's answer for this prompt: 0 routine, 0.5 moderate, 1 hard, or
 * undefined when it has not been asked, or was asked and had no answer.
 */
export function decidedDifficulty(
  config: AutoDeciderConfig | undefined,
  prompt: string,
): number | undefined {
  if (!config || !prompt) {
    return undefined;
  }
  return cache.get(cacheKey(config, prompt))?.difficulty;
}

/**
 * Ask the decider about a typed prompt unless it has been asked already.
 * Never throws: a failure is cached as "no answer" so the task routes by the
 * keyword rules from its first turn to its last instead of flipping when the
 * decider comes back.
 */
export async function primeAutoDecider(
  config: AutoDeciderConfig | undefined,
  prompt: string,
  context: DeciderContext,
): Promise<void> {
  if (!config || !prompt) {
    return;
  }
  const key = cacheKey(config, prompt);
  const known = cache.get(key);
  if (known && (known.difficulty !== undefined || now() - known.at < NO_ANSWER_TTL_MS)) {
    return;
  }
  const running = inFlight.get(key);
  if (running) {
    return running;
  }
  const run = (async () => {
    const started = Date.now();
    const fetchImpl = context.fetchImpl ?? fetch;
    const timeoutMs = config.timeoutMs ?? DEFAULT_DECIDER_TIMEOUT_MS;
    let difficulty: number | undefined;
    let error: string | undefined;
    try {
      const clipped = clip(prompt);
      difficulty =
        config.kind === "nebius"
          ? await askNebius(config, clipped, context, fetchImpl, timeoutMs)
          : await askSystemOne(config, clipped, fetchImpl, timeoutMs);
    } catch (err) {
      error =
        err instanceof Error ? (err.name === "AbortError" ? "timeout" : err.message) : "error";
    }
    cache.delete(key);
    cache.set(key, { difficulty, at: now() });
    if (cache.size > CACHE_ENTRIES) {
      const oldest = cache.keys().next();
      if (!oldest.done) {
        cache.delete(oldest.value);
      }
    }
    writeProxyDebugLog("nconnect proxy", context, "auto decider", {
      decider: config.kind,
      ...(difficulty === undefined
        ? { answer: "none" }
        : { difficulty: Number(difficulty.toFixed(3)) }),
      ...(error ? { error } : {}),
      ms: Date.now() - started,
    });
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, run);
  return run;
}

let now = (): number => Date.now();

/** Test hook: replace the clock. */
export function setAutoDeciderClock(clock: () => number): void {
  now = clock;
}

/** Test hook: forget every cached decision. */
export function clearAutoDeciderCache(): void {
  now = () => Date.now();
  cache.clear();
  inFlight.clear();
}
