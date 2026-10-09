import { decidedDifficulty, primeAutoDecider } from "../auto-decider.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { acceptsReasoningEffort, findModelById, type ModelDefinition } from "@nconnect/models";
import { postChatCompletion, postChatCompletionStream } from "../nebius-client.js";
import { readJsonBodyWithSize } from "../http-util.js";
import type { SessionState } from "./state.js";
import { AUTO_MODEL_ID, isAutoModel } from "../auto-model.js";
import {
  AUTO_HARNESS_CALL,
  autoTargetModel,
  chatAutoSignals,
  decideAuto,
  type AutoDecision,
} from "../auto-routing.js";
import { writeProxyDebugLog } from "../proxy-debug.js";

/**
 * OpenAI-compatible passthrough for the spawned harnesses.
 *
 * OpenCode, Pi, Prime, Hermes, DeepSeek and Grok are not proxied: they hold the
 * Nebius key and call `/chat/completions` themselves. That means everything the
 * proxied path gives Claude and Codex - per-turn cost metering, automatic model
 * fallback, the per-model circuit breaker, transient-fault retries - simply does
 * not apply to them. A session with one of those tools shows $0.00 spent, and a
 * model outage surfaces as a raw error instead of a fallback.
 *
 * Pointing them at this route instead of api.studio.nebius.com puts them on the
 * same shared client as everyone else. It stays a passthrough: the request body
 * is forwarded as the harness wrote it, because these tools drive their own
 * prompting and any rewriting here would be a second, invisible translation
 * layer on top of the one they already have.
 */

const CHAT_COMPLETIONS_PATHS = new Set(["/v1/chat/completions", "/chat/completions"]);

export function isChatCompletionsPath(path: string): boolean {
  return CHAT_COMPLETIONS_PATHS.has(path);
}

/** Upstream paths a spawned harness may reach through its session route. */
export function isPassthroughPath(path: string): boolean {
  return isChatCompletionsPath(path) || path === "/v1/models" || path === "/models";
}

export type PassthroughUsage = {
  promptTokens: number;
  cachedTokens: number;
  completionTokens: number;
};

/** Read the usage block from a chat completion (streamed or not). */
export function readUsage(value: unknown): PassthroughUsage | undefined {
  const usage = (value as { usage?: Record<string, unknown> } | null)?.usage;
  if (!usage || typeof usage !== "object") {
    return undefined;
  }
  const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const details = usage.prompt_tokens_details as { cached_tokens?: unknown } | undefined;
  const promptTokens = num(usage.prompt_tokens);
  const completionTokens = num(usage.completion_tokens);
  if (promptTokens === 0 && completionTokens === 0) {
    return undefined;
  }
  return {
    promptTokens,
    cachedTokens: num(details?.cached_tokens),
    completionTokens,
  };
}

/**
 * Pull the last usage block out of a batch of SSE text. Nebius emits it on a
 * terminal chunk when `stream_options.include_usage` is set; scanning for the
 * last one avoids mistaking a mid-stream partial for the final tally.
 */
export function usageFromSseChunk(text: string): PassthroughUsage | undefined {
  let found: PassthroughUsage | undefined;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) {
      continue;
    }
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") {
      continue;
    }
    try {
      const usage = readUsage(JSON.parse(payload));
      if (usage) {
        found = usage;
      }
    } catch {
      // A split frame across chunk boundaries is normal; the usage block
      // arrives whole on its own chunk, so skipping partials is safe.
    }
  }
  return found;
}

/**
 * The model this request bills against. The harness picks the model per call,
 * so the session's registered model is only a fallback for an id we do not
 * recognize - pricing the wrong model would silently misreport spend.
 */
function billingModel(body: Record<string, unknown>, session: SessionState): ModelDefinition {
  const requested = typeof body.model === "string" ? body.model : undefined;
  return (requested ? findModelById(requested) : undefined) ?? session.modelDefinition;
}

/**
 * Resolve a request for Auto to the real model for this task. This is the one
 * rewrite the passthrough makes: Auto is a routing choice that Nebius does not
 * serve, so the `model` field has to name a real model before it is
 * forwarded. Everything else in the body goes through as the harness wrote it.
 */
export function resolveAutoRequest(
  body: Record<string, unknown>,
  session: Pick<SessionState, "modelDefinition" | "autoDecider" | "autoSettings">,
): { body: Record<string, unknown>; auto?: AutoDecision } {
  const requested = typeof body.model === "string" ? body.model : undefined;
  const unknown = requested === undefined || findModelById(requested) === undefined;
  const isAuto =
    isAutoModel(requested) || (unknown && session.modelDefinition.id === AUTO_MODEL_ID);
  if (!isAuto) {
    return { body };
  }
  const signals = chatAutoSignals(body);
  const auto = isAutoModel(requested)
    ? decideAuto(
        { ...signals, difficulty: decidedDifficulty(session.autoDecider, signals.prompt) },
        session.autoSettings,
      )
    : AUTO_HARNESS_CALL;
  const target = autoTargetModel(auto, session.autoSettings);
  return {
    body: {
      ...body,
      model: target.id,
      // Auto's suggested effort, only where the harness set none and the
      // model takes one. An explicit choice by the harness is left alone.
      ...(auto.effort && body.reasoning_effort === undefined && acceptsReasoningEffort(target.id)
        ? { reasoning_effort: auto.effort }
        : {}),
    },
    auto,
  };
}

