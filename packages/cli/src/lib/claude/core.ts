import {
  CLAUDE_HAIKU_MODEL_SELECTION,
  CLAUDE_MODEL_CAPABILITIES,
  getClaudeSupportedModels,
  resolveClaudeModel,
  type ClaudeModelSelection,
} from "./defaults.js";
import {} from "../daemon/launch.js";
import { runProxiedSession, type ProxiedSessionResult } from "../proxied-session.js";

const CONFLICTING_ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "ANTHROPIC_MODEL",
  "ANTHROPIC_DEFAULT_OPUS_MODEL",
  "ANTHROPIC_DEFAULT_OPUS_MODEL_NAME",
  "ANTHROPIC_DEFAULT_OPUS_MODEL_DESCRIPTION",
  "ANTHROPIC_DEFAULT_SONNET_MODEL",
  "ANTHROPIC_DEFAULT_SONNET_MODEL_NAME",
  "ANTHROPIC_DEFAULT_SONNET_MODEL_DESCRIPTION",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL_DESCRIPTION",
  "ANTHROPIC_DEFAULT_FABLE_MODEL",
  "ANTHROPIC_DEFAULT_FABLE_MODEL_NAME",
  "ANTHROPIC_DEFAULT_FABLE_MODEL_DESCRIPTION",
  "ANTHROPIC_CUSTOM_MODEL_OPTION",
  "ANTHROPIC_CUSTOM_MODEL_OPTION_NAME",
  "ANTHROPIC_CUSTOM_MODEL_OPTION_DESCRIPTION",
  "ANTHROPIC_CUSTOM_MODEL_OPTION_SUPPORTED_CAPABILITIES",
] as const;

// Preserve Claude Code's native 32k cumulative-output guard. NConnect
// independently caps ordinary upstream turns at 28k, while compaction keeps
// the full budget requested by Claude Code.
const DEFAULT_CLAUDE_CODE_MAX_OUTPUT_TOKENS = 32_000;

/** At or above this context window, Claude Code needs the `[1m]` client hint. */
const CLAUDE_EXTENDED_CONTEXT_TOKENS = 1_000_000;

export type ClaudeLaunchOptions = {
  apiKey: string;
  baseUrl: string;
  modelId?: string;
  args?: string[];
};

export type ClaudeLaunchResult = {
  status: number | null;
  signal: NodeJS.Signals | null;
};

