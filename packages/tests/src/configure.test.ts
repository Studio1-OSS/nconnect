import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import * as clack from "@clack/prompts";

vi.mock("@clack/prompts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@clack/prompts")>()),
  password: vi.fn(),
}));

import { runConfigure } from "../../cli/src/lib/commands/global.js";
import { readGlobalConfig, resolveStoredTavilyApiKey } from "../../cli/src/lib/global-config.js";

const temporaryHomes: string[] = [];

afterEach(async () => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await Promise.all(
    temporaryHomes.splice(0).map((home) => rm(home, { recursive: true, force: true })),
  );
});

describe("nconnect configure", () => {
  test("requires a Nebius key and allows an untouched Tavily prompt to be skipped", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "nconnect-configure-"));
    temporaryHomes.push(home);
    vi.stubEnv("NEBIUS_API_KEY", "");
    vi.stubEnv("TAVILY_API_KEY", "");
    vi.mocked(clack.password).mockResolvedValueOnce(" nebius-test-key ").mockResolvedValueOnce("");

    expect(await runConfigure(home)).toBe(true);
    const validate = vi.mocked(clack.password).mock.calls[0][0].validate!;
    expect(validate("")).toBe("An API key is required");
    expect(validate("   ")).toBe("An API key is required");
    expect(validate("test-key")).toBeUndefined();
    const config = await readGlobalConfig(home);
    expect(config.apiKey).toBe("nebius-test-key");
    expect(config.tavilyApiKey || "").toBe("");
  });

  test("cancels before saving credentials", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "nconnect-configure-"));
    temporaryHomes.push(home);
    vi.stubEnv("NEBIUS_API_KEY", "");
    vi.stubEnv("TAVILY_API_KEY", "");
    vi.mocked(clack.password).mockResolvedValueOnce(Symbol.for("clack:cancel"));
    const cancel = vi.spyOn(clack, "isCancel").mockReturnValueOnce(true);
    expect(await runConfigure(home)).toBe(false);
    expect((await readGlobalConfig(home)).apiKey).toBe("");
    cancel.mockRestore();
  });

  test("persists an Exa key across a cold start even when configure reads it from the environment", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "nconnect-configure-"));
    temporaryHomes.push(home);
    vi.stubEnv("NEBIUS_API_KEY", "nebius-test-key");
    vi.stubEnv("TAVILY_API_KEY", "exa-test-key");

    await runConfigure(home);

    vi.stubEnv("TAVILY_API_KEY", "");
    const stored = (await readGlobalConfig(home)).tavilyApiKey;

    expect(stored).toBe("exa-test-key");
    expect(resolveStoredTavilyApiKey(stored)).toBe("exa-test-key");
  });
});
