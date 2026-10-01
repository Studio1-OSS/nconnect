import { randomUUID } from "node:crypto";
import type { ModelDefinition } from "@nconnect/models";
import { NEBIUS_BASE_URL } from "./nebius-core.js";
import { backoffMs, parseRetryAfter, sleep } from "./nebius-retry.js";
import { persistRequestDiagnostic } from "./request-diagnostics.js";
import {
  CONTEXT_FIT_MAX_ATTEMPTS,
  applyContextFit,
  emitContextTrimAlarm,
  newContextFitState,
} from "./context-fit.js";
import type { ContextTrimTelemetryInfo } from "./telemetry.js";

/**
 * The deep Nebius HTTP client - one place for the POST /chat/completions
 * retry loop that used to be copy-pasted three times (claude/nebius-call.ts,
 * claude/stream.ts:postNebiusStream, codex/nebius-call.ts). Carved out so
 * `nebius-core.ts`'s name finally earns its keep: the retry contract
 * (429/503 + Retry-After + exponential backoff, serialize-once) lives here
 * behind a small interface, testable through one seam instead of three.
 *
 * On top of the transient-fault retry, the client also owns the shared
 * *reactive context-fit* retry: when Nebius rejects a request with
 * `context_length_exceeded`, `fetchWithContextFit` mutates the (already
 * OpenAI-normalized) payload via `applyContextFit` and re-posts until it fits.
 * Both harnesses (Claude + Codex, stream + non-stream) inherit it for free -
 * see `context-fit.ts` and the plan in `.claude/plans`.
 *
 * Returns the raw `Response`. Each harness applies its own error-shape mapping
 * (Anthropic vs OpenAI Responses) on top - keeping the error contract where
 * the wire format lives, not here.
 */

// Transient upstream faults worth retrying. 429 = rate limited; 503 = temporary
// capacity. Everything else (401, 400, 402, 404, 5xx other than 503) is
// non-retryable - retrying a bad key or a malformed request just delays the
// same failure.
const RETRYABLE_STATUSES = new Set([429, 503]);

export const MAX_RETRIES = 3;
const DEFAULT_STREAM_RETRIES = 1;
// Time to wait for Nebius to return the first response headers before failing
// over. 45s catches genuinely-slow-but-working models (large prefill, light
// queuing) while failing over reasonably fast when a model's Nebius endpoint is
// down. On failover the request is retried on the fallback model (see
// withModelFallback), and the circuit breaker then routes subsequent turns
// straight to the fallback, so this timeout is only paid once per outage.
// Override with NCONNECT_RESPONSE_HEADER_TIMEOUT_MS.
const DEFAULT_RESPONSE_HEADER_TIMEOUT_MS = 45_000;

// Automatic model fallback: when a request's target model returns no response
// headers (its Nebius endpoint is down/overloaded), the relay transparently
// re-issues the SAME request on a healthy fallback model instead of surfacing
// an error - so a provider-side outage of one model (e.g. Kimi-K3) doesn't
// break sessions mid-flight. A short-lived per-model circuit breaker then skips
// the dead model entirely for a cooldown window, so only the first failing turn
// pays the timeout. Configure with NCONNECT_FALLBACK_MODEL (set to
// "off"/"none" to disable) and NCONNECT_FALLBACK_COOLDOWN_MS.
const DEFAULT_FALLBACK_MODEL = "moonshotai/Kimi-K2.6";
const DEFAULT_FALLBACK_COOLDOWN_MS = 60_000;

/** model id -> epoch ms of its last response-header timeout (circuit breaker). */
const unhealthySince = new Map<string, number>();

function fallbackModel(): string | undefined {
  const raw = process.env.NCONNECT_FALLBACK_MODEL;
  if (raw === undefined) {
    return DEFAULT_FALLBACK_MODEL;
  }
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  if (trimmed === "" || lower === "off" || lower === "none" || lower === "0") {
    return undefined;
  }
  return trimmed;
}

function fallbackCooldownMs(): number {
  const raw = Number.parseInt(process.env.NCONNECT_FALLBACK_COOLDOWN_MS ?? "", 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_FALLBACK_COOLDOWN_MS;
}

function markModelUnhealthy(model: string): void {
  unhealthySince.set(model, Date.now());
}

function isModelUnhealthy(model: string): boolean {
  const at = unhealthySince.get(model);
  return at !== undefined && Date.now() - at < fallbackCooldownMs();
}

/** Rewrite the `model` field of a serialized chat-completions body. */
function withModelReplaced(body: string, model: string): string {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    parsed.model = model;
    return JSON.stringify(parsed);
  } catch {
    return body;
  }
}

