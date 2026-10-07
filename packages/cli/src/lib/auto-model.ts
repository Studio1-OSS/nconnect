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

/**
 * The two models Auto chooses between. Fast is the catalog default; strong is
 * Kimi K3 when Nebius serves it. If no distinct strong model is available,
 * both are the fast model and Auto behaves like the default.
 */
export function autoCandidates(env: NodeJS.ProcessEnv = process.env): {
  fast: ModelDefinition;
  strong: ModelDefinition;
} {
  const fast = configuredModel(env[AUTO_FAST_MODEL_ENV]) ?? getDefaultModel();
  const strong =
    configuredModel(env[AUTO_STRONG_MODEL_ENV]) ??
    getSelectableModels().find((model) => model.id === AUTO_STRONG_DEFAULT_ID) ??
    fast;
  return { fast, strong };
}

/**
 * Auto as a model definition. It is what a harness budgets against before a
 * request is routed, so it takes the smaller window and output cap of the two
 * candidates: whichever model a task lands on, it fits.
 */
export function autoModelDefinition(env: NodeJS.ProcessEnv = process.env): ModelDefinition {
  const { fast, strong } = autoCandidates(env);
  return {
    ...fast,
    id: AUTO_MODEL_ID,
    name: "Auto",
    anthropicAlias: AUTO_MODEL_ALIAS,
    limit: {
      ...fast.limit,
      context: Math.min(fast.limit.context, strong.limit.context),
      output: Math.min(fast.limit.output, strong.limit.output),
    },
  };
}
