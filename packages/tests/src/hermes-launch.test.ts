import { describe, expect, test } from "vitest";
import { buildHermesLaunchSpec } from "../../cli/src/lib/hermes/core.js";

const base = {
  modelId: "zai-org/GLM-5.3-Flash",
  apiKey: "session-token",
  baseUrl: "https://nebius.test/v1",
  hermesHome: "/tmp/overlay",
};

describe("hermes launch", () => {
  test("runs the terminal agent in the directory the user launched from", () => {
    // Hermes's terminal tool falls back to ~ in one-shot mode when
    // TERMINAL_CWD is unset, so a task would touch files in the home directory.
    const spec = buildHermesLaunchSpec({
      ...base,
      mode: "terminal",
      env: {},
      cwd: "/work/project",
    });
    expect(spec.env.TERMINAL_CWD).toBe("/work/project");
    expect(spec.args.slice(0, 4)).toEqual(["--provider", "nconnect", "--model", base.modelId]);
    expect(spec.env.HERMES_HOME).toBe("/tmp/overlay");
  });

  test("keeps a working directory the user chose themselves", () => {
    const spec = buildHermesLaunchSpec({
      ...base,
      mode: "terminal",
      env: { TERMINAL_CWD: "/elsewhere" },
      cwd: "/work/project",
    });
    expect(spec.env.TERMINAL_CWD).toBe("/elsewhere");
  });

  test("leaves the desktop app's working directory alone", () => {
    const spec = buildHermesLaunchSpec({ ...base, mode: "desktop", env: {}, cwd: "/work/project" });
    expect(spec.env.TERMINAL_CWD).toBeUndefined();
    expect(spec.args[0]).toBe("desktop");
  });
});
