import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

const cleanup: string[] = [];

afterEach(() => {
  for (const directory of cleanup.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("daemon session persistence", () => {
  test("restores the session-scoped Nebius base URL", async () => {
    const home = mkdtempSync(join(tmpdir(), "nconnect-daemon-store-"));
    cleanup.push(home);
    const output = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
          import { createSessionStore } from "./packages/cli/dist/lib/daemon/storage.js";
          import { GLM_5_2 } from "./packages/models/dist/index.js";
          const home = process.argv[1];
          const store = await createSessionStore(home);
          if (store.kind !== "sqlite") throw new Error("sqlite unavailable");
          store.upsertSession({
            token: "session-with-base-url",
            agent: "claude",
            apiKey: "phantom-key",
            baseUrl: "http://protected-proxy.test/nebius/v1",
            modelLabel: GLM_5_2.name,
            modelId: GLM_5_2.anthropicAlias ?? GLM_5_2.id,
            targetModelId: GLM_5_2.id,
            modelName: GLM_5_2.name,
            modelDefinition: GLM_5_2,
            startedAt: 1,
            lastSeenAt: 2,
            costSummary: "test",
            costTotals: { promptTokens: 0, cachedTokens: 0, completionTokens: 0, costUsd: 0 },
          });
          store.close();
          const restoredStore = await createSessionStore(home);
          const restored = restoredStore.restoreActiveSessions();
          restoredStore.close();
          process.stdout.write(restored[0]?.baseUrl ?? "missing");
        `,
        home,
      ],
      { cwd: join(process.cwd(), "..", ".."), encoding: "utf8" },
    );

    expect(output).toBe("http://protected-proxy.test/nebius/v1");
  });
});

/**
 * `nconnect usage` used to require `ended_at IS NOT NULL`, so a session that
 * was still running contributed nothing. ChatGPT Desktop registers without a
 * pid and never ends while the app is open, so its spend was permanently
 * invisible - and proxied sessions only persisted cost at exit, so a daemon
 * restart lost whatever was in flight.
 */
describe("usage counts sessions that are still running", () => {
  function runStoreScript(home: string, body: string): string {
    return execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
          import { createSessionStore } from "./packages/cli/dist/lib/daemon/storage.js";
          import { GLM_5_2 } from "./packages/models/dist/index.js";
          const home = process.argv[1];
          const store = await createSessionStore(home);
          if (store.kind !== "sqlite") throw new Error("sqlite unavailable");
          const base = (token, startedAt, lastSeenAt) => ({
            token,
            agent: "codex-app",
            apiKey: "k",
            baseUrl: "http://x/v1",
            modelLabel: GLM_5_2.name,
            modelId: GLM_5_2.id,
            targetModelId: GLM_5_2.id,
            modelName: GLM_5_2.name,
            modelDefinition: GLM_5_2,
            startedAt,
            lastSeenAt,
            costSummary: "",
            costTotals: { promptTokens: 0, cachedTokens: 0, completionTokens: 0, costUsd: 0 },
          });
          ${body}
          store.close();
        `,
        home,
      ],
      { cwd: join(process.cwd(), "..", ".."), encoding: "utf8" },
    );
  }

  test("an active session's live cost appears in the window", () => {
    const home = mkdtempSync(join(tmpdir(), "nconnect-usage-active-"));
    cleanup.push(home);
    const output = runStoreScript(
      home,
      `
        const now = Date.now();
        store.upsertSession(base("live", now - 1000, now));
        // Cost flushed mid-session, exactly as markSeen now does.
        store.updateSessionUsage("live", "running", {
          promptTokens: 900, cachedTokens: 100, completionTokens: 50, costUsd: 0.25,
        });
        const rows = store.queryUsageSince(now - 60_000);
        process.stdout.write(JSON.stringify({
          count: rows.length,
          cost: rows[0]?.costUsd ?? 0,
          active: rows[0]?.active ?? false,
        }));
      `,
    );
    const result = JSON.parse(output) as { count: number; cost: number; active: boolean };
    expect(result.count).toBe(1);
    expect(result.cost).toBeCloseTo(0.25, 6);
    // Flagged so the report can say the total is still growing.
    expect(result.active).toBe(true);
  });

  test("an active session older than the window is still excluded", () => {
    const home = mkdtempSync(join(tmpdir(), "nconnect-usage-stale-"));
    cleanup.push(home);
    const output = runStoreScript(
      home,
      `
        const now = Date.now();
        const old = now - 30 * 86_400_000;
        store.upsertSession(base("stale", old, old));
        process.stdout.write(String(store.queryUsageSince(now - 86_400_000).length));
      `,
    );
    expect(output).toBe("0");
  });

  test("ended sessions still count, and are not marked active", () => {
    const home = mkdtempSync(join(tmpdir(), "nconnect-usage-ended-"));
    cleanup.push(home);
    const output = runStoreScript(
      home,
      `
        const now = Date.now();
        store.upsertSession(base("done", now - 5000, now - 4000));
        store.markSessionEnded("done", now - 3000, "done", {
          promptTokens: 10, cachedTokens: 0, completionTokens: 5, costUsd: 0.01,
        });
        const rows = store.queryUsageSince(now - 60_000);
        process.stdout.write(JSON.stringify({ n: rows.length, active: rows[0]?.active ?? false }));
      `,
    );
    expect(JSON.parse(output)).toEqual({ n: 1, active: false });
  });
});
