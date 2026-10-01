import path from "node:path";
import { nconnectHome } from "./paths.js";
import { readJsonIfExists, writeJsonAtomic } from "./nebius-core.js";

/**
 * Per-harness "last model" persistence.
 *
 * The relay pins a model on every launch, so a `/model` change inside a session
 * would otherwise be forgotten on the next start. The daemon records the model
 * each proxied request actually targets (see the codex/claude proxies, which
 * filter out fixed-role calls: Codex memory turns and Claude's Haiku-tier
 * subagents). On the next launch the harness reads that back and uses it as the
 * default when no explicit --model is given. Best-effort: a preference read or
 * write never breaks a request or a launch.
 */

type PreferencesFile = {
  models?: Record<string, string>;
};

// nconnectHome() is the one home both the daemon and the launcher resolve
// (via NCONNECT_HOME or ~/.nconnect), so the daemon's writes and the
// launcher's reads always hit the same file.
function preferencesPath(): string {
  return path.join(nconnectHome(), "preferences.json");
}

// Debounce disk writes: the daemon only writes when the model actually changes.
const lastRecorded = new Map<string, string>();

/** Record the model an agent is currently using. No-op if unchanged. */
export async function recordAgentModel(agent: string, modelId: string): Promise<void> {
  if (!modelId || lastRecorded.get(agent) === modelId) {
    return;
  }
  lastRecorded.set(agent, modelId);
  try {
    const file = preferencesPath();
    const current = (await readJsonIfExists<PreferencesFile>(file)) ?? {};
    if (current.models?.[agent] === modelId) {
      return;
    }
    await writeJsonAtomic(file, {
      ...current,
      models: { ...(current.models ?? {}), [agent]: modelId },
    });
  } catch {
    // best-effort; a preference write must never break a proxied request
  }
}

/** Read an agent's last-used model, or undefined if none/unreadable. */
export async function readAgentModelPreference(agent: string): Promise<string | undefined> {
  try {
    const current = await readJsonIfExists<PreferencesFile>(preferencesPath());
    const model = current?.models?.[agent];
    return typeof model === "string" && model.length > 0 ? model : undefined;
  } catch {
    return undefined;
  }
}
