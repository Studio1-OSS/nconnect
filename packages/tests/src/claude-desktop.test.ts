import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { GLM_5_2, getDefaultModel } from "../../models/src/index.js";
import {
  applyClaudeDesktopConfig,
  buildGatewayConfig,
  claudeDesktopProfileDir,
  claudeDesktopSessionToken,
  gatewayModels,
  removeClaudeDesktopConfig,
} from "../../cli/src/lib/claude-desktop.js";
import { resolveClaudeModel } from "../../cli/src/lib/claude/defaults.js";
import {
  appRegistrationPath,
  clearAppRegistration,
  readAppRegistration,
  writeAppRegistration,
} from "../../cli/src/lib/daemon/app-registration.js";
import {
  buildSession,
  isProxiedAgent,
  speaksResponsesApi,
} from "../../cli/src/lib/daemon/state.js";

let root: string;
let profileDir: string;
let stateFile: string;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "nconnect-claude-desktop-"));
  profileDir = path.join(root, "Claude-3p");
  stateFile = path.join(root, "nconnect", "claude-desktop", "state.json");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const read = (...parts: string[]) =>
  JSON.parse(readFileSync(path.join(profileDir, ...parts), "utf8")) as Record<string, any>;
const write = (value: unknown, ...parts: string[]) => {
  const file = path.join(profileDir, ...parts);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value));
};
const config = buildGatewayConfig({
  baseUrl: "http://127.0.0.1:7878/session/tok",
  authToken: "local-token",
  models: [{ name: "nebius-glm-5-3-flash", labelOverride: "Nebius GLM 5.3 Flash" }],
});
const apply = () => applyClaudeDesktopConfig({ profileDir, stateFile, config });
const remove = () => removeClaudeDesktopConfig({ profileDir, stateFile });

