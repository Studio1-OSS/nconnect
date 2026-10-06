import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { buildCatalog, parseModelsDevIndex, type NebiusApiModel } from "../../models/src/index.js";
// The CLI modules read the built package; mutate the same catalog instance.
import { applyCatalog, getSelectableModels } from "@nconnect/models";
import { resolveClaudeModel } from "../../cli/src/lib/claude/defaults.js";
import { resolveCodexModel } from "../../cli/src/lib/codex/defaults.js";
import { initModelCatalog } from "../../cli/src/lib/model-catalog-init.js";

const row = (id: string, extra: Partial<NebiusApiModel> = {}): NebiusApiModel => ({
  id,
  name: id,
  context_length: 262_144,
  architecture: { modality: "text->text" },
  pricing: { prompt: "0.0000001", completion: "0.0000002" },
  ...extra,
});

describe("models.dev index parsing", () => {
  test("extracts Nebius models and tolerates junk", () => {
    const index = parseModelsDevIndex({
      nebius: {
        models: {
          "a/one": { name: "One", tool_call: true, reasoning: false, release_date: "2026-09-10" },
          "a/bad": "not a model",
        },
      },
      other: { models: { "x/y": { tool_call: true } } },
    });
    expect(Object.keys(index)).toEqual(["a/one"]);
    expect(index["a/one"]).toMatchObject({ tool_call: true, reasoning: false });
    expect(parseModelsDevIndex(null)).toEqual({});
    expect(parseModelsDevIndex({ nebius: {} })).toEqual({});
  });
});

describe("catalog enrichment", () => {
  test("Nebius supported_features wins over models.dev; models.dev fills when Nebius is silent", () => {
    const catalog = buildCatalog(
      [
        row("lab/reports-tools", { supported_features: ["tools"] }),
        row("lab/silent"),
        row("lab/no-tools-per-modelsdev"),
      ],
      {
        "lab/reports-tools": { tool_call: false, reasoning: true },
        "lab/silent": { tool_call: true, reasoning: false },
        "lab/no-tools-per-modelsdev": { tool_call: false },
      },
    );
    const by = (id: string) => catalog.byId.get(id)!;
    expect(by("lab/reports-tools").tool_call).toBe(true); // Nebius says tools
    expect(by("lab/reports-tools").reasoning).toBe(false); // Nebius list omits reasoning
    expect(by("lab/silent").reasoning).toBe(false); // models.dev fills the gap
    expect(by("lab/no-tools-per-modelsdev").tool_call).toBe(false);
  });

  test("a model that cannot call tools stays out of the picker but remains addressable", () => {
    const catalog = buildCatalog([row("lab/agentic"), row("lab/chat-only")], {
      "lab/chat-only": { tool_call: false },
    });
    expect(catalog.selectable.map((m) => m.id)).not.toContain("lab/chat-only");
    expect(catalog.byId.has("lab/chat-only")).toBe(true);
  });

  test("uncurated models are ordered newest first, after the curated flagships", () => {
    const catalog = buildCatalog(
      [
        row("zai-org/GLM-5.3-Flash"),
        row("lab/old", { created: Date.parse("2026-10-06") / 1000 }), // redeployed today
        row("lab/mid"),
        row("lab/newest"),
        row("lab/undated"),
      ],
      {
        "lab/old": { release_date: "2025-01-01" },
        "lab/mid": { release_date: "2026-08-01" },
        "lab/newest": { release_date: "2026-10-01" },
      },
    );
    const ids = catalog.selectable.map((m) => m.id);
    expect(ids[0]).toBe("zai-org/GLM-5.3-Flash");
    // Curated rows (including bundled fallbacks) come first; ours follow, newest first.
    // Nebius's `created` (reset on redeploy) must not lift "lab/old".
    expect(ids.filter((id) => id.startsWith("lab/"))).toEqual([
      "lab/newest",
      "lab/mid",
      "lab/old",
      "lab/undated",
    ]);
  });

  test("output caps stay conservative even when models.dev lists output == context", () => {
    const catalog = buildCatalog([row("lab/long", { context_length: 1_048_576 })], {
      "lab/long": { limit: { context: 1_048_576, output: 1_048_576 } },
    });
    expect(catalog.byId.get("lab/long")!.limit.output).toBeLessThanOrEqual(32_768);
  });

  test("an empty index yields the same catalog as Nebius alone", () => {
    const rows = [row("lab/a", { supported_features: ["tools", "reasoning"] }), row("lab/b")];
    expect(buildCatalog(rows, {}).selectable.map((m) => m.id)).toEqual(
      buildCatalog(rows).selectable.map((m) => m.id),
    );
  });
});

describe("review follow-ups", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  test("curated models that cannot call tools are filtered too", () => {
    const catalog = buildCatalog([row("zai-org/GLM-5.3-Flash", { supported_features: [] })]);
    expect(catalog.selectable.map((m) => m.id)).not.toContain("zai-org/GLM-5.3-Flash");
    expect(catalog.byId.has("zai-org/GLM-5.3-Flash")).toBe(true);
  });

  test("ordering ignores last_updated: a model with only a metadata edit date is undated", () => {
    const catalog = buildCatalog([row("lab/released"), row("lab/edited-only")], {
      "lab/released": { release_date: "2026-01-01" },
      "lab/edited-only": { last_updated: "2026-10-05" },
    });
    const ids = catalog.selectable.map((m) => m.id).filter((id) => id.startsWith("lab/"));
    expect(ids).toEqual(["lab/released", "lab/edited-only"]);
  });

  test("an explicit --model for a model hidden from the picker still resolves", () => {
    const hidden = "lab/no-tools";
    applyCatalog(
      buildCatalog([row("lab/agentic"), row(hidden, { supported_features: [] })]) as never,
    );
    try {
      expect(getSelectableModels().map((m) => m.id)).not.toContain(hidden);
      expect(resolveClaudeModel(hidden).definition.id).toBe(hidden);
      expect(resolveCodexModel(hidden).definition.id).toBe(hidden);
      expect(() => resolveCodexModel("lab/does-not-exist")).toThrow(/Unsupported/);
    } finally {
      applyCatalog(buildCatalog([]) as never);
    }
  });

  test("a corrupt models.dev cache neither blocks the live catalog nor waits on the network", async () => {
    const home = mkdtempSync(path.join(tmpdir(), "nconnect-mdcache-"));
    try {
      const dir = path.join(home, ".nconnect");
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, "models-dev.json"), "{ not json");
      writeFileSync(
        path.join(dir, "model-catalog.json"),
        JSON.stringify({
          fetchedAt: Date.now(),
          baseUrl: "https://api.tokenfactory.nebius.com/v1",
          models: [row("lab/fresh-from-cache", { supported_features: ["tools"] })],
        }),
      );
      // A network that never answers: the launch must not wait for it.
      const fetchSpy = vi.fn(() => new Promise<Response>(() => {}));
      vi.stubGlobal("fetch", fetchSpy);
      const started = Date.now();
      await initModelCatalog({ home, force: false });
      expect(Date.now() - started).toBeLessThan(1000);
      expect(getSelectableModels().map((m) => m.id)).toContain("lab/fresh-from-cache");
      expect(fetchSpy).toHaveBeenCalled(); // refresh kicked off in the background
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
