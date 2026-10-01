import type { ReactNode } from "react";
import type { DocPage } from "../types";
import { Cell, Code, P, Row, Table } from "../ui";

const envVars: Array<[string, ReactNode]> = [
  [
    "NEBIUS_API_KEY",
    <>
      Nebius key, used when none is saved by <Code>configure</Code> or passed with{" "}
      <Code>--api-key</Code>.
    </>,
  ],
  [
    "TAVILY_API_KEY",
    <>
      Enables web search (or set it via <Code>configure</Code>).
    </>,
  ],
  [
    "NEBIUS_BASE_URL",
    <>
      Override the API base. Default <Code>https://api.tokenfactory.nebius.com/v1</Code>.
    </>,
  ],
  [
    "NCONNECT_REASONING_EFFORT",
    <>
      <Code>none</Code> | <Code>low</Code> | <Code>medium</Code> | <Code>high</Code> |{" "}
      <Code>max</Code>. Default <Code>none</Code> for speed; raise it for harder tasks.
    </>,
  ],
  [
    "NCONNECT_FALLBACK_MODEL",
    <>
      Model to fail over to when the target returns no response headers. Default{" "}
      <Code>moonshotai/Kimi-K2.6</Code>; set <Code>off</Code> to disable.
    </>,
  ],
  [
    "NCONNECT_METER=1",
    <>
      Route the spawned harnesses through the daemon so they get cost metering, model fallback and
      retries. Off by default.
    </>,
  ],
  [
    "NCONNECT_REASONING_HISTORY",
    <>
      <Code>full</Code> (default) | <Code>interleaved</Code> | <Code>off</Code>. How much prior
      reasoning is replayed each turn. <Code>off</Code> is cheapest on long sessions.
    </>,
  ],
  [
    "NCONNECT_CACHE_READ_RATIO",
    <>
      Price of a cached input token as a fraction of the input price. Default <Code>1</Code>, since
      Nebius publishes no cached rate, so the total is an upper bound.
    </>,
  ],
  [
    "NCONNECT_CODEX_MEMORY_MODEL",
    <>Model that summarizes Codex traces for durable memory. Defaults to MiniMax M3.</>,
  ],
  ["NCONNECT_DISABLE_AUTOUPDATE=1", <>Stop the installed binary from self-updating.</>],
  [
    "NCONNECT_TELEMETRY_URL",
    <>Opt in to telemetry by pointing at your own collector. Off by default.</>,
  ],
];

export const environment: DocPage = {
  slug: "environment",
  title: "Environment variables",
  description:
    "Configure NConnect with environment variables: API keys, base URL, reasoning effort, fallback model, daemon metering, auto-update and telemetry.",
  group: "Reference",
  Content() {
    return (
      <>
        <P>
          Keys resolve in this order: the <Code>--api-key</Code> flag, then the key saved by{" "}
          <Code>nconnect configure</Code>, then the environment.
        </P>
        <Table head={["Variable", "Effect"]}>
          {envVars.map(([name, effect]) => (
            <Row key={name}>
              <Cell>
                <Code>{name}</Code>
              </Cell>
              <Cell>{effect}</Cell>
            </Row>
          ))}
        </Table>
      </>
    );
  },
};
