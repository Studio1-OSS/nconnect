import { describe, expect, test } from "vitest";
import { nconnectHome, isProcessAlive } from "@nconnect/cli/dist/lib/paths.js";

describe("paths.ts - single source of truth for home + liveness (#7)", () => {
  test("nconnectHome honors NCONNECT_HOME env", () => {
    const original = process.env.NCONNECT_HOME;
    process.env.NCONNECT_HOME = "/tmp/nconnect-test-home-xyz";
    try {
      expect(nconnectHome()).toBe("/tmp/nconnect-test-home-xyz");
    } finally {
      if (original === undefined) delete process.env.NCONNECT_HOME;
      else process.env.NCONNECT_HOME = original;
    }
  });

  test("nconnectHome falls back to ~/.nconnect when env unset", () => {
    const original = process.env.NCONNECT_HOME;
    delete process.env.NCONNECT_HOME;
    try {
      const home = nconnectHome();
      expect(home.endsWith("/.nconnect")).toBe(true);
    } finally {
      if (original !== undefined) process.env.NCONNECT_HOME = original;
    }
  });

  test("isProcessAlive returns false for a dead pid (ESRCH)", () => {
    // pid 0 is never a valid kill target on unix; use a very large unused pid.
    expect(isProcessAlive(999_999_999)).toBe(false);
  });

  test("isProcessAlive returns true for the current process", () => {
    expect(isProcessAlive(process.pid)).toBe(true);
  });
});
