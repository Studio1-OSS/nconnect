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

export function resolveClaudeModel(value: string | undefined): ClaudeModelSelection {
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
