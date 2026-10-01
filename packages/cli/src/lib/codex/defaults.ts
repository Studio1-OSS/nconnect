import {
  getDefaultModel,
  getSelectableModels,
  resolveModelByKeys,
  type ModelDefinition,
} from "@nconnect/models";

export const CODEX_PROVIDER_ID = "nconnect";
export const CODEX_AUTH_ENV = "NCONNECT_CODEX_AUTH_TOKEN";

/** The default Codex model id (the live catalog's default). */
export function codexDefaultModelId(): string {
  return getDefaultModel().id;
}

export type CodexModelSelection = {
  id: string;
  definition: ModelDefinition;
};

/** Codex-routable models from the live Nebius catalog. */
export function getCodexSupportedModels(): readonly CodexModelSelection[] {
  return getSelectableModels().map((definition) => ({
    id: definition.id,
    definition,
  }));
}

export function resolveCodexModel(value: string | undefined): CodexModelSelection {
  const supported = getCodexSupportedModels();
  if (supported.length === 0) {
    throw new Error("No Codex models are configured.");
  }
  const found = resolveModelByKeys(
    supported.map((model) => model.definition),
    value,
    [(model) => model.id],
    codexDefaultModelId(),
  );
  if (!found) {
    const expected = supported.map((model) => model.id).join(", ");
    throw new Error(`Unsupported Codex model "${value}". Expected one of: ${expected}.`);
  }
  return { id: found.id, definition: found };
}
