import {
  findModelById,
  getDefaultModel,
  getSelectableModels,
  isVisionModel,
  type ModelDefinition,
} from "@nconnect/models";

/**
 * "Auto" is not a Nebius model. It is a routing choice: each task goes to a
 * fast model or a strong one, decided per request inside the daemon (see
 * auto-routing.ts). It is offered alongside the real models, and must always
 * be replaced by one of them before a request goes upstream.
 */
export const AUTO_MODEL_ID = "nconnect/auto";
export const AUTO_MODEL_ALIAS = "nebius-auto";
export const AUTO_FAST_MODEL_ENV = "NCONNECT_AUTO_FAST_MODEL";
export const AUTO_STRONG_MODEL_ENV = "NCONNECT_AUTO_STRONG_MODEL";
/** Kimi K3: the frontier coding model in the lineup, and its most expensive. */
const AUTO_STRONG_DEFAULT_ID = "moonshotai/Kimi-K3";

export function isAutoModel(value: string | undefined | null): boolean {
  const name = value?.trim().toLowerCase();
  return name === "auto" || name === AUTO_MODEL_ALIAS || name === AUTO_MODEL_ID;
}

function configuredModel(value: string | undefined): ModelDefinition | undefined {
  const name = value?.trim();
  if (!name) {
    return undefined;
  }
  return (
    findModelById(name) ??
    getSelectableModels().find((model) => model.anthropicAlias === name || model.id === name)
  );
}

export const AUTO_BALANCED_MODEL_ENV = "NCONNECT_AUTO_BALANCED_MODEL";
export const AUTO_COST_TIER_ENV = "NCONNECT_AUTO_COST_TIER";
export const AUTO_EFFORT_ENV = "NCONNECT_AUTO_EFFORT";
export const AUTO_PER_TURN_ENV = "NCONNECT_AUTO_PER_TURN";
export const AUTO_MODELS_ENV = "NCONNECT_AUTO_MODELS";
export const AUTO_EXCLUDED_MODELS_ENV = "NCONNECT_AUTO_EXCLUDED_MODELS";
/** GLM 5.3: about a tenth of Kimi K3's input price, ten times the default's. */
const AUTO_BALANCED_DEFAULT_ID = "zai-org/GLM-5.3";

export type AutoCostTier = "low" | "medium" | "high";

/**
 * How Auto behaves for one session. Read from the launcher's environment and
 * sent with the session registration, so it follows the launch rather than a
 * daemon that may have been running since before the setting changed.
 */
export type AutoSettings = {
  /** Lean cheap, balanced, or capable when a task could go either way. */
  costTier?: AutoCostTier | undefined;
  /**
   * Candidates for each tier, most preferred first: a model id or alias, a
   * wildcard pattern (`*flash*`, `moonshotai/*`), or several separated by commas.
   */
  fastModel?: string | undefined;
  balancedModel?: string | undefined;
  strongModel?: string | undefined;
  /** If set, only models matching one of these patterns may be picked. */
  allowModels?: string | undefined;
  /** Models matching one of these patterns are never picked. Always wins. */
  excludedModels?: string | undefined;
  /** False turns off Auto's own choice of reasoning effort. */
  effort?: boolean | undefined;
  /** True lets follow-up turns of a task step down a tier. Off by default. */
  perTurn?: boolean | undefined;
};

const off = (value: string | undefined) =>
  ["off", "false", "0", "no"].includes(value?.trim().toLowerCase() ?? "");
const on = (value: string | undefined) =>
  ["on", "true", "1", "yes"].includes(value?.trim().toLowerCase() ?? "");

