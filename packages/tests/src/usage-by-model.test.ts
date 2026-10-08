import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { GLM_5_2, getDefaultModel } from "../../models/src/index.js";
import { modelShares, summarizeUsage } from "../../cli/src/lib/usage-report.js";
import { extractImageBlocks } from "../../cli/src/lib/claude/vision-resolver.js";

const FLASH = getDefaultModel();
const K3_ID = "moonshotai/Kimi-K3";
const usage = (promptTokens: number, completionTokens: number, costUsd: number) => ({
  promptTokens,
  cachedTokens: 0,
  completionTokens,
  costUsd,
});
const session = (extra: Record<string, unknown>) => ({
  agent: "claude",
  modelId: "nconnect/auto",
  modelName: "Auto",
  endedAt: 10,
  ...usage(1000, 100, 1.1),
  ...extra,
});

describe("usage report by model", () => {
  test("an Auto session is reported under the models it actually ran on", () => {
    const summary = summarizeUsage(
      [
        session({
          byModel: [
            { model: FLASH.id, ...usage(600, 60, 0.1) },
            { model: K3_ID, ...usage(400, 40, 1.0) },
          ],
        }),
      ],
      0,
    );
    expect(summary.byModel.map((row) => row.model)).toEqual(["Kimi K3", FLASH.name]);
    // "Auto" has no price and is not a model: it must not appear as a row.
    expect(summary.byModel.some((row) => row.model === "Auto")).toBe(false);
    expect(summary.byModel.reduce((sum, row) => sum + row.costUsd, 0)).toBeCloseTo(1.1);
    expect(summary.costUsd).toBeCloseTo(1.1);
    expect(summary.sessions).toBe(1);
  });

  test("spend the per-model record does not cover stays under the launch model", () => {
    // The record restarts with the daemon, so it can cover less than the total.
    const shares = new Map(
      modelShares(session({ byModel: [{ model: K3_ID, ...usage(400, 40, 0.5) }] })),
    );
    expect(shares.get("Kimi K3")?.costUsd).toBeCloseTo(0.5);
    expect(shares.get("Auto")?.costUsd).toBeCloseTo(0.6);
    expect(shares.get("Auto")?.promptTokens).toBe(600);
    const total = [...shares.values()].reduce((sum, row) => sum + row.costUsd, 0);
    expect(total).toBeCloseTo(1.1);
  });

  test("never reports more than the session spent", () => {
    const shares = modelShares(session({ byModel: [{ model: K3_ID, ...usage(5000, 500, 9) }] }));
    expect(shares).toHaveLength(1);
    expect(shares[0]?.[1].costUsd).toBeCloseTo(1.1);
    expect(shares[0]?.[1].promptTokens).toBe(1000);
  });

  test("a session recorded without a per-model split keeps its launch model", () => {
    const summary = summarizeUsage(
      [
        {
          agent: "pi",
          modelId: GLM_5_2.id,
          modelName: GLM_5_2.name,
          endedAt: 1,
          ...usage(10, 1, 0.01),
        },
      ],
      0,
    );
    expect(summary.byModel).toEqual([{ model: GLM_5_2.name, sessions: 1, ...usage(10, 1, 0.01) }]);
  });
});

describe("usage by model survives the session store", () => {
  const cleanup: string[] = [];
  afterEach(() =>
    cleanup.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })),
  );

  test("is written with the session and read back", () => {
    const home = mkdtempSync(join(tmpdir(), "nconnect-usage-by-model-"));
    cleanup.push(home);
    const output = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
          import { createSessionStore } from "./packages/cli/dist/lib/daemon/storage.js";
          import { GLM_5_2 } from "./packages/models/dist/index.js";
          const store = await createSessionStore(process.argv[1]);
          if (store.kind !== "sqlite") throw new Error("sqlite unavailable");
          const totals = { promptTokens: 10, cachedTokens: 0, completionTokens: 2, costUsd: 0.5 };
          store.upsertSession({
            token: "t", agent: "codex", apiKey: "k", modelLabel: "Auto", modelId: "nconnect/auto",
            targetModelId: "nconnect/auto", modelName: "Auto", modelDefinition: GLM_5_2,
            startedAt: Date.now(), lastSeenAt: Date.now(), costSummary: "", costTotals: totals,
          });
          const byModel = [{ model: "moonshotai/Kimi-K3", ...totals }];
          store.updateSessionUsage("t", "s", totals, undefined, byModel);
          // A later write with nothing to record must not erase what is stored.
          store.updateSessionUsage("t", "s", totals, undefined, []);
          store.markSessionEnded("t", Date.now(), "s", totals);
          console.log(JSON.stringify(store.queryUsageSince(0)[0].byModel));
          store.close();
        `,
        home,
      ],
      { cwd: join(import.meta.dirname, "../../.."), encoding: "utf8" },
    );
    expect(JSON.parse(output.trim().split("\\n").at(-1) ?? "null")).toEqual([
      { model: K3_ID, promptTokens: 10, cachedTokens: 0, completionTokens: 2, costUsd: 0.5 },
    ]);
  });
});

describe("tool references", () => {
  test("are not mistaken for images", () => {
    // Claude Code's tool search returns these on every turn after a tool loads.
    const found = extractImageBlocks({
      messages: [
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "a",
              content: [{ type: "tool_reference", tool_name: "WebSearch" }],
            },
          ],
        },
      ],
    });
    expect(found).toEqual([]);
  });
});
