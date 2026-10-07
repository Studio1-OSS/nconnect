import {
  getDefaultModel,
  getSelectableModels,
  resolveModelByKeys,
  type ModelDefinition,
  findModelById,
} from "@nconnect/models";

import { AUTO_MODEL_ID, autoModelDefinition, isAutoModel } from "../auto-model.js";

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

/** Auto as a selection for the harnesses that name models by Nebius id. */
export function autoCodexSelection(): CodexModelSelection {
  return { id: AUTO_MODEL_ID, definition: autoModelDefinition() };
}

/**
 * Set when this launch selected Auto. A spawned harness only reaches the
 * daemon - the one place Auto can be resolved - when it was launched with
 * Auto, so only then may Auto appear in the model list the harness is given.
 */
let launchOffersAuto = false;

/**
 * Models offered to a harness: the live Nebius catalog, led by Auto when this
 * launch selected it.
 */
export function getCodexSupportedModels(): readonly CodexModelSelection[] {
  const models = getSelectableModels().map((definition) => ({
    id: definition.id,
    definition,
  }));
  return launchOffersAuto ? [autoCodexSelection(), ...models] : models;
}

/** Same list as bare model definitions, for config builders that want those. */
export function launchModelDefinitions(): ModelDefinition[] {
  return getCodexSupportedModels().map((model) => model.definition);
}

export function resolveCodexModel(value: string | undefined): CodexModelSelection {
  if (isAutoModel(value)) {
    launchOffersAuto = true;
    return autoCodexSelection();
  }
  const supported = getCodexSupportedModels();
  if (supported.length === 0) {
    throw new Error("No Codex models are configured.");
  }
  const found =
    resolveModelByKeys(
      supported.map((model) => model.definition),
      value,
      [(model) => model.id],
      codexDefaultModelId(),
    ) ?? explicitCatalogModel(value);
  if (!found) {
    const expected = supported.map((model) => model.id).join(", ");
    throw new Error(`Unsupported Codex model "${value}". Expected one of: ${expected}.`);
  }
  return { id: found.id, definition: found };
}

/**
 * An explicit model id that is in the live catalog but not in the picker
 * (e.g. a model Nebius reports without tool support). The picker is a
 * recommendation, not an allow-list: naming a model on purpose still works.
 */
function explicitCatalogModel(value: string | undefined) {
  return value ? findModelById(value) : undefined;
}