/** Auto's settings as the environment gives them; absent fields mean "default". */
export function autoSettingsFromEnv(env: NodeJS.ProcessEnv = process.env): AutoSettings {
  const tier = env[AUTO_COST_TIER_ENV]?.trim().toLowerCase();
  const settings: AutoSettings = {};
  if (tier === "low" || tier === "medium" || tier === "high") {
    settings.costTier = tier;
  }
  for (const [key, name] of [
    ["fastModel", AUTO_FAST_MODEL_ENV],
    ["balancedModel", AUTO_BALANCED_MODEL_ENV],
    ["strongModel", AUTO_STRONG_MODEL_ENV],
    ["allowModels", AUTO_MODELS_ENV],
    ["excludedModels", AUTO_EXCLUDED_MODELS_ENV],
  ] as const) {
    const value = env[name]?.trim();
    if (value) {
      settings[key] = value;
    }
  }
  if (off(env[AUTO_EFFORT_ENV])) {
    settings.effort = false;
  }
  if (on(env[AUTO_PER_TURN_ENV])) {
    settings.perTurn = true;
  }
  return settings;
}

/** Keep only well-formed fields from a settings object of unknown origin. */
export function validAutoSettings(value: unknown): AutoSettings | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const settings: AutoSettings = {};
  if (raw.costTier === "low" || raw.costTier === "medium" || raw.costTier === "high") {
    settings.costTier = raw.costTier;
  }
  for (const key of [
    "fastModel",
    "balancedModel",
    "strongModel",
    "allowModels",
    "excludedModels",
  ] as const) {
    if (typeof raw[key] === "string" && raw[key]) {
      settings[key] = raw[key] as string;
    }
  }
  if (typeof raw.effort === "boolean") {
    settings.effort = raw.effort;
  }
  if (typeof raw.perTurn === "boolean") {
    settings.perTurn = raw.perTurn;
  }
  return Object.keys(settings).length > 0 ? settings : undefined;
}

export type AutoTierName = "fast" | "balanced" | "strong";

export type AutoCandidates = Record<AutoTierName, ModelDefinition>;

/**
 * Each tier's candidates when the user names none, most preferred first. The
 * first is the tier's model. The rest are there for what the first cannot do:
 * GLM 5.3 reads no images, so an image task on the balanced tier goes to
 * Kimi K2.6, which costs about the same and can.
 */
const DEFAULT_POOLS: Record<AutoTierName, readonly string[]> = {
  fast: ["@default", "deepseek-ai/DeepSeek-V4.1-Flash"],
  balanced: [AUTO_BALANCED_DEFAULT_ID, "moonshotai/Kimi-K2.6"],
  strong: [AUTO_STRONG_DEFAULT_ID],
};

