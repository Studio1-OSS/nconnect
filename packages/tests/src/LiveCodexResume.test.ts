import { copyFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { assertCommandExists } from "./assert.js";
import { runCommand } from "./command.js";
import { cleanupTmpDir, createTestContext, resetTmpDir } from "./context.js";
import { asRecord, jsonLines } from "./json-lines.js";
import type { CommandResult, TestContext } from "./types.js";

const maybeDescribe = process.env.NCONNECT_LIVE_CODEX_RESUME === "1" ? describe : describe.skip;

maybeDescribe("live Codex cross-provider resume", () => {
  let context: TestContext;
  let codexHome: string;

  beforeAll(async () => {
    assertCommandExists("codex");
    context = await createTestContext();
    await resetTmpDir(context);
    codexHome = path.join(context.tmpDir, "codex-home");
    await mkdir(codexHome, { recursive: true });
    await copyFile(
      path.join(os.homedir(), ".codex", "auth.json"),
      path.join(codexHome, "auth.json"),
    );
  });

  afterAll(async () => {
    if (context) {
      await cleanupTmpDir(context);
    }
  });

  test("normal Codex → ncodex → normal Codex preserves reasoning and local actions", async () => {
    const cwd = path.join(context.tmpDir, "normal-nebius-normal");
    await mkdir(cwd, { recursive: true });
    const normalMarker = "NORMAL_ACTION_5261";
    const nebiusMarker = "NEBIUS_ACTION_9047";

    const normalStart = await runNormalCodex(
      context,
      codexHome,
      cwd,
      "resume-normal-start",
      persistentExecArgs(
        `Use apply_patch to create normal-action.txt containing exactly ${normalMarker} followed by a newline. Then reply exactly: NORMAL_CODEX_CREATED`,
      ),
    );
    expect(normalStart.status).toBe(0);
    expect(itemTypes(normalStart)).toContain("file_change");
    const threadId = startedThreadId(normalStart);

    const nebiusResume = await runNebiusCodex(
      context,
      codexHome,
      cwd,
      "resume-nebius-middle",
      persistentResumeArgs(
        threadId,
        `Use a shell command to read normal-action.txt. Then use apply_patch to create nebius-action.txt containing exactly ${nebiusMarker} followed by a newline. Reply exactly: ${normalMarker} ${nebiusMarker}`,
      ),
    );
    expect(nebiusResume.status).toBe(0);
    expect(startedThreadId(nebiusResume)).toBe(threadId);
    expect(itemTypes(nebiusResume)).toEqual(
      expect.arrayContaining(["command_execution", "file_change"]),
    );
    expect(nebiusResume.stdout).toContain(`${normalMarker} ${nebiusMarker}`);

    const normalResume = await runNormalCodex(
      context,
      codexHome,
      cwd,
      "resume-normal-finish",
      persistentResumeArgs(
        threadId,
        "Use a shell command to read normal-action.txt and nebius-action.txt. Reply exactly with their two marker lines separated by one space.",
      ),
    );
    expect(normalResume.status).toBe(0);
    expect(startedThreadId(normalResume)).toBe(threadId);
    expect(itemTypes(normalResume)).toContain("command_execution");
    expect(normalResume.stdout).toContain(`${normalMarker} ${nebiusMarker}`);
    expect(normalResume.stdout + normalResume.stderr).not.toContain("array_above_max_length");
  });

  test("ncodex → normal Codex → ncodex preserves shell and patch history", async () => {
    const cwd = path.join(context.tmpDir, "nebius-normal-nebius");
    await mkdir(cwd, { recursive: true });
    const nebiusMarker = "NEBIUS_ORIGIN_3185";
    const normalMarker = "NORMAL_RESUMED_7724";

    const nebiusStart = await runNebiusCodex(
      context,
      codexHome,
      cwd,
      "reverse-nebius-start",
      persistentExecArgs(
        `Use a shell command with printf to create shared-action.txt containing exactly ${nebiusMarker} followed by a newline. Then reply exactly: NEBIUS_CODEX_CREATED`,
      ),
    );
    expect(nebiusStart.status).toBe(0);
    expect(itemTypes(nebiusStart)).toContain("command_execution");
    const threadId = startedThreadId(nebiusStart);

    const normalResume = await runNormalCodex(
      context,
      codexHome,
      cwd,
      "reverse-normal-middle",
      persistentResumeArgs(
        threadId,
        `Use a shell command to read shared-action.txt. Then use apply_patch to append ${normalMarker} on its own line. Reply exactly: ${nebiusMarker} ${normalMarker}`,
      ),
    );
    expect(normalResume.status).toBe(0);
    expect(startedThreadId(normalResume)).toBe(threadId);
    expect(itemTypes(normalResume)).toEqual(
      expect.arrayContaining(["command_execution", "file_change"]),
    );
    expect(normalResume.stdout).toContain(`${nebiusMarker} ${normalMarker}`);
    expect(normalResume.stdout + normalResume.stderr).not.toContain("array_above_max_length");

    const nebiusResume = await runNebiusCodex(
      context,
      codexHome,
      cwd,
      "reverse-nebius-finish",
      persistentResumeArgs(
        threadId,
        "Use a shell command to read shared-action.txt. Reply exactly with its two marker lines separated by one space.",
      ),
    );
    expect(nebiusResume.status).toBe(0);
    expect(startedThreadId(nebiusResume)).toBe(threadId);
    expect(itemTypes(nebiusResume)).toContain("command_execution");
    expect(nebiusResume.stdout).toContain(`${nebiusMarker} ${normalMarker}`);
  });

  test.todo(
    "normal Codex resume picker lists NConnect provider sessions (blocked by openai/codex#19318)",
  );
});

function persistentExecArgs(prompt: string): string[] {
  return [
    "exec",
    "--json",
    "--skip-git-repo-check",
    "--ignore-user-config",
    "--ignore-rules",
    "--dangerously-bypass-approvals-and-sandbox",
    prompt,
  ];
}

function persistentResumeArgs(threadId: string, prompt: string): string[] {
  return [
    "exec",
    "resume",
    threadId,
    "--json",
    "--skip-git-repo-check",
    "--ignore-user-config",
    "--ignore-rules",
    "--dangerously-bypass-approvals-and-sandbox",
    prompt,
  ];
}

async function runNormalCodex(
  context: TestContext,
  codexHome: string,
  cwd: string,
  name: string,
  args: string[],
): Promise<CommandResult> {
  return runCommand(context, name, "codex", args, {
    cwd,
    timeoutMs: 240_000,
    env: { CODEX_HOME: codexHome },
  });
}

async function runNebiusCodex(
  context: TestContext,
  codexHome: string,
  cwd: string,
  name: string,
  args: string[],
): Promise<CommandResult> {
  return runCommand(context, name, process.execPath, [context.cliBin, "codex", "--", ...args], {
    cwd,
    timeoutMs: 240_000,
    env: { CODEX_HOME: codexHome },
  });
}

function events(result: CommandResult): Array<Record<string, unknown>> {
  return jsonLines(result.stdout).map(asRecord);
}

function startedThreadId(result: CommandResult): string {
  const id = events(result).find((event) => event.type === "thread.started")?.thread_id;
  expect(typeof id).toBe("string");
  return String(id);
}

function itemTypes(result: CommandResult): string[] {
  return events(result)
    .filter((event) => event.type === "item.completed")
    .map((event) => String(asRecord(event.item).type ?? ""));
}
