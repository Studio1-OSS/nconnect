/**
 * Single source of truth for the Nebius models nconnect routes to:
 * ids, capabilities, modalities, and per-token cost. Both harnesses (Claude
 * Code's local proxy and OpenCode's ephemeral config) import from here so the
 * facts can't drift between them.
 *
 * The catalog is DYNAMIC: at startup the CLI/daemon fetches the live Nebius
 * Token Factory catalog (`GET /v1/models?verbose=true`) and builds the model
 * list from it, so the set of models and - critically - each model's modality
 * (which ones accept images) always match what Nebius actually serves. The
 * verbose endpoint returns id, name, context_length, `architecture.modality`
 * ("text->text" vs "text+image->text"), and per-token pricing.
 *
 * A small curated override table (`CURATED_OVERRIDES`) supplies only the facts
 * that endpoint does NOT expose or misreports: max-output limits, Claude
 * aliases, and a floor for the placeholder context window Nebius returns for a
 * few flagships (it reports 8000 for GLM-5.2 et al., which is wrong). Modality
 * and pricing are taken from the API except for explicit bundled fallback rows
 * that keep newly announced models selectable before every catalog endpoint has
 * caught up.
 *
 * When the live fetch has not run or fails, everything falls back to
 * CATALOG_SNAPSHOT (a captured copy of the live endpoint), so the tool works
 * offline. The named constants (GLM_5_2, VISION_MODELS, ...) are built from
 * that snapshot and are what the test-suite imports; production code uses the
 * dynamic getters (getSelectableModels(), getVisionModels(), ...).
 */

import { CATALOG_SNAPSHOT } from "./catalog-snapshot.js";
import { modelsDevReleaseTime, type ModelsDevIndex, type ModelsDevModel } from "./models-dev.js";

export const NEBIUS_BASE_URL = "https://api.tokenfactory.nebius.com/v1";

export type ModelCost = {
  /** USD per 1M input tokens. */
  input: number;
  /** USD per 1M output tokens. */
  output: number;
  /** USD per 1M cached input tokens (Nebius shared prefix cache). 0 if none. */
  cache_read: number;
};

export type ModelLimit = {
  /** Max input context window in tokens. */
  context: number;
  /** Max output tokens per response. */
  output: number;
};

export type Modality = "text" | "audio" | "image" | "video" | "pdf";

export type ModelModalities = {
  input: readonly Modality[];
  output: readonly Modality[];
};

export type ModelDefinition = {
  /** The Nebius API model id, e.g. "zai-org/GLM-5.2". */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** Claude Code's ANTHROPIC_MODEL alias for this model, or null for non-primary. */
  anthropicAlias: string | null;
  cost: ModelCost;
  limit: ModelLimit;
  /** Accepts image attachments (vision). Derived from the API modality. */
  attachment: boolean;
  /** Supports reasoning/thinking tokens. */
  reasoning: boolean;
  /** Accepts a temperature setting. */
  temperature: boolean;
  /** Supports tool/function calling. */
  tool_call: boolean;
  modalities: ModelModalities;
};

const TOKENS_PER_MILLION = 1_000_000;

/** Convert a per-1M-token price to a per-token price. */
export function costPerToken(costPerMillion: number): number {
  return costPerMillion / TOKENS_PER_MILLION;
}

// ---------------------------------------------------------------------------
// Live Nebius catalog: fetch, parse, merge with curated overrides
// ---------------------------------------------------------------------------

/**
 * One row from `GET /v1/models?verbose=true`. Only the fields buildCatalog()
 * reads are typed; the endpoint returns more (quantization, per_request_limits)
 * that we ignore.
 */
export type NebiusApiModel = {
  id: string;
  name?: string | null;
  description?: string | null;
  context_length?: number | null;
  architecture?: { modality?: string | null } | null;
  pricing?: {
    prompt?: string | number | null;
    completion?: string | number | null;
    image?: string | number | null;
  } | null;
  /** e.g. ["tools", "reasoning"]; null when Nebius does not say. */
  supported_features?: readonly string[] | null;
  /**
   * Unix seconds. Not used for ordering: Nebius resets it on redeploys, so
   * long-released models can report the current day.
   */
  created?: number | null;
};