export function buildClaudeEnv({
  apiKey,
  modelId,
  proxyUrl,
  authToken,
}: ClaudeLaunchOptions & {
  modelId: string;
  modelName: string;
  proxyUrl: string;
  authToken: string;
}): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of CONFLICTING_ENV_KEYS) {
    delete env[key];
  }
  env.ANTHROPIC_BASE_URL = proxyUrl;
  // Use bearer-token mode for local proxy auth. Claude Code treats
  // ANTHROPIC_API_KEY as a user-supplied provider key and prompts about it;
  // ANTHROPIC_AUTH_TOKEN still sends Authorization: Bearer <token> to our
  // local daemon without entering that custom-key flow.
  env.ANTHROPIC_AUTH_TOKEN = authToken;
  env.CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY = "1";
  // Carries the `[1m]` client hint for 1M-context models (see claudeCodeModelId).
  env.ANTHROPIC_MODEL = claudeCodeModelId(resolveClaudeModel(modelId));
  // Claude Code disables tool search automatically when ANTHROPIC_BASE_URL is
  // customized unless the feature is explicitly enabled. nconnect forwards
  // the required tool_reference blocks, so opt in by default. Preserve
  // true/false/auto:N overrides from the user.
  if (!env.ENABLE_TOOL_SEARCH?.trim()) {
    env.ENABLE_TOOL_SEARCH = "true";
  }
  // Use Claude Code's concise system prompt for gateway models. This is a
  // straight input-token saving on every single turn (the verbose prompt is
  // several thousand tokens), which matters because Nebius bills full price for
  // the repeated prefix - it has no prompt caching. Respect an explicit "0".
  if (!env.CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT?.trim()) {
    env.CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT = "1";
  }
  if (env.CLAUDE_CODE_MAX_OUTPUT_TOKENS === undefined) {
    env.CLAUDE_CODE_MAX_OUTPUT_TOKENS = String(DEFAULT_CLAUDE_CODE_MAX_OUTPUT_TOKENS);
  }
  applyClaudeModelMenuEnv(env, modelId);

  // Disable Claude Code's periodic "How is Claude doing this session?" survey.
  // It's an internal TUI prompt (not a request the proxy could intercept), and
  // its rating rides on Anthropic's telemetry channel - which bypasses our proxy
  // entirely, so it can't be captured. Default to off; only respect an explicit
  // user opt-in (e.g. "1" re-enables). Uses the targeted kill switch rather than
  // DISABLE_TELEMETRY so we don't also suppress error reporting / auto-updater.
  if (env.CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY === undefined) {
    env.CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY = "1";
  }

  // Disable the `/feedback` slash command. `/feedback` posts a transcript +
  // report straight to a first-party Anthropic endpoint (api.anthropic.com,
  // landing in their `claude_cli_feedback` table) - it does NOT route through
  // ANTHROPIC_BASE_URL / our proxy, so we can neither capture nor honor it. The
  // binary even tags third-party providers as a reason feedback is unavailable.
  // Disable it so users aren't offered a feedback channel that silently reports
  // to Anthropic instead of to nconnect. The dedicated kill switch (not
  // DISABLE_FEEDBACK_COMMAND's sibling DISABLE_TELEMETRY) leaves bug reports /
  // diagnostics untouched. Default off; respect an explicit "0"/"" opt-in.
  // See TODO.md "Custom `/nconnect-feedback` command" for the replacement.
  if (env.DISABLE_FEEDBACK_COMMAND === undefined) {
    env.DISABLE_FEEDBACK_COMMAND = "1";
  }
  return env;
}

export type ClaudeTier = "OPUS" | "SONNET" | "HAIKU" | "FABLE";

/**
 * Which Nebius model fills each of Claude Code's `/model` tiers. The single
 * source of truth for both the env NConnect launches Claude Code with and
 * `nconnect models`, so the two cannot disagree.
 */
export function claudeTierModels(selectedAlias?: string): Record<ClaudeTier, ClaudeModelSelection> {
  const selected = resolveClaudeModel(selectedAlias);
  const supported = getClaudeSupportedModels();
  const defaultModel = supported[0] ?? selected;
  const secondaryModel = supported.find((model) => model.alias !== defaultModel.alias) ?? selected;

  // Claude Code 2.1.289+ added a fourth tier, Fable. Left unset, its `/model`
  // row shows Anthropic's real "Fable 5.1", and choosing it sends
  // `claude-fable-5-1`, which matches no Nebius model and silently falls back
  // to the session model - so the menu would advertise a model the user is
  // not getting. Fill it with the next distinct Nebius model instead.
  const used = new Set([
    defaultModel.alias,
    secondaryModel.alias,
    CLAUDE_HAIKU_MODEL_SELECTION.alias,
  ]);
  const fableModel = supported.find((model) => !used.has(model.alias)) ?? secondaryModel;
  return {
    OPUS: defaultModel,
    SONNET: secondaryModel,
    HAIKU: CLAUDE_HAIKU_MODEL_SELECTION,
    FABLE: fableModel,
  };
}

function applyClaudeModelMenuEnv(env: NodeJS.ProcessEnv, selectedAlias: string): void {
  const selected = resolveClaudeModel(selectedAlias);
  const tiers = claudeTierModels(selectedAlias);
  for (const tier of ["OPUS", "SONNET", "HAIKU", "FABLE"] as const) {
    setTierModelEnv(env, tier, tiers[tier]);
  }

  // Claude Code currently exposes a single generic custom-model slot in
  // addition to the three tier slots. Point that at the selected backend so a
  // `--main nebius-kimi-k2-7-code` launch also marks Kimi as the custom row.
  env.ANTHROPIC_CUSTOM_MODEL_OPTION = selected.alias;
  env.ANTHROPIC_CUSTOM_MODEL_OPTION_NAME = selected.definition.name;
  env.ANTHROPIC_CUSTOM_MODEL_OPTION_DESCRIPTION = "Local Anthropic-to-Nebius proxy";
  env.ANTHROPIC_CUSTOM_MODEL_OPTION_SUPPORTED_CAPABILITIES = CLAUDE_MODEL_CAPABILITIES;
}

