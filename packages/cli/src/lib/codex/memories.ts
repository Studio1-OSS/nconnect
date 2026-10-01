import type { ModelDefinition } from "@nconnect/models";
import { callNebiusWithNativeTools } from "./nebius-call.js";
import { EMPTY_CODEX_TOOL_TRANSLATION } from "./translate-request.js";
import type { ChatResponse } from "./wire-types.js";

/**
 * Codex durable memory (`/v1/memories/trace_summarize`).
 *
 * After a task, Codex asks the server to distill the trace into two things: a
 * faithful account of what happened, and the durable lessons worth keeping.
 * Without this endpoint Codex's memory feature has nowhere to go (we used to
 * 404), so nothing is ever retained between sessions.
 *
 * The summarizer runs on a cheap model - it is compression, not reasoning - and
 * tools are disabled because a summary must never take an action.
 */

const MEMORY_MAX_OUTPUT_TOKENS = 4_096;

const MEMORY_SYSTEM_PROMPT = `You summarize one Codex task trace for durable memory.
Return one JSON object with exactly two string fields:
- "trace_summary": a faithful, concrete summary of what happened in the trace.
- "memory_summary": the durable decisions, preferences, constraints, and reusable lessons worth retaining.
Do not call tools. Do not wrap the JSON in markdown.`;

export type CodexMemoryTrace = {
  id?: string;
  metadata?: { source_path?: string };
  items?: unknown[];
};

export type CodexMemoriesRequest = {
  model?: string;
  traces?: CodexMemoryTrace[];
  reasoning?: { effort?: string | null } | null;
};

export type CodexMemoryOutput = {
  trace_summary: string;
  memory_summary: string;
};

/** Validate the request body; returns an error message, or undefined if valid. */
export function invalidMemoryTraces(value: unknown): string | undefined {
  const body = value as CodexMemoriesRequest | null;
  if (!body || typeof body !== "object") {
    return "Request body must be an object.";
  }
  if (!Array.isArray(body.traces)) {
    return "traces must be an array.";
  }
  if (body.traces.length === 0) {
    return "traces must not be empty.";
  }
  return undefined;
}

function memoryPayload(
  trace: CodexMemoryTrace,
  targetModelId: string,
  modelDefinition: ModelDefinition,
): Record<string, unknown> {
  return {
    model: targetModelId,
    messages: [
      { role: "system", content: MEMORY_SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(trace) },
    ],
    max_tokens: Math.min(MEMORY_MAX_OUTPUT_TOKENS, modelDefinition.limit.output),
    response_format: { type: "json_object" },
    chat_template_kwargs: { clear_thinking: false },
    stream: false,
  };
}

export function parseMemoryJson(content: string): CodexMemoryOutput | undefined {
  // Models sometimes fence JSON despite being told not to.
  const unfenced = content
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
  try {
    const value = JSON.parse(unfenced) as Record<string, unknown>;
    if (typeof value.trace_summary !== "string" || typeof value.memory_summary !== "string") {
      return undefined;
    }
    return { trace_summary: value.trace_summary, memory_summary: value.memory_summary };
  } catch {
    return undefined;
  }
}

export function memoryOutput(response: ChatResponse): CodexMemoryOutput {
  const content = response.choices?.[0]?.message?.content?.trim() ?? "";
  const parsed = parseMemoryJson(content);
  if (parsed) {
    return parsed;
  }
  // Never fail the turn over malformed JSON - a plain-text summary is far more
  // useful to Codex than an error, so degrade to using the raw content.
  const fallback = content || "(no memory summary available)";
  return { trace_summary: fallback, memory_summary: fallback };
}

export async function summarizeCodexMemories(
  body: CodexMemoriesRequest,
  targetModelId: string,
  modelDefinition: ModelDefinition,
  options: Parameters<typeof callNebiusWithNativeTools>[2],
  signal?: AbortSignal,
  onUsage?: (usage: ChatResponse["usage"]) => void,
): Promise<{ output: CodexMemoryOutput[] }> {
  const output: CodexMemoryOutput[] = [];
  for (const trace of body.traces ?? []) {
    const response = await callNebiusWithNativeTools(
      memoryPayload(trace, targetModelId, modelDefinition),
      EMPTY_CODEX_TOOL_TRANSLATION,
      options,
      modelDefinition,
      signal,
    );
    output.push(memoryOutput(response));
    onUsage?.(response.usage);
  }
  return { output };
}
