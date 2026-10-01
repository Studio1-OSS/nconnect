import { backoffMs, sleep } from "./nebius-retry.js";
import { getNebiusResponseDiagnostics } from "./nebius-client.js";
import { persistRequestDiagnostic } from "./request-diagnostics.js";
import { createSseIdleWatchdog, sseEventPayload, takeSseEvents } from "./sse.js";

const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 120_000;
const DEFAULT_STREAM_RETRIES = 1;

export type NebiusSseEvent = {
  data: string;
  /** Zero for the initial response, incremented after each safe idle retry. */
  attempt: number;
};

export type NebiusSseRetryInfo = {
  attempt: number;
  maxRetries: number;
  timeoutMs: number;
};

export class NebiusSseIdleTimeoutError extends Error {
  constructor(
    readonly timeoutMs: number,
    readonly clientRequestId?: string | undefined,
    readonly upstreamRequestId?: string | undefined,
  ) {
    const ids = [
      clientRequestId ? `client request ID: ${clientRequestId}` : undefined,
      upstreamRequestId ? `upstream request ID: ${upstreamRequestId}` : undefined,
    ].filter(Boolean);
    super(
      `Nebius stream produced no SSE event for ${timeoutMs}ms.` +
        (ids.length > 0 ? ` (${ids.join(", ")})` : ""),
    );
    this.name = "NebiusSseIdleTimeoutError";
  }
}

export class NebiusSsePrematureCloseError extends Error {
  constructor(
    readonly clientRequestId?: string | undefined,
    readonly upstreamRequestId?: string | undefined,
  ) {
    const ids = [
      clientRequestId ? `client request ID: ${clientRequestId}` : undefined,
      upstreamRequestId ? `upstream request ID: ${upstreamRequestId}` : undefined,
    ].filter(Boolean);
    super(
      "Nebius stream closed before the [DONE] event." +
        (ids.length > 0 ? ` (${ids.join(", ")})` : ""),
    );
    this.name = "NebiusSsePrematureCloseError";
  }
}

export class NebiusSseRetryResponseError extends Error {
  constructor(readonly response: Response) {
    super(`Nebius SSE retry returned HTTP ${response.status}.`);
    this.name = "NebiusSseRetryResponseError";
  }
}

/**
 * Read Nebius SSE data with one shared watchdog/retry policy. Harnesses keep
 * only their wire translation and report when semantic output has begun; this
 * module owns framing, cancellation, idle detection, backoff, and safe retry.
 */
export async function* readNebiusSseWithRetry(
  initialResponse: Response,
  retry: () => Promise<Response>,
  options: {
    isOutputStarted: () => boolean;
    onRetry?: ((info: NebiusSseRetryInfo) => void) | undefined;
  },
): AsyncGenerator<NebiusSseEvent> {
  const idleTimeoutMs = streamIdleTimeoutMs();
  const maxRetries = streamRetries();
  let response = initialResponse;
  let attempt = 0;

  for (;;) {
    try {
      for await (const data of readResponseSse(response, idleTimeoutMs)) {
        yield { data, attempt };
      }
      return;
    } catch (err) {
      if (
        !(err instanceof NebiusSseIdleTimeoutError) &&
        !(err instanceof NebiusSsePrematureCloseError)
      ) {
        throw err;
      }
      await persistStreamDiagnostic(response, err, attempt);
      if (options.isOutputStarted() || attempt >= maxRetries) {
        throw err;
      }
      options.onRetry?.({ attempt, maxRetries, timeoutMs: idleTimeoutMs });
      await sleep(backoffMs(attempt));
      const next = await retry();
      if (!next.ok) {
        throw new NebiusSseRetryResponseError(next);
      }
      if (!next.body) {
        throw new Error("Nebius returned no stream body after an SSE idle retry.");
      }
      response = next;
      attempt += 1;
    }
  }
}

async function* readResponseSse(response: Response, idleTimeoutMs: number): AsyncGenerator<string> {
  if (!response.body) {
    throw new Error("Nebius returned no stream body.");
  }
  const diagnostics = getNebiusResponseDiagnostics(response);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const watchdog = createSseIdleWatchdog(
    idleTimeoutMs,
    () =>
      new NebiusSseIdleTimeoutError(
        idleTimeoutMs,
        diagnostics?.clientRequestId,
        diagnostics?.upstreamRequestId,
      ),
  );
  let buffer = "";
  let sawDone = false;
  try {
    for (;;) {
      const read = await watchdog.read(reader);
      if (read.done) {
        break;
      }
      buffer += decoder.decode(read.value, { stream: true });
      for (const event of takeSseEvents(buffer)) {
        buffer = event.remaining;
        if (event.payload) {
          if (event.payload === "[DONE]") {
            sawDone = true;
          }
          yield event.payload;
        }
      }
    }
  } catch (err) {
    if (err instanceof NebiusSseIdleTimeoutError) {
      await reader.cancel(err).catch(() => undefined);
    }
    throw err;
  } finally {
    watchdog.dispose();
    reader.releaseLock();
  }

  buffer += decoder.decode();
  const trailing = buffer.trim();
  if (trailing) {
    const payload = sseEventPayload(trailing);
    if (payload) {
      if (payload === "[DONE]") {
        sawDone = true;
      }
      yield payload;
    }
  }
  if (!sawDone) {
    throw new NebiusSsePrematureCloseError(
      diagnostics?.clientRequestId,
      diagnostics?.upstreamRequestId,
    );
  }
}

async function persistStreamDiagnostic(
  response: Response,
  error: NebiusSseIdleTimeoutError | NebiusSsePrematureCloseError,
  attempt: number,
): Promise<void> {
  const diagnostics = getNebiusResponseDiagnostics(response);
  if (!diagnostics) {
    return;
  }
  await persistRequestDiagnostic({
    phase: "sse",
    reason: error instanceof NebiusSseIdleTimeoutError ? "idle_timeout" : "premature_close",
    clientRequestId: diagnostics.clientRequestId,
    upstreamRequestId: diagnostics.upstreamRequestId,
    attempt,
    ...(error instanceof NebiusSseIdleTimeoutError ? { timeoutMs: error.timeoutMs } : {}),
    error: error.message,
  }).catch(() => undefined);
}

function streamIdleTimeoutMs(): number {
  const raw =
    process.env.NCONNECT_STREAM_IDLE_TIMEOUT_MS ??
    process.env.NCONNECT_CODEX_STREAM_IDLE_TIMEOUT_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0
    ? Math.max(100, parsed)
    : DEFAULT_STREAM_IDLE_TIMEOUT_MS;
}

function streamRetries(): number {
  const raw = process.env.NCONNECT_STREAM_RETRIES ?? process.env.NCONNECT_CODEX_STREAM_IDLE_RETRIES;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : DEFAULT_STREAM_RETRIES;
}
