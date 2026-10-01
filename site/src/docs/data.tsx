import type { ReactNode } from "react";
import {
  ClaudeMark,
  DeepSeekMark,
  GrokMark,
  OpenCodeMark,
  PiMark,
  PrimeMark,
} from "../routes/index";

export const installCommand = "curl -fsSL https://nconnect.sh/install.sh | bash";
export const githubUrl = "https://github.com/Studio1-OSS/nconnect";
export const changelogUrl = `${githubUrl}/blob/main/CHANGELOG.md`;
export const nebiusApiKeysUrl = "https://tokenfactory.nebius.com/?modals=create-api-key";
export const tavilyUrl = "https://app.tavily.com";
export const llmsUrl = "https://nconnect.sh/llms.txt";

export type HarnessMode = "Proxied" | "Spawned" | "Editor";

export const harnesses: Array<{
  name: string;
  command: string;
  mode: HarnessMode;
  note: string;
  logo: ReactNode;
  /** Slug under /docs/tutorials/ with a worked example for this harness. */
  tutorial?: string;
}> = [
  {
    name: "Claude Code",
    tutorial: "kimi-k3-claude-code",
    command: "nclaude",
    mode: "Proxied",
    note: "Anthropic Messages API translated to Nebius.",
    logo: <ClaudeMark />,
  },
  {
    name: "Codex CLI",
    tutorial: "glm-5-3-codex",
    command: "ncodex",
    mode: "Proxied",
    note: "OpenAI Responses API translated to Nebius.",
    logo: "/chatgpt-icon.png",
  },
  {
    name: "OpenCode",
    tutorial: "qwen-3-5-opencode",
    command: "nopencode",
    mode: "Spawned",
    note: "Nebius wired in as an OpenAI-compatible provider.",
    logo: <OpenCodeMark />,
  },
  {
    name: "Pi Code",
    tutorial: "minimax-m3-pi",
    command: "npi",
    mode: "Spawned",
    note: "Custom Nebius provider in a temporary config directory.",
    logo: <PiMark />,
  },
  {
    name: "Prime Agent",
    tutorial: "deepseek-v4-flash-prime-agent",
    command: "nprime",
    mode: "Spawned",
    note: "PrimeIntellect's RLM agent on Nebius models.",
    logo: <PrimeMark />,
  },
  {
    name: "Hermes Agent",
    tutorial: "kimi-k3-hermes-agent",
    command: "nhermes",
    mode: "Spawned",
    note: "Nous Research's agent, isolated home overlay.",
    logo: "/hermes-icon.png",
  },
  {
    name: "DeepSeek Harness",
    tutorial: "deepseek-v4-pro-deepseek-harness",
    command: "ndeepseek",
    mode: "Spawned",
    note: "DeepSeek's web profile with Nebius layered in.",
    logo: <DeepSeekMark />,
  },
  {
    name: "Grok Build",
    tutorial: "kimi-k3-grok-build",
    command: "ngrok",
    mode: "Spawned",
    note: "xAI's terminal harness; your key never reaches api.x.ai.",
    logo: <GrokMark />,
  },
  {
    name: "Unreal Agent",
    tutorial: "kimi-k2-7-code-unreal-agent",
    command: "nunreal",
    mode: "Proxied",
    note: "Unreal Labs' async-first runner; its Responses API traffic translated to Nebius.",
    logo: "/unreal-icon.png",
  },
  {
    name: "Cursor",
    command: "",
    mode: "Editor",
    note: "Native Nebius configuration.",
    logo: "/logos/cursor.png",
  },
  {
    name: "Antigravity IDE",
    command: "",
    mode: "Editor",
    note: "Native Nebius configuration.",
    logo: "/logos/antigravity.png",
  },
];

export const models: Array<{
  name: string;
  id: string;
  bestFor: string;
  context: string;
  vision: boolean;
  isDefault?: boolean;
  logo: ReactNode;
}> = [
  {
    name: "GLM 5.3 Flash",
    id: "zai-org/GLM-5.3-Flash",
    bestFor: "Fast, very low cost, agentic",
    context: "1M",
    vision: false,
    isDefault: true,
    logo: "/zai-logo.svg",
  },
  {
    name: "GLM 5.3",
    id: "zai-org/GLM-5.3",
    bestFor: "Coding, reasoning, tool use",
    context: "1,024K",
    vision: false,
    logo: "/zai-logo.svg",
  },
  {
    name: "DeepSeek V4 Pro 0813",
    id: "deepseek-ai/DeepSeek-V4-Pro-0813",
    bestFor: "Reasoning and agentic coding",
    context: "979K",
    vision: false,
    logo: <DeepSeekMark />,
  },
  {
    name: "Kimi K3",
    id: "moonshotai/Kimi-K3",
    bestFor: "Frontier coding + agentic",
    context: "1M",
    vision: false,
    logo: "/logos/kimi.png",
  },
  {
    name: "Kimi K2.6",
    id: "moonshotai/Kimi-K2.6",
    bestFor: "Vision flagship",
    context: "262K",
    vision: true,
    logo: "/logos/kimi.png",
  },
  {
    name: "Kimi K2.7 Code",
    id: "moonshotai/Kimi-K2.7-Code",
    bestFor: "Coding",
    context: "262K",
    vision: false,
    logo: "/logos/kimi.png",
  },
  {
    name: "MiniMax M3",
    id: "MiniMaxAI/MiniMax-M3",
    bestFor: "Fast, cheap",
    context: "196K",
    vision: false,
    logo: "/logos/minimax.png",
  },
  {
    name: "Qwen 3.5 397B",
    id: "Qwen/Qwen3.5-397B-A17B",
    bestFor: "General / coding flagship",
    context: "262K",
    vision: false,
    logo: "/logos/qwen.png",
  },
  {
    name: "DeepSeek V4 Flash",
    id: "deepseek-ai/DeepSeek-V4-Flash",
    bestFor: "Fast DeepSeek V4",
    context: "1M",
    vision: false,
    logo: <DeepSeekMark />,
  },
  {
    name: "DeepSeek V4 Pro",
    id: "deepseek-ai/DeepSeek-V4-Pro",
    bestFor: "Long-context reasoning",
    context: "1M",
    vision: false,
    logo: <DeepSeekMark />,
  },
  {
    name: "Qwen2.5-VL 72B",
    id: "Qwen/Qwen2.5-VL-72B-Instruct",
    bestFor: "Vision fallback",
    context: "32K",
    vision: true,
    logo: "/logos/qwen.png",
  },
];