/** Add Auto to a model listing, for a harness that checks its model exists. */
function withAutoListed(text: string): string {
  try {
    const parsed = JSON.parse(text) as { data?: unknown };
    if (!Array.isArray(parsed.data)) {
      return text;
    }
    const entry = { id: AUTO_MODEL_ID, object: "model", owned_by: "nconnect" };
    return JSON.stringify({ ...parsed, data: [entry, ...parsed.data] });
  } catch {
    return text;
  }
}

/** Ask for the terminal usage chunk; without it a streamed turn meters as $0. */
function withUsageReporting(body: Record<string, unknown>): Record<string, unknown> {
  if (body.stream !== true) {
    return body;
  }
  const existing = (body.stream_options ?? {}) as Record<string, unknown>;
  return { ...body, stream_options: { ...existing, include_usage: true } };
}

export async function handleChatPassthrough(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  session: SessionState,
): Promise<void> {
  const clientOptions = {
    apiKey: session.apiKey,
    baseUrl: session.baseUrl,
    ...(session.debug ? { debug: true } : {}),
  };

  // Model listing: forward verbatim so the harness sees the real catalog.
  if (!isChatCompletionsPath(path)) {
    const upstream = await fetch(`${session.baseUrl.replace(/\/$/, "")}/models`, {
      headers: { authorization: `Bearer ${session.apiKey}` },
    });
    const text = await upstream.text();
    res.writeHead(upstream.status, {
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
    });
    res.end(
      upstream.ok && session.modelDefinition.id === AUTO_MODEL_ID ? withAutoListed(text) : text,
    );
    return;
  }

  const { body: parsed } = await readJsonBodyWithSize(req);
  const incoming = (parsed ?? {}) as Record<string, unknown>;
  // Auto with a decider: ask it about a newly typed prompt before routing.
  if (
    session.autoDecider &&
    isAutoModel(typeof incoming.model === "string" ? incoming.model : "")
  ) {
    await primeAutoDecider(session.autoDecider, chatAutoSignals(incoming).prompt, {
      nebiusApiKey: session.apiKey,
      nebiusBaseUrl: session.baseUrl,
      debug: session.debug,
    });
  }
  const routed = resolveAutoRequest(incoming, session);
  const body = withUsageReporting(routed.body);
  const model = billingModel(body, session);
  if (routed.auto) {
    writeProxyDebugLog("nconnect proxy", session, "auto route", {
      tier: routed.auto.tier,
      reason: routed.auto.reason,
      model: model.id,
    });
  }

  const abort = new AbortController();
  res.once("close", () => {
    if (!res.writableEnded) {
      abort.abort();
    }
  });

  const meter = (usage: PassthroughUsage | undefined): void => {
    if (usage) {
      session.costTracker.addUsage(
        usage.promptTokens,
        usage.cachedTokens,
        usage.completionTokens,
        model,
      );
    }
  };

  if (body.stream === true) {
    const upstream = await postChatCompletionStream(body, clientOptions, abort.signal);
    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => "");
      res.writeHead(upstream.status, { "Content-Type": "application/json" });
      res.end(text || JSON.stringify({ error: { message: "Upstream request failed." } }));
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    const decoder = new TextDecoder();
    const reader = upstream.body.getReader();
    let usage: PassthroughUsage | undefined;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        const text = decoder.decode(value, { stream: true });
        usage = usageFromSseChunk(text) ?? usage;
        // Forward bytes untouched - the harness parses its own wire format.
        if (!res.write(text)) {
          await new Promise((resolve) => res.once("drain", resolve));
        }
      }
    } finally {
      // Meter whatever the turn produced even if the client hung up partway,
      // because those tokens were still generated and billed by Nebius.
      meter(usage);
      if (!res.writableEnded) {
        res.end();
      }
    }
    return;
  }

  const upstream = await postChatCompletion(body, clientOptions, abort.signal);
  const text = await upstream.text();
  if (upstream.ok) {
    try {
      meter(readUsage(JSON.parse(text)));
    } catch {
      // An unparseable 200 is not worth failing the turn over; the harness
      // gets the raw bytes and decides.
    }
  }
  res.writeHead(upstream.status, {
    "Content-Type": upstream.headers.get("content-type") ?? "application/json",
  });
  res.end(text);
}