function logFallback(reason: "circuit_open" | "header_timeout", from: string, to: string): void {
  void persistRequestDiagnostic({
    phase: "fallback",
    reason,
    clientRequestId: randomUUID(),
    model: to,
    error:
      reason === "circuit_open"
        ? `Model ${from} is in cooldown after a timeout; serving ${to} instead.`
        : `Model ${from} returned no response headers; failing over to ${to}.`,
  }).catch(() => undefined);
}

/**
 * Wrap a body-fetcher with automatic model fallback + circuit breaker. Covers
 * both harnesses (Claude via postChatCompletionStream, Codex via
 * postChatCompletion) since both fetch through this.
 */
function withModelFallback(
  fetcher: (body: string) => Promise<Response>,
  signal?: AbortSignal,
): (body: string) => Promise<Response> {
  return async (body: string): Promise<Response> => {
    const fallback = fallbackModel();
    const current = modelFromSerializedBody(body);

    // Circuit open: the target model recently timed out - skip it entirely.
    if (fallback && current && current !== fallback && isModelUnhealthy(current)) {
      logFallback("circuit_open", current, fallback);
      return fetcher(withModelReplaced(body, fallback));
    }

    try {
      return await fetcher(body);
    } catch (err) {
      if (
        err instanceof NebiusResponseHeaderTimeoutError &&
        !signal?.aborted &&
        fallback &&
        current &&
        current !== fallback
      ) {
        markModelUnhealthy(current);
        logFallback("header_timeout", current, fallback);
        return fetcher(withModelReplaced(body, fallback));
      }
      throw err;
    }
  };
}

export type NebiusResponseDiagnostics = {
  clientRequestId: string;
  upstreamRequestId?: string | undefined;
};

const responseDiagnostics = new WeakMap<Response, NebiusResponseDiagnostics>();

export class NebiusResponseHeaderTimeoutError extends Error {
  constructor(
    readonly timeoutMs: number,
    readonly requestId: string,
  ) {
    super(
      `Nebius returned no response headers within ${timeoutMs}ms ` +
        `(client request ID: ${requestId}).`,
    );
    this.name = "NebiusResponseHeaderTimeoutError";
  }
}

export function getNebiusResponseDiagnostics(
  response: Response,
): NebiusResponseDiagnostics | undefined {
  return responseDiagnostics.get(response);
}

export type NebiusClientOptions = {
  apiKey: string;
  /** Explicit for proxied sessions; defaults only for direct library callers. */
  baseUrl?: string;
  debug?: boolean | undefined;
};

/**
 * Enables the reactive context-fit retry. When present, the client repairs a
 * context-length rejection in place instead of surfacing it. `onContextTrim`
 * lets tests capture the alarm without real network/install-id I/O; production
 * leaves it undefined so the always-on stderr warning + telemetry fire.
 */
export type ContextFitConfig = {
  modelDefinition: ModelDefinition;
  onContextTrim?: ((info: ContextTrimTelemetryInfo) => void) | undefined;
  /** When true, log each applied context-fit rung to stderr (incl. the benign
   * max_tokens clamp, which the always-on trim alarm intentionally skips). */
  debug?: boolean | undefined;
};

/**
 * POST /chat/completions with automatic retry for transient faults (429/503)
 * and, when `fit` is provided, the shared context-fit retry. Serializes once
 * per attempt (the context-fit path re-serializes after each payload mutation).
 * Honors `Retry-After` when present, else exponential 1s→2s→4s with jitter.
 *
 * Returns the final `Response`. The caller reads the body and maps errors to
 * its wire format. On a terminal context-length 400 the body is a fresh
 * readable `Response` (the fit loop had to consume the original to inspect it).
 */
export async function postChatCompletion(
  payload: Record<string, unknown>,
  options: NebiusClientOptions,
  signal?: AbortSignal,
  fit?: ContextFitConfig,
): Promise<Response> {
  const doFetch = withModelFallback(
    (body: string) =>
      payload.stream === true
        ? streamFetchOnce(body, options, signal)
        : postChatCompletionOnce(body, options, signal),
    signal,
  );
  if (!fit) {
    return doFetch(JSON.stringify(payload));
  }
  return fetchWithContextFit(payload, fit, doFetch);
}

