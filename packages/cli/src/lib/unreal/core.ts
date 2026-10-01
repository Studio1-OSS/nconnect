import { resolveCodexModel } from "../codex/defaults.js";
import { extractCodexModelArg } from "../codex/launch-args.js";
import { runProxiedSession, type ProxiedSessionResult } from "../proxied-session.js";
import { renderUnrealLine } from "./render.js";

/**
 * Unreal Agent (Unreal Labs) - a proxied harness, like Codex.
 *
 * `unreal-agent-runner` speaks only the OpenAI Responses API: every provider
 * client it ships (OpenAI, OpenRouter, Fireworks, Ollama, Codex) posts to
 * `<base>/responses` and reads the SSE stream back. Nebius serves chat
 * completions, not Responses, so the runner cannot talk to Token Factory
 * directly. The relay daemon already translates Responses traffic for Codex,
 * and the runner's requests are the same shape Codex sends (streamed,
 * `store: false`, function tools, `prompt_cache_key`), so we register an
 * `unreal` session and point the runner's `openai` provider at that route.
 *
 * The runner is configured entirely through environment variables - there is
 * no config file to write or restore - and the API key it receives is the
 * per-session daemon token, never the Nebius key.
 */

export const UNREAL_BIN = "unreal-agent-runner";

export const UNREAL_ENV = {
  provider: "UNREAL_HARNESS_LLM_PROVIDER",
  baseUrl: "UNREAL_HARNESS_LLM_BASE_URL",
  apiKey: "UNREAL_HARNESS_LLM_API_KEY",
  model: "UNREAL_HARNESS_LLM_MODEL",
} as const;

export type UnrealLaunchOptions = {
  apiKey: string;
  baseUrl: string;
  modelId?: string;
  args?: string[];
};

/**
 * The runner's environment. The `openai` provider is the generic Responses
 * client (Bearer auth, `<base>/responses`), so it is the one to aim at the
 * daemon. The Nebius key is dropped from the child environment: the daemon
 * holds it, and the runner has no use for it.
 */
export function buildUnrealEnv(
  base: NodeJS.ProcessEnv,
  context: { proxyUrl: string; authToken: string; modelId: string },
): NodeJS.ProcessEnv {
  const { NEBIUS_API_KEY: _omit, ...env } = base;
  void _omit;
  return {
    ...env,
    [UNREAL_ENV.provider]: "openai",
    [UNREAL_ENV.baseUrl]: `${context.proxyUrl}/v1`,
    [UNREAL_ENV.apiKey]: context.authToken,
    [UNREAL_ENV.model]: context.modelId,
  };
}

/**
 * With no request on the command line the runner blocks reading a JSON
 * request from stdin, which in a terminal looks like a hang. When that is the
 * situation (nothing to run, interactive stdin) we ask for the task instead
 * and hand it over as `-p`. Piped input and explicit requests are untouched.
 */
export function needsTaskPrompt(args: readonly string[], stdinIsTTY: boolean): boolean {
  return stdinIsTTY && !hasRunnerRequest(args);
}

/** Runner flags that take a value, so the value is not a positional request. */
const RUNNER_VALUE_FLAGS = new Set([
  "-workspace",
  "--workspace",
  "-session-directory",
  "--session-directory",
  "-log-directory",
  "--log-directory",
  "-tool-heartbeat-interval",
  "--tool-heartbeat-interval",
]);

/** True when the args already carry a task: `-p <prompt>` or a positional JSON request. */
export function hasRunnerRequest(args: readonly string[]): boolean {
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (arg === "-p" || arg === "--p") {
      return true;
    }
    if (arg.startsWith("-p=") || arg.startsWith("--p=")) {
      return true;
    }
    if (RUNNER_VALUE_FLAGS.has(arg)) {
      i += 1;
      continue;
    }
    if (arg.startsWith("-")) {
      continue;
    }
    return true; // positional JSON request
  }
  return false;
}

async function askForTask(): Promise<string[]> {
  const clack = await import("@clack/prompts");
  const task = await clack.text({
    message: "What should Unreal Agent do? (next time: nunreal -- -p 'task')",
    placeholder: "Inspect this project and explain how to run its tests.",
    validate: (value) => (value.trim() ? undefined : "Enter a task, or Ctrl-C to quit."),
  });
  if (clack.isCancel(task)) {
    clack.cancel("Cancelled.");
    process.exit(130);
  }
  return ["-p", task];
}

export async function runUnrealNebius(options: UnrealLaunchOptions): Promise<ProxiedSessionResult> {
  // `--model` before the runner's own flags picks the Nebius model; everything
  // else is passed to `unreal-agent-runner` untouched (-p, -workspace, JSON).
  const invocation = extractCodexModelArg(options.args ?? []);
  const selectedModel = resolveCodexModel(options.modelId ?? invocation.modelId);
  if (needsTaskPrompt(invocation.args, Boolean(process.stdin.isTTY))) {
    invocation.args = await askForTask();
  }
  return runProxiedSession({
    agent: "unreal",
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    modelId: selectedModel.definition.id,
    targetModelId: selectedModel.definition.id,
    modelName: selectedModel.definition.name,
    modelDefinition: selectedModel.definition,
    args: invocation.args,
    binary: UNREAL_BIN,
    keepaliveLabel: "Unreal Agent session",
    banner: (modelName) =>
      `NConnect ▸ Routing Unreal Agent → Nebius Token Factory (${modelName}).\n`,
    buildEnv: (context) => buildUnrealEnv(process.env, context),
    buildArgs: ({ args }) => args,
    // Raw JSONL when piped (scripts rely on it); readable text in a terminal.
    ...(process.stdout.isTTY ? { renderStdout: renderUnrealLine } : {}),
  });
}
