import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  autoModelSelection,
  getClaudeSupportedModels,
  resolveClaudeModel,
  type ClaudeModelSelection,
} from "./claude/defaults.js";
import { clearAppRegistration, writeAppRegistration } from "./daemon/app-registration.js";
import {
  daemonFetch,
  daemonSessionUrl,
  ensureDaemon,
  localProxyAuthToken,
  registerDaemonSession,
} from "./daemon/launch.js";
import type { RegisterSessionRequest } from "./daemon/state.js";
import { initModelCatalog } from "./model-catalog-init.js";
import { resolveNebiusApiKey } from "./nebius-core.js";

const execFileAsync = promisify(execFile);

/**
 * `nconnect claude-desktop`: point the Claude desktop app at Nebius models.
 *
 * Claude Desktop has a third-party inference mode. When its "config library"
 * holds an applied configuration with an `inferenceProvider`, the app starts
 * in that mode, with its own profile directory (`Claude-3p`) so the user's
 * Anthropic login, chats and settings in the normal profile are untouched.
 * The `gateway` provider sends Anthropic Messages requests to a base URL with
 * a bearer key - the same wire format Claude Code uses, which the daemon's
 * Claude proxy already translates for Nebius.
 *
 * So turning it on is: register a persistent daemon session, add one entry to
 * the config library pointing at that session's URL, and apply it. Turning it
 * off removes exactly that entry and re-applies whatever was applied before.
 * The app rewrites these files itself, so both directions edit keys in place
 * rather than restoring file copies.
 *
 * Verified against Claude Desktop 1.7196.0 (macOS).
 *
 * Model names: the app rejects gateway models whose names do not look like
 * Anthropic models, and names such as "kimi", "glm" and "qwen" are refused
 * outright. `unstableDisableModelVerification` is the app's own setting for
 * turning that check off, and nothing shows in the model picker without it.
 * It is an unstable setting: a later release may remove it.
 */

export const CLAUDE_DESKTOP_AGENT = "claude-desktop";
const PROFILE_DIR = "Claude-3p";
const DESKTOP_CONFIG = "claude_desktop_config.json";
const LIBRARY_DIR = "configLibrary";
const LIBRARY_META = "_meta.json";
const ENTRY_NAME = "NConnect";
const STATE_FILE = "state.json";

type Json = Record<string, unknown>;

type LibraryEntry = { id: string; name: string; provider?: string; note?: string };
type LibraryMeta = { appliedId: string; entries: LibraryEntry[] } & Json;

/** What `off` needs to put back. Written by `on`, removed by `off`. */
export type ClaudeDesktopState = {
  entryId: string;
  /** The config that was applied before NConnect's, if any. */
  previousAppliedId?: string;
  /** `deploymentMode` in the profile's desktop config before NConnect set it. */
  previousDeploymentMode?: string;
  appliedAt: string;
};

export type GatewayModel = { name: string; labelOverride: string };

/** Claude Desktop's third-party profile directory, or undefined where unsupported. */
export function claudeDesktopProfileDir(
  home: string,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (platform === "darwin") {
    return path.join(home, "Library", "Application Support", PROFILE_DIR);
  }
  if (platform === "linux") {
    return path.join(env.XDG_CONFIG_HOME?.trim() || path.join(home, ".config"), PROFILE_DIR);
  }
  return undefined;
}

/**
 * The daemon route token for the desktop app. Stable, so the config written
 * once keeps working across daemon restarts, and distinct from the ChatGPT
 * Desktop route, which uses the local auth token itself.
 */
export function claudeDesktopSessionToken(authToken: string): string {
  return `claude-desktop-${createHash("sha256").update(authToken).digest("hex").slice(0, 32)}`;
}

/** The model picker: the selected model first (the app's default), then Auto, then the rest. */
export function gatewayModels(selected: ClaudeModelSelection): GatewayModel[] {
  const ordered = [selected, autoModelSelection(), ...getClaudeSupportedModels()];
  const seen = new Set<string>();
  const models: GatewayModel[] = [];
  for (const model of ordered) {
    if (seen.has(model.alias)) {
      continue;
    }
    seen.add(model.alias);
    // Catalog names carry picker notes ("GLM 5.3 Flash · default"); the app's
    // own picker marks the default, so show the plain name.
    const label = model.definition.name.split(" · ")[0];
    models.push({ name: model.alias, labelOverride: `Nebius ${label}` });
  }
  return models;
}

export function buildGatewayConfig(options: {
  baseUrl: string;
  authToken: string;
  models: GatewayModel[];
}): Json {
  return {
    inferenceProvider: "gateway",
    inferenceGatewayBaseUrl: options.baseUrl,
    inferenceGatewayApiKey: options.authToken,
    inferenceGatewayAuthScheme: "bearer",
    inferenceModels: options.models,
    unstableDisableModelVerification: true,
  };
}

