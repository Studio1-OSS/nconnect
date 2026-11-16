import { afterEach, describe, expect, test, vi } from "vitest";
import { extractCodexModelArg } from "../../cli/src/lib/codex/launch-args.js";
import { runCodexNebius } from "../../cli/src/lib/codex/core.js";
import codexHarness from "../../cli/src/lib/harnesses/codex.js";
import { recordAgentModel } from "../../cli/src/lib/model-preferences.js";

vi.mock("../../cli/src/lib/codex/core.js", () => ({
  runCodexNebius: vi.fn().mockResolvedValue({ status: 0, signal: null }),
}));
vi.mock("../../cli/src/lib/model-preferences.js", () => ({
  readAgentModelPreference: vi.fn().mockResolvedValue(undefined),
  recordAgentModel: vi.fn(),
}));

afterEach(() => vi.clearAllMocks());

describe("ncodex vision model selection", () => {
  test.each([
    ["--model", "moonshotai/Kimi-K3.1-Pro"],
    ["-m", "moonshotai/Kimi-K3.1-Pro"],
    ["--model=moonshotai/Kimi-K3.1-Pro"],
    ["-m=moonshotai/Kimi-K3.1-Pro"],
  ])("honors model arguments %j and preserves image attachments", async (...modelArgs) => {
    await codexHarness.run({
      home: "/unused",
      apiKey: "test-key",
      passthrough: [...modelArgs, "-i", "/tmp/screen shot.png", "Describe this"],
    });
    expect(runCodexNebius).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: "moonshotai/Kimi-K3.1-Pro",
        args: ["-i", "/tmp/screen shot.png", "Describe this"],
      }),
    );
    expect(recordAgentModel).toHaveBeenCalledWith("codex", "moonshotai/Kimi-K3.1-Pro");
  });

  test("rejects a mistyped explicit model instead of silently selecting a text model", async () => {
    await expect(
      codexHarness.run({
        home: "/unused",
        apiKey: "test-key",
        passthrough: ["--model", "missing-vision-model"],
      }),
    ).rejects.toThrow("Unsupported Codex model");
    expect(runCodexNebius).not.toHaveBeenCalled();
  });

  test("preserves literal model-looking arguments after the separator", () => {
    expect(extractCodexModelArg(["-i", "image.png", "--", "--model", "literal"])).toEqual({
      modelId: undefined,
      args: ["-i", "image.png", "--", "--model", "literal"],
    });
  });

  test.each([["--model"], ["--model="], ["-m", "--image"], ["-m", ""]])(
    "rejects missing model values %j",
    (...args) => {
      expect(() => extractCodexModelArg(args)).toThrow();
    },
  );
});