/**
 * Curated metadata the verbose endpoint can't be trusted for, keyed by Nebius
 * id. Modality and pricing are NEVER overridden here (they come from the API);
 * this only fills gaps: output caps the API omits, Claude aliases, a context
 * floor for the placeholder 8000 Nebius reports for a few flagships, the
 * picker order, and the vision-failover rank. Models absent from this map still
 * appear, built entirely from their API row with sane defaults.
 */
type ModelOverride = {
  name?: string;
  anthropicAlias?: string | null;
  /** Max output tokens (the API has no such field). */
  outputLimit?: number;
  /** Floor for context_length when the API returns a known-bad small value. */
  minContext?: number;
  reasoning?: boolean;
  temperature?: boolean;
  tool_call?: boolean;
  /** Sort priority in the selectable picker (lower first); flagships get one. */
  order?: number;
  /** Position in the image-description failover list (lower first). */
  visionRank?: number;
};

const CURATED_OVERRIDES: Record<string, ModelOverride> = {
  "zai-org/GLM-5.3": {
    name: "GLM 5.3",
    anthropicAlias: "nebius-glm-5-3",
    order: 2,
  },
  "deepseek-ai/DeepSeek-V4-Pro-0813": {
    name: "DeepSeek V4 Pro 0813",
    anthropicAlias: "nebius-deepseek-v4-pro-0813",
    order: 3,
  },
  "zai-org/GLM-5.2": {
    name: "GLM 5.2",
    anthropicAlias: "nebius-glm-5-2",
    outputLimit: 164_000,
    minContext: 262_144, // API reports a placeholder 8000
    order: 5, // was the default; Nebius removed it from the live catalog (2026-07-27)
  },
  "moonshotai/Kimi-K2.6": {
    name: "Kimi K2.6 · vision",
    anthropicAlias: "nebius-kimi-k2-6",
    outputLimit: 131_000,
    order: 10,
    visionRank: 0, // vision flagship: primary for image description
  },
  "zai-org/GLM-5.3-Flash": {
    name: "GLM 5.3 Flash · default",
    anthropicAlias: "nebius-glm-5-3-flash",
    outputLimit: 131_072,
    // The API reports 1,024,000 directly (no placeholder), but floor it so a
    // catalog blip cannot silently shrink the window on the default model.
    minContext: 1_024_000,
    order: 0, // the default model
  },
  "moonshotai/Kimi-K3": {
    name: "Kimi K3",
    anthropicAlias: "nebius-kimi-k3",
    outputLimit: 131_072,
    // Nebius reports a placeholder 8000. Kimi K3's real window is 1M tokens
    // (Moonshot's model card and upstream both use 1,048,576); we previously
    // floored it at 262144, which made every harness compact ~4x too early.
    minContext: 1_048_576,
    order: 1,
  },
  "moonshotai/Kimi-K2.7-Code": {
    name: "Kimi K2.7 Code",
    anthropicAlias: "nebius-kimi-k2-7-code",
    outputLimit: 131_072,
    minContext: 262_144, // API reports a placeholder 8000
    order: 20,
  },
  "MiniMaxAI/MiniMax-M3": {
    name: "MiniMax M3",
    outputLimit: 128_000,
    minContext: 196_608, // API reports a placeholder 8000
    order: 30,
  },
  "Qwen/Qwen3.5-397B-A17B": {
    name: "Qwen 3.5 397B · flagship",
    outputLimit: 65_536,
    order: 40,
  },
  "deepseek-ai/DeepSeek-V4-Flash": {
    name: "DeepSeek V4 Flash",
    anthropicAlias: "nebius-deepseek-v4-flash",
    outputLimit: 384_000,
    minContext: 1_048_576,
    order: 45,
  },
  "deepseek-ai/DeepSeek-V4-Pro": {
    name: "DeepSeek V4 Pro",
    anthropicAlias: "nebius-deepseek-v4-pro",
    outputLimit: 384_000,
    minContext: 1_048_576,
    order: 50,
  },
  "Qwen/Qwen2.5-VL-72B-Instruct": {
    name: "Qwen2.5-VL 72B · vision",
    reasoning: false, // perception model, not a reasoner
    outputLimit: 32_768,
    order: 60,
    visionRank: 1, // vision fallback
  },
};

/**
 * Snapshot rows that remain selectable even when a live/cache catalog fetch
 * succeeds without them. Keep this tiny and intentional: it is for newly
 * announced or regional models users need to select before the default catalog
 * endpoint catches up, not for resurrecting every model Nebius has removed.
 */