function setTierModelEnv(
  env: NodeJS.ProcessEnv,
  tier: ClaudeTier,
  model: ClaudeModelSelection,
): void {
  const prefix = `ANTHROPIC_DEFAULT_${tier}_MODEL`;
  env[prefix] = claudeCodeModelId(model);
  env[`${prefix}_NAME`] = model.definition.name;
  env[`${prefix}_DESCRIPTION`] =
    `Nebius Token Factory (${model.definition.name}) via nconnect - not Anthropic`;
}

/**
 * Claude Code does not derive its local context budget from gateway model
 * metadata - it recognizes a `[1m]` suffix on the model id as a client hint,
 * then strips that suffix before sending the id to our proxy (so no proxy-side
 * handling is needed). Without it, a 1M-context model like Kimi K3 is still
 * budgeted as ~200K locally and Claude Code compacts far too early.
 */
function claudeCodeModelId(model: ClaudeModelSelection): string {
  return model.definition.limit.context >= CLAUDE_EXTENDED_CONTEXT_TOKENS
    ? `${model.alias}[1m]`
    : model.alias;
}

export async function runClaudeNebius(options: ClaudeLaunchOptions): Promise<ClaudeLaunchResult> {
  const args = options.args ?? [];
  const selectedModel = resolveClaudeModel(options.modelId);
  const result: ProxiedSessionResult = await runProxiedSession({
    agent: "claude",
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    modelId: selectedModel.alias,
    registrationModelId: selectedModel.alias,
    targetModelId: selectedModel.definition.id,
    modelName: selectedModel.definition.name,
    modelDefinition: selectedModel.definition,
    extraRegistration: {
      claudeCodeMaxOutputTokens: claudeCodeMaxOutputTokensFromEnv(
        process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS,
      ),
      claudeCodeMaxOutputTokensUserSet: process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS !== undefined,
    },
    args,
    binary: "claude",
    keepaliveLabel: "Claude session",
    preserveSessionAfterExit: claudeRunsInBackground(args),
    banner: (modelName) =>
      `NConnect ▸ Routing Claude Code → Nebius Token Factory (${modelName}). Not Anthropic.\n`,
    buildEnv: ({ proxyUrl, authToken, modelId, modelName }) =>
      buildClaudeEnv({ ...options, modelId, modelName, proxyUrl, authToken }),
    buildArgs: ({ args: launchArgs, authToken }) => buildClaudeLaunchArgs(launchArgs, authToken),
  });
  return result;
}

/**
 * True when Claude Code will keep running after the foreground process exits -
 * `--bg`/`--background` hand off to a detached worker that keeps calling our
 * proxy, so the daemon session must survive the foreground exit.
 */
export function claudeRunsInBackground(args: string[]): boolean {
  return args.some((arg) => arg === "--bg" || arg === "--background");
}

export function buildClaudeLaunchArgs(args: string[], authToken?: string): string[] {
  return [
    ...claudeArgsWithoutModelOverrides(args),
    ...claudeCacheFriendlyArgs(args),
    ...claudeEffortArgs(args),
    ...claudeExtraSettingsArgs(args, authToken),
  ];
}

