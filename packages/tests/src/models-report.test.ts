import { afterEach, describe, expect, test, vi } from "vitest";
// The CLI reads the built package; drive the same catalog instance.
import { applyCatalog, buildCatalog, type NebiusApiModel } from "@nconnect/models";
import { claudeTierModels } from "../../cli/src/lib/claude/core.js";
import {
  buildModelRows,
  formatModelsReport,
  formatPrice,
  formatTokens,
} from "../../cli/src/lib/models-report.js";

const row = (id: string, extra: Partial<NebiusApiModel> = {}): NebiusApiModel => ({
  id,
  name: id,
  context_length: 262_144,
  architecture: { modality: "text->text" },
  pricing: { prompt: "0.0000003", completion: "0.0000012" },
  supported_features: ["tools", "reasoning"],
  ...extra,
});

afterEach(() => {
  vi.unstubAllEnvs();
  applyCatalog(buildCatalog([]) as never);
});

describe("nconnect models", () => {
  test("formats context the way Nebius quotes it, and prices to the cent", () => {
    expect(formatTokens(1_048_576)).toBe("1M");
    expect(formatTokens(1_024_000)).toBe("1M");
    expect(formatTokens(979_000)).toBe("979K");
    expect(formatTokens(262_144)).toBe("262K");
    expect(formatTokens(1_500_000)).toBe("1.5M");
    expect(formatPrice(0.06)).toBe("0.06");
    expect(formatPrice(15)).toBe("15.00");
    expect(formatPrice(0.005)).toBe("0.005");
    expect(formatPrice(0)).toBe("n/a");
  });

  test("rows mark the default, the Claude tiers and the background model - matching the launch env", () => {
    applyCatalog(
      buildCatalog([
        row("zai-org/GLM-5.3-Flash"),
        row("lab/vision", { architecture: { modality: "text+image->text" } }),
      ]) as never,
    );
    const rows = buildModelRows();
    const glm = rows.find((r) => r.id === "zai-org/GLM-5.3-Flash")!;
    expect(glm.default).toBe(true);
    expect(glm.background).toBe(true);
    expect(rows.find((r) => r.id === "lab/vision")!.vision).toBe(true);
    // Every Claude tier label lands on exactly the model claudeTierModels() picks.
    const tiers = claudeTierModels();
    for (const [tier, label] of [
      ["OPUS", "Opus"],
      ["SONNET", "Sonnet"],
      ["HAIKU", "Haiku"],
      ["FABLE", "Fable"],
    ] as const) {
      const r = rows.find((x) => x.id === tiers[tier].definition.id);
      expect(r, `${tier} tier model must have a row`).toBeDefined();
      expect(r!.claudeTiers).toContain(label);
    }
  });

  test("a tier model missing from the live catalog still gets a row, flagged", () => {
    // The live list omits the bundled Haiku-tier backend (Kimi K2.7 Code).
    applyCatalog(buildCatalog([row("zai-org/GLM-5.3-Flash"), row("lab/other")]) as never);
    const haiku = claudeTierModels().HAIKU.definition.id;
    const rows = buildModelRows();
    const r = rows.find((x) => x.id === haiku);
    expect(r).toBeDefined();
    expect(r!.claudeTiers).toContain("Haiku");
    expect(r!.inCatalog).toBe(false);
    expect(formatModelsReport(rows)).toContain("missing from Nebius's live catalog");
  });

  test("a bundled fallback absent from Nebius's list is flagged, not reported as live", () => {
    // DeepSeek V4 Flash is a bundled fallback; this live list does not have it.
    applyCatalog(buildCatalog([row("zai-org/GLM-5.3-Flash")]) as never);
    const rows = buildModelRows();
    const fallback = rows.find((r) => r.id === "deepseek-ai/DeepSeek-V4-Flash");
    expect(fallback).toBeDefined();
    expect(fallback!.inPicker).toBe(true);
    expect(fallback!.inCatalog).toBe(false);
    expect(formatModelsReport(rows)).toMatch(
      /deepseek-ai\/DeepSeek-V4-Flash.*not in Nebius's live catalog/,
    );
    expect(rows.find((r) => r.id === "zai-org/GLM-5.3-Flash")!.inCatalog).toBe(true);
  });

  test("--all adds models kept out of the picker, flagged as not in it", () => {
    applyCatalog(
      buildCatalog([row("lab/agentic"), row("lab/no-tools", { supported_features: [] })]) as never,
    );
    expect(buildModelRows().map((r) => r.id)).not.toContain("lab/no-tools");
    const all = buildModelRows({ all: true });
    const hidden = all.find((r) => r.id === "lab/no-tools")!;
    expect(hidden.inPicker).toBe(false);
    const text = formatModelsReport(all, { all: true });
    expect(text).toContain("Not in the picker");
    expect(text).toMatch(/lab\/no-tools.*no tools/);
  });

  test("the background column follows NCONNECT_BACKGROUND_MODEL", () => {
    applyCatalog(buildCatalog([row("zai-org/GLM-5.3-Flash"), row("lab/other")]) as never);
    vi.stubEnv("NCONNECT_BACKGROUND_MODEL", "off");
    expect(buildModelRows().some((r) => r.background)).toBe(false);
  });

  test("an unpublished price is called out rather than shown as free", () => {
    applyCatalog(buildCatalog([row("lab/unpriced", { pricing: null })]) as never);
    const text = formatModelsReport(buildModelRows());
    expect(text).toMatch(/lab\/unpriced\s+262K\s+n\/a\s+n\/a\s+price not published/);
  });
});