/** One transient-retry attempt-set against Nebius, sending `body` verbatim. */
async function postChatCompletionOnce(
  body: string,
  options: NebiusClientOptions,
  signal?: AbortSignal,
): Promise<Response> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    let response: Response;
    try {
      response = await fetchNebiusResponse(body, options, signal, attempt);
    } catch (err) {
      // Header timeouts get one short, separately configurable retry and keep
      // their typed error. Other network failures use the legacy transient
      // retry budget and eventually become a 503 for existing error mapping.
      if (signal?.aborted) {
        throw err;
      }
      if (err instanceof NebiusResponseHeaderTimeoutError) {
        if (attempt < responseHeaderRetries()) {
          await sleep(backoffMs(attempt));
          continue;
        }
        throw err;
      }
      if (attempt < MAX_RETRIES) {
        await sleep(backoffMs(attempt));
        continue;
      }
      return syntheticOverloadedResponse(err instanceof Error ? err.message : String(err));
    }

    if (response.ok || !RETRYABLE_STATUSES.has(response.status) || attempt >= MAX_RETRIES) {
      return response;
    }
    // Drain the retryable response body before sleeping (the body is small for
    // 429/503 and we must not leak the stream).
    await response.arrayBuffer().catch(() => undefined);
    await sleep(parseRetryAfter(response.headers.get("retry-after")) ?? backoffMs(attempt));
  }
  // Unreachable: the loop returns on every path. Defensive fallback.
  return syntheticOverloadedResponse("Nebius request failed after retries.");
}

/**
 * POST /chat/completions as a streaming request. Response-header failures and
 * retryable pre-stream HTTP statuses are retried here because no SSE bytes can
 * have reached a harness yet. It also runs the shared context-fit retry when
 * `fit` is provided - that fires on a non-OK 400 before stream bytes flow.
 *
 * `body` lets callers that have already serialized the payload (e.g. the
 * native-tool continuation loop) resend identical bytes; in that mode the
 * context-fit retry is skipped (the caller owns (re)serialization).
 */
export async function postChatCompletionStream(
  payload: Record<string, unknown>,
  options: NebiusClientOptions,
  signal?: AbortSignal,
  body?: string,
  fit?: ContextFitConfig,
): Promise<Response> {
  const doFetch = withModelFallback((b: string) => streamFetchOnce(b, options, signal), signal);
  if (body !== undefined || !fit) {
    return doFetch(body ?? JSON.stringify(payload));
  }
  return fetchWithContextFit(payload, fit, doFetch);
}

async function streamFetchOnce(
  body: string,
  options: NebiusClientOptions,
  signal?: AbortSignal,
): Promise<Response> {
  const maxRetries = Math.max(streamRetries(), responseHeaderRetries());
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    let response: Response;
    try {
      response = await fetchNebiusResponse(body, options, signal, attempt);
    } catch (err) {
      const allowedRetries =
        err instanceof NebiusResponseHeaderTimeoutError ? responseHeaderRetries() : streamRetries();
      if (signal?.aborted || attempt >= allowedRetries) {
        throw err;
      }
      await sleep(backoffMs(attempt));
      continue;
    }
    if (response.ok || !RETRYABLE_STATUSES.has(response.status) || attempt >= maxRetries) {
      return response;
    }
    await response.arrayBuffer().catch(() => undefined);
    await sleep(parseRetryAfter(response.headers.get("retry-after")) ?? backoffMs(attempt));
  }
  throw new Error("Nebius stream request failed after retries.");
}

