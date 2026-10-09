import {
  findModelById,
  getDefaultModel,
  getSelectableModels,
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
  fastModel?: string | undefined;
  balancedModel?: string | undefined;
  strongModel?: string | undefined;
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
  for (const key of ["fastModel", "balancedModel", "strongModel"] as const) {
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

export type AutoCandidates = {
  fast: ModelDefinition;
  balanced: ModelDefinition;
  strong: ModelDefinition;
};

/**
 * The three models Auto chooses between. Fast is the catalog default,
 * balanced is GLM 5.3 and strong is Kimi K3, when Nebius serves them. A tier
 * whose model is missing borrows from its neighbour: balanced falls back to
 * strong (never quietly to the cheap model), strong to balanced, then fast.
 */
export function autoCandidates(settings: AutoSettings = autoSettingsFromEnv()): AutoCandidates {
  const pick = (id: string) => getSelectableModels().find((model) => model.id === id);
  const fast = configuredModel(settings.fastModel) ?? getDefaultModel();
  const strongChoice = configuredModel(settings.strongModel) ?? pick(AUTO_STRONG_DEFAULT_ID);
  const balancedChoice = configuredModel(settings.balancedModel) ?? pick(AUTO_BALANCED_DEFAULT_ID);
  const strong = strongChoice ?? balancedChoice ?? fast;
  const balanced = balancedChoice ?? strong;
  return { fast, balanced, strong };
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
