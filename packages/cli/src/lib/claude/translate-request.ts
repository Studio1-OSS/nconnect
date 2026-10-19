import {
  acceptsReasoningEffort,
  maximumReasoningEffort,
  minimumReasoningEffort,
  type ModelDefinition,
  requiresReasoningOnAssistantTurns,
} from "@nconnect/models";
import {
  nativeToolMaxUses as sharedNativeToolMaxUses,
  runWebSearchDetailed as runSharedWebSearchDetailed,
  stringArray,
  withNativeToolSystemPrompt as withSharedNativeToolSystemPrompt,
  type WebSearchOutcome,
} from "../tavily-search.js";
import { writeProxyDebugLog } from "../proxy-debug.js";
import {
  formatToolResultContent,
  formatWebSearchToolResult,
  stringifyAnthropicContent,
} from "./content-format.js";
import {
  currentReasoningHistoryPolicy,
  reasoningHistoryPolicy,
  type ReasoningHistoryMode,
} from "../reasoning-history.js";
import { isImageBlock, isUrlImageBlock, toDataUrl } from "./vision.js";
import type {
  AnthropicMessagesRequest,
  AnthropicTool,
  NativeServerTool,
  OpenAIContentPart,
  OpenAIMessage,
  OpenAITool,
} from "./wire-types.js";

type DebugOptions = {
  debug?: boolean | undefined;
};

type NebiusReasoningEffort = "none" | "low" | "medium" | "high" | "max" | "xhigh";

const NCONNECT_IDENTITY_PROMPT =
  "You are a Nebius Token Factory model routed through nconnect, not Anthropic Claude.";

/**
 * Reasoning effort applied when the request does NOT explicitly ask for extended
 * thinking. GLM-5.2 is a hybrid reasoning model: with no `reasoning_effort` it
 * reasons on *every* turn (240+ reasoning tokens even for "hi"), which dominates
 * latency - Claude Code then renders that unsolicited reasoning as "Thought for
 * Ns". Defaulting to "none" keeps interactive turns snappy. Override globally
 * with NCONNECT_REASONING_EFFORT=low|medium|high|max for more reasoning depth
 * by default (at the cost of speed).
 */
function defaultReasoningEffort(): NebiusReasoningEffort {
  return normalizeNebiusReasoningEffort(process.env.NCONNECT_REASONING_EFFORT) ?? "none";
}

export function nebiusReasoningEffort(
  body: AnthropicMessagesRequest,
  targetModel: ModelDefinition,
  /** Effort Auto suggests for this request, when it routed it. */
  autoEffort?: NebiusReasoningEffort,
): NebiusReasoningEffort | undefined {
  // Only send reasoning_effort to models known to accept it (GLM-5.2, Kimi-K3);
  // other Nebius models may reject the parameter. Both are hybrid reasoners that
  // reason on every turn without an explicit effort, so capping it keeps trivial
  // turns fast and prevents runaway output.
  if (!acceptsReasoningEffort(targetModel.id)) {
    return undefined;
  }

  // An explicit reasoning_effort/effort on the request wins. NOTE: we do NOT
  // escalate off Claude Code's `thinking.budget_tokens` - Claude Code sends a
  // thinking budget liberally, and mapping that to high/max reasoning is what
  // made trivial turns take ~40s. Deep reasoning is opt-in via an explicit
  // effort field or NCONNECT_REASONING_EFFORT.
  const explicitEffort = normalizeNebiusReasoningEffort(
    body.reasoning_effort ?? body.effort ?? body.thinking?.effort,
  );
  if (explicitEffort) {
    return applyEffortBounds(explicitEffort, targetModel);
  }
  // Auto judged this task worth more thought. It sets this on a task's first
  // turn only, so the tool-calling turns after it stay fast.
  if (autoEffort) {
    return applyEffortBounds(autoEffort, targetModel);
  }

  // Otherwise keep turns fast: send an explicit low/no effort so GLM-5.2 does
  // not fall back to reasoning on every turn.
  return applyEffortBounds(defaultReasoningEffort(), targetModel);
}

/**
 * Raise "none" to a model's minimum when its template mishandles it, and
 * lower "max" to the name a model takes for its top effort. GLM 5.3 Flash
 * leaks its whole chain-of-thought into `content` at "none" (see
 * minimumReasoningEffort); Muse Spark Open rejects both "none" and "max".
 */
function applyEffortBounds(
  effort: NebiusReasoningEffort,
  targetModel: ModelDefinition,
): NebiusReasoningEffort {
  const bound =
    effort === "none"
      ? minimumReasoningEffort(targetModel.id)
      : effort === "max"
        ? maximumReasoningEffort(targetModel.id)
        : undefined;
  return (bound as NebiusReasoningEffort | undefined) ?? effort;
}