// Because nconnect advertises effort capabilities for GLM-5.2, Claude Code
// shows its `/effort` selector and defaults it to "medium" - so even "hi" makes
// GLM-5.2 reason before replying, which is what users see as slow ("Baked for
// 17s"). Claude Code's `--effort` has no "none"/"minimal" value (only
// low|medium|high|xhigh|max), so we default the session to the lowest ("low"),
// keeping the selector functional for users who want to dial reasoning up.
// Respect an explicit --effort, and honor NCONNECT_REASONING_EFFORT when it
// names a value --effort accepts.
function claudeEffortArgs(args: string[]): string[] {
  for (const arg of args) {
    if (arg === "--effort" || arg.startsWith("--effort=")) {
      return [];
    }
    // Headless (`-p`/`--print`) has no `/effort` selector, so Claude Code sends
    // no effort and the proxy already defaults to a fast "none". Only interactive
    // sessions get the medium selector default we need to lower, so skip -p.
    if (arg === "-p" || arg === "--print") {
      return [];
    }
  }
  const env = process.env.NCONNECT_REASONING_EFFORT?.toLowerCase();
  const level =
    env === "medium" || env === "high" || env === "xhigh" || env === "max" || env === "low"
      ? env
      : "low";
  return ["--effort", level];
}

function claudeCodeMaxOutputTokensFromEnv(value: string | undefined): number {
  if (value === undefined || value.trim() === "") {
    return DEFAULT_CLAUDE_CODE_MAX_OUTPUT_TOKENS;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CLAUDE_CODE_MAX_OUTPUT_TOKENS;
}

function claudeArgsWithoutModelOverrides(args: string[]): string[] {
  const sanitized: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === undefined) {
      continue;
    }
    if (arg === "--model" || arg === "-m") {
      i += 1;
      continue;
    }
    if (arg.startsWith("--model=")) {
      continue;
    }
    sanitized.push(arg);
  }
  return sanitized;
}

function claudeCacheFriendlyArgs(args: string[]): string[] {
  for (const arg of args) {
    if (
      arg === "--exclude-dynamic-system-prompt-sections" ||
      arg === "--system-prompt" ||
      arg.startsWith("--system-prompt=") ||
      arg === "--system-prompt-file" ||
      arg.startsWith("--system-prompt-file=")
    ) {
      return [];
    }
  }
  return ["--exclude-dynamic-system-prompt-sections"];
}

// Extra settings.json keys nconnect applies by default. These are
// settings-only (no env-var equivalent), so they're injected via claude's
// `--settings <json>` flag, which *merges* into the user's existing settings
// rather than replacing them. We bail out entirely if the user already passed
// `--settings` themselves, so we never clobber their explicit config.
function claudeExtraSettingsArgs(args: string[], authToken?: string): string[] {
  for (const arg of args) {
    if (arg === "--settings" || arg.startsWith("--settings=")) {
      return [];
    }
  }

  // skipWebFetchPreflight: the WebFetch tool pings api.anthropic.com directly
  // (bypassing ANTHROPIC_BASE_URL / our proxy) for its domain safety check. In
  // a nconnect session api.anthropic.com isn't our model endpoint, so the
  // preflight fails and WebFetch breaks entirely. Skipping it restores
  // WebFetch without reaching Anthropic.
  //
  // attribution: nconnect runs Nebius models inside the Claude Code harness,
  // so Claude's default generated-by text and Co-Authored-By trailer would
  // identify the wrong model. Keep both commits and PRs unattributed.
  //
  // apiKeyHelper: force Claude Code into API-key mode (the helper's output is
  // used as the api key, sent to our local proxy which accepts x-api-key). This
  // is what makes nconnect work for users whose ORG DISABLED Claude Code for
  // the claude.ai subscription: in OAuth/subscription mode Claude Code runs an
  // org-eligibility check at startup and hard-blocks with "Your organization
  // has disabled Claude subscription access" - even though we only want to talk
  // to the local proxy. apiKeyHelper is explicit config, so it never triggers
  // the "detected a custom API key" prompt and never reads OAuth/keychain. The
  // token is a local, per-session proxy credential (not the Nebius key), so
  // passing it via a shell echo is low-risk.
  const settings: Record<string, unknown> = {
    skipWebFetchPreflight: true,
    attribution: {
      commit: "",
      pr: "",
    },
  };
  if (authToken) {
    settings.apiKeyHelper = `printf %s ${JSON.stringify(authToken)}`;
  }
  return ["--settings", JSON.stringify(settings)];
}
