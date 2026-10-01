import {
  acceptsReasoningEffort,
  minimumReasoningEffort,
  type ModelDefinition,
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
import type {
  AnthropicMessagesRequest,
  AnthropicTool,
  NativeServerTool,
  OpenAIMessage,
  OpenAITool,
} from "./wire-types.js";

type DebugOptions = {
  debug?: boolean | undefined;
};

type NebiusReasoningEffort = "none" | "low" | "medium" | "high" | "max";

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
    return applyEffortFloor(explicitEffort, targetModel);
  }

  // Otherwise keep turns fast: send an explicit low/no effort so GLM-5.2 does
  // not fall back to reasoning on every turn.
  return applyEffortFloor(defaultReasoningEffort(), targetModel);
}

/**
 * Raise "none" to a model's minimum when its template mishandles it. GLM 5.3
 * Flash leaks its whole chain-of-thought into `content` at "none" (see
 * minimumReasoningEffort), which the user then reads as the answer.
 */
function applyEffortFloor(
  effort: NebiusReasoningEffort,
  targetModel: ModelDefinition,
): NebiusReasoningEffort {
  if (effort !== "none") {
    return effort;
  }
  const floor = minimumReasoningEffort(targetModel.id);
  return (floor as NebiusReasoningEffort | undefined) ?? effort;
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

export function toOpenAIMessages(
  body: AnthropicMessagesRequest,
  targetModel?: ModelDefinition,
  reasoningMode?: ReasoningHistoryMode,
): OpenAIMessage[] {
  const historyPolicy =
    reasoningMode === undefined
      ? currentReasoningHistoryPolicy()
      : reasoningHistoryPolicy(reasoningMode);
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
    for (const block of message.content) {
      if (block.type === "text") {
        textParts.push(block.text);
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
    if (content || reasoningParts.length > 0 || toolCalls.length > 0) {
      messages.push({
        role: message.role,
        content: content || null,
        ...(reasoningParts.length > 0 && historyPolicy.includeHistoricalReasoning
          ? { reasoning_content: reasoningParts.join("\n") }
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
