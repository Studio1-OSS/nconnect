import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { codexModelCatalogJson } from "./catalog.js";
import { extractCodexModelArg } from "./launch-args.js";
import { CODEX_AUTH_ENV, CODEX_PROVIDER_ID, resolveCodexModel } from "./defaults.js";
import { codexArgsIgnoreUserConfig, ensureCodexGenericUserDefaults } from "./user-config.js";
import {} from "../daemon/launch.js";
import { runProxiedSession, type ProxiedSessionResult } from "../proxied-session.js";

export type CodexLaunchOptions = {
  apiKey: string;
  baseUrl: string;
  home: string;
  modelId?: string;
  args?: string[];
};

export type CodexLaunchResult = {
  status: number | null;
  signal: NodeJS.Signals | null;
};

/**
 * `--no-mcp` is a nconnect convenience: Codex connects to every MCP server
 * in `~/.codex/config.toml` at startup (docker containers, remote URLs), which
 * can add many seconds even to a "hi". We can't clear individual `[mcp_servers]`
 * TOML tables reliably via `-c`, so `--no-mcp` maps to Codex's own
 * `--ignore-user-config`, which skips the user config entirely (no MCP). Auth
 * still works (it rides on the CODEX_AUTH_ENV env key, not the config file).
 */
function applyNoMcp(args: string[]): string[] {
  if (!args.includes("--no-mcp")) {
    return args;
  }
  const out: string[] = [];
  let injected = false;
  for (const arg of args) {
    if (arg === "--no-mcp") {
      if (!injected && !args.includes("--ignore-user-config")) {
        out.push("--ignore-user-config");
      }
      injected = true;
      continue;
    }
    out.push(arg);
  }
  return out;
}

export async function runCodexNebius(options: CodexLaunchOptions): Promise<CodexLaunchResult> {
  const invocation = extractCodexModelArg(options.args ?? []);
  const args = applyNoMcp(invocation.args);
  if (!codexArgsIgnoreUserConfig(args)) {
    await ensureCodexGenericUserDefaults(options.home);
  }

  const selectedModel = resolveCodexModel(options.modelId ?? invocation.modelId);
  let catalog: { path: string; cleanup: () => void } | undefined;
  const result: ProxiedSessionResult = await runProxiedSession({
    agent: "codex",
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    modelId: selectedModel.definition.id,
    targetModelId: selectedModel.definition.id,
    modelName: selectedModel.definition.name,
    modelDefinition: selectedModel.definition,
    args,
    binary: "codex",
    keepaliveLabel: "Codex session",
    banner: (modelName) =>
      `NConnect ▸ Routing Codex → Nebius Token Factory (${modelName}). Not OpenAI.\n`,
    beforeSpawn: () => {
      catalog = writeCodexModelCatalog();
      return catalog;
    },
    buildEnv: ({ authToken }) => buildCodexEnv(authToken),
    buildArgs: ({ proxyUrl, authToken, modelId, beforeSpawnResult }) => {
      const configArgs = codexConfigArgs(
        proxyUrl,
        authToken,
        modelId,
        (beforeSpawnResult as { path: string; cleanup: () => void } | undefined)?.path ?? "",
      );
      const separator = args.indexOf("--");
      return separator < 0
        ? [...args, ...configArgs]
        : [...args.slice(0, separator), ...configArgs, ...args.slice(separator)];
    },
    afterDeregister: () => catalog?.cleanup(),
  });
  return result;
}

function buildCodexEnv(authToken: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    [CODEX_AUTH_ENV]: authToken,
  };
}

function codexConfigArgs(
  proxyUrl: string,
  authToken: string,
  modelId: string,
  catalogPath: string,
): string[] {
  void authToken;
  return [
    "-c",
    `model_provider="${CODEX_PROVIDER_ID}"`,
    "-c",
    `model="${modelId}"`,
    "-c",
    `model_catalog_json="${catalogPath}"`,
    "-c",
    `model_providers.${CODEX_PROVIDER_ID}.name="NConnect"`,
    "-c",
    `model_providers.${CODEX_PROVIDER_ID}.base_url="${proxyUrl}/v1"`,
    "-c",
    `model_providers.${CODEX_PROVIDER_ID}.wire_api="responses"`,
    "-c",
    `model_providers.${CODEX_PROVIDER_ID}.env_key="${CODEX_AUTH_ENV}"`,
  ];
}

function writeCodexModelCatalog(): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "nconnect-codex-catalog-"));
  const path = join(dir, "models.json");
  writeFileSync(path, codexModelCatalogJson(), "utf8");
  return {
    path,
    cleanup: () => {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // best-effort
      }
    },
  };
}
