import type { DocPage } from "../types";
import { Callout, Card, Cards, Code, H2, P } from "../ui";

export const howItWorks: DocPage = {
  slug: "how-it-works",
  title: "How NConnect works",
  description:
    "NConnect runs a local daemon that translates the Anthropic and OpenAI Responses wire formats to Nebius chat completions, so your coding agent runs unchanged on open models.",
  group: "Get started",
  Content() {
    return (
      <>
        <P>
          Nebius serves open models over an OpenAI-compatible API. It does not speak the Anthropic
          Messages API that Claude Code uses, nor the OpenAI Responses API that Codex uses. NConnect
          runs a small local daemon that translates those wire formats to Nebius{" "}
          <Code>/chat/completions</Code> on the fly. Your agent believes it is talking to its native
          backend, while every token is served by Nebius.
        </P>

        <H2 id="two-families">Two kinds of harness</H2>
        <Cards>
          <Card title="Proxied harnesses">
            Claude Code, Codex and Unreal Agent. The daemon translates each request and response,
            tracks cost, retries transient failures, trims context to fit, and emulates native web
            search.
          </Card>
          <Card title="Spawned harnesses">
            Everything else. Launched with a generated provider config pointed at Nebius. No proxy
            needed, since they already speak the OpenAI-compatible format.
          </Card>
        </Cards>

        <H2 id="what-the-daemon-adds">What the daemon adds</H2>
        <ul>
          <li>
            <strong>Protocol translation</strong> between each agent's wire format and Nebius.
          </li>
          <li>
            <strong>Cost metering</strong> for every turn, viewable with <Code>nconnect usage</Code>
            . Nothing is uploaded.
          </li>
          <li>
            <strong>Resilience</strong>: transient failures are retried and an overloaded model
            fails over to a fallback model.
          </li>
          <li>
            <strong>Context fitting</strong> to each model's window.
          </li>
          <li>
            <strong>Web search</strong> backed by Tavily, with citations.
          </li>
          <li>
            <strong>Vision routing</strong>: image blocks go to a vision-capable model.
          </li>
        </ul>
        <P>
          Spawned harnesses can opt into the same client with{" "}
          <a href="/docs/cost-metering">daemon metering</a>.
        </P>

        <Callout>
          CLI launches use temporary provider settings, so your normal agent configuration is never
          touched. The optional <a href="/docs/desktop">ChatGPT / Codex Desktop integration</a> is
          the exception: it manages a persistent config, and <Code>nconnect chatgpt off</Code>{" "}
          restores it.
        </Callout>
      </>
    );
  },
};