const BUNDLED_FALLBACK_MODEL_IDS: ReadonlySet<string> = new Set([
  "zai-org/GLM-5.3",
  "deepseek-ai/DeepSeek-V4-Pro-0813",
  "deepseek-ai/DeepSeek-V4-Flash",
  "deepseek-ai/DeepSeek-V4-Pro",
]);

/**
 * The pinned default model id. Kept stable so both harnesses agree. Kimi-K3
 * since 2026-07-27, when Nebius removed GLM-5.2 from the live catalog. Note:
 * K3's Nebius capacity can be flaky (occasional header/SSE-idle timeouts); the
 * 120s response-header timeout and reasoning cap mitigate it.
 */
export const DEFAULT_MODEL_ID = "zai-org/GLM-5.3-Flash";

/**
 * Nebius model ids verified to accept the OpenAI `reasoning_effort` parameter.
 * These are hybrid reasoners that reason on every turn unless told not to, so
 * the proxy sends them an explicit effort (defaulting to a fast "none") to keep
 * trivial turns snappy and prevent runaway reasoning. Other models may reject
 * the parameter, so it is only sent to ids in this set.
 */
export const REASONING_EFFORT_MODEL_IDS: ReadonlySet<string> = new Set([
  "zai-org/GLM-5.3-Flash",
  "zai-org/GLM-5.2",
  "moonshotai/Kimi-K2.6",
  "moonshotai/Kimi-K3",
]);

/**
 * Models whose chat template mishandles `reasoning_effort: "none"`.
 *
 * GLM 5.3 Flash still reasons at "none" but fails to route it to
 * `reasoning_content`, emitting the whole chain-of-thought into `content`
 * terminated by a stray `</think>` - so the user reads the model's private
 * reasoning as if it were the answer. "low" is clean and actually spends FEWER
 * reasoning tokens (11 vs 27 measured), so flooring costs nothing.
 */
const MIN_REASONING_EFFORT: Record<string, string> = {
  "zai-org/GLM-5.3-Flash": "low",
};

/** The lowest `reasoning_effort` this model handles correctly, if constrained. */
export function minimumReasoningEffort(modelId: string): string | undefined {
  return MIN_REASONING_EFFORT[modelId];
}

/** Whether a model accepts the `reasoning_effort` parameter. */
export function acceptsReasoningEffort(modelId: string): boolean {
  return REASONING_EFFORT_MODEL_IDS.has(modelId);
}

const ORDER_FALLBACK = 1_000;
const DEFAULT_OUTPUT_LIMIT = 32_768;
const DEFAULT_CONTEXT = 131_072;

/**
 * Capabilities string Claude Code reads from
 * ANTHROPIC_CUSTOM_MODEL_OPTION_SUPPORTED_CAPABILITIES. Mirrors what GLM-5.2
 * supports on Nebius: adjustable reasoning effort (incl. xhigh/max), thinking,
 * adaptive thinking, and interleaved thinking.
 */
export const GLM_5_2_ANTHROPIC_CAPABILITIES =
  "effort,xhigh_effort,max_effort,thinking,adaptive_thinking,interleaved_thinking";

function priceToMillion(value: string | number | null | undefined): number {
  const perToken = typeof value === "string" ? Number.parseFloat(value) : (value ?? 0);
  if (!Number.isFinite(perToken) || perToken <= 0) {
    return 0;
  }
  return perToken * TOKENS_PER_MILLION;
}

/**
 * Parse a Nebius `architecture.modality` string ("text+image->text",
 * "text->text", "text->embedding") into input/output modality lists.
 */
export function parseModalities(modality: string | null | undefined): ModelModalities {
  const known: readonly Modality[] = ["text", "audio", "image", "video", "pdf"];
  const isKnown = (v: string): v is Modality => (known as readonly string[]).includes(v);
  const [inputRaw = "text", outputRaw = "text"] = (modality ?? "text->text").split("->");
  const parse = (side: string): Modality[] => {
    const parts = side
      .split("+")
      .map((p) => p.trim().toLowerCase())
      .filter(isKnown);
    return parts.length > 0 ? parts : ["text"];
  };
  return { input: parse(inputRaw), output: parse(outputRaw) };
}

/** Whether a model's raw modality produces text output (i.e. a chat model). */
function rawOutputIsText(modality: string | null | undefined): boolean {
  const output = (modality ?? "text->text").split("->")[1] ?? "text";
  return output
    .split("+")
    .map((part) => part.trim().toLowerCase())
    .includes("text");
}

