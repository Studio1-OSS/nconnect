import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  emitContextTrimAlarm,
  parseNebiusContextLengthInputTokens,
} from "../../cli/src/lib/context-fit.js";
import { getInstallId, sendTelemetryEvent } from "../../cli/src/lib/telemetry.js";

describe("telemetry", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "nconnect-telemetry-"));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("does not send analytics or create install state in GitHub Actions", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("GITHUB_ACTIONS", "true");

    await sendTelemetryEvent({ event: "cli_started", agent: "codex" }, tmpDir);

    expect(fetchMock).not.toHaveBeenCalled();
    await expect(
      readFile(path.join(tmpDir, ".nconnect", "install-id"), "utf8"),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  test("returns one stable install id when first-use callers race", async () => {
    const ids = await Promise.all(Array.from({ length: 10 }, () => getInstallId(tmpDir)));

    expect(new Set(ids)).toHaveLength(1);
    const stored = JSON.parse(await readFile(path.join(tmpDir, ".nconnect", "install-id"), "utf8"));
    expect(stored.id).toBe(ids[0]);
  });

  test("context_trim telemetry event is POSTed with the structured trim payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("GITHUB_ACTIONS", "false");
    // Telemetry is opt-in in this fork: it only sends when the endpoint is set.
    vi.stubEnv("NCONNECT_TELEMETRY_URL", "https://telemetry.test/api/telemetry");

    await sendTelemetryEvent(
      {
        event: "context_trim",
        contextTrim: {
          path: "preemptive",
          model: "zai-org/GLM-5.2",
          trimmedChars: 4096,
          inputTokens: 200000,
          contextWindow: 262144,
        },
      },
      tmpDir,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/api\/telemetry$/);
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.event).toBe("context_trim");
    expect(body.contextTrim).toEqual({
      path: "preemptive",
      model: "zai-org/GLM-5.2",
      trimmedChars: 4096,
      inputTokens: 200000,
      contextWindow: 262144,
    });
    // Anonymous install id is attached, no device fingerprint.
    expect(typeof body.installId).toBe("string");
    expect(body.installId.length).toBeGreaterThan(0);
  });
});

describe("context trim alarm (telemetry + stderr)", () => {
  let stderrWrite: ReturnType<typeof vi.spyOn>;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "nconnect-trim-alarm-"));
    vi.spyOn(os, "homedir").mockReturnValue(tmpDir);
    stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("writes an always-on stderr warning and fires a context_trim telemetry event", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("GITHUB_ACTIONS", "false");
    // Telemetry is opt-in in this fork: it only sends when the endpoint is set.
    vi.stubEnv("NCONNECT_TELEMETRY_URL", "https://telemetry.test/api/telemetry");

    emitContextTrimAlarm({
      path: "retry",
      model: "moonshotai/Kimi-K2.7-Code",
      trimmedChars: 9001,
      inputTokens:
        parseNebiusContextLengthInputTokens(
          "maximum context length is 262,144 tokens. (258_001 input tokens, 2048 output tokens).",
        ) ?? 0,
      contextWindow: 262144,
    });

    // The stderr warning is always-on (not debug-gated) and single-line.
    const written = stderrWrite.mock.calls.map((c: unknown[]) => String(c[0])).join("");
    expect(written).toContain("nconnect: trimmed 9001 chars");
    expect(written).toContain("moonshotai/Kimi-K2.7-Code");
    expect(written).toContain("(retry path)");
    expect(written).toContain("if you see this often, report it");

    // Telemetry is fire-and-forget but still flushes within the timeout.
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.event).toBe("context_trim");
    expect(body.contextTrim).toEqual({
      path: "retry",
      model: "moonshotai/Kimi-K2.7-Code",
      trimmedChars: 9001,
      inputTokens: 258001,
      contextWindow: 262144,
    });
  });
});