async function readJson<T extends Json>(file: string): Promise<T | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(file, "utf8"));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as T)
      : undefined;
  } catch {
    return undefined;
  }
}

/** 0600 and atomic: the gateway config carries the local proxy token. */
async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp-${process.pid}`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(tmp, file);
}

function libraryEntries(meta: LibraryMeta | undefined): LibraryEntry[] {
  return Array.isArray(meta?.entries)
    ? meta.entries.filter(
        (entry): entry is LibraryEntry =>
          typeof entry === "object" && entry !== null && typeof entry.id === "string",
      )
    : [];
}

/**
 * Add NConnect's gateway config to the profile's config library and apply it.
 * Other entries are kept. Running it again updates the same entry and keeps
 * the original record of what to restore.
 */
export async function applyClaudeDesktopConfig(options: {
  profileDir: string;
  stateFile: string;
  config: Json;
  now?: Date;
}): Promise<ClaudeDesktopState> {
  const { profileDir, stateFile } = options;
  const metaFile = path.join(profileDir, LIBRARY_DIR, LIBRARY_META);
  const desktopFile = path.join(profileDir, DESKTOP_CONFIG);
  const meta = await readJson<LibraryMeta>(metaFile);
  const desktop = (await readJson<Json>(desktopFile)) ?? {};
  const existing = await readJson<ClaudeDesktopState>(stateFile);

  const entryId = existing?.entryId ?? randomUUID();
  const appliedBefore = typeof meta?.appliedId === "string" ? meta.appliedId : "";
  const state: ClaudeDesktopState = existing ?? {
    entryId,
    ...(appliedBefore && appliedBefore !== entryId ? { previousAppliedId: appliedBefore } : {}),
    ...(typeof desktop.deploymentMode === "string"
      ? { previousDeploymentMode: desktop.deploymentMode }
      : {}),
    appliedAt: (options.now ?? new Date()).toISOString(),
  };

  // The record of what to undo goes first: a crash after this point still
  // leaves `off` able to find and remove whatever was written.
  await writeJson(stateFile, state);
  await writeJson(path.join(profileDir, LIBRARY_DIR, `${entryId}.json`), options.config);
  const entries = libraryEntries(meta).filter((entry) => entry.id !== entryId);
  entries.push({
    id: entryId,
    name: ENTRY_NAME,
    provider: "gateway",
    note: String(options.config.inferenceGatewayBaseUrl ?? ""),
  });
  await writeJson(metaFile, { ...meta, appliedId: entryId, entries });
  // Without this the app honours a remembered "1p" choice and ignores the config.
  await writeJson(desktopFile, { ...desktop, deploymentMode: "3p" });
  return state;
}

/**
 * Remove NConnect's entry and re-apply what was applied before. Returns false
 * when there is nothing of NConnect's to remove. Entries the user added in
 * the meantime are kept, and their own choice of applied config is respected.
 */
export async function removeClaudeDesktopConfig(options: {
  profileDir: string;
  stateFile: string;
}): Promise<boolean> {
  const { profileDir, stateFile } = options;
  const state = await readJson<ClaudeDesktopState>(stateFile);
  if (!state?.entryId) {
    return false;
  }
  const metaFile = path.join(profileDir, LIBRARY_DIR, LIBRARY_META);
  const desktopFile = path.join(profileDir, DESKTOP_CONFIG);

  const meta = await readJson<LibraryMeta>(metaFile);
  if (meta) {
    const entries = libraryEntries(meta).filter((entry) => entry.id !== state.entryId);
    const previous = state.previousAppliedId;
    const appliedId =
      meta.appliedId !== state.entryId
        ? meta.appliedId
        : previous && entries.some((entry) => entry.id === previous)
          ? previous
          : "";
    if (entries.length === 0) {
      await rm(metaFile, { force: true });
    } else {
      await writeJson(metaFile, { ...meta, appliedId, entries });
    }
  }
  await rm(path.join(profileDir, LIBRARY_DIR, `${state.entryId}.json`), { force: true });

  const desktop = await readJson<Json>(desktopFile);
  if (desktop && desktop.deploymentMode === "3p") {
    const { deploymentMode: _ours, ...rest } = desktop;
    await writeJson(
      desktopFile,
      state.previousDeploymentMode
        ? { ...rest, deploymentMode: state.previousDeploymentMode }
        : rest,
    );
  }
  await rm(stateFile, { force: true });
  return true;
}

function nconnectHomeDir(home: string): string {
  return process.env.NCONNECT_HOME || path.join(home, ".nconnect");
}

function stateFilePath(home: string): string {
  return path.join(nconnectHomeDir(home), CLAUDE_DESKTOP_AGENT, STATE_FILE);
}

async function isClaudeDesktopRunning(): Promise<boolean> {
  try {
    const pattern =
      process.platform === "darwin" ? "Claude.app/Contents/MacOS/Claude" : "claude-desktop";
    const { stdout } = await execFileAsync("pgrep", ["-f", pattern]);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

async function openClaudeDesktop(): Promise<boolean> {
  if (process.platform !== "darwin") {
    return false;
  }
  try {
    await execFileAsync("open", ["-a", "Claude"]);
    return true;
  } catch {
    return false;
  }
}

/** The app reads its mode at startup, and quitting it is the user's call. */
async function relaunchHint(open: boolean): Promise<string> {
  if (await isClaudeDesktopRunning()) {
    return "Claude Desktop is running: quit and reopen it for this to take effect.";
  }
  if (open && (await openClaudeDesktop())) {
    return "Opened Claude Desktop.";
  }
  return "Open Claude Desktop to use it.";
}

function unsupportedPlatform(): Error {
  return new Error("nconnect claude-desktop supports macOS and Linux.");
}

export async function turnOnClaudeDesktop(options: {
  home?: string;
  apiKey?: string | undefined;
  model?: string | undefined;
  open?: boolean;
}): Promise<string> {
  const home = options.home ?? os.homedir();
  const profileDir = claudeDesktopProfileDir(home);
  if (!profileDir) {
    throw unsupportedPlatform();
  }
  const apiKey = await resolveNebiusApiKey({ apiKey: options.apiKey, home });
  if (!apiKey) {
    throw new Error(
      "No Nebius API key found. Pass --api-key, run `nconnect configure`, or set NEBIUS_API_KEY.",
    );
  }
  await initModelCatalog({ apiKey, home });
  const selected = resolveClaudeModel(options.model);

  const authToken = await localProxyAuthToken();
  const sessionToken = claudeDesktopSessionToken(authToken);
  const { url: proxyUrl } = await ensureDaemon();
  const registration: RegisterSessionRequest = {
    token: sessionToken,
    authToken,
    agent: CLAUDE_DESKTOP_AGENT,
    apiKey,
    modelLabel: `${selected.definition.name} (Claude Desktop)`,
    modelId: selected.alias,
    targetModelId: selected.definition.id,
    modelName: selected.definition.name,
    modelDefinition: selected.definition,
    ...(process.env.NCONNECT_DEBUG === "1" ? { debug: true } : {}),
  };
  await registerDaemonSession(proxyUrl, registration);
  // This command exits, so nothing stays alive to re-register the session.
  // The daemon rebuilds it from this file after a restart or an idle reap.
  await writeAppRegistration(registration, nconnectHomeDir(home), CLAUDE_DESKTOP_AGENT);

  await applyClaudeDesktopConfig({
    profileDir,
    stateFile: stateFilePath(home),
    config: buildGatewayConfig({
      baseUrl: daemonSessionUrl(proxyUrl, sessionToken),
      authToken,
      models: gatewayModels(selected),
    }),
  });

  return [
    "Claude Desktop now uses Nebius Token Factory through NConnect. (beta)",
    `Default model: ${selected.definition.name.split(" · ")[0]}. The model picker lists the rest.`,
    "It runs in Claude Desktop's separate third-party profile, so your Anthropic",
    "login, chats and settings are untouched and return when you switch back.",
    "Switch back with: nconnect claude-desktop off",
    "The NConnect daemon must be running while you use the app; `nconnect daemon",
    "install` starts it at login.",
    await relaunchHint(options.open ?? true),
  ].join("\n");
}

