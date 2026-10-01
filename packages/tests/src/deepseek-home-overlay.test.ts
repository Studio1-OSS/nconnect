import { describe, expect, test } from "vitest";
import { extractDeepseekProfile, withoutPersistedModel } from "../../cli/src/lib/deepseek/core.js";

/**
 * dsh persists the model last picked in its web UI to settings.yaml, and that
 * setting outranks the profile config AND our --patch. So `ndeepseek --model X`
 * was silently ignored: measured, a run launched as "GLM 5.3 Flash" billed at
 * DeepSeek V4 Pro's $1.75/M rate - 12x the intended price, on a model the user
 * never asked for.
 */
describe("stripping the persisted model override", () => {
  test("removes the block and keeps everything else", () => {
    const settings = [
      "ui-onboarding:",
      "  welcomeNoticeVersion: 2026-08-13.1",
      "agent-default-model:",
      "  provider: nconnect",
      "  model: deepseek-ai/DeepSeek-V4-Pro",
      "",
    ].join("\n");
    const stripped = withoutPersistedModel(settings);
    expect(stripped).toContain("ui-onboarding:");
    expect(stripped).toContain("welcomeNoticeVersion");
    expect(stripped).not.toContain("agent-default-model");
    expect(stripped).not.toContain("DeepSeek-V4-Pro");
  });

  // The block can sit anywhere in the file, and what follows must survive.
  test("keeps keys that come after the block", () => {
    const settings = [
      "agent-default-model:",
      "  provider: nconnect",
      "  model: deepseek-ai/DeepSeek-V4-Pro",
      "other-setting:",
      "  value: 42",
      "",
    ].join("\n");
    const stripped = withoutPersistedModel(settings);
    expect(stripped).not.toContain("agent-default-model");
    expect(stripped).toContain("other-setting:");
    expect(stripped).toContain("value: 42");
  });

  test("a file without the block is unchanged in substance", () => {
    const settings = "ui-onboarding:\n  welcomeNoticeVersion: 1\n";
    expect(withoutPersistedModel(settings)).toContain("welcomeNoticeVersion: 1");
  });

  test("an empty settings file is handled", () => {
    expect(withoutPersistedModel("")).toBe("");
  });
});

describe("profile selection", () => {
  // `web` is dsh's local UI and its only subcommand; `headless` answers one
  // task and exits, which is the only way to script it.
  test("defaults to the web profile", () => {
    expect(extractDeepseekProfile([]).profile).toBe("web");
    expect(extractDeepseekProfile(["--resume", "x"]).profile).toBe("web");
  });

  test("--profile is hoisted out of the passthrough args", () => {
    const { profile, rest } = extractDeepseekProfile(["--profile", "headless", "do the thing"]);
    expect(profile).toBe("headless");
    // The launcher flag must not reach the profile's own arg parser.
    expect(rest).toEqual(["do the thing"]);
  });

  test("the --profile=name form works too", () => {
    const { profile, rest } = extractDeepseekProfile(["--profile=headless", "task"]);
    expect(profile).toBe("headless");
    expect(rest).toEqual(["task"]);
  });
});
