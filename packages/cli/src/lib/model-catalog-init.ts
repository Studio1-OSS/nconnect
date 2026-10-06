import path from "node:path";
import {
  applyCatalog,
  buildCatalog,
  MODELS_DEV_API_URL,
  NEBIUS_BASE_URL,
  parseModelsDevIndex,
  type ModelsDevIndex,
  type NebiusApiModel,
} from "@nconnect/models";
import { nconnectHome } from "./global-config.js";
import { readJsonIfExists, resolveNebiusApiKey, writeJsonAtomic } from "./nebius-core.js";

/**
 * Load the live Nebius model catalog and install it as the active one.
 *
 * The catalog (which models exist and, crucially, each model's modality) comes
 * from `GET /v1/models?verbose=true` so it always matches what Nebius serves -
 * no hand-maintained list. Results are cached to `~/.nconnect/
 * model-catalog.json` and reused for CACHE_TTL_MS so repeat launches don't
 * re-fetch, and a stale cache (or the bundled snapshot) is used when the
 * network is unavailable. This is best-effort: any failure leaves the existing
 * catalog (snapshot at first, or a prior fetch) in place and never throws.
 */

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const FETCH_TIMEOUT_MS = 3000;

/**
 * models.dev metadata (tool/reasoning flags, output caps, release dates) that
 * the Nebius endpoint does not publish. Changes slowly, so cache for a day.
 * Strictly optional: `NCONNECT_MODELS_DEV=off` disables it, and any failure
 * just builds the catalog from Nebius alone.
 */
const MODELS_DEV_TTL_MS = 24 * 60 * 60 * 1000;

type ModelsDevCache = {
  fetchedAt: number;
  models: ModelsDevIndex;
};

function modelsDevCachePath(home?: string): string {
  return path.join(nconnectHome(home), "models-dev.json");
}

async function loadModelsDev(home: string | undefined, now: number): Promise<ModelsDevIndex> {
  if (process.env.NCONNECT_MODELS_DEV?.trim().toLowerCase() === "off") {
    return {};
  }
  const file = modelsDevCachePath(home);
  const cached = await readJsonIfExists<ModelsDevCache>(file);
  if (cached?.models && now - cached.fetchedAt < MODELS_DEV_TTL_MS) {
    return cached.models;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(MODELS_DEV_API_URL, { signal: controller.signal });
    if (!res.ok) {
      return cached?.models ?? {};
    }
    const models = parseModelsDevIndex(await res.json());
    if (Object.keys(models).length > 0) {
      await writeJsonAtomic(file, { fetchedAt: now, models } satisfies ModelsDevCache).catch(
        () => {},
      );
      return models;
    }
    return cached?.models ?? {};
  } catch {
    return cached?.models ?? {};
  } finally {
    clearTimeout(timer);
  }
}

type CatalogCache = {
  fetchedAt: number;
  baseUrl: string;
  models: NebiusApiModel[];
};

function cachePath(home?: string): string {
  return path.join(nconnectHome(home), "model-catalog.json");
}

let inFlight: Promise<void> | undefined;

export type InitModelCatalogOptions = {
  apiKey?: string;
  home?: string;
  baseUrl?: string;
  /** Ignore a fresh cache and always re-fetch. */
  force?: boolean;
  now?: number;
};

/**
 * Idempotent per-process: concurrent callers share one load. Safe to call from
 * both the daemon boot and the CLI entry.
 */
export async function initModelCatalog(options: InitModelCatalogOptions = {}): Promise<void> {
  if (inFlight && !options.force) {
    return inFlight;
  }
  const run = loadCatalog(options).catch(() => {
    // Best-effort: keep whatever catalog is active (snapshot or prior fetch).
  });
  inFlight = run;
  return run;
}

async function loadCatalog(options: InitModelCatalogOptions): Promise<void> {
  const home = options.home;
  const now = options.now ?? Date.now();
  const baseUrl = (options.baseUrl ?? NEBIUS_BASE_URL).replace(/\/$/, "");
  const file = cachePath(home);

  // Started in parallel with the Nebius fetch; only awaited when building.
  const modelsDevLoad = loadModelsDev(home, now);
  const cached = await readJsonIfExists<CatalogCache>(file);
  const cacheFresh =
    cached &&
    Array.isArray(cached.models) &&
    cached.models.length > 0 &&
    cached.baseUrl === baseUrl &&
    now - cached.fetchedAt < CACHE_TTL_MS;

  if (cacheFresh && !options.force) {
    applyCatalog(buildCatalog(cached.models, await modelsDevLoad));
    return;
  }

  const apiKey = await resolveNebiusApiKey({
    ...(options.apiKey !== undefined ? { apiKey: options.apiKey } : {}),
    ...(home !== undefined ? { home } : {}),
  });
  if (!apiKey) {
    // No key yet (e.g. before `configure`). Use a stale cache if present,
    // else leave the bundled snapshot active.
    if (cached && Array.isArray(cached.models) && cached.models.length > 0) {
      applyCatalog(buildCatalog(cached.models, await modelsDevLoad));
    }
    return;
  }

  const models = await fetchVerboseModels(apiKey, baseUrl);
  if (models.length === 0) {
    if (cached && Array.isArray(cached.models) && cached.models.length > 0) {
      applyCatalog(buildCatalog(cached.models, await modelsDevLoad));
    }
    return;
  }

  applyCatalog(buildCatalog(models, await modelsDevLoad));
  await writeJsonAtomic(file, {
    fetchedAt: now,
    baseUrl,
    models,
  } satisfies CatalogCache).catch(() => {
    // A cache-write failure is non-fatal; the fetch already succeeded.
  });
}

async function fetchVerboseModels(apiKey: string, baseUrl: string): Promise<NebiusApiModel[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}/models?verbose=true`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (!res.ok) {
      return [];
    }
    const body = (await res.json()) as { data?: NebiusApiModel[] };
    return Array.isArray(body.data) ? body.data : [];
  } finally {
    clearTimeout(timer);
  }
}
