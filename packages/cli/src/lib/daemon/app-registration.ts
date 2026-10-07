import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { RegisterSessionRequest } from "./state.js";
import { nconnectHome } from "../paths.js";

const REGISTRATION_FILE = "registration.json";

/**
 * Persisted daemon registration for the desktop-app integrations (ChatGPT
 * Desktop as `codex-app`, Claude Desktop as `claude-desktop`).
 *
 * `nconnect codex-app` configures the Codex desktop app once and exits, so
 * unlike the CLI launchers there is no long-lived process to re-register the
 * session when the daemon loses it (restart, idle reap, kill -9). The Codex
 * app keeps sending its stable token and gets 401s until the user re-runs
 * `nconnect codex-app`. Persisting the full register body lets the daemon
 * rebuild the session on demand instead.
 */
/** Desktop integrations that keep a persisted registration, one file each. */
export const APP_REGISTRATION_AGENTS = ["codex-app", "claude-desktop"] as const;
export type AppRegistrationAgent = (typeof APP_REGISTRATION_AGENTS)[number];

export function appRegistrationPath(
  home = nconnectHome(),
  app: AppRegistrationAgent = "codex-app",
): string {
  return path.join(home, app, REGISTRATION_FILE);
}

export async function writeAppRegistration(
  registration: RegisterSessionRequest,
  home = nconnectHome(),
  app: AppRegistrationAgent = "codex-app",
): Promise<void> {
  const file = appRegistrationPath(home, app);
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  // 0600: the body carries the real Nebius API key, like daemon.sqlite.
  await writeFile(tmp, `${JSON.stringify(registration, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(tmp, file);
}

export async function clearAppRegistration(
  home = nconnectHome(),
  app: AppRegistrationAgent = "codex-app",
): Promise<void> {
  await rm(appRegistrationPath(home, app), { force: true });
}

/**
 * Read the persisted registration, validating the same fields the daemon's
 * register endpoint requires for a proxied agent so `buildSession` never sees
 * a half-formed body. A missing or malformed file resolves to undefined; the
 * next `nconnect codex-app` run rewrites it.
 */
export async function readAppRegistration(
  home = nconnectHome(),
  app: AppRegistrationAgent = "codex-app",
): Promise<RegisterSessionRequest | undefined> {
  let raw: string;
  try {
    raw = await readFile(appRegistrationPath(home, app), "utf8");
  } catch {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw) as RegisterSessionRequest;
    const valid =
      typeof parsed.token === "string" &&
      parsed.token !== "" &&
      typeof parsed.apiKey === "string" &&
      parsed.apiKey !== "" &&
      typeof parsed.modelLabel === "string" &&
      parsed.modelLabel !== "" &&
      typeof parsed.modelDefinition === "object" &&
      parsed.modelDefinition !== null &&
      typeof parsed.modelId === "string" &&
      parsed.modelId !== "" &&
      typeof parsed.targetModelId === "string" &&
      parsed.targetModelId !== "";
    if (valid) {
      return parsed;
    }
  } catch {
    // Malformed JSON: treat as absent.
  }
  return undefined;
}
