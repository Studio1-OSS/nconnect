import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  acceptsReasoningEffort,
  getAllModels,
  getDefaultModel,
  getVisionModels,
  getVisionPrimary,
  isVisionModel,
  type ModelDefinition,
} from "@nconnect/models";
import { createSessionStore } from "./daemon/storage.js";

/**
 * `nconnect image describe`: ask a vision model about an image from the
 * terminal, without opening a coding agent.
 *
 * Nebius Token Factory serves models that read images but none that create
 * them (its images endpoint does not exist, checked 2026-10-07), so there is
 * no `generate` or `edit` here; asking for one says so instead of failing
 * obscurely.
 */

export const DEFAULT_IMAGE_PROMPT = "Describe this image.";
/** Above this a base64 request body is unlikely to be accepted upstream. */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_OUTPUT_TOKENS = 4096;

const MEDIA_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export const IMAGE_USAGE = `Usage:
  nconnect image describe <file-or-url> [question] [--prompt <question>] [--model <id>] [--json]

Examples:
  nconnect image describe screenshot.png
  nconnect image describe error.png "What is the error message?"
  nconnect image describe diagram.webp --model moonshotai/Kimi-K3 --json

Reads PNG, JPEG, GIF and WebP files, or an http(s) image URL.`;

export type ImageArgs = {
  verb: string | undefined;
  source: string | undefined;
  prompt: string;
  model: string | undefined;
  json: boolean;
  help: boolean;
};

/** Parse everything after `image` on the command line. */
export function parseImageArgs(argv: readonly string[]): ImageArgs {
  const positional: string[] = [];
  let prompt: string | undefined;
  let model: string | undefined;
  let json = false;
  let help = false;
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i] as string;
    if (token === "--json") {
      json = true;
    } else if (token === "--help" || token === "-h") {
      help = true;
    } else if (token === "--prompt" || token === "-p" || token === "--model" || token === "-m") {
      const value = argv[i + 1];
      if (value === undefined) {
        throw new Error(`Flag ${token} expects a value`);
      }
      if (token === "--prompt" || token === "-p") {
        prompt = value;
      } else {
        model = value;
      }
      i += 1;
    } else if (token.startsWith("--prompt=")) {
      prompt = token.slice("--prompt=".length);
    } else if (token.startsWith("--model=")) {
      model = token.slice("--model=".length);
    } else if (token.startsWith("-") && token !== "-") {
      throw new Error(`Unknown flag ${token} for "nconnect image".\n\n${IMAGE_USAGE}`);
    } else {
      positional.push(token);
    }
  }
  const [verb, source, ...rest] = positional;
  // Words after the image are the question, so it needs no flag or quoting.
  const question = prompt ?? rest.join(" ");
  return { verb, source, prompt: question.trim() || DEFAULT_IMAGE_PROMPT, model, json, help };
}

function sniffMediaType(bytes: Uint8Array): string | undefined {
  const starts = (...sig: number[]) => sig.every((byte, i) => bytes[i] === byte);
  if (starts(0x89, 0x50, 0x4e, 0x47)) {
    return "image/png";
  }
  if (starts(0xff, 0xd8, 0xff)) {
    return "image/jpeg";
  }
  if (starts(0x47, 0x49, 0x46, 0x38)) {
    return "image/gif";
  }
  if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45) {
    return "image/webp";
  }
  return undefined;
}

/** A local file as a data URL, or an http(s) URL unchanged. */
export async function imageUrlFor(source: string): Promise<string> {
  if (/^https?:\/\//i.test(source)) {
    return source;
  }
  let size: number;
  try {
    const info = await stat(source);
    if (!info.isFile()) {
      throw new Error(`"${source}" is not a file.`);
    }
    size = info.size;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`No image at "${source}".`, { cause: err });
    }
    throw err;
  }
  if (size === 0) {
    throw new Error(`"${source}" is empty.`);
  }
  if (size > MAX_IMAGE_BYTES) {
    throw new Error(
      `"${source}" is ${(size / 1024 / 1024).toFixed(1)} MB; the limit is ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`,
    );
  }
  const bytes = await readFile(source);
  // Trust the content over the name: a mislabelled file is sent as what it is.
  const mediaType = sniffMediaType(bytes) ?? MEDIA_TYPES[path.extname(source).toLowerCase()];
  if (!mediaType) {
    throw new Error(`"${source}" is not a PNG, JPEG, GIF or WebP image.`);
  }
  return `data:${mediaType};base64,${bytes.toString("base64")}`;
}

/**
 * The model that reads the image. Unasked, that is the default model when it
 * can see (GLM 5.3 Flash: the cheapest vision model in the lineup), otherwise
 * the catalog's vision model. A named model must be one that accepts images.
 */