/** Build a ModelDefinition from a live API row plus any curated override. */
/**
 * A capability flag, by precedence: curated override, then what Nebius itself
 * reports (`supported_features`, when it reports anything), then models.dev,
 * then the permissive default.
 */
function capability(
  override: boolean | undefined,
  api: NebiusApiModel,
  feature: "tools" | "reasoning",
  fromModelsDev: boolean | undefined,
): boolean {
  if (override !== undefined) return override;
  if (Array.isArray(api.supported_features)) return api.supported_features.includes(feature);
  return fromModelsDev ?? true;
}

function mapApiModel(
  api: NebiusApiModel,
  override: ModelOverride | undefined,
  modelsDev: ModelsDevModel | undefined,
): ModelDefinition {
  const modalities = parseModalities(api.architecture?.modality);
  const attachment = modalities.input.includes("image");
  const apiContext =
    typeof api.context_length === "number" && api.context_length > 0 ? api.context_length : 0;
  const context = Math.max(apiContext, override?.minContext ?? 0) || DEFAULT_CONTEXT;
  // models.dev often lists output == context for long-context models; keep our
  // conservative default cap rather than inviting a 1M-token response.
  const output =
    override?.outputLimit ??
    Math.min(context, modelsDev?.limit?.output ?? DEFAULT_OUTPUT_LIMIT, DEFAULT_OUTPUT_LIMIT);
  return {
    id: api.id,
    name: override?.name ?? api.name ?? api.id,
    anthropicAlias: override?.anthropicAlias ?? null,
    cost: {
      input: priceToMillion(api.pricing?.prompt),
      output: priceToMillion(api.pricing?.completion),
      cache_read: 0, // the verbose endpoint publishes no cached-input price
    },
    limit: { context, output },
    attachment,
    reasoning: capability(override?.reasoning, api, "reasoning", modelsDev?.reasoning),
    temperature: override?.temperature ?? true,
    tool_call: capability(override?.tool_call, api, "tools", modelsDev?.tool_call),
    modalities,
  };
}

export type NebiusCatalog = {
  /** Every chat model (text output), unordered map access below. */
  all: readonly ModelDefinition[];
  /** Chat models for the picker, flagship-ordered. */
  selectable: readonly ModelDefinition[];
  /** Vision-capable models for image description, failover-ordered. */
  vision: readonly ModelDefinition[];
  byId: ReadonlyMap<string, ModelDefinition>;
  defaultModel: ModelDefinition;
};

/**
 * Build a catalog from live (or snapshot) API rows. Embedding-only models
 * (output modality != text) are dropped - they aren't chat backends. The
 * selectable list is flagship-first (curated `order`) then the rest by name,
 * so a newly added Nebius model appears automatically at the tail.
 */
export function buildCatalog(
  apiModels: readonly NebiusApiModel[],
  modelsDev: ModelsDevIndex = {},
): NebiusCatalog {
  const seenIds = new Set(
    apiModels.filter((m) => m && typeof m.id === "string" && m.id.length > 0).map((m) => m.id),
  );
  const bundledFallbackRows = CATALOG_SNAPSHOT.filter(
    (m) => BUNDLED_FALLBACK_MODEL_IDS.has(m.id) && !seenIds.has(m.id),
  );
  const sourceModels = [...apiModels, ...bundledFallbackRows];

  const defs = sourceModels
    .filter((m) => m && typeof m.id === "string" && m.id.length > 0)
    // Chat models only: the output side of the modality must be text. This
    // drops embedding models ("text->embedding") that can't back a coding
    // agent. Read the raw modality so an unrecognized output token (e.g.
    // "embedding") is excluded rather than defaulting to text.
    .filter((m) => rawOutputIsText(m.architecture?.modality))
    .map((m) => mapApiModel(m, CURATED_OVERRIDES[m.id], modelsDev[m.id]));

  // Curated flagships first, in their curated order. Everything else - which
  // is where new Nebius models land - newest first by models.dev release date,
  // so a model released this week shows up near the top instead of
  // alphabetically at the tail; models.dev has not dated yet go last, by name.
  // Nebius's own `created` is deliberately ignored: it is reset on redeploys
  // (models years old report the current day), so it is not a release signal.
  // A model that cannot call tools cannot drive a coding agent, so it stays
  // out of the picker - curated or not. It stays in `all`/`byId` (and `vision`
  // where it applies), and an explicit `--model <id>` still resolves it.
  const releasedAt = (d: ModelDefinition): number => modelsDevReleaseTime(modelsDev[d.id]);
  const orderOf = (d: ModelDefinition): number => CURATED_OVERRIDES[d.id]?.order ?? ORDER_FALLBACK;
  const selectable = defs
    .filter((d) => d.tool_call)
    .sort(
      (a, b) =>
        orderOf(a) - orderOf(b) || releasedAt(b) - releasedAt(a) || a.name.localeCompare(b.name),
    );

  const visionRankOf = (d: ModelDefinition): number =>
    CURATED_OVERRIDES[d.id]?.visionRank ?? ORDER_FALLBACK;
  const vision = defs
    .filter((d) => d.attachment)
    .sort((a, b) => visionRankOf(a) - visionRankOf(b) || a.name.localeCompare(b.name));

  const byId = new Map(defs.map((d) => [d.id, d]));
  const defaultModel = byId.get(DEFAULT_MODEL_ID) ?? selectable[0] ?? defs[0];
  if (!defaultModel) {
    throw new Error("Nebius catalog is empty: no chat models available.");
  }

  return { all: defs, selectable, vision, byId, defaultModel };
}