function normalizeNebiusReasoningEffort(value: unknown): NebiusReasoningEffort | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const effort = value.toLowerCase();
  if (effort === "none" || effort === "minimal" || effort === "off") {
    return "none";
  }
  if (effort === "low") {
    return "low";
  }
  if (effort === "medium") {
    return "medium";
  }
  if (effort === "high") {
    return "high";
  }
  if (effort === "max" || effort === "xhigh") {
    return "max";
  }
  return undefined;
}

export function toOpenAITools(
  tools: AnthropicTool[] | undefined,
  options?: DebugOptions,
): OpenAITool[] | undefined {
  if (!tools || tools.length === 0) {
    return undefined;
  }
  const hasNativeWebSearch = tools.some(isNativeWebSearchTool);
  return tools.flatMap((tool) => {
    if (hasNativeWebSearch && !isNativeWebSearchTool(tool) && tool.name === "web_search") {
      debugLog(options, "dropped colliding custom web_search tool", {
        name: tool.name,
        type: tool.type,
      });
      return [];
    }
    return [
      {
        type: "function",
        function: {
          name: openAIToolName(tool),
          description: tool.description ?? "",
          parameters: toOpenAIToolParameters(tool),
        },
      },
    ];
  });
}

function openAIToolName(tool: AnthropicTool): string {
  return isNativeWebSearchTool(tool) ? "web_search" : (tool.name ?? "tool");
}

function toOpenAIToolParameters(tool: AnthropicTool): unknown {
  if (tool.input_schema) {
    return tool.input_schema;
  }
  if (isNativeWebSearchTool(tool)) {
    return {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    };
  }
  return { type: "object", properties: {} };
}

export function toOpenAIToolChoice(toolChoice: unknown): unknown {
  if (!toolChoice || typeof toolChoice !== "object") {
    return undefined;
  }
  const choice = toolChoice as { type?: unknown; name?: unknown };
  if (choice.type === "auto") {
    return "auto";
  }
  if (choice.type === "any") {
    return "required";
  }
  if (choice.type === "tool" && typeof choice.name === "string" && choice.name) {
    return { type: "function", function: { name: choice.name } };
  }
  return undefined;
}

export function nativeServerTools(tools: AnthropicTool[] | undefined): NativeServerTool[] {
  return (tools ?? []).flatMap((tool) => {
    if (!isNativeWebSearchTool(tool)) {
      return [];
    }
    return [{ kind: "web_search", name: "web_search", definition: tool }];
  });
}

function isNativeWebSearchTool(tool: AnthropicTool): boolean {
  return tool.type?.startsWith("web_search") === true;
}

export function claudeNativeToolMaxUses(tool: AnthropicTool): number {
  return sharedNativeToolMaxUses(tool as { max_uses?: unknown });
}

export function withClaudeNativeToolSystemPrompt(
  messages: OpenAIMessage[],
  nativeTools: NativeServerTool[],
): OpenAIMessage[] {
  return withSharedNativeToolSystemPrompt(messages, nativeTools, {
    mergeLeadingSystemMessages,
    toolName: (tool) => tool.name,
  });
}

export async function runClaudeWebSearch(
  input: unknown,
  tool: AnthropicTool,
  options: DebugOptions,
): Promise<WebSearchOutcome> {
  return runSharedWebSearchDetailed({
    query: input,
    queryKeys: ["query", "q"],
    allowedDomains: stringArray(tool.allowed_domains, { requireTrimmed: false }),
    blockedDomains: stringArray(tool.blocked_domains, { requireTrimmed: false }),
    tavilyApiKey: process.env.TAVILY_API_KEY,
    debugLog: (label, value) => debugLog(options, label, value),
    missingApiKeyMessage:
      "Web search error: TAVILY_API_KEY is not set. Set it in the repo .env (TAVILY_API_KEY=...) and retry.",
    snippetLength: 600,
  });
}

/** An Anthropic image/url block as a chat-completions content part. */
function imagePart(block: unknown): OpenAIContentPart | undefined {
  if (!isImageBlock(block) && !isUrlImageBlock(block)) {
    return undefined;
  }
  const url = toDataUrl(block);
  return url
    ? { type: "image_url", image_url: { url } }
    : { type: "text", text: "[Image unavailable: could not read image data]" };
}

/**
 * Translate an Anthropic request into chat-completions messages.
 *
 * `nativeImages` is for a target model that can see. Image blocks then travel
 * as `image_url` parts instead of being dropped. A tool message can only hold
 * text, so an image returned by a tool (Claude Code's Read on a screenshot) is
 * carried in the user message that follows the tool results, labelled with the
 * call it came from. Leave it off for text-only models and for token counting.
 */
