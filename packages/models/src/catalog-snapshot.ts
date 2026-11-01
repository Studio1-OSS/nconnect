/**
 * Offline snapshot of the Nebius Token Factory verbose model catalog
 * (GET /v1/models?verbose=true), captured 2026-11-01. Used as the fallback
 * when the live fetch fails or has not run yet, and as the deterministic
 * source for the named model constants the test-suite imports. A small number
 * of newer fallback rows may be manually appended between captures so newly
 * announced models are still selectable when offline.
 *
 * Regenerate with: pnpm -F @nconnect/cli exec nconnect ... (see
 * scripts/list-nebius-models.mjs) or re-run the capture in the models package.
 * Only the fields buildCatalog() reads are kept.
 */
import type { NebiusApiModel } from "./index.js";

export const CATALOG_SNAPSHOT: readonly NebiusApiModel[] = [
  {
    id: "deepseek-ai/DeepSeek-V4.1-Flash-1017",
    name: "DeepSeek V4.1 Flash 1017",
    description:
      "DeepSeek\u2019s multimodal Flash model for reasoning, coding and tool-driven workflows, with text and image input and text output.",
    context_length: 1048576,
    architecture: { modality: "text+image->text" },
    pricing: {
      prompt: "0.0000003",
      input_cache_read: "0.000000006",
      completion: "0.0000012",
      image: "0",
    },
    supported_features: ["tools", "reasoning"],
  },
  {
    id: "MiniMaxAI/MiniMax-M3.1-Flash",
    name: "MiniMax-M3.1-Flash",
    description:
      "MiniMax-M3.1-Flash is a native multimodal mixture-of-experts model for coding, agentic workflows, computer use, and cybersecurity. It supports text, image, and video inputs with a context window of up to 1M tokens.",
    context_length: 1048576,
    architecture: { modality: "text+image->text" },
    pricing: {
      prompt: "0.00000015",
      input_cache_read: "0.000000015",
      completion: "0.0000006",
      image: "0",
    },
    supported_features: ["tools", "reasoning"],
  },
  {
    id: "reflection/beam",
    name: "Reflection Beam 1.0",
    description:
      "Beam is Reflection\u2019s open-weight, instruction-tuned text model for coding, reasoning and agentic tool use. Its mixture-of-experts architecture has 501.3B total parameters and 23.4B active parameters. It supports a 1M-token context window, was developed predominantly for English, and has a knowledge cutoff of June 30, 2026.",
    context_length: 1048576,
    architecture: { modality: "text->text" },
    pricing: {
      prompt: "0.00000025",
      input_cache_read: "0.00000005",
      completion: "0.000001",
      image: "0",
    },
    supported_features: ["tools", "reasoning"],
  },
  {
    id: "nvidia/Nemotron-3.5-Super-VL",
    name: "Nemotron 3.5 Super VL",
    description:
      "NVIDIA's multimodal model for visual understanding, coding, reasoning, and tool use. It processes text, images, and video to generate text responses.",
    context_length: 1048576,
    architecture: { modality: "text+image->text" },
    pricing: {
      prompt: "0.0000003",
      input_cache_read: "0.00000006",
      completion: "0.0000009",
      image: "0",
    },
    supported_features: ["tools", "reasoning"],
  },
  {
    id: "nvidia/Nemotron-3_5-Lightning",
    name: "Nemotron-3.5-Lightning",
    description:
      "NVIDIA's 30B-parameter hybrid MoE model with 3B active parameters per token, designed for efficient agentic reasoning, tool use, coding, and long-context workflows.",
    context_length: 1048576,
    architecture: { modality: "text->text" },
    pricing: {
      prompt: "0.00000006",
      input_cache_read: "0.00000003",
      completion: "0.00000024",
      image: "0",
    },
    supported_features: ["tools", "reasoning"],
  },
  {
    id: "Qwen/Qwen3.8-27B",
    name: "Qwen3.8-27B",
    description:
      "Qwen3.8-27B is Qwen's dense 27B-parameter reasoning model for coding, professional work, research, and long-horizon agentic tasks. This NVFP4 serverless deployment supports tool calling and a native 262K context window.",
    context_length: 262144,
    architecture: { modality: "text+image->text" },
    pricing: {
      prompt: "0.00000045",
      input_cache_read: "0.0000001",
      completion: "0.000003",
      image: "0",
    },
    supported_features: ["tools", "reasoning"],
  },
  {
    id: "deepseek-ai/DeepSeek-V4.1-Flash",
    name: "DeepSeek V4.1 Flash",
    description:
      "DeepSeek\u2019s multimodal mixture-of-experts model for coding, reasoning, and tasks combining images and text.",
    context_length: 1048576,
    architecture: { modality: "text+image->text" },
    pricing: {
      prompt: "0.0000003",
      input_cache_read: "0.00000001",
      completion: "0.0000012",
      image: "0",
    },
  },
  {
    id: "deepseek-ai/DeepSeek-V4-Flash-0731",
    name: "DeepSeek-V4-Flash-0731",
    description:
      "DeepSeek V4 Flash 0731 is a 1M-context reasoning model designed for coding and agentic workloads.",
    context_length: 1048576,
    architecture: { modality: "text->text" },
    pricing: {
      prompt: "0.00000014",
      input_cache_read: "0.00000001",
      completion: "0.00000028",
      image: "0",
    },
    supported_features: ["tools", "json_mode", "structured_outputs", "reasoning"],
  },
  {
    id: "meta-models/muse-spark-open",
    name: "Muse Spark Open",
    description:
      "Meta\u2019s 816B-parameter mixture-of-experts model for coding and agentic workflows, with about 42B active parameters, image and video input, reasoning and tool use.",
    context_length: 1048576,
    architecture: { modality: "text+image->text" },
    pricing: {
      prompt: "0.00000125",
      input_cache_read: "0.00000015",
      completion: "0.00000425",
      image: "0",
    },
    supported_features: ["tools", "reasoning"],
  },
  {
    id: "zai-org/GLM-5.3",
    name: "GLM-5.3",
    description:
      "Z.ai's GLM-5.3 in NVFP4 with DFlash2 speculative decoding: a 750B-parameter mixture-of-experts model for coding, agentic workflows, reasoning, tool use, and long-context tasks over a 1M-token window.",
    context_length: 1048576,
    architecture: { modality: "text->text" },
    pricing: {
      prompt: "0.0000014",
      input_cache_read: "0.00000026",
      completion: "0.0000044",
      image: "0",
    },
    supported_features: ["tools", "reasoning"],
  },
  {
    id: "deepseek-ai/DeepSeek-V4-Pro-0813",
    name: "DeepSeek-V4-Pro-0813",
    description:
      "DeepSeek V4 Pro 0813 is DeepSeek's official V4 Pro release for advanced reasoning, coding, tool use, and long-horizon agentic workflows.",
    context_length: 1048576,
    architecture: { modality: "text->text" },
    pricing: {
      prompt: "0.00000132",
      input_cache_read: "0.00000004",
      completion: "0.00000396",
      image: "0",
    },
    supported_features: ["tools", "reasoning"],
  },
  {
    id: "MiniMaxAI/MiniMax-M3",
    name: "MiniMax-M3",
    description:
      "MiniMax-M3 is a 428B MoE reasoning model with 1M context, served on B200 via vLLM with EAGLE3 speculative decoding.",
    context_length: 1048576,
    architecture: { modality: "text->text" },
    pricing: {
      prompt: "0.0000003",
      input_cache_read: "0.00000006",
      completion: "0.0000012",
      image: "0",
    },
    supported_features: ["tools", "reasoning"],
  },
  {
    id: "moonshotai/Kimi-K2.7-Code",
    name: "Kimi-K2.7-Code",
    description:
      "Open-source code-focused reasoning model built for long-context software engineering, tool use, and agentic coding workflows.",
    context_length: 262144,
    architecture: { modality: "text->text" },
    pricing: {
      prompt: "0.00000095",
      input_cache_read: "0.00000015",
      completion: "0.000004",
      image: "0",
    },
    supported_features: ["tools", "reasoning"],
  },
  {
    id: "moonshotai/Kimi-K2.6",
    name: "Kimi-K2.6",
    description:
      "Kimi K2.6 is an open-source, native multimodal agentic model built through continual pretraining on approximately 15 trillion mixed visual and text tokens atop Kimi-K2-Base",
    context_length: 262144,
    architecture: { modality: "text+image->text" },
    pricing: {
      prompt: "0.00000095",
      input_cache_read: "0.00000016",
      completion: "0.000004",
      image: "0",
    },
    supported_features: ["tools", "reasoning"],
  },
  {
    id: "Qwen/Qwen3.5-397B-A17B",
    name: "Qwen3.5-397B-A17B",
    description:
      "Multimodal model featuring a Hybrid Mixture-of-Experts architecture, designed for state-of-the-art performance across chat, retrieval-augmented generation, vision-language understanding, video understanding, and agentic workflows",
    context_length: 262144,
    architecture: { modality: "text->text" },
    pricing: {
      prompt: "0.0000006",
      input_cache_read: "0.00000012",
      completion: "0.0000036",
      image: "0",
    },
    supported_features: ["tools", "reasoning"],
  },
  {
    id: "deepseek-ai/DeepSeek-V4-Pro",
    name: "DeepSeek-V4-Pro",
    description:
      "DeepSeek-V4 is designed for advanced reasoning, coding, and long-horizon agent workflows, with strong performance across knowledge, math, and software engineering benchmarks.",
    context_length: 1048576,
    architecture: { modality: "text->text" },
    pricing: {
      prompt: "0.00000175",
      input_cache_read: "0.00000014",
      completion: "0.0000035",
      image: "0",
    },
    supported_features: ["tools", "json_mode", "structured_outputs", "reasoning"],
  },
  {
    id: "zai-org/GLM-5.2",
    name: "GLM-5.2",
    description:
      "Zhipu AI's latest flagship multimodal model with strong bilingual (Chinese-English) reasoning, long-context understanding, advanced tool use, and agent-oriented capabilities.",
    context_length: 1048576,
    architecture: { modality: "text->text" },
    pricing: {
      prompt: "0.0000014",
      input_cache_read: "0.00000014",
      completion: "0.0000044",
      image: "0",
    },
    supported_features: ["tools", "reasoning"],
  },
  {
    id: "moonshotai/Kimi-K3",
    name: "Kimi-K3",
    description:
      "Moonshot AI's Kimi K3 frontier open-weights MoE model (NVFP4, 1M context) with DSpark speculative decoding, strong agentic tool use, reasoning, and coding.",
    context_length: 1048576,
    architecture: { modality: "text+image->text" },
    pricing: {
      prompt: "0.000003",
      input_cache_read: "0.0000003",
      completion: "0.000015",
      image: "0",
    },
    supported_features: ["tools", "reasoning"],
  },
  {
    id: "zai-org/GLM-5.3-Flash",
    name: "GLM-5.3-Flash",
    description:
      "Z.ai's 320B-parameter, 18B-active mixture-of-experts model for coding, agentic workflows, reasoning, tool use, and long-context tasks.",
    context_length: 1048576,
    architecture: { modality: "text+image->text" },
    pricing: {
      prompt: "0.00000015",
      input_cache_read: "0.00000003",
      completion: "0.0000005",
      image: "0",
    },
    supported_features: ["tools", "reasoning"],
  },
];
