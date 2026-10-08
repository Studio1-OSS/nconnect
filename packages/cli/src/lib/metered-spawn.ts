import { randomBytes } from "node:crypto";
import type { ModelDefinition } from "@nconnect/models";
import {
  daemonFetch,
  daemonSessionUrl,
  ensureDaemon,
  localProxyAuthToken,
  registerDaemonSession,
  startDaemonSessionKeepalive,
} from "./daemon/launch.js";
import { printSessionCost } from "./proxied-session.js";
import type { AgentId, RegisterSessionRequest } from "./daemon/state.js";
import { isAutoModel } from "./auto-model.js";

/**
 * Route a spawned harness through the daemon so its spend is metered.
 *
 * The spawned harnesses (Pi, Prime, Hermes, DeepSeek, Grok, OpenCode) hold the
 * Nebius key and call `/chat/completions` themselves, so none of the proxied
 * path's machinery reaches them: no per-turn cost, no automatic model fallback,
 * no circuit breaker, no transient-fault retry. This registers a daemon session
 * and hands the harness a loopback base URL instead of api.studio.nebius.com,
 * which puts it on the shared client with everything else - and keeps the real
 * Nebius key inside the daemon, since the harness only ever sees the local
 * session token.
 *
 * Opt-in for now (NCONNECT_METER=1): it changes where every request from
 * these tools goes, and a daemon that is down would take the harness with it.
 * When it is off, `resolve` returns the direct Nebius endpoint unchanged.
 */

export const METER_ENV = "NCONNECT_METER";

export function meteringEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env[METER_ENV]?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export type MeteredEndpoint = {
  /** Base URL to hand the harness (loopback when metered, Nebius when not). */
  baseUrl: string;
  /** API key to hand the harness (session token when metered). */
  apiKey: string;
  /** Whether metering is actually active (daemon reachable and registered). */
  metered: boolean;
  /** Print the session cost and release the session. Always safe to call. */
  finish: () => Promise<void>;
};

export type MeteredSpawnSpec = {
  agent: AgentId;
  /** The real Nebius key and endpoint, used by the daemon upstream. */
  apiKey: string;
  baseUrl: string;
  model: ModelDefinition;
};

function directEndpoint(spec: MeteredSpawnSpec): MeteredEndpoint {
  return {
    baseUrl: spec.baseUrl,
    apiKey: spec.apiKey,
    metered: false,
    finish: async () => undefined,
  };
}

export async function meteredEndpoint(spec: MeteredSpawnSpec): Promise<MeteredEndpoint> {
  // Auto is resolved inside the daemon, so a launch on Auto always goes
  // through it, and cannot fall back to Nebius directly: Nebius has no model
  // by that name.
  const needsDaemon = isAutoModel(spec.model.id);
  if (!needsDaemon && !meteringEnabled()) {
    return directEndpoint(spec);
  }

  const sessionId = randomBytes(24).toString("hex");
  let proxyUrl: string;
  let authToken: string;
  try {
    authToken = await localProxyAuthToken();
    ({ url: proxyUrl } = await ensureDaemon());
  } catch (err) {
    // Metering is an accounting nicety; it must never be the reason a coding
    // session cannot start. Fall back to talking to Nebius directly.
    if (needsDaemon) {
      throw autoNeedsDaemon(err);
    }
    warnDegraded(err);
    return directEndpoint(spec);
  }

  const registration: RegisterSessionRequest = {
    token: sessionId,
    authToken,
    agent: spec.agent,
    apiKey: spec.apiKey,
    baseUrl: spec.baseUrl,
    modelLabel: spec.model.name,
    // Send the model id/name so the session carries them explicitly rather
    // than relying on the store deriving them from modelDefinition.
    modelId: spec.model.id,
    targetModelId: spec.model.id,
    modelName: spec.model.name,
    modelDefinition: spec.model,
    ...(process.env.NCONNECT_DEBUG === "1" ? { debug: true } : {}),
  };
  try {
    await registerDaemonSession(proxyUrl, registration);
  } catch (err) {
    if (needsDaemon) {
      throw autoNeedsDaemon(err);
    }
    warnDegraded(err);
    return directEndpoint(spec);
  }

  const keepalive = startDaemonSessionKeepalive(registration, {
    debug: process.env.NCONNECT_DEBUG === "1",
    label: `${spec.agent} session`,
  });

  let released = false;
  const finish = async (): Promise<void> => {
    if (released) {
      return;
    }
    released = true;
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    keepalive.stop();
    await printSessionCost(proxyUrl, sessionId).catch(() => undefined);
    await daemonFetch(`${proxyUrl}/internal/sessions/${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
    }).catch(() => undefined);
  };

  /**
   * Ctrl-C is the normal way to stop several of these harnesses - a few (dsh)
   * run a web UI and have no other exit - and it kills this launcher alongside
   * the child. Without this the run ends with no cost line and the session sits
   * registered until the daemon's reaper sweeps it, so the tokens look free.
   */
  function onSignal(signal: NodeJS.Signals): void {
    void finish().finally(() => {
      // 128 + signal number, the convention a shell reports for a signalled exit.
      process.exit(signal === "SIGINT" ? 130 : 143);
    });
  }
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  return {
    // The harness appends /chat/completions to this, landing on the daemon's
    // passthrough route rather than Nebius.
    baseUrl: `${daemonSessionUrl(proxyUrl, sessionId)}/v1`,
    // Never the real key: the daemon substitutes it upstream.
    apiKey: authToken,
    metered: true,
    finish,
  };
}

function autoNeedsDaemon(err: unknown): Error {
  return new Error(
    `The Auto model needs the NConnect daemon, which could not be reached (${
      err instanceof Error ? err.message : String(err)
    }). Pick a model with --model <id> to run without it.`,
  );
}

function warnDegraded(err: unknown): void {
  process.stderr.write(
    `NConnect ▸ Cost metering unavailable (${err instanceof Error ? err.message : String(err)}); ` +
      "connecting to Nebius directly.\n",
  );
}
