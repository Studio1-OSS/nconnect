import type { ModelDefinition } from "@nconnect/models";
import type { ResponsesInputItem, ResponsesRequest } from "./wire-types.js";

/**
 * Codex context-checkpoint compaction.
 *
 * When a Codex session approaches `auto_compact_token_limit` (a value WE
 * advertise in the model catalog - see codex/catalog.ts), Codex asks the server
 * to compact the conversation instead of continuing it. It signals this by
 * appending a `compaction_trigger` item to the input.
 *
 * Without special handling that request is treated as an ordinary turn: the
 * whole history is forwarded WITH every tool schema, the model answers the task
 * instead of summarizing, and Codex gets back something it cannot use as a
 * checkpoint - burning a large, expensive turn for nothing. Here we detect the
 * trigger, strip it, ask for a durable handoff summary with tools disabled, and
 * hand the summary back as a `compaction` item Codex can replay.
 *
 * The summary is stored in `encrypted_content` because that is the field Codex
 * reads. It is NOT encryption - it is a versioned, reversible nconnect
 * encoding (prefix `nrc1:`) so a later turn can recover the plain summary.
 */

const COMPACTION_PREFIX = "nrc1:";
const COMPACTION_MAX_OUTPUT_TOKENS = 8_192;

export const COMPACTION_SUMMARY_PREFIX =
  "Another language model started this task and produced a continuation summary. " +
  "Use it to continue without repeating completed work:";

const COMPACTION_PROMPT = `You are performing a context checkpoint compaction. Write a durable handoff summary for another language model that will resume the task.

Retain current progress, key decisions, constraints, user preferences, remaining work, and critical data or references. Be concise, structured, and focused on seamless continuation. Do not call tools.`;

/** True when Codex is asking us to compact rather than answer. */
export function isCodexCompactionRequest(body: ResponsesRequest): boolean {
  return Array.isArray(body.input) && body.input.at(-1)?.type === "compaction_trigger";
}

/** The conversation to summarize, with the trigger item removed. */
export function compactionInput(body: ResponsesRequest): ResponsesRequest["input"] {
  if (!Array.isArray(body.input)) {
    return body.input;
  }
  return body.input.filter((item) => item.type !== "compaction_trigger");
}

export function encodeCompactionSummary(summary: string): string {
  return `${COMPACTION_PREFIX}${Buffer.from(summary, "utf8").toString("base64")}`;
}

export function decodeCompactionSummary(encoded: string | undefined): string | undefined {
  if (!encoded?.startsWith(COMPACTION_PREFIX)) {
    return undefined;
  }
  try {
    return Buffer.from(encoded.slice(COMPACTION_PREFIX.length), "base64").toString("utf8");
  } catch {
    return undefined;
  }
}

/**
 * Turn a stored `compaction` item back into plain conversation text so the
 * model actually sees the summary on the next turn. Items we did not mint
 * (no `nrc1:` prefix) are passed through untouched.
 */
export function normalizeCompactionItem(item: ResponsesInputItem): ResponsesInputItem | undefined {
  if (item.type === "compaction_trigger") {
    return undefined;
  }
  if (item.type !== "compaction") {
    return item;
  }
  const summary = decodeCompactionSummary(
    (item as { encrypted_content?: string }).encrypted_content,
  );
  if (summary === undefined) {
    return item;
  }
  return {
    type: "message",
    role: "user",
    content: [{ type: "input_text", text: `${COMPACTION_SUMMARY_PREFIX}\n\n${summary}` }],
  } as ResponsesInputItem;
}

/** Replace compaction items with readable text across a whole input list. */
export function normalizeCompactionInput(
  input: readonly ResponsesInputItem[],
): ResponsesInputItem[] {
  return input
    .map((item) => normalizeCompactionItem(item))
    .filter((item): item is ResponsesInputItem => item !== undefined);
}

/**
 * Rewrite an already-translated chat payload into a compaction request: append
 * the summarize instruction, drop tools (a summary must not call them), cap
 * output, and force non-streaming so we can return one complete summary.
 */
export function toCompactionPayload(
  translatedPayload: Record<string, unknown>,
  modelDefinition: ModelDefinition,
): Record<string, unknown> {
  const messages = Array.isArray(translatedPayload.messages)
    ? [...(translatedPayload.messages as unknown[])]
    : [];
  messages.push({ role: "user", content: COMPACTION_PROMPT });
  return {
    ...translatedPayload,
    messages,
    max_tokens: Math.min(COMPACTION_MAX_OUTPUT_TOKENS, modelDefinition.limit.output),
    tools: undefined,
    tool_choice: undefined,
    // Reasoning adds latency and tokens to what is a summarization task.
    reasoning: { enabled: false },
    stream: false,
  };
}

/** Pull the summary text out of a non-streaming chat completion. */
export function compactionSummary(chatResponse: {
  choices?: Array<{ message?: { content?: string | null; reasoning_content?: string | null } }>;
}): string {
  const message = chatResponse.choices?.[0]?.message;
  return (message?.content || message?.reasoning_content || "").trim();
}

/** The Responses-shaped body Codex expects back from a compaction turn. */
export function compactionResponse(summary: string, model: string): Record<string, unknown> {
  return {
    id: `resp_${Date.now().toString(36)}`,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status: "completed",
    model,
    output: [
      {
        type: "compaction",
        id: `compaction_${Date.now().toString(36)}`,
        encrypted_content: encodeCompactionSummary(summary),
      },
    ],
    usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
  };
}

/**
 * Codex clients are inconsistent about the `/v1` prefix: the CLI is configured
 * with a base URL that already ends in `/v1` and appends `/responses`, while
 * some clients (notably ChatGPT Desktop) send the bare path. Treat the
 * un-prefixed forms as aliases so a valid request is never answered with a 404.
 */
const CODEX_V1_ALIAS_PATHS = new Set([
  "/models",
  "/responses",
  "/responses/compact",
  "/memories/trace_summarize",
]);

export const CODEX_RESPONSES_PATH = "/v1/responses";
export const CODEX_COMPACT_PATH = "/v1/responses/compact";
export const CODEX_MODELS_PATH = "/v1/models";
export const CODEX_MEMORIES_PATH = "/v1/memories/trace_summarize";

export function normalizeCodexPath(path: string): string {
  return CODEX_V1_ALIAS_PATHS.has(path) ? `/v1${path}` : path;
}

/** Both the turn endpoint and the dedicated compaction endpoint. */
export function isCodexResponsesPath(path: string): boolean {
  const normalized = normalizeCodexPath(path);
  return normalized === CODEX_RESPONSES_PATH || normalized === CODEX_COMPACT_PATH;
}

/** True for the dedicated compaction endpoint (as opposed to a trigger item). */
export function isCodexCompactPath(path: string): boolean {
  return normalizeCodexPath(path) === CODEX_COMPACT_PATH;
}

/** Codex durable-memory trace summarization. */
export function isCodexMemoriesPath(path: string): boolean {
  return normalizeCodexPath(path) === CODEX_MEMORIES_PATH;
}
