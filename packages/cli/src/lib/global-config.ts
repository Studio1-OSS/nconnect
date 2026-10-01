import os from "node:os";
import path from "node:path";
import {
  readJsonIfExists,
  writeJsonAtomic,
  NEBIUS_API_KEY_ENV_REF,
  TAVILY_API_KEY_ENV_REF,
} from "./nebius-core.js";

export type GlobalConfig = {
  apiKey: string;
  tavilyApiKey: string;
};

export function nconnectHome(home = os.homedir()): string {
  return path.join(home, ".nconnect");
}

function globalConfigPath(home = os.homedir()): string {
  return path.join(nconnectHome(home), "config.json");
}

export async function readGlobalConfig(home = os.homedir()): Promise<GlobalConfig> {
  const config = await readJsonIfExists<Partial<GlobalConfig>>(globalConfigPath(home));
  return {
    apiKey: config.apiKey ?? "",
    tavilyApiKey: config.tavilyApiKey ?? "",
  };
}

export async function writeGlobalConfig(home: string, config: GlobalConfig): Promise<void> {
  await writeJsonAtomic(globalConfigPath(home), config);
}

export async function setGlobalApiKey(home: string, apiKey: string): Promise<void> {
  const config = await readGlobalConfig(home);
  config.apiKey = apiKey;
  await writeGlobalConfig(home, config);
}

export async function setGlobalTavilyApiKey(home: string, tavilyApiKey: string): Promise<void> {
  const config = await readGlobalConfig(home);
  config.tavilyApiKey = tavilyApiKey;
  await writeGlobalConfig(home, config);
}

/**
 * Resolves a stored key value to the literal secret. Stored values are
 * either a literal key or the `{env:NEBIUS_API_KEY}` reference written
 * when the key came from the environment rather than `--api-key`.
 */
export function resolveStoredApiKey(stored: string | undefined): string {
  if (!stored) {
    return "";
  }
  if (stored === NEBIUS_API_KEY_ENV_REF) {
    return process.env.NEBIUS_API_KEY?.trim() ?? "";
  }
  return stored;
}

/**
 * Resolves the stored Tavily key to the literal secret. Supports the same
 * `{env:TAVILY_API_KEY}` reference pattern as the Nebius key, so a key that
 * came from the environment (e.g. the repo .env) isn't persisted as a literal.
 */
export function resolveStoredTavilyApiKey(stored: string | undefined): string {
  if (!stored) {
    return "";
  }
  if (stored === TAVILY_API_KEY_ENV_REF) {
    return process.env.TAVILY_API_KEY?.trim() ?? "";
  }
  return stored;
}