export function pickImageModel(requested?: string): ModelDefinition {
  if (!requested) {
    const fallback = getDefaultModel();
    return isVisionModel(fallback) ? fallback : getVisionPrimary();
  }
  const model = getAllModels().find((m) => m.id === requested || m.anthropicAlias === requested);
  const vision = getVisionModels()
    .map((m) => m.id)
    .join(", ");
  if (!model) {
    throw new Error(`Unknown model "${requested}". Models that read images: ${vision}.`);
  }
  if (!isVisionModel(model)) {
    throw new Error(`${model.id} does not accept images. Models that do: ${vision}.`);
  }
  return model;
}

export type ImageDescription = {
  model: string;
  text: string;
  usage: { inputTokens: number; outputTokens: number };
  costUsd: number;
};

export async function describeImageFile(options: {
  source: string;
  prompt: string;
  model: ModelDefinition;
  apiKey: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
}): Promise<ImageDescription> {
  const { model } = options;
  const url = await imageUrlFor(options.source);
  const body = {
    model: model.id,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: options.prompt },
          { type: "image_url", image_url: { url } },
        ],
      },
    ],
    max_tokens: Math.min(MAX_OUTPUT_TOKENS, model.limit.output),
    // Hybrid reasoners think at length by default, which can use up the whole
    // output budget on a perception task and return no answer.
    ...(acceptsReasoningEffort(model.id) ? { reasoning_effort: "low" } : {}),
    stream: false,
  };
  const response = await (options.fetchImpl ?? fetch)(
    `${options.baseUrl.replace(/\/+$/, "")}/chat/completions`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Nebius returned ${response.status} for ${model.id}: ${raw.slice(0, 400)}`);
  }
  let json: {
    choices?: Array<{ finish_reason?: string | null; message?: { content?: string | null } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`Nebius returned a non-JSON response for ${model.id}.`);
  }
  const choice = json.choices?.[0];
  const text = (choice?.message?.content ?? "").trim();
  if (!text) {
    throw new Error(
      `${model.id} returned no text (finish reason: ${choice?.finish_reason ?? "unknown"}).`,
    );
  }
  const inputTokens = json.usage?.prompt_tokens ?? 0;
  const outputTokens = json.usage?.completion_tokens ?? 0;
  return {
    model: model.id,
    text,
    usage: { inputTokens, outputTokens },
    costUsd: (inputTokens * model.cost.input + outputTokens * model.cost.output) / 1_000_000,
  };
}

/**
 * Record a describe call in the local session store, so `nconnect usage`
 * counts it. The command talks to Nebius directly rather than through the
 * daemon, which is what normally writes that store, so it writes one
 * already-ended session itself. Best-effort: a spend record must never be the
 * reason the answer is lost. The Nebius key is not stored.
 */
export async function recordImageUsage(
  result: ImageDescription,
  model: ModelDefinition,
  now = Date.now(),
): Promise<void> {
  try {
    const store = await createSessionStore();
    try {
      const token = `image-${randomUUID()}`;
      const totals = {
        promptTokens: result.usage.inputTokens,
        cachedTokens: 0,
        completionTokens: result.usage.outputTokens,
        costUsd: result.costUsd,
      };
      const summary = formatImageReceipt(result);
      store.upsertSession({
        token,
        agent: "image",
        apiKey: "",
        modelLabel: model.name,
        modelId: model.id,
        targetModelId: model.id,
        modelName: model.name,
        modelDefinition: model,
        startedAt: now,
        lastSeenAt: now,
        endedAt: now,
        costSummary: summary,
        costTotals: totals,
      });
      store.markSessionEnded(token, now, summary, totals, [{ model: model.id, ...totals }]);
    } finally {
      store.close();
    }
  } catch {
    // The description was already printed; an unwritable store is not an error.
  }
}

export function formatImageReceipt(result: ImageDescription): string {
  // A single image on the default model costs a few thousandths of a cent.
  const cost =
    result.costUsd < 0.0001
      ? "under $0.0001"
      : `$${result.costUsd < 0.01 ? result.costUsd.toFixed(4) : result.costUsd.toFixed(2)}`;
  return `${result.model} · ${result.usage.inputTokens} in / ${result.usage.outputTokens} out tokens · ${cost}`;
}

/** Why a verb other than `describe` cannot run, or undefined if it can. */
export function unsupportedImageVerb(verb: string | undefined): string | undefined {
  if (verb === "describe") {
    return undefined;
  }
  if (verb === "generate" || verb === "edit") {
    return `"nconnect image ${verb}" is not available: Nebius Token Factory serves no image-generation models. "nconnect image describe" reads an image instead.\n\n${IMAGE_USAGE}`;
  }
  return verb ? `Unknown image command "${verb}".\n\n${IMAGE_USAGE}` : IMAGE_USAGE;
}
