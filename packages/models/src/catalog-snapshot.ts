/**
 * Offline snapshot of the Nebius Token Factory verbose model catalog
 * (GET /v1/models?verbose=true), captured 2026-07-26. Used as the fallback
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
  // Verified against Nebius GET /v1/models?verbose=true on 2026-09-11.
  // Max output is not published there; retain the catalog's conservative default.
  {
    id: "zai-org/GLM-5.3",
    name: "GLM-5.3",
    context_length: 1024000,
    architecture: { modality: "text->text" },
    pricing: { prompt: "0.0000014", completion: "0.0000044", image: "0" },
  },
  {
    id: "deepseek-ai/DeepSeek-V4-Pro-0813",
    name: "DeepSeek-V4-Pro-0813",
    context_length: 979000,
    architecture: { modality: "text->text" },
    pricing: { prompt: "0.00000132", completion: "0.00000396", image: "0" },
  },
  {
    id: "Qwen/Qwen2.5-VL-72B-Instruct",
    name: "Qwen2.5-VL-72B-Instruct",
    description:
      "High-end multimodal model delivering strong vision-language reasoning with long-context support.",
    context_length: 32000,
    architecture: {
      modality: "text+image->text",
    },
    pricing: {
      prompt: "0.00000025",
      completion: "0.00000075",
      image: "0",
    },
  },
  {
    id: "MiniMaxAI/MiniMax-M3",
    name: "MiniMax-M3",
    description:
      "MiniMax-M3 is a 428B MoE reasoning model with 1M context, served on B200 via vLLM with EAGLE3 speculative decoding.",
    context_length: 8000,
    architecture: {
      modality: "text->text",
    },
    pricing: {
      prompt: "0.0000003",
      completion: "0.0000012",
      image: "0",
    },
  },
  {
    id: "moonshotai/Kimi-K2.7-Code",
    name: "Kimi-K2.7-Code",
    description:
      "Open-source code-focused reasoning model built for long-context software engineering, tool use, and agentic coding workflows.",
    context_length: 8000,
    architecture: {
      modality: "text->text",
    },
    pricing: {
      prompt: "0.00000095",
      completion: "0.000004",
      image: "0",
    },
  },
  {
    id: "moonshotai/Kimi-K2.6",
    name: "Kimi-K2.6",
    description:
      "Kimi K2.6 is an open-source, native multimodal agentic model built through continual pretraining on approximately 15 trillion mixed visual and text tokens atop Kimi-K2-Base",
    context_length: 262144,
    architecture: {
      modality: "text+image->text",
    },
    pricing: {
      prompt: "0.00000095",
      completion: "0.000004",
      image: "0",
    },
  },
  {
    id: "Qwen/Qwen3.5-397B-A17B",
    name: "Qwen3.5-397B-A17B",
    description:
      "Multimodal model featuring a Hybrid Mixture-of-Experts architecture, designed for state-of-the-art performance across chat, retrieval-augmented generation, vision-language understanding, video understanding, and agentic workflows",
    context_length: 262144,
    architecture: {
      modality: "text->text",
    },
    pricing: {
      prompt: "0.0000006",
      completion: "0.0000036",
      image: "0",
    },
  },
  {
    id: "deepseek-ai/DeepSeek-V4-Flash",
    name: "DeepSeek-V4-Flash",
    description:
      "DeepSeek-V4-Flash is a fast, cost-effective V4 preview model for coding, reasoning, and agentic workflows.",
    context_length: 1048576,
    architecture: {
      modality: "text->text",
    },
    pricing: {
      prompt: "0",
      completion: "0",
      image: "0",
    },
  },
  {
    id: "deepseek-ai/DeepSeek-V4-Pro",
    name: "DeepSeek-V4-Pro",
    description:
      "DeepSeek-V4 is designed for advanced reasoning, coding, and long-horizon agent workflows, with strong performance across knowledge, math, and software engineering benchmarks.",
    context_length: 1048576,
    architecture: {
      modality: "text->text",
    },
    pricing: {
      prompt: "0.00000175",
      completion: "0.0000035",
      image: "0",
    },
  },
  {
    id: "zai-org/GLM-5.2",
    name: "GLM-5.2",
    description:
      "Zhipu AI's latest flagship multimodal model with strong bilingual (Chinese-English) reasoning, long-context understanding, advanced tool use, and agent-oriented capabilities.",
    context_length: 8000,
    architecture: {
      modality: "text->text",
    },
    pricing: {
      prompt: "0.0000014",
      completion: "0.0000044",
      image: "0",
    },
  },
  {
    id: "moonshotai/Kimi-K3",
    name: "Kimi-K3",
    description:
      "Moonshot AI's Kimi K3 frontier open-weights MoE model (MXFP4, 1M context) with MTP speculative decoding, strong agentic tool use, reasoning, and coding.",
    context_length: 8000,
    architecture: {
      modality: "text+image->text",
    },
    pricing: {
      prompt: "0.000003",
      completion: "0.000015",
      image: "0",
    },
  },
  {
    id: "zai-org/GLM-5.3-Flash",
    name: "GLM-5.3-Flash",
    description:
      "Z.ai's GLM 5.3 Flash: fast, very low cost hybrid-reasoning open-weights model with a 1M context window and strong agentic tool use. The default model.",
    context_length: 1024000,
    architecture: {
      modality: "text+image->text",
    },
    pricing: {
      prompt: "0.00000015",
      completion: "0.0000005",
      image: "0",
    },
  },
];
