import { describe, expect, test, vi } from "vitest";
import { runCodexNebius } from "../../cli/src/lib/codex/core.js";
import { runProxiedSession } from "../../cli/src/lib/proxied-session.js";

vi.mock("../../cli/src/lib/proxied-session.js", () => ({
  runProxiedSession: vi.fn().mockResolvedValue({ status: 0, signal: null }),
}));

describe("Codex image launch arguments", () => {
  test("registers the requested vision model and keeps files and literal prompts intact", async () => {
    await runCodexNebius({
      apiKey: "test-key",
      baseUrl: "https://example.invalid",
      home: "/unused",
      args: [
        "--ignore-user-config",
        "--model",
        "moonshotai/Kimi-K3.1-Pro",
        "--image",
        "/tmp/screen shot.png",
        "--",
        "--model is literal prompt text",
      ],
    });
    const spec = vi.mocked(runProxiedSession).mock.calls.at(-1)![0];
    expect(spec.modelId).toBe("moonshotai/Kimi-K3.1-Pro");
    expect(spec.modelDefinition.modalities.input).toContain("image");
    const args = spec.buildArgs({
      proxyUrl: "http://127.0.0.1:9999",
      authToken: "test-token",
      modelId: spec.modelId,
      args: spec.args ?? [],
      beforeSpawnResult: { path: "/tmp/catalog.json" },
    });
    expect(args.slice(0, 3)).toEqual(["--ignore-user-config", "--image", "/tmp/screen shot.png"]);
    expect(args).toContain('model="moonshotai/Kimi-K3.1-Pro"');
    expect(args.slice(-2)).toEqual(["--", "--model is literal prompt text"]);
    expect(args).not.toContain("--model");
  });
});
