import { HARNESS, HARNESS_LABEL, type HarnessId } from "../harness.js";

/**
 * `off` / `restore`: turn off the relay-managed Codex configuration.
 *
 * `nconnect chatgpt` persistently rewrites `~/.codex/config.toml` so ChatGPT
 * Desktop routes through the local daemon. The Codex CLI reads that same file,
 * so a plain `codex` keeps routing through us afterwards - with no obvious way
 * back. `--restore` did exist, but you had to know it, and the natural guesses
 * silently did the wrong thing: `nconnect codex off` handed "off" to Codex
 * as a prompt, because everything after a harness name is passthrough.
 *
 * The managed config is shared by ChatGPT Desktop and the Codex CLI, so
 * disabling from either command fixes both.
 */

/** Harnesses that write a persistent config we can later restore. */
const MANAGED_CONFIG_HARNESSES = new Set<string>([HARNESS.CODEX, "codex-app", "chatgpt"]);

const DISABLE_VERBS = new Set(["off", "restore"]);

export function isDisableVerb(value: string | undefined): boolean {
  return value !== undefined && DISABLE_VERBS.has(value.toLowerCase());
}

export type DisableRequest =
  | { kind: "restore" }
  | { kind: "error"; message: string }
  | { kind: "none" };

/**
 * Decide whether this invocation is a disable request.
 *
 * `verbCandidates` covers both shapes the parser produces: `chatgpt off` leaves
 * "off" in positional (chatgpt is not a harness id), while `codex off` moves it
 * into passthrough (everything after a harness name is passed through).
 */
export function resolveDisableRequest(
  command: string | undefined,
  verbCandidates: ReadonlyArray<string | undefined>,
): DisableRequest {
  // Bare `nconnect off` / `nconnect restore`: the verb is the command.
  if (isDisableVerb(command)) {
    return { kind: "restore" };
  }
  const verb = verbCandidates.find((candidate) => isDisableVerb(candidate));
  if (verb === undefined) {
    return { kind: "none" };
  }
  if (command === undefined) {
    // Bare `nconnect restore` - the managed config is shared, so this is
    // unambiguous even without naming a harness.
    return { kind: "restore" };
  }
  if (MANAGED_CONFIG_HARNESSES.has(command)) {
    return { kind: "restore" };
  }
  // Forwarding the verb to a harness that writes no config would launch it with
  // "off" as a prompt, which is how this used to fail silently.
  const label = HARNESS_LABEL[command as HarnessId] ?? command;
  return {
    kind: "error",
    message:
      `${label} writes no persistent configuration, so there is nothing to turn off.\n` +
      "Only the Codex config (shared by ChatGPT Desktop and the Codex CLI) is managed: " +
      "run `nconnect chatgpt off`.",
  };
}
