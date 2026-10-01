import { afterEach, describe, expect, test, vi } from "vitest";
import {
  buildSession,
  toPersistedSession,
  toPublicSessionView,
  type RegisterSessionRequest,
} from "../../cli/src/lib/daemon/state.js";

const MODEL = {
  id: "zai-org/GLM-5.2",
  name: "GLM 5.2",
  anthropicAlias: "nebius-glm-5-2",
  cost: { input: 1.4, output: 4.4, cache_read: 0.26 },
  limit: { context: 262144, output: 164000 },
  attachment: false,
  reasoning: true,
  temperature: true,
  tool_call: true,
  modalities: { input: ["text"], output: ["text"] },
} satisfies RegisterSessionRequest["modelDefinition"];

describe("daemon session state", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("aggregates proxy perf payloads only when perf mode is enabled", () => {
    const disabledSession = buildSession(registerBody("disabled"));
    expect(disabledSession.options?.perfSink).toBeUndefined();
    expect(toPublicSessionView(disabledSession).proxyPerf).toBeUndefined();

    vi.stubEnv("NCONNECT_PERF", "1");
    const enabledSession = buildSession(registerBody("enabled"));

    enabledSession.options?.perfSink?.({
      name: "claude.proxy",
      totalMs: 42,
      fields: { path: "/v1/messages" },
      result: { status: 200, stream: true },
      spans: [
        { name: "body_read_parse", durationMs: 2, atMs: 2 },
        {
          name: "vision_image_resolution",
          durationMs: 8,
          atMs: 10,
          fields: { imageBlockCount: 2 },
        },
        { name: "upstream_fetch", durationMs: 25, atMs: 40 },
      ],
      marks: [{ name: "first_delta", atMs: 12, fields: { kind: "text" } }],
    });

    expect(toPublicSessionView(enabledSession).proxyPerf).toEqual({
      requestCount: 1,
      totalMs: 42,
      maxMs: 42,
      firstDelta: { count: 1, totalMs: 12, maxMs: 12 },
      spans: {
        body_read_parse: { count: 1, totalMs: 2, maxMs: 2 },
        upstream_fetch: { count: 1, totalMs: 25, maxMs: 25 },
        vision_image_resolution: { count: 1, totalMs: 8, maxMs: 8 },
      },
    });
  });
});

function registerBody(token: string): RegisterSessionRequest {
  return {
    token,
    agent: "claude",
    apiKey: "test-key",
    modelLabel: MODEL.name,
    modelId: MODEL.anthropicAlias,
    targetModelId: MODEL.id,
    modelName: MODEL.name,
    modelDefinition: MODEL,
  };
}

/**
 * `nconnect usage` groups by model. Model ids used to be persisted only when
 * a session had proxy options, which spawned harnesses never have - so every
 * Pi/Prime/Hermes/DeepSeek/Grok session was filed under model "unknown",
 * blanking the by-model breakdown for exactly the tools metering was added for.
 */
describe("model attribution for spawned harnesses", () => {
  test("a spawned session persists its model id and name", () => {
    const state = buildSession({
      token: "spawned",
      agent: "pi",
      apiKey: "k",
      baseUrl: "https://api.studio.nebius.com/v1",
      modelLabel: MODEL.name,
      modelDefinition: MODEL,
    } satisfies RegisterSessionRequest);

    // No proxy options: this is the spawned path.
    expect(state.options).toBeUndefined();

    const persisted = toPersistedSession(state);
    expect(persisted.modelId).toBe(MODEL.id);
    expect(persisted.targetModelId).toBe(MODEL.id);
    expect(persisted.modelName).toBe(MODEL.name);
  });

  test("a proxied session still persists its own alias, not the raw id", () => {
    const state = buildSession({
      token: "proxied",
      agent: "claude",
      apiKey: "k",
      baseUrl: "https://api.studio.nebius.com/v1",
      modelLabel: MODEL.name,
      modelId: MODEL.anthropicAlias,
      targetModelId: MODEL.id,
      modelName: MODEL.name,
      modelDefinition: MODEL,
    } satisfies RegisterSessionRequest);

    const persisted = toPersistedSession(state);
    expect(persisted.modelId).toBe(MODEL.anthropicAlias);
    expect(persisted.targetModelId).toBe(MODEL.id);
  });
});