describe("Claude Desktop gateway config", () => {
  test("points the app's gateway provider at the daemon route", () => {
    expect(config).toEqual({
      inferenceProvider: "gateway",
      inferenceGatewayBaseUrl: "http://127.0.0.1:7878/session/tok",
      inferenceGatewayApiKey: "local-token",
      inferenceGatewayAuthScheme: "bearer",
      inferenceModels: [{ name: "nebius-glm-5-3-flash", labelOverride: "Nebius GLM 5.3 Flash" }],
      // Without this the app refuses every non-Anthropic model name.
      unstableDisableModelVerification: true,
    });
  });

  test("lists the selected model first, then Auto, with no duplicates", () => {
    const models = gatewayModels(resolveClaudeModel(GLM_5_2.id));
    expect(models[0]).toEqual({
      name: GLM_5_2.anthropicAlias,
      labelOverride: `Nebius ${GLM_5_2.name.split(" · ")[0]}`,
    });
    // Picker notes from the catalog ("· default") are not part of the label.
    expect(models.every((model) => !model.labelOverride.includes("·"))).toBe(true);
    expect(models[1]).toEqual({ name: "nebius-auto", labelOverride: "Nebius Auto" });
    const names = models.map((model) => model.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain(getDefaultModel().anthropicAlias);
    // Selecting Auto puts it first, once.
    const auto = gatewayModels(resolveClaudeModel("auto")).map((model) => model.name);
    expect(auto[0]).toBe("nebius-auto");
    expect(auto.filter((name) => name === "nebius-auto")).toHaveLength(1);
  });

  test("finds the third-party profile per platform", () => {
    expect(claudeDesktopProfileDir("/Users/a", "darwin", {})).toBe(
      "/Users/a/Library/Application Support/Claude-3p",
    );
    expect(claudeDesktopProfileDir("/home/a", "linux", {})).toBe("/home/a/.config/Claude-3p");
    expect(claudeDesktopProfileDir("/home/a", "linux", { XDG_CONFIG_HOME: "/x" })).toBe(
      "/x/Claude-3p",
    );
    expect(claudeDesktopProfileDir("C:\\Users\\a", "win32", {})).toBeUndefined();
  });

  test("uses a stable route token that is not the auth token", () => {
    const token = claudeDesktopSessionToken("nconnect-local-secret");
    expect(token).toBe(claudeDesktopSessionToken("nconnect-local-secret"));
    expect(token).toMatch(/^claude-desktop-[0-9a-f]{32}$/);
    expect(token).not.toContain("secret");
    expect(token).not.toBe(claudeDesktopSessionToken("other"));
  });
});

describe("turning Claude Desktop routing on and off", () => {
  test("a fresh profile gets one applied entry, and off leaves no trace", async () => {
    const state = await apply();
    const meta = read("configLibrary", "_meta.json");
    expect(meta.appliedId).toBe(state.entryId);
    expect(meta.entries).toEqual([
      {
        id: state.entryId,
        name: "NConnect",
        provider: "gateway",
        note: "http://127.0.0.1:7878/session/tok",
      },
    ]);
    // The app only reads entries named by a UUID.
    expect(state.entryId).toMatch(/^[a-f0-9-]{36}$/);
    expect(read("configLibrary", `${state.entryId}.json`)).toEqual(config);
    expect(read("claude_desktop_config.json").deploymentMode).toBe("3p");
    // It holds the local proxy token.
    const mode = statSync(path.join(profileDir, "configLibrary", `${state.entryId}.json`)).mode;
    expect(mode & 0o077).toBe(0);

    expect(await remove()).toBe(true);
    expect(readdirSync(path.join(profileDir, "configLibrary"))).toEqual([]);
    expect(read("claude_desktop_config.json")).toEqual({});
    expect(existsSync(stateFile)).toBe(false);
    expect(await remove()).toBe(false);
  });

  test("keeps the user's own configs and settings, and restores what was applied", async () => {
    const mine = "11111111-2222-3333-4444-555555555555";
    write(
      { appliedId: mine, entries: [{ id: mine, name: "Work Bedrock" }] },
      "configLibrary",
      "_meta.json",
    );
    write({ inferenceProvider: "bedrock" }, "configLibrary", `${mine}.json`);
    write(
      { deploymentMode: "1p", mcpServers: { files: { command: "x" } }, enterpriseConfig: [] },
      "claude_desktop_config.json",
    );

    const state = await apply();
    expect(state.previousAppliedId).toBe(mine);
    expect(state.previousDeploymentMode).toBe("1p");
    const meta = read("configLibrary", "_meta.json");
    expect(meta.appliedId).toBe(state.entryId);
    expect(meta.entries.map((entry: { name: string }) => entry.name)).toEqual([
      "Work Bedrock",
      "NConnect",
    ]);
    expect(read("claude_desktop_config.json")).toEqual({
      deploymentMode: "3p",
      mcpServers: { files: { command: "x" } },
      enterpriseConfig: [],
    });

    expect(await remove()).toBe(true);
    expect(read("configLibrary", "_meta.json")).toEqual({
      appliedId: mine,
      entries: [{ id: mine, name: "Work Bedrock" }],
    });
    expect(read("configLibrary", `${mine}.json`)).toEqual({ inferenceProvider: "bedrock" });
    expect(read("claude_desktop_config.json")).toEqual({
      deploymentMode: "1p",
      mcpServers: { files: { command: "x" } },
      enterpriseConfig: [],
    });
  });

  test("running it twice updates the same entry and still restores the original", async () => {
    const mine = "11111111-2222-3333-4444-555555555555";
    write(
      { appliedId: mine, entries: [{ id: mine, name: "Mine" }] },
      "configLibrary",
      "_meta.json",
    );
    const first = await apply();
    const second = await applyClaudeDesktopConfig({
      profileDir,
      stateFile,
      config: { ...config, inferenceGatewayBaseUrl: "http://127.0.0.1:7878/session/new" },
    });
    expect(second.entryId).toBe(first.entryId);
    // Not overwritten with NConnect's own id on the second run.
    expect(second.previousAppliedId).toBe(mine);
    const meta = read("configLibrary", "_meta.json");
    expect(meta.entries).toHaveLength(2);
    expect(read("configLibrary", `${first.entryId}.json`).inferenceGatewayBaseUrl).toBe(
      "http://127.0.0.1:7878/session/new",
    );
    await remove();
    expect(read("configLibrary", "_meta.json").appliedId).toBe(mine);
  });

  test("off respects changes the user made in the app afterwards", async () => {
    const state = await apply();
    // The user added a config in the app and applied it, and chose Anthropic sign-in.
    const theirs = "99999999-2222-3333-4444-555555555555";
    const meta = read("configLibrary", "_meta.json");
    write(
      { appliedId: theirs, entries: [...meta.entries, { id: theirs, name: "Theirs" }] },
      "configLibrary",
      "_meta.json",
    );
    write({ deploymentMode: "1p" }, "claude_desktop_config.json");

    expect(await remove()).toBe(true);
    expect(read("configLibrary", "_meta.json")).toEqual({
      appliedId: theirs,
      entries: [{ id: theirs, name: "Theirs" }],
    });
    expect(read("claude_desktop_config.json")).toEqual({ deploymentMode: "1p" });
    expect(existsSync(path.join(profileDir, "configLibrary", `${state.entryId}.json`))).toBe(false);
  });
});

describe("the daemon side", () => {
  const registration = {
    token: claudeDesktopSessionToken("auth"),
    authToken: "auth",
    agent: "claude-desktop" as const,
    apiKey: "nebius-key",
    modelLabel: "GLM 5.2 (Claude Desktop)",
    modelId: GLM_5_2.anthropicAlias ?? GLM_5_2.id,
    targetModelId: GLM_5_2.id,
    modelName: GLM_5_2.name,
    modelDefinition: GLM_5_2,
  };

  test("serves Claude Desktop through the Anthropic proxy, remembering its model separately", () => {
    expect(isProxiedAgent("claude-desktop")).toBe(true);
    expect(speaksResponsesApi("claude-desktop")).toBe(false);
    const session = buildSession(registration);
    expect(session.agent).toBe("claude-desktop");
    expect(session.options?.authToken).toBe("auth");
    // A model picked in the desktop app must not change the CLI's remembered model.
    expect((session.options as { agent?: string }).agent).toBe("claude-desktop");
  });

  test("keeps its registration apart from ChatGPT Desktop's", async () => {
    const home = path.join(root, "home");
    await writeAppRegistration(registration, home, "claude-desktop");
    expect(appRegistrationPath(home, "claude-desktop")).toBe(
      path.join(home, "claude-desktop", "registration.json"),
    );
    expect((await readAppRegistration(home, "claude-desktop"))?.token).toBe(registration.token);
    expect(await readAppRegistration(home)).toBeUndefined();
    expect(appRegistrationPath(home)).toBe(path.join(home, "codex-app", "registration.json"));
    await clearAppRegistration(home, "claude-desktop");
    expect(await readAppRegistration(home, "claude-desktop")).toBeUndefined();
  });
});
