import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { assert, assertCommandExists } from "../assert.js";
import { runCommand } from "../command.js";
import type { Scenario } from "../types.js";

/**
 * unreal-agent-runner writes one JSON record per line to stdout:
 * `{ Sequence, RecordedAt, Kind, Data }`. The final assistant text lives on a
 * `model_response` record under `Data.Response.Output[].Data.Text`.
 */
type RunnerRecord = {
  Kind?: string;
  Data?: { Response?: { Output?: Array<{ Type?: string; Data?: { Text?: string } }> } };
};

function runnerRecords(stdout: string): RunnerRecord[] {
  const records: RunnerRecord[] = [];
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line) as RunnerRecord);
    } catch {
      // Non-JSON stdout lines are not runner records.
    }
  }
  return records;
}

function assistantText(records: RunnerRecord[]): string[] {
  const texts: string[] = [];
  for (const record of records) {
    if (record.Kind !== "model_response") continue;
    for (const item of record.Data?.Response?.Output ?? []) {
      if (item.Type === "message" && item.Data?.Text) texts.push(item.Data.Text);
    }
  }
  return texts;
}

/** The runner refuses to start unless its workspace directory already exists. */
async function runnerArgs(
  context: { tmpDir: string },
  name: string,
  prompt: string,
): Promise<string[]> {
  const dir = path.join(context.tmpDir, `unreal-${name}`);
  await mkdir(dir, { recursive: true });
  return [
    "unreal",
    "--",
    "-workspace",
    dir,
    "-session-directory",
    path.join(dir, "sessions"),
    "-log-directory",
    path.join(dir, "logs"),
    "-p",
    prompt,
  ];
}

export function unrealScenarios(): Scenario[] {
  return [
    {
      name: "unreal: basic headless response",
      run: async (context) => {
        assertCommandExists("unreal-agent-runner");
        const result = await runCommand(context, "unreal-basic", process.execPath, [
          context.cliBin,
          ...(await runnerArgs(context, "basic", "Reply with exactly: hi")),
        ]);
        assert(result.status === 0, `exit ${result.status}`);
        const records = runnerRecords(result.stdout);
        assert(
          records.some((record) => record.Kind === "model_response"),
          "missing model_response record",
        );
        assert(
          assistantText(records).some((text) => /\bhi\b/i.test(text)),
          "missing expected agent text",
        );
      },
    },
    {
      name: "unreal: bash tool call",
      run: async (context) => {
        assertCommandExists("unreal-agent-runner");
        const token = `UNREAL_TOOL_${Date.now().toString(36)}`;
        const probePath = path.join(context.tmpDir, "unreal-tool-probe.txt");
        await writeFile(probePath, `${token}\n`, "utf8");
        const result = await runCommand(
          context,
          "unreal-tool",
          process.execPath,
          [
            context.cliBin,
            ...(await runnerArgs(
              context,
              "tool",
              `Use bash to read this exact file path: ${probePath}. Answer with exactly the file contents and nothing else.`,
            )),
          ],
          { timeoutMs: 180_000 },
        );
        assert(result.status === 0, `exit ${result.status}`);
        assert(
          assistantText(runnerRecords(result.stdout)).some((text) => text.includes(token)),
          "agent did not echo the probe token read via bash",
        );
      },
    },
  ];
}
