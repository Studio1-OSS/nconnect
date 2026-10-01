import os from "node:os";
import * as clack from "@clack/prompts";
import { ALL_HARNESSES, HARNESS_LABEL, type HarnessId } from "../harness.js";
import { isHarnessImplemented } from "../harness-registry.js";
import { detectInstalledHarnesses } from "../detect.js";
import {
  readGlobalConfig,
  setGlobalApiKey,
  resolveStoredApiKey,
  resolveStoredTavilyApiKey,
  setGlobalTavilyApiKey,
} from "../global-config.js";
import { VERSION } from "../version.js";

export function printHelp() {
  console.log(`nconnect v${VERSION} - Nebius Token Factory for coding CLIs

Usage:
  nconnect configure
  nconnect update            update to the latest release
  nconnect whoami
  nconnect usage [--last 7d] tracked local spend by model and tool
  nconnect daemon install    start the daemon at login (macOS/Linux)
  nconnect daemon uninstall  stop starting the daemon at login
  nconnect daemon status     show auto-start service status
  nconnect daemon stop       stop the running daemon
  nconnect chatgpt [--model <model>]              (alpha)
  nconnect chatgpt off       stop routing Codex/ChatGPT Desktop through the
                                relay and restore your previous config
                                (also: "codex off", or bare "nconnect off")
  nconnect codex [...]       (alias: ncodex)
  nconnect claude [...]      (alias: nclaude)
  nconnect pi [...]          (alias: npi)
  nconnect opencode [...]    (alias: nopencode)
  nconnect prime [...]       (alias: nprime)
  nconnect hermes [...]      (alias: nhermes; "hermes desktop" for the app)
  nconnect deepseek [...]    (alpha, alias: ndeepseek)
  nconnect grok [...]        (alias: ngrok; Grok's UI on Nebius models)
  nconnect unreal [...]      (alias: nunreal; Unreal Agent runner on Nebius models)

Extra args after codex/claude/pi/opencode/prime/unreal are passed through.
ChatGPT App support is alpha. The managed ~/.codex/config.toml is shared with the
Codex CLI, so "chatgpt off" (or "codex off") restores both.

Codex flags:
  --no-mcp   Skip your ~/.codex/config.toml MCP servers for a fast startup
             (maps to codex --ignore-user-config; also skips other codex config).

Your last-used model is remembered per tool: change it with /model (or --model
before the harness) and the next launch reuses it.

Docs: https://nebius-tf-relay.vercel.app/llms.txt
  LLM-readable documentation - if you are an AI agent asked to install, configure,
  or use nconnect (including headless use), read that file first.
`);
}

export async function runConfigure(home = os.homedir()): Promise<boolean> {
  clack.intro("nconnect configure");

  const detected = detectInstalledHarnesses();
  const notImplemented = ALL_HARNESSES.filter((h) => !isHarnessImplemented(h));

  const lines = ALL_HARNESSES.map((h) => {
    const found = detected[h].installed ? "found" : "not found";
    const support = isHarnessImplemented(h) ? " (ephemeral settings)" : " (support coming later)";
    return `  ${HARNESS_LABEL[h]}: ${found}${support}`;
  });
  clack.log.info(`Detected tools:\n${lines.join("\n")}`);

  const existing = resolveStoredApiKey((await readGlobalConfig(home)).apiKey);
  let apiKey = existing || process.env.NEBIUS_API_KEY || "";
  if (!apiKey) {
    const entered = await clack.password({
      message: "Nebius API key (from https://tokenfactory.nebius.com/?modals=create-api-key):",
      validate: (value) => (value?.trim() ? undefined : "An API key is required"),
    });
    if (clack.isCancel(entered)) {
      clack.cancel("Cancelled.");
      return false;
    }
    apiKey = entered.trim();
  }
  await setGlobalApiKey(home, apiKey);

  // Tavily powers the proxy's native web_search emulation for Claude Code and
  // Codex. It's optional - without it, searches return a clear "TAVILY_API_KEY
  // not set" error rather than failing silently - so allow skipping.
  const existingTavily = resolveStoredTavilyApiKey((await readGlobalConfig(home)).tavilyApiKey);
  let tavilyApiKey = existingTavily || process.env.TAVILY_API_KEY || "";
  if (!tavilyApiKey) {
    const enteredTavily = await clack.password({
      message:
        "Tavily API key for web search (from https://app.tavily.com - press Enter to skip; web search will be disabled):",
    });
    if (clack.isCancel(enteredTavily)) {
      clack.cancel("Cancelled.");
      return false;
    }
    tavilyApiKey = enteredTavily.trim();
  }
  // `configure` is the explicit persistent-credential flow. Store the resolved
  // Tavily key just like the Nebius key above so it survives a cold start even
  // when the current shell's TAVILY_API_KEY does not. (This fixes the papercut
  // where a daemon started before configure kept failing web search.)
  await setGlobalTavilyApiKey(home, tavilyApiKey);
  if (tavilyApiKey) {
    clack.log.success("Tavily web search enabled.");
  } else {
    clack.log.info("Tavily key skipped - web search will be unavailable in your agents.");
  }

  const launchable = ALL_HARNESSES.filter(
    (h) => isHarnessImplemented(h) && detected[h as HarnessId].installed,
  );
  if (launchable.length > 0) {
    clack.log.info(
      `Ready to launch: ${launchable
        .map((h) => HARNESS_LABEL[h])
        .join(", ")}. Run \`nconnect <harness>\` to start - nothing is written to disk.`,
    );
  }

  if (notImplemented.length > 0) {
    clack.log.info(
      `${notImplemented.map((h) => HARNESS_LABEL[h]).join(" and ")} support is coming in a later phase (needs a local translation proxy).`,
    );
  }

  clack.outro("Done.");
  return true;
}
