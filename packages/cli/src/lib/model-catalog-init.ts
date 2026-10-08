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

/**
 * The models.dev index for this launch. Never waits on the network and never
 * throws: it returns whatever cache exists (fresh or stale; a missing or
 * corrupt file counts as empty) and, when that cache is missing or older than
 * a day, refreshes it in the background so the next launch has it. Launch time
 * is never spent on optional metadata.
 */
async function loadModelsDev(home: string | undefined, now: number): Promise<ModelsDevIndex> {
  if (process.env.NCONNECT_MODELS_DEV?.trim().toLowerCase() === "off") {
    return {};
  }
  const file = modelsDevCachePath(home);
  let cached: ModelsDevCache | undefined;
  try {
    const raw = await readJsonIfExists<ModelsDevCache>(file);
    cached = raw && typeof raw.models === "object" && raw.models ? raw : undefined;
  } catch {
    cached = undefined; // corrupt cache: treat as a miss
  }
  if (!cached || now - (cached.fetchedAt ?? 0) >= MODELS_DEV_TTL_MS) {
    void refreshModelsDev(file, now);
  }
  return cached?.models ?? {};
}

async function refreshModelsDev(file: string, now: number): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(MODELS_DEV_API_URL, { signal: controller.signal });
    if (!res.ok) {
      return;
    }
    const models = parseModelsDevIndex(await res.json());
    if (Object.keys(models).length > 0) {
      await writeJsonAtomic(file, { fetchedAt: now, models } satisfies ModelsDevCache);
    }
  } catch {
    // Best-effort: the next launch tries again.
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
/**
 * Where the active catalog came from. "bundled" means neither a live fetch nor
 * a cache was available, so the list is the snapshot shipped with this
 * release: about half the live lineup, and possibly out of date.
 */
export type CatalogSource = "live" | "cache" | "bundled";
let catalogSource: CatalogSource = "bundled";

export function activeCatalogSource(): CatalogSource {
  return catalogSource;
}

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

  // Reads the local cache only; any network refresh happens in the background.
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
    catalogSource = "cache";
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
      catalogSource = "cache";
    }
    return;
  }

  const models = await fetchVerboseModels(apiKey, baseUrl);
  if (models.length === 0) {
    if (cached && Array.isArray(cached.models) && cached.models.length > 0) {
      applyCatalog(buildCatalog(cached.models, await modelsDevLoad));
      catalogSource = "cache";
    }
    return;
  }

  applyCatalog(buildCatalog(models, await modelsDevLoad));
  catalogSource = "live";
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