function patterns(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function matcher(pattern: string): (model: ModelDefinition) => boolean {
  if (!pattern.includes("*")) {
    const exact = pattern.toLowerCase();
    return (model) =>
      model.id.toLowerCase() === exact || model.anthropicAlias?.toLowerCase() === exact;
  }
  const source = pattern
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  const regex = new RegExp(`^${source}$`, "i");
  return (model) =>
    regex.test(model.id) || (model.anthropicAlias ? regex.test(model.anthropicAlias) : false);
}

/** Expand a list of ids and wildcard patterns into models, in the order given. */
function expand(entries: readonly string[]): ModelDefinition[] {
  const selectable = getSelectableModels();
  const out: ModelDefinition[] = [];
  const add = (model: ModelDefinition | undefined) => {
    if (model && !out.some((existing) => existing.id === model.id)) {
      out.push(model);
    }
  };
  for (const entry of entries) {
    if (entry === "@default") {
      add(getDefaultModel());
    } else if (entry.includes("*")) {
      // A pattern only reaches models in the picker: ones Nebius serves with
      // tool calling. Naming a model outright is how to reach any other.
      selectable.filter(matcher(entry)).forEach(add);
    } else {
      add(configuredModel(entry));
    }
  }
  return out;
}

/**
 * The candidates for each tier, after the allow and exclude lists.
 *
 * - A tier the user set uses their list; one whose entries match nothing
 *   falls back to the defaults rather than leaving the tier empty.
 * - The exclude list always applies.
 * - The allow list narrows a tier only if it leaves something in it; an
 *   allow list that matches nothing in a tier is ignored for that tier.
 * - A tier left empty borrows its neighbour: balanced from strong (never
 *   quietly from the cheap model), strong from balanced then fast, fast
 *   from balanced. Only if everything is excluded is the catalog default used.
 */
export function autoPools(
  settings: AutoSettings = autoSettingsFromEnv(),
): Record<AutoTierName, ModelDefinition[]> {
  const allow = patterns(settings.allowModels).map(matcher);
  const deny = patterns(settings.excludedModels).map(matcher);
  const build = (configured: string | undefined, tier: AutoTierName): ModelDefinition[] => {
    const chosen = expand(patterns(configured));
    const pool = (chosen.length > 0 ? chosen : expand(DEFAULT_POOLS[tier])).filter(
      (model) => !deny.some((matches) => matches(model)),
    );
    const allowed = allow.length > 0 ? pool.filter((model) => allow.some((m) => m(model))) : pool;
    return allowed.length > 0 ? allowed : pool;
  };
  let fast = build(settings.fastModel, "fast");
  let balanced = build(settings.balancedModel, "balanced");
  let strong = build(settings.strongModel, "strong");
  if (strong.length === 0) {
    strong = balanced.length > 0 ? balanced : fast;
  }
  if (balanced.length === 0) {
    balanced = strong;
  }
  if (fast.length === 0) {
    fast = balanced;
  }
  // Every tier excluded: there is still a request to serve. The catalog
  // default is the one model Auto falls back to against the user's lists.
  if (fast.length === 0) {
    fast = balanced = strong = [getDefaultModel()];
  }
  return { fast, balanced, strong };
}

/** Each tier's first-choice model. */
export function autoCandidates(settings: AutoSettings = autoSettingsFromEnv()): AutoCandidates {
  const pools = autoPools(settings);
  return {
    fast: pools.fast[0] as ModelDefinition,
    balanced: pools.balanced[0] as ModelDefinition,
    strong: pools.strong[0] as ModelDefinition,
  };
}

/** What a request needs from whichever model serves it. */
export type AutoNeeds = {
  /** The task carries images the model should see. */
  vision?: boolean | undefined;
  /** Rough size of the conversation, in tokens. */
  contextTokens?: number | undefined;
};

const TIERS_UP: Record<AutoTierName, readonly AutoTierName[]> = {
  fast: ["fast", "balanced", "strong"],
  balanced: ["balanced", "strong", "fast"],
  strong: ["strong", "balanced", "fast"],
};

/**
 * The model for a request on a tier: the tier's first candidate that can do
 * what the request needs. If none in the tier can, the next tier is searched
 * (upward first: a task that needs images should not lose capability to get
 * them). If nothing anywhere fits, the tier's first choice is used, and the
 * usual fallbacks apply - images are described, context is trimmed.
 */
export function pickAutoModel(
  tier: AutoTierName,
  settings: AutoSettings = autoSettingsFromEnv(),
  needs: AutoNeeds = {},
): ModelDefinition {
  const pools = autoPools(settings);
  const fits = (model: ModelDefinition): boolean =>
    (!needs.vision || isVisionModel(model)) &&
    (needs.contextTokens === undefined || model.limit.context >= needs.contextTokens);
  for (const candidateTier of TIERS_UP[tier]) {
    const found = pools[candidateTier].find(fits);
    if (found) {
      return found;
    }
  }
  return pools[tier][0] as ModelDefinition;
}

/**
 * Auto as a model definition. It is what a harness budgets against before a
 * request is routed, so it takes the smallest window and output cap of the
 * candidates: whichever model a task lands on, it fits.
 */
export function autoModelDefinition(
  settings: AutoSettings = autoSettingsFromEnv(),
): ModelDefinition {
  const { fast, balanced, strong } = autoCandidates(settings);
  const all = [fast, balanced, strong];
  return {
    ...fast,
    id: AUTO_MODEL_ID,
    name: "Auto",
    anthropicAlias: AUTO_MODEL_ALIAS,
    limit: {
      ...fast.limit,
      context: Math.min(...all.map((model) => model.limit.context)),
      output: Math.min(...all.map((model) => model.limit.output)),
    },
  };
}
