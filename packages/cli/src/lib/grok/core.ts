import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { getSelectableModels, getVisionPrimary } from "@nconnect/models";
import type { ModelDefinition } from "@nconnect/models";
import { NEBIUS_BASE_URL } from "../nebius-core.js";

/**
 * Grok Build support.
 *
 * Grok Build is xAI's terminal harness. Nebius does not serve Grok models, so
 * this runs the *harness* on Nebius models - you get Grok's UI driving Kimi,
 * DeepSeek, Qwen, and so on.
 *
 * Grok discovers models from an OpenAI-shaped `/v1/models` endpoint, so we
 * serve our own catalog from an ephemeral localhost server and point Grok's
 * inference at Nebius.
 *
 * CREDENTIAL SAFETY: Grok requires XAI_API_KEY to accept a custom catalog, and
 * several of its features (image gen/edit, voice) call api.x.ai directly with
 * whatever key is active. We therefore (a) point every xAI-native API surface at
 * the localhost catalog server so the Nebius key can never be sent to api.x.ai,
 * and (b) disable those features outright. Do not relax either without a
 * dedicated Nebius integration for them.
 */

const GROK_API_KEY_ENV = "NEBIUS_API_KEY";
const GROK_XAI_API_KEY_ENV = "XAI_API_KEY";
const GROK_MAX_COMPLETION_TOKENS = 8192;

export function buildGrokIdentityRule(model: ModelDefinition): string {
  return (
    `Grok Build is only the terminal harness. You are ${model.name} (${model.id}), ` +
    `served by Nebius Token Factory via NConnect. You are not Grok or an xAI ` +
    `model. For identity questions, name this backend and Nebius Token Factory; ` +
    `never claim xAI built or serves you.`
  );
}

export type GrokCatalogEntry = {
  id: string;
  model: string;
  name: string;
  description: string;
  base_url: string;
  api_backend: "chat_completions";
  context_window: number;
  max_completion_tokens: number;
  user_selectable: true;
};

export type GrokModelCatalog = {
  object: "list";
  data: GrokCatalogEntry[];
};

/** Our live Nebius catalog, shaped as the OpenAI-style list Grok expects. */
export function buildGrokModelCatalog(baseUrl = NEBIUS_BASE_URL): GrokModelCatalog {
  return {
    object: "list",
    data: getSelectableModels().map((model) => ({
      id: model.id,
      model: model.id,
      name: `Nebius · ${model.name}`,
      description: `Nebius Token Factory model: ${model.id}`,
      base_url: baseUrl,
      api_backend: "chat_completions" as const,
      context_window: model.limit.context,
      max_completion_tokens: Math.min(model.limit.output, GROK_MAX_COMPLETION_TOKENS),
      user_selectable: true as const,
    })),
  };
}

export type GrokModelCatalogServer = {
  modelsListUrl: string;
  close: () => Promise<void>;
};

/** Serve the catalog on an ephemeral localhost port for this launch only. */
export async function startGrokModelCatalogServer(
  baseUrl = NEBIUS_BASE_URL,
): Promise<GrokModelCatalogServer> {
  const body = JSON.stringify(buildGrokModelCatalog(baseUrl));
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    if (request.method === "GET" && pathname === "/v1/models") {
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-length": Buffer.byteLength(body),
        "content-type": "application/json; charset=utf-8",
      });
      response.end(body);
      return;
    }
    response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    response.end('{"error":"not_found"}');
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", onError);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  return {
    modelsListUrl: `http://127.0.0.1:${address.port}/v1/models`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

export function buildGrokLaunchEnvironment({
  inheritedEnv,
  apiKey,
  authPath,
  baseUrl,
  modelsListUrl,
  selectedModel,
}: {
  inheritedEnv: NodeJS.ProcessEnv;
  apiKey: string;
  authPath: string;
  baseUrl: string;
  modelsListUrl: string;
  selectedModel: ModelDefinition;
}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...inheritedEnv,
    [GROK_API_KEY_ENV]: apiKey,
    // Grok requires XAI_API_KEY to accept a custom catalog. Keep inference
    // working, but route every xAI-native surface at the localhost catalog
    // server so this Nebius credential can never reach api.x.ai.
    [GROK_XAI_API_KEY_ENV]: apiKey,
    GROK_XAI_API_BASE_URL: new URL(".", modelsListUrl).toString().replace(/\/$/, ""),
    GROK_AUTH_PATH: authPath,
    GROK_MODELS_BASE_URL: baseUrl,
    GROK_MODELS_LIST_URL: modelsListUrl,
    GROK_DEFAULT_MODEL: selectedModel.id,
    GROK_SESSION_SUMMARY_MODEL: selectedModel.id,
    GROK_IMAGE_DESCRIPTION_MODEL: getVisionPrimary().id,
    GROK_PROMPT_SUGGESTIONS_MODEL: selectedModel.id,
    GROK_SUGGESTIONS_AI_MODEL: selectedModel.id,
    GROK_WORKFLOWS: "1",
    // Grok's Imagine tools call api.x.ai directly with the active key and an
    // xAI-only image model. Do not expose them while we supply a Nebius key.
    GROK_IMAGE_GEN: "0",
    GROK_IMAGE_EDIT: "0",
    // Voice sends its bearer straight to api.x.ai; it cannot safely use the
    // Nebius credential or Nebius's chat-completions endpoint.
    GROK_VOICE_MODE: "0",
    GROK_TELEMETRY_ENABLED: "0",
    GROK_FEEDBACK_ENABLED: "0",
  };

  // GROK_AUTH is inline session auth and outranks GROK_AUTH_PATH. We must use
  // the supplied Nebius key even when the user's normal Grok login is active.
  // Their auth file itself is left untouched.
  delete env.GROK_AUTH;
  delete env.GROK_DISABLE_API_KEY_AUTH;

  // A blank override points Grok at the current directory; treat it as unset so
  // Grok resolves its normal ~/.grok home and keeps its built-in resources.
  if (!env.GROK_HOME?.trim()) {
    delete env.GROK_HOME;
  }
  return env;
}

export function grokArgsWithoutNConnectOverrides(args: string[]): string[] {
  const sanitized: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) {
      continue;
    }
    if (arg === "--model" || arg === "-m") {
      index += 1;
      continue;
    }
    if (arg.startsWith("--model=") || (arg.startsWith("-m") && arg.length > 2)) {
      continue;
    }
    sanitized.push(arg);
  }
  return sanitized;
}

/**
 * Append an identity rule so the model does not claim to be Grok/xAI - it is a
 * Nebius model wearing Grok's UI, and saying otherwise misleads the user.
 * A user-supplied --rules value is preserved alongside ours.
 */
export function grokArgsWithNebiusIdentity(args: string[], identityRule: string): string[] {
  const sanitized = grokArgsWithoutNConnectOverrides(args);
  const passthrough: string[] = [];
  const userRules: string[] = [];

  for (let index = 0; index < sanitized.length; index += 1) {
    const arg = sanitized[index];
    if (arg === undefined) {
      continue;
    }
    if (arg === "--rules" || arg === "--append-system-prompt") {
      const value = sanitized[index + 1];
      if (value !== undefined) {
        userRules.push(value);
        index += 1;
      }
      continue;
    }
    passthrough.push(arg);
  }

  const rules = [identityRule, ...userRules].join("\n\n");
  return [...passthrough, "--rules", rules];
}
