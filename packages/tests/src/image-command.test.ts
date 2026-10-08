import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, test, vi } from "vitest";
import { GLM_5_2, KIMI_K2_6, getDefaultModel } from "../../models/src/index.js";
import {
  DEFAULT_IMAGE_PROMPT,
  describeImageFile,
  formatImageReceipt,
  imageUrlFor,
  parseImageArgs,
  pickImageModel,
  unsupportedImageVerb,
} from "../../cli/src/lib/image-command.js";

const dir = mkdtempSync(path.join(tmpdir(), "nconnect-image-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const file = (name: string, bytes: Buffer | string) => {
  const target = path.join(dir, name);
  writeFileSync(target, bytes);
  return target;
};

describe("nconnect image arguments", () => {
  test("words after the image are the question", () => {
    expect(parseImageArgs(["describe", "shot.png", "what", "is", "the", "error?"])).toMatchObject({
      verb: "describe",
      source: "shot.png",
      prompt: "what is the error?",
      json: false,
    });
    // A harness name inside the question is just a word.
    expect(parseImageArgs(["describe", "a.png", "is this claude or codex?"]).prompt).toBe(
      "is this claude or codex?",
    );
  });

  test("flags work in any position, and --prompt wins over trailing words", () => {
    const args = parseImageArgs(["--json", "describe", "-m", "x/y", "a.png", "--prompt", "why?"]);
    expect(args).toMatchObject({ source: "a.png", prompt: "why?", model: "x/y", json: true });
    expect(parseImageArgs(["describe", "a.png", "--model=x/y", "--prompt=hi"])).toMatchObject({
      model: "x/y",
      prompt: "hi",
    });
  });

  test("defaults the question and rejects bad flags", () => {
    expect(parseImageArgs(["describe", "a.png"]).prompt).toBe(DEFAULT_IMAGE_PROMPT);
    expect(() => parseImageArgs(["describe", "a.png", "--prompt"])).toThrow(/expects a value/);
    expect(() => parseImageArgs(["describe", "a.png", "--quality", "best"])).toThrow(
      /Unknown flag --quality/,
    );
  });

  test("says plainly that generating images is not available", () => {
    expect(unsupportedImageVerb("describe")).toBeUndefined();
    expect(unsupportedImageVerb("generate")).toMatch(/no image-generation models/);
    expect(unsupportedImageVerb("edit")).toMatch(/no image-generation models/);
    expect(unsupportedImageVerb("resize")).toMatch(/Unknown image command "resize"/);
    expect(unsupportedImageVerb(undefined)).toMatch(/^Usage:/);
  });
});

describe("reading the image", () => {
  test("a file becomes a data URL typed by its content, not its name", async () => {
    expect(await imageUrlFor(file("a.png", PNG))).toBe(
      `data:image/png;base64,${PNG.toString("base64")}`,
    );
    // A PNG saved with the wrong extension is still sent as a PNG.
    expect(await imageUrlFor(file("wrong.jpg", PNG))).toMatch(/^data:image\/png;base64,/);
  });

  test("a web URL is passed through", async () => {
    expect(await imageUrlFor("https://example.com/a.png")).toBe("https://example.com/a.png");
  });

  test("rejects what is not an image", async () => {
    await expect(imageUrlFor(path.join(dir, "missing.png"))).rejects.toThrow(/No image at/);
    await expect(imageUrlFor(file("notes.txt", "hello"))).rejects.toThrow(/not a PNG, JPEG/);
    await expect(imageUrlFor(file("empty.png", ""))).rejects.toThrow(/is empty/);
    await expect(imageUrlFor(dir)).rejects.toThrow(/not a file/);
  });
});

describe("choosing the model", () => {
  test("defaults to the default model, which can see", () => {
    expect(pickImageModel().id).toBe(getDefaultModel().id);
    expect(pickImageModel().attachment).toBe(true);
  });

  test("accepts a vision model by id or alias and refuses the rest", () => {
    expect(pickImageModel(KIMI_K2_6.id).id).toBe(KIMI_K2_6.id);
    expect(pickImageModel(KIMI_K2_6.anthropicAlias ?? "").id).toBe(KIMI_K2_6.id);
    expect(() => pickImageModel(GLM_5_2.id)).toThrow(/does not accept images. Models that do: /);
    expect(() => pickImageModel("nope/none")).toThrow(/Unknown model "nope\/none"/);
  });
});

describe("asking Nebius", () => {
  const ok = (content: string | null, finish = "stop") =>
    new Response(
      JSON.stringify({
        choices: [{ finish_reason: finish, message: { content } }],
        usage: { prompt_tokens: 1000, completion_tokens: 200 },
      }),
      { status: 200 },
    );
  const ask = (fetchImpl: typeof fetch) =>
    describeImageFile({
      source: file("ask.png", PNG),
      prompt: "what is this?",
      model: getDefaultModel(),
      apiKey: "test-key",
      baseUrl: "https://nebius.test/v1/",
      fetchImpl,
    });

  test("sends the question and the image, and prices the answer", async () => {
    const fetchImpl = vi.fn(async () => ok("  A red circle.  "));
    const result = await ask(fetchImpl as unknown as typeof fetch);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://nebius.test/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe(getDefaultModel().id);
    expect(body.messages[0].content).toEqual([
      { type: "text", text: "what is this?" },
      { type: "image_url", image_url: { url: `data:image/png;base64,${PNG.toString("base64")}` } },
    ]);

    const model = getDefaultModel();
    expect(result.text).toBe("A red circle.");
    expect(result.usage).toEqual({ inputTokens: 1000, outputTokens: 200 });
    expect(result.costUsd).toBeCloseTo((1000 * model.cost.input + 200 * model.cost.output) / 1e6);
    expect(formatImageReceipt(result)).toBe(
      `${model.id} · 1000 in / 200 out tokens · $${result.costUsd.toFixed(4)}`,
    );
    expect(formatImageReceipt({ ...result, costUsd: 0.00003 })).toContain("· under $0.0001");
    expect(formatImageReceipt({ ...result, costUsd: 1.239 })).toContain("· $1.24");
  });

  test("an upstream error or an empty answer is an error, not blank output", async () => {
    await expect(
      ask((async () => new Response("model overloaded", { status: 503 })) as typeof fetch),
    ).rejects.toThrow(/Nebius returned 503 .*model overloaded/);
    await expect(ask((async () => ok(null, "length")) as typeof fetch)).rejects.toThrow(
      /returned no text \(finish reason: length\)/,
    );
    await expect(
      ask((async () => new Response("<html>", { status: 200 })) as typeof fetch),
    ).rejects.toThrow(/non-JSON/);
  });
});

describe("image spend in the usage report", () => {
  test("a describe call is recorded and shows under its own tool and model", () => {
    const home = mkdtempSync(path.join(tmpdir(), "nconnect-image-usage-"));
    try {
      const output = execFileSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `
            import { recordImageUsage } from "./packages/cli/dist/lib/image-command.js";
            import { buildUsageReport, formatUsageReport } from "./packages/cli/dist/lib/usage-report.js";
            import { createSessionStore } from "./packages/cli/dist/lib/daemon/storage.js";
            import { getDefaultModel } from "./packages/models/dist/index.js";
            const probe = await createSessionStore();
            if (probe.kind !== "sqlite") throw new Error("sqlite unavailable");
            probe.close();
            const model = getDefaultModel();
            const result = { model: model.id, text: "a red circle", usage: { inputTokens: 1000, outputTokens: 200 }, costUsd: 0.0025 };
            await recordImageUsage(result, model);
            await recordImageUsage(result, model);
            const summary = await buildUsageReport(60_000);
            const store = await createSessionStore();
            const active = store.restoreActiveSessions().length;
            store.close();
            console.log(JSON.stringify({ summary, active, text: formatUsageReport(summary, "1m") }));
          `,
        ],
        {
          cwd: path.join(import.meta.dirname, "../../.."),
          encoding: "utf8",
          env: { ...process.env, NCONNECT_HOME: home },
        },
      );
      const { summary, active, text } = JSON.parse(output.trim().split("\n").at(-1) ?? "{}");
      expect(summary.sessions).toBe(2);
      expect(summary.costUsd).toBeCloseTo(0.005);
      expect(summary.promptTokens).toBe(2000);
      expect(summary.byHarness).toEqual([expect.objectContaining({ agent: "image", sessions: 2 })]);
      expect(summary.byModel).toEqual([
        expect.objectContaining({ model: getDefaultModel().name, sessions: 2 }),
      ]);
      // Written already ended: the daemon must not pick it up as a live session.
      expect(active).toBe(0);
      expect(summary.activeSessions).toBe(0);
      expect(text).toMatch(/image\s+\$0\.0050\s+2 session/);
      // The Nebius key is not part of the record.
      expect(output).not.toContain("apiKey");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