/** Sent as the reasoning of an assistant turn that has none, for models that require one. */
export const NO_REASONING_RECORDED =
  "[nconnect: no reasoning was recorded for this turn, for example because a different model produced it.]";

export function toOpenAIMessages(
  body: AnthropicMessagesRequest,
  targetModel?: ModelDefinition,
  reasoningMode?: ReasoningHistoryMode,
  nativeImages = false,
): OpenAIMessage[] {
  const historyPolicy =
    reasoningMode === undefined
      ? currentReasoningHistoryPolicy()
      : reasoningHistoryPolicy(reasoningMode);
  // Some models refuse a request whose earlier assistant turns lack reasoning. Send theirs back
  // whatever the history setting, and label turns that have none, such as turns another model
  // produced before Auto escalated to this one. The label states a fact; it is not reasoning.
  const reasoningRequired = targetModel ? requiresReasoningOnAssistantTurns(targetModel.id) : false;
  const systemParts = [
    targetModel
      ? `${NCONNECT_IDENTITY_PROMPT} Backend: ${targetModel.name} (${targetModel.id}).`
      : NCONNECT_IDENTITY_PROMPT,
  ];
  const system = stringifyAnthropicContent(body.system);
  if (system) {
    systemParts.push(system);
  }
  const messages: OpenAIMessage[] = [{ role: "system", content: systemParts.join("\n\n") }];

  for (const message of body.messages ?? []) {
    if (typeof message.content === "string") {
      messages.push({ role: message.role, content: message.content });
      continue;
    }

    const textParts: string[] = [];
    const reasoningParts: string[] = [];
    const toolCalls: OpenAIMessage["tool_calls"] = [];
    // Text and images in their original order, used only when an image is present.
    const parts: OpenAIContentPart[] = [];
    let hasImage = false;
    const sendImages = nativeImages && message.role === "user";
    for (const block of message.content) {
      if (block.type === "text") {
        textParts.push(block.text);
        parts.push({ type: "text", text: block.text });
      } else if (sendImages && (block.type === "image" || block.type === "url")) {
        const part = imagePart(block);
        if (part) {
          parts.push(part);
          hasImage = true;
        }
      } else if (block.type === "thinking") {
        reasoningParts.push(block.thinking);
      } else if (block.type === "redacted_thinking") {
        reasoningParts.push(block.data);
      } else if (block.type === "tool_result") {
        messages.push({
          role: "tool",
          tool_call_id: block.tool_use_id,
          content: formatToolResultContent(block.content, block.is_error),
        });
        if (sendImages && Array.isArray(block.content)) {
          for (const inner of block.content) {
            const part = imagePart(inner);
            if (part) {
              parts.push({ type: "text", text: `[Image from tool result ${block.tool_use_id}]` });
              parts.push(part);
              hasImage = true;
            }
          }
        }
      } else if (
        block.type === "web_search_tool_result" ||
        block.type === "web_search_tool_result_error"
      ) {
        messages.push({
          role: "tool",
          tool_call_id: block.tool_use_id ?? "web_search",
          content: formatWebSearchToolResult(block),
        });
      } else if (block.type === "tool_use" || block.type === "server_tool_use") {
        toolCalls.push({
          id: block.id,
          type: "function",
          function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) },
        });
      }
    }

    const content = textParts.join("\n");
    if (hasImage || content || reasoningParts.length > 0 || toolCalls.length > 0) {
      messages.push({
        role: message.role,
        content: hasImage ? parts : content || null,
        ...(reasoningParts.length > 0 &&
        (historyPolicy.includeHistoricalReasoning || reasoningRequired)
          ? { reasoning_content: reasoningParts.join("\n") }
          : reasoningRequired && message.role === "assistant"
            ? { reasoning_content: NO_REASONING_RECORDED }
            : {}),
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      });
    }
  }

  return messages;
}

function mergeLeadingSystemMessages(messages: OpenAIMessage[]): OpenAIMessage[] {
  const systemParts: string[] = [];
  let index = 0;
  while (index < messages.length && messages[index]?.role === "system") {
    const content = messages[index]?.content;
    if (typeof content === "string" && content.trim()) {
      systemParts.push(content);
    }
    index += 1;
  }
  if (systemParts.length === 0) {
    return messages.slice(index);
  }
  return [{ role: "system", content: systemParts.join("\n\n") }, ...messages.slice(index)];
}

function debugLog(
  options: DebugOptions | undefined,
  label: string,
  value: unknown | (() => unknown),
): void {
  writeProxyDebugLog("nconnect proxy", options, label, value);
}
