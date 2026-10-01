import { describe, expect, test } from "vitest";
import { type ServerResponse } from "node:http";
import { renderDaemonError } from "@nconnect/cli/dist/lib/daemon/server.js";
import type { NebiusApiError } from "@nconnect/cli/dist/lib/claude/wire-types.js";

// A minimal ServerResponse stub: capture statusCode + the JSON body written.
function mockRes(): { res: ServerResponse; statusCode: number | undefined; body: string } {
  const state = { statusCode: undefined as number | undefined, body: "" };
  const res = {
    writeHead: (status: number, _headers?: Record<string, string>) => {
      state.statusCode = status;
    },
    end: (chunk?: unknown) => {
      state.body = typeof chunk === "string" ? chunk : String(chunk ?? "");
    },
    setHeader: () => {},
  } as unknown as ServerResponse;
  return {
    res,
    get statusCode() {
      return state.statusCode;
    },
    get body() {
      return state.body;
    },
  };
}

// Construct a NebiusApiError the way claude/nebius-call.ts does - the
// Anthropic-shaped error the catch-all used to handle exclusively.
function anthropicError(status: number, type: string, message: string): NebiusApiError {
  return {
    status,
    anthropicStatus: status,
    anthropicType: type,
    message,
    code: undefined,
    retryAfterMs: undefined,
    retryable: false,
  };
}

describe("daemon error rendering (#2 - error contract at the seam)", () => {
  test("Claude agent + Anthropic error → Anthropic error shape", () => {
    const m = mockRes();
    renderDaemonError(m.res, anthropicError(429, "rate_limit_error", "slow down"), "claude");
    expect(m.statusCode).toBe(429);
    const parsed = JSON.parse(m.body);
    expect(parsed.type).toBe("error");
    expect(parsed.error.type).toBe("rate_limit_error");
    expect(parsed.error.message).toBe("slow down");
  });

  test("Claude agent + plain Error → Anthropic 500 api_error", () => {
    const m = mockRes();
    renderDaemonError(m.res, new Error("boom"), "claude");
    expect(m.statusCode).toBe(500);
    const parsed = JSON.parse(m.body);
    expect(parsed.type).toBe("error");
    expect(parsed.error.type).toBe("api_error");
    expect(parsed.error.message).toBe("boom");
  });

  test("Codex agent + Anthropic-shaped error → OpenAI error shape (the bug fix)", () => {
    const m = mockRes();
    // Before the fix: Codex threw plain Error, isNebiusApiError never matched,
    // and the client got an Anthropic-shaped error despite speaking the
    // Responses API. After the fix: codex agent renders the OpenAI shape.
    renderDaemonError(m.res, anthropicError(429, "rate_limit_error", "slow down"), "codex");
    expect(m.statusCode).toBe(429);
    const parsed = JSON.parse(m.body);
    // OpenAI error shape is { error: { type, message } } - NOT the Anthropic
    // { type: "error", error: { ... } } envelope.
    expect(parsed.error).toBeTypeOf("object");
    expect(parsed.error.type).toBe("rate_limit_error");
    expect(parsed.error.message).toBe("slow down");
    expect(parsed.type).toBeUndefined();
  });

  test("Codex-app agent + plain Error → OpenAI error shape", () => {
    const m = mockRes();
    renderDaemonError(m.res, new Error("codex boom"), "codex-app");
    expect(m.statusCode).toBe(500);
    const parsed = JSON.parse(m.body);
    expect(parsed.error.type).toBe("api_error");
    expect(parsed.error.message).toBe("codex boom");
    expect(parsed.type).toBeUndefined();
  });

  test("Unknown agent defaults to Anthropic shape (no regression to Claude path)", () => {
    const m = mockRes();
    renderDaemonError(m.res, new Error("unknown agent"), undefined);
    expect(m.statusCode).toBe(500);
    const parsed = JSON.parse(m.body);
    expect(parsed.type).toBe("error");
    expect(parsed.error.type).toBe("api_error");
  });

  test("Non-Error thrown value is stringified, not crashed", () => {
    const m = mockRes();
    renderDaemonError(m.res, "a bare string", "codex");
    expect(m.statusCode).toBe(500);
    const parsed = JSON.parse(m.body);
    expect(parsed.error.message).toBe("a bare string");
  });
});

// Regression: an error that arrives AFTER a streaming response has already sent
// headers must not attempt a second response. writeHead() throws
// ERR_HTTP_HEADERS_SENT there, and because this runs in the daemon's request
// catch-all the throw was uncaught - it crashed the daemon process and killed
// every other active session with it.
describe("renderDaemonError after headers are sent", () => {
  function streamingRes(writableEnded = false): {
    res: ServerResponse;
    writeHeadCalls: number;
    ended: boolean;
  } {
    const state = { writeHeadCalls: 0, ended: false };
    const res = {
      headersSent: true,
      writableEnded,
      writeHead: () => {
        state.writeHeadCalls += 1;
        throw new Error("ERR_HTTP_HEADERS_SENT");
      },
      end: () => {
        state.ended = true;
      },
      setHeader: () => {},
    } as unknown as ServerResponse;
    return {
      res,
      get writeHeadCalls() {
        return state.writeHeadCalls;
      },
      get ended() {
        return state.ended;
      },
    };
  }

  for (const agent of ["claude", "codex", "codex-app", undefined] as const) {
    test(`does not throw or re-write for agent=${agent ?? "undefined"}`, () => {
      const m = streamingRes();
      expect(() => renderDaemonError(m.res, new Error("mid-stream boom"), agent)).not.toThrow();
      expect(m.writeHeadCalls).toBe(0);
      // The half-open connection is closed so the client is not left hanging.
      expect(m.ended).toBe(true);
    });
  }

  test("does not double-end a response that already finished", () => {
    const m = streamingRes(true);
    expect(() => renderDaemonError(m.res, new Error("boom"), "claude")).not.toThrow();
    expect(m.ended).toBe(false);
  });

  test("Nebius API errors after headers are sent are also swallowed", () => {
    const m = streamingRes();
    expect(() =>
      renderDaemonError(m.res, anthropicError(429, "rate_limit_error", "slow down"), "claude"),
    ).not.toThrow();
    expect(m.writeHeadCalls).toBe(0);
  });
});
