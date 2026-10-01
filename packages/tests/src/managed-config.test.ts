import { describe, expect, test } from "vitest";
import { isDisableVerb, resolveDisableRequest } from "../../cli/src/lib/commands/managed-config.js";

describe("disable verbs", () => {
  test("off and restore are recognized, case-insensitively", () => {
    for (const verb of ["off", "restore", "OFF", "Restore"]) {
      expect(isDisableVerb(verb)).toBe(true);
    }
  });

  test("ordinary words are not verbs", () => {
    for (const value of ["exec", "chat", undefined, "", "offline"]) {
      expect(isDisableVerb(value)).toBe(false);
    }
  });
});

describe("resolving a disable request", () => {
  // `chatgpt off` leaves the verb in positional (chatgpt is not a harness id).
  test("chatgpt off / restore disables", () => {
    expect(resolveDisableRequest("codex-app", ["off"])).toEqual({ kind: "restore" });
    expect(resolveDisableRequest("codex-app", ["restore"])).toEqual({ kind: "restore" });
  });

  // `codex off` moves it into passthrough: everything after a harness name is
  // passed through, which is exactly how this used to reach Codex as a prompt.
  test("codex off disables rather than launching Codex with a prompt", () => {
    expect(resolveDisableRequest("codex", [undefined, "off"])).toEqual({ kind: "restore" });
  });

  test("bare restore / off needs no harness - the config is shared", () => {
    expect(resolveDisableRequest("restore", [])).toEqual({ kind: "restore" });
    expect(resolveDisableRequest("off", [])).toEqual({ kind: "restore" });
  });

  // Forwarding the verb to a harness that writes no config would launch it
  // with "off" as the prompt - silent, billable, and baffling.
  test("harnesses with no managed config are refused with a clear error", () => {
    for (const harness of ["claude", "pi", "opencode", "hermes", "grok"]) {
      const result = resolveDisableRequest(harness, [undefined, "off"]);
      expect(result.kind).toBe("error");
      if (result.kind === "error") {
        expect(result.message).toContain("no persistent configuration");
        expect(result.message).toContain("nconnect chatgpt off");
      }
    }
  });

  test("the error names the harness so it is obvious what was refused", () => {
    const result = resolveDisableRequest("claude", ["off"]);
    expect(result.kind === "error" && result.message).toContain("Claude Code");
  });

  test("an ordinary launch is untouched", () => {
    expect(resolveDisableRequest("codex", [undefined, "exec"])).toEqual({ kind: "none" });
    expect(resolveDisableRequest("claude", [])).toEqual({ kind: "none" });
    expect(resolveDisableRequest(undefined, [])).toEqual({ kind: "none" });
  });
});
