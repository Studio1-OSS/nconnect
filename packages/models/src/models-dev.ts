/**
 * models.dev enrichment for the Nebius catalog.
 *
 * The live Nebius endpoint (`GET /v1/models?verbose=true`) stays the source of
 * truth for what exists, its context window and its modality - it is what
 * Nebius actually serves, and models.dev can lag behind it. models.dev
 * (https://models.dev/providers/nebius) fills the gaps the endpoint leaves:
 * whether a model calls tools or reasons when Nebius does not say, its output
 * cap, and its release date for ordering new models in the picker.
 *
 * Nothing here is required: an empty index produces exactly the catalog the
 * live endpoint alone would.
 */

export type ModelsDevModel = {
  name?: string;
  tool_call?: boolean;
  reasoning?: boolean;
  limit?: { context?: number; output?: number };
  release_date?: string;
  last_updated?: string;
};

/** Nebius models from models.dev, keyed by Nebius model id. */
export type ModelsDevIndex = Readonly<Record<string, ModelsDevModel>>;

export const MODELS_DEV_API_URL = "https://models.dev/api.json";
export const MODELS_DEV_PROVIDER_ID = "nebius";

/**
 * Pull the Nebius provider out of models.dev's `api.json`. Tolerant of shape
 * drift: anything that does not look like a model is skipped, and an
 * unrecognised document yields an empty index.
 */
export function parseModelsDevIndex(document: unknown): Record<string, ModelsDevModel> {
  const provider = (document as Record<string, unknown> | null)?.[MODELS_DEV_PROVIDER_ID] as
    | { models?: unknown }
    | undefined;
  const models = provider?.models;
  if (!models || typeof models !== "object") {
    return {};
  }
  const index: Record<string, ModelsDevModel> = {};
  for (const [id, raw] of Object.entries(models as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const m = raw as Record<string, unknown>;
    const limit = m.limit as { context?: unknown; output?: unknown } | undefined;
    const entry: ModelsDevModel = {};
    if (typeof m.name === "string") entry.name = m.name;
    if (typeof m.tool_call === "boolean") entry.tool_call = m.tool_call;
    if (typeof m.reasoning === "boolean") entry.reasoning = m.reasoning;
    if (limit && typeof limit === "object") {
      entry.limit = {
        ...(typeof limit.context === "number" ? { context: limit.context } : {}),
        ...(typeof limit.output === "number" ? { output: limit.output } : {}),
      };
    }
    if (typeof m.release_date === "string") entry.release_date = m.release_date;
    if (typeof m.last_updated === "string") entry.last_updated = m.last_updated;
    index[id] = entry;
  }
  return index;
}

/**
 * A model's release time in ms, or 0 when unknown. Only `release_date`:
 * `last_updated` moves on any metadata edit, so an old model with a recent
 * correction would otherwise outrank genuinely new releases.
 */
export function modelsDevReleaseTime(model: ModelsDevModel | undefined): number {
  const raw = model?.release_date;
  const parsed = raw ? Date.parse(raw) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}
