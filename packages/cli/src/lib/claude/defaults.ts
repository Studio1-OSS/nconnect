import {
  GLM_5_2_ANTHROPIC_CAPABILITIES,
  KIMI_K2_7_CODE,
  getDefaultModel,
  getSelectableModels,
  resolveModelByKeys,
  type ModelDefinition,
  findModelById,
} from "@nconnect/models";

export const CLAUDE_LOCAL_PROXY_HOST = "127.0.0.1";
export const CLAUDE_MODEL_CAPABILITIES = GLM_5_2_ANTHROPIC_CAPABILITIES;

export type ClaudeModelSelection = {
  alias: string;
  definition: ModelDefinition;
};

export const CLAUDE_HAIKU_MODEL = KIMI_K2_7_CODE;
export const CLAUDE_HAIKU_MODEL_SELECTION: ClaudeModelSelection = {
  alias: CLAUDE_HAIKU_MODEL.anthropicAlias ?? CLAUDE_HAIKU_MODEL.id,
  definition: CLAUDE_HAIKU_MODEL,
};

/**
 * Claude-routable models = every model in the live Nebius catalog plus the
 * lightweight Haiku-tier backend Claude Code uses for built-in exploration
 * subagents. Read from the dynamic catalog so it tracks what Nebius serves.
 * Models without a friendly Anthropic alias use their Nebius id directly.
 */
export function getClaudeSupportedModels(): readonly ClaudeModelSelection[] {
  const selectable = getSelectableModels().map((definition) => ({
    alias: definition.anthropicAlias ?? definition.id,
    definition,
  }));
  const hasHaiku = selectable.some(
    (model) => model.definition.id === CLAUDE_HAIKU_MODEL_SELECTION.definition.id,
  );
  return hasHaiku ? selectable : [...selectable, CLAUDE_HAIKU_MODEL_SELECTION];
}

/**
 * "Auto" is not a Nebius model. It is a routing choice: each task goes to a
 * fast model or a strong one, decided per request by the proxy (see
 * auto-routing.ts). It is offered alongside the real models but kept out of
 * `getClaudeSupportedModels`, so it never fills one of Claude Code's tiers.
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
 * Auto as a selection. Its definition is what Claude Code budgets against
 * before a request is routed, so it takes the smaller window and output cap
 * of the two candidates: whichever model a task lands on, it fits.
 */
export function autoModelSelection(env: NodeJS.ProcessEnv = process.env): ClaudeModelSelection {
  const { fast, strong } = autoCandidates(env);
  return {
    alias: AUTO_MODEL_ALIAS,
    definition: {
      ...fast,
      id: AUTO_MODEL_ID,
      name: "Auto",
      anthropicAlias: AUTO_MODEL_ALIAS,
      limit: {
        ...fast.limit,
        context: Math.min(fast.limit.context, strong.limit.context),
        output: Math.min(fast.limit.output, strong.limit.output),
      },
    },
  };
}

export function resolveClaudeModel(value: string | undefined): ClaudeModelSelection {
  if (isAutoModel(value)) {
    return autoModelSelection();
  }
  const supported = getClaudeSupportedModels();
  if (supported.length === 0) {
    throw new Error("No Claude models are configured.");
  }
  const found =
    resolveModelByKeys(
      supported.map((model) => model.definition),
      value,
      [(model) => model.anthropicAlias, (model) => model.id],
      getDefaultModel().id,
    ) ?? explicitCatalogModel(value);
  if (!found) {
    const expected = supported
      .map(
        (model) =>
          `${model.definition.anthropicAlias ?? model.definition.id} (${model.definition.id})`,
      )
      .join(", ");
    throw new Error(`Unsupported Claude model "${value}". Expected one of: ${expected}.`);
  }
  return { alias: found.anthropicAlias ?? found.id, definition: found };
}

/**
 * An explicit model id that is in the live catalog but not in the picker
 * (e.g. a model Nebius reports without tool support). The picker is a
 * recommendation, not an allow-list: naming a model on purpose still works.
 */
function explicitCatalogModel(value: string | undefined) {
  return value ? findModelById(value) : undefined;
}
