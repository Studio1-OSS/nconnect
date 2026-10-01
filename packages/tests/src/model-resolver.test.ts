import { describe, expect, it } from "vitest";
import {
  DEEPSEEK_V4_FLASH,
  DEEPSEEK_V4_PRO,
  DEEPSEEK_V4_PRO_0813,
  GLM_5_3,
  DEFAULT_MODEL_ID,
  SNAPSHOT_CATALOG,
  acceptsReasoningEffort,
  GLM_5_2,
  KIMI_K2_7_CODE,
  SELECTABLE_MODELS,
  buildCatalog,
  resolveModelByKeys,
  type ModelDefinition,
} from "@nconnect/models";

// Unit tests for the shared model-selection mechanism. The per-harness
// wrappers (resolveClaudeModel / resolveCodexModel) are thin policy over this
// pure helper, and the live gauntlet never exercises `--main`, so this is the
// only place the resolution algorithm is asserted today.

describe("resolveModelByKeys", () => {
  // Claude matches by alias OR id; mirrors the key set in resolveClaudeModel.
  const aliasAndId: ReadonlyArray<(model: ModelDefinition) => string | null | undefined> = [
    (model) => model.anthropicAlias,
    (model) => model.id,
  ];
  const byId: ReadonlyArray<(model: ModelDefinition) => string | null | undefined> = [
    (model) => model.id,
  ];

  it("returns the default model when no value is given", () => {
    expect(resolveModelByKeys(SELECTABLE_MODELS, undefined, aliasAndId, GLM_5_2.id)?.id).toBe(
      GLM_5_2.id,
    );
  });

  it("returns the default model when the value is empty", () => {
    expect(resolveModelByKeys(SELECTABLE_MODELS, "", aliasAndId, GLM_5_2.id)?.id).toBe(GLM_5_2.id);
  });

  it("matches by id", () => {
    expect(
      resolveModelByKeys(SELECTABLE_MODELS, KIMI_K2_7_CODE.id, aliasAndId, GLM_5_2.id)?.id,
    ).toBe(KIMI_K2_7_CODE.id);
  });

  it("matches by alias", () => {
    expect(
      resolveModelByKeys(
        SELECTABLE_MODELS,
        GLM_5_2.anthropicAlias ?? undefined,
        aliasAndId,
        GLM_5_2.id,
      )?.id,
    ).toBe(GLM_5_2.id);
  });

  it("includes DeepSeek V4 Flash and Pro aliases with long-context limits", () => {
    expect(DEEPSEEK_V4_FLASH.anthropicAlias).toBe("nebius-deepseek-v4-flash");
    expect(DEEPSEEK_V4_FLASH.limit.context).toBe(1_048_576);
    expect(DEEPSEEK_V4_FLASH.limit.output).toBe(384_000);
    expect(DEEPSEEK_V4_PRO.anthropicAlias).toBe("nebius-deepseek-v4-pro");
    expect(DEEPSEEK_V4_PRO.limit.context).toBe(1_048_576);
    expect(DEEPSEEK_V4_PRO.limit.output).toBe(384_000);
  });

  it("keeps bundled DeepSeek fallback rows when live catalog omits them", () => {
    const catalog = buildCatalog([
      {
        id: "example/Only-Live-Model",
        name: "Only Live Model",
        context_length: 8000,
        architecture: { modality: "text->text" },
        pricing: { prompt: "0.0000001", completion: "0.0000002" },
      },
    ]);

    expect(catalog.byId.has("example/Only-Live-Model")).toBe(true);
    expect(catalog.byId.get(DEEPSEEK_V4_FLASH.id)?.limit.context).toBe(1_048_576);
    expect(catalog.byId.get(DEEPSEEK_V4_PRO.id)?.limit.output).toBe(384_000);
  });

  it("returns undefined when the value matches no model", () => {
    expect(
      resolveModelByKeys(SELECTABLE_MODELS, "no/such-model", aliasAndId, GLM_5_2.id),
    ).toBeUndefined();
  });

  it.each([
    [GLM_5_3, "nebius-glm-5-3", 1_024_000, 1.4, 4.4],
    [DEEPSEEK_V4_PRO_0813, "nebius-deepseek-v4-pro-0813", 979_000, 1.32, 3.96],
  ] as const)(
    "selects $0.id by exact ID and alias with verified metadata",
    (model, alias, context, input, output) => {
      expect(resolveModelByKeys(SELECTABLE_MODELS, model.id, byId, DEFAULT_MODEL_ID)?.id).toBe(
        model.id,
      );
      expect(resolveModelByKeys(SELECTABLE_MODELS, alias, aliasAndId, DEFAULT_MODEL_ID)?.id).toBe(
        model.id,
      );
      expect(model.limit).toEqual({ context, output: 32_768 });
      expect(model.cost.input).toBeCloseTo(input);
      expect(model.cost.output).toBeCloseTo(output);
      expect(model.attachment).toBe(false);
      expect(model.tool_call).toBe(true);
      expect(model.reasoning).toBe(true);
      expect(acceptsReasoningEffort(model.id)).toBe(false);
      expect(buildCatalog([]).byId.get(model.id)).toEqual(model);
    },
  );

  it.each([GLM_5_3, DEEPSEEK_V4_PRO_0813])(
    "prefers live metadata over the $id fallback",
    (model) => {
      const catalog = buildCatalog([
        {
          id: model.id,
          context_length: 500_000,
          architecture: { modality: "text+image->text" },
          pricing: { prompt: "0.000002", completion: "0.000006" },
        },
      ]);
      expect(catalog.all.filter((entry) => entry.id === model.id)).toHaveLength(1);
      expect(catalog.byId.get(model.id)).toMatchObject({
        anthropicAlias: model.anthropicAlias,
        limit: { context: 500_000 },
        cost: { input: 2, output: 6 },
        attachment: true,
      });
    },
  );

  it("keeps GLM 5.3 Flash as the default", () => {
    expect(DEFAULT_MODEL_ID).toBe("zai-org/GLM-5.3-Flash");
    expect(SNAPSHOT_CATALOG.defaultModel.id).toBe(DEFAULT_MODEL_ID);
  });

  it("falls back to the first list entry when defaultId is not in the list", () => {
    expect(resolveModelByKeys(SELECTABLE_MODELS, undefined, byId, "no/such-id")?.id).toBe(
      SELECTABLE_MODELS[0]?.id,
    );
  });

  it("returns undefined for an empty list", () => {
    expect(resolveModelByKeys([], undefined, byId, GLM_5_2.id)).toBeUndefined();
  });
});