export async function turnOffClaudeDesktop(options: { home?: string } = {}): Promise<string> {
  const home = options.home ?? os.homedir();
  const profileDir = claudeDesktopProfileDir(home);
  if (!profileDir) {
    throw unsupportedPlatform();
  }
  const removed = await removeClaudeDesktopConfig({ profileDir, stateFile: stateFilePath(home) });
  // Stop the daemon resurrecting the route once the app no longer points at it.
  await clearAppRegistration(nconnectHomeDir(home), CLAUDE_DESKTOP_AGENT);
  if (!removed) {
    return "Claude Desktop is not routed through NConnect - nothing to turn off.";
  }
  try {
    const { url } = await ensureDaemon();
    const token = claudeDesktopSessionToken(await localProxyAuthToken());
    await daemonFetch(`${url}/internal/sessions/${encodeURIComponent(token)}`, {
      method: "DELETE",
    });
  } catch {
    // Switching back must succeed even if the daemon is unreachable.
  }
  return ["Claude Desktop is back on its own configuration.", await relaunchHint(false)].join("\n");
}

export async function claudeDesktopStatus(options: { home?: string } = {}): Promise<string> {
  const home = options.home ?? os.homedir();
  const state = await readJson<ClaudeDesktopState>(stateFilePath(home));
  return state?.entryId
    ? `Claude Desktop is routed through NConnect (since ${state.appliedAt}).\nSwitch back with: nconnect claude-desktop off`
    : "Claude Desktop is not routed through NConnect.\nTurn it on with: nconnect claude-desktop";
}