async function fetchNebiusResponse(
  body: string,
  options: NebiusClientOptions,
  signal: AbortSignal | undefined,
  attempt: number,
): Promise<Response> {
  const clientRequestId = randomUUID();
  const timeoutMs = responseHeaderTimeoutMs();
  const controller = new AbortController();
  let timeoutError: NebiusResponseHeaderTimeoutError | undefined;
  const abortFromCaller = () => controller.abort(signal?.reason);
  if (signal?.aborted) {
    abortFromCaller();
  } else {
    signal?.addEventListener("abort", abortFromCaller, { once: true });
  }
  const timeout = setTimeout(() => {
    timeoutError = new NebiusResponseHeaderTimeoutError(timeoutMs, clientRequestId);
    controller.abort(timeoutError);
  }, timeoutMs);
  timeout.unref?.();

  try {
    const response = await fetch(`${options.baseUrl ?? NEBIUS_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
        "X-Client-Request-ID": clientRequestId,
      },
      body,
      signal: controller.signal,
    });
    const responseRequestId = upstreamRequestId(response);
    responseDiagnostics.set(response, {
      clientRequestId,
      ...(responseRequestId ? { upstreamRequestId: responseRequestId } : {}),
    });
    return response;
  } catch (err) {
    signal?.removeEventListener("abort", abortFromCaller);
    const reason = timeoutError ? "timeout" : signal?.aborted ? "caller_abort" : "network_error";
    const surfaced = timeoutError ?? err;
    await persistRequestDiagnostic({
      phase: "response_headers",
      reason,
      clientRequestId,
      model: modelFromSerializedBody(body),
      attempt,
      ...(timeoutError ? { timeoutMs } : {}),
      error: surfaced instanceof Error ? surfaced.message : String(surfaced),
    }).catch(() => undefined);
    throw surfaced;
  } finally {
    clearTimeout(timeout);
  }
}

function responseHeaderTimeoutMs(): number {
  const raw = process.env.NCONNECT_RESPONSE_HEADER_TIMEOUT_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0
    ? Math.max(100, parsed)
    : DEFAULT_RESPONSE_HEADER_TIMEOUT_MS;
}

function streamRetries(): number {
  const raw = process.env.NCONNECT_STREAM_RETRIES;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : DEFAULT_STREAM_RETRIES;
}

function responseHeaderRetries(): number {
  const raw = process.env.NCONNECT_RESPONSE_HEADER_RETRIES ?? process.env.NCONNECT_STREAM_RETRIES;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : DEFAULT_STREAM_RETRIES;
}

function upstreamRequestId(response: Response): string | undefined {
  return (
    response.headers.get("x-request-id") ??
    response.headers.get("request-id") ??
    response.headers.get("cf-ray") ??
    undefined
  );
}

function modelFromSerializedBody(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { model?: unknown };
    return typeof parsed.model === "string" ? parsed.model : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The shared reactive context-fit loop. Posts, and while Nebius returns a
 * context-length 400, mutates the payload via `applyContextFit` (max_tokens →
 * strip old images → trim text → drop oldest turns) and re-posts, using
 * Nebius's real reported token count each time so it converges.
 *
 * Invariants:
 *  - Never reads the body of an OK response - live SSE streams pass through
 *    untouched.
 *  - Non-context errors (any non-400, or a 400 that isn't a context overflow)
 *    pass through untouched for the caller to map.
 *  - On a terminal context-length 400 (nothing left to free, or attempts
 *    exhausted) it returns a fresh readable `Response` carrying the last error
 *    body, since inspecting it consumed the original.
 */
async function fetchWithContextFit(
  payload: Record<string, unknown>,
  fit: ContextFitConfig,
  doFetch: (body: string) => Promise<Response>,
): Promise<Response> {
  let response = await doFetch(JSON.stringify(payload));
  const state = newContextFitState(payload);
  for (let attempt = 0; attempt < CONTEXT_FIT_MAX_ATTEMPTS; attempt += 1) {
    if (response.ok || response.status !== 400) {
      return response;
    }
    const text = await response.text();
    const outcome = applyContextFit(payload, text, fit.modelDefinition, state);
    if (!outcome.mutated) {
      // Not a context overflow (e.g. a template error) or the floor is reached:
      // hand the body back as a fresh readable Response.
      return rebuildJsonResponse(text, response.status);
    }
    if (fit.debug) {
      process.stderr.write(
        `[nconnect proxy] context-fit retry (${outcome.action}): ` +
          `input ${outcome.inputTokens} tokens vs window ${outcome.contextWindow}\n`,
      );
    }
    // A pure max_tokens clamp loses no context, so it isn't a trim alarm.
    if (outcome.action !== "max_tokens") {
      (fit.onContextTrim ?? emitContextTrimAlarm)({
        path: "retry",
        model: typeof payload.model === "string" ? payload.model : "",
        trimmedChars: outcome.freedChars,
        inputTokens: outcome.inputTokens,
        contextWindow: outcome.contextWindow,
        action: outcome.action,
        hard: outcome.hard,
      });
    }
    response = await doFetch(JSON.stringify(payload));
  }
  // Attempts exhausted while still overflowing: give the caller a readable body.
  if (!response.ok && response.status === 400) {
    return rebuildJsonResponse(await response.text(), response.status);
  }
  return response;
}

function rebuildJsonResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "application/json" },
  });
}

function syntheticOverloadedResponse(message: string): Response {
  return new Response(JSON.stringify({ error: { message } }), {
    status: 503,
    headers: { "content-type": "application/json" },
  });
}

/** Whether a given HTTP status is in the retryable set (429/503). Exposed for
 * callers that need to decide whether to retry without re-issuing the fetch. */
export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUSES.has(status);
}