export class NebiusCatalogError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "NebiusCatalogError";
  }
}

/**
 * Fetch the live catalog from `GET {baseUrl}/models?verbose=true` and build it.
 * Throws NebiusCatalogError on a non-2xx response or unparseable body; callers
 * are expected to catch and fall back to the snapshot.
 */
export async function fetchNebiusCatalog(opts: {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): Promise<NebiusCatalog> {
  const base = (opts.baseUrl ?? NEBIUS_BASE_URL).replace(/\/$/, "");
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(`${base}/models?verbose=true`, {
    headers: { Authorization: `Bearer ${opts.apiKey}` },
    ...(opts.signal ? { signal: opts.signal } : {}),
  });
  if (!res.ok) {
    throw new NebiusCatalogError(`GET /models?verbose=true failed: ${res.status}`, res.status);
  }
  let body: { data?: NebiusApiModel[] };
  try {
    body = (await res.json()) as { data?: NebiusApiModel[] };
  } catch {
    throw new NebiusCatalogError("GET /models?verbose=true returned non-JSON");
  }
  const rows = Array.isArray(body.data) ? body.data : [];
  if (rows.length === 0) {
    throw new NebiusCatalogError("GET /models?verbose=true returned no models");
  }
  return buildCatalog(rows);
}

// ---------------------------------------------------------------------------
// Snapshot-backed constants (deterministic) + live singleton (dynamic)
// ---------------------------------------------------------------------------

/** The catalog built from the shipped offline snapshot. Deterministic. */
export const SNAPSHOT_CATALOG: NebiusCatalog = buildCatalog(CATALOG_SNAPSHOT);

function fromSnapshot(id: string): ModelDefinition {
  const model = SNAPSHOT_CATALOG.byId.get(id);
  if (!model) {
    throw new Error(`Snapshot is missing required model "${id}".`);
  }
  return model;
}

/**
 * Named model constants, resolved from the offline snapshot. These are stable
 * fixtures (the test-suite imports them); production code that needs the live
 * catalog uses the getters below instead.
 */
export const GLM_5_2: ModelDefinition = fromSnapshot("zai-org/GLM-5.2");
export const GLM_5_3: ModelDefinition = fromSnapshot("zai-org/GLM-5.3");
export const DEEPSEEK_V4_PRO_0813: ModelDefinition = fromSnapshot(
  "deepseek-ai/DeepSeek-V4-Pro-0813",
);
export const KIMI_K2_6: ModelDefinition = fromSnapshot("moonshotai/Kimi-K2.6");
export const KIMI_K2_7_CODE: ModelDefinition = fromSnapshot("moonshotai/Kimi-K2.7-Code");
export const MINIMAX_M3: ModelDefinition = fromSnapshot("MiniMaxAI/MiniMax-M3");
export const QWEN_3_5_397B: ModelDefinition = fromSnapshot("Qwen/Qwen3.5-397B-A17B");
export const DEEPSEEK_V4_FLASH: ModelDefinition = fromSnapshot("deepseek-ai/DeepSeek-V4-Flash");
export const DEEPSEEK_V4_PRO: ModelDefinition = fromSnapshot("deepseek-ai/DeepSeek-V4-Pro");
export const QWEN_2_5_VL_72B: ModelDefinition = fromSnapshot("Qwen/Qwen2.5-VL-72B-Instruct");

/** Selectable models from the offline snapshot (deterministic). */
export const SELECTABLE_MODELS: readonly ModelDefinition[] = SNAPSHOT_CATALOG.selectable;
/** Vision models from the offline snapshot (deterministic). */
export const VISION_MODELS: readonly ModelDefinition[] = SNAPSHOT_CATALOG.vision;
/** Primary vision model from the offline snapshot (deterministic). */
export const VISION_PRIMARY: ModelDefinition = SNAPSHOT_CATALOG.vision[0] ?? GLM_5_2;

// The live singleton starts as the snapshot and is replaced by applyCatalog()
// once the daemon/CLI fetches the real catalog. Getters read it, so every
// consumer that uses a getter tracks the live data after refresh.
let activeCatalog: NebiusCatalog = SNAPSHOT_CATALOG;

/** Replace the active (live) catalog. Called after a successful fetch. */
export function applyCatalog(catalog: NebiusCatalog): void {
  activeCatalog = catalog;
}

/** The current active catalog (live if fetched, else snapshot). */
export function getCatalog(): NebiusCatalog {
  return activeCatalog;
}

/** Fetch the live catalog and install it as the active one. Returns it. */
export async function refreshCatalog(opts: {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): Promise<NebiusCatalog> {
  const catalog = await fetchNebiusCatalog(opts);
  applyCatalog(catalog);
  return catalog;
}

/** Every chat model in the live catalog, including ones kept out of the picker. */
export function getAllModels(): readonly ModelDefinition[] {
  return activeCatalog.all;
}

/** Selectable models from the live catalog (falls back to snapshot). */
export function getSelectableModels(): readonly ModelDefinition[] {
  return activeCatalog.selectable;
}

/** Vision models from the live catalog (falls back to snapshot). */
export function getVisionModels(): readonly ModelDefinition[] {
  return activeCatalog.vision;
}

/** Primary vision model from the live catalog. */
export function getVisionPrimary(): ModelDefinition {
  return activeCatalog.vision[0] ?? VISION_PRIMARY;
}

/** The default model from the live catalog. */
export function getDefaultModel(): ModelDefinition {
  return activeCatalog.defaultModel;
}

/**
 * Find a model definition by its Nebius id in the live catalog. Returns
 * undefined if the model is not in the current catalog.
 */
export function findModelById(id: string): ModelDefinition | undefined {
  return activeCatalog.byId.get(id);
}

/**
 * Whether a model accepts image input (vision-capable). Used to pick the right
 * OpenCode build-agent system prompt: vision primaries receive images directly,
 * text-only primaries must route to the `@vision` subagent.
 */
export function isVisionModel(model: ModelDefinition): boolean {
  return model.attachment && model.modalities.input.includes("image");
}

/**
 * Resolve a model from a list by trying each candidate key against `value`,
 * falling back to the model whose id is `defaultId` (or the first in the list)
 * when no value is given. Returns undefined only when a value is given but no
 * model matches - the caller decides whether that is an error. Pure: no I/O,
 * no throwing; the per-harness "Unsupported <harness> model" error is a cli
 * policy that lives in the thin wrappers, not here.
 */
export function resolveModelByKeys(
  list: readonly ModelDefinition[],
  value: string | undefined,
  keys: ReadonlyArray<(model: ModelDefinition) => string | null | undefined>,
  defaultId: string,
): ModelDefinition | undefined {
  const defaultModel = list.find((model) => model.id === defaultId) ?? list[0];
  if (!value) {
    return defaultModel;
  }
  return list.find((model) => keys.some((key) => key(model) === value));
}

/**
 * Prompt for the image-description sub-call. Shared by the Claude proxy (which
 * injects it on its own vision fetch) and the OpenCode `@vision` subagent
 * (which uses it as the agent system prompt). Keep it perception-focused and
 * concise so the main model reasons over a tight description.
 */
export const VISION_PROMPT =
  "Describe this image for a coding assistant that cannot see it. " +
  "Be concise but specific: layout, UI elements, colors, any text (quote it " +
  "verbatim), diagrams, charts, or notable details. If it is a screenshot, " +
  "describe the visible UI. Keep it under 150 words.";

export * from "./models-dev.js";
