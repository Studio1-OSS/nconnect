import type { DocPage } from "../types";
import { harnesses } from "../data";
import { Badge, Callout, Cell, Code, CopyBox, H2, Mark, P, Row, Table } from "../ui";

const modeTone = { Proxied: "brand", Spawned: "amber", Editor: "neutral" } as const;

export const harnessesPage: DocPage = {
  slug: "harnesses",
  title: "Supported harnesses",
  navLabel: "All harnesses",
  description:
    "Run Claude Code, Codex, OpenCode, Pi, Prime Agent, Hermes, DeepSeek Harness, Grok Build and Unreal Agent on Nebius models, each with a one-word NConnect command.",
  group: "Harnesses",
  Content() {
    return (
      <>
        <P>
          Launch any of them directly. Extra arguments are passed straight through to the underlying
          agent.
        </P>
        <Table head={["Harness", "Command", "Mode", "Notes", "Tutorial"]}>
          {harnesses.map((h) => (
            <Row key={h.name}>
              <Cell strong>
                <span className="docs-name">
                  <Mark logo={h.logo} />
                  {h.name}
                </span>
              </Cell>
              <Cell>
                {h.command ? <Code>{h.command}</Code> : <span className="docs-dim">-</span>}
              </Cell>
              <Cell>
                <Badge tone={modeTone[h.mode]}>{h.mode}</Badge>
              </Cell>
              <Cell>{h.note}</Cell>
              <Cell>
                {h.tutorial ? (
                  <a href={`/docs/tutorials/${h.tutorial}`}>Guide</a>
                ) : (
                  <span className="docs-dim">-</span>
                )}
              </Cell>
            </Row>
          ))}
        </Table>
        <P>
          <strong>Proxied</strong> harnesses route through the local daemon.{" "}
          <strong>Spawned</strong> harnesses launch with a generated provider config. See{" "}
          <a href="/docs/how-it-works">How NConnect works</a>.
        </P>

        <H2 id="choosing-a-model">Choosing a model</H2>
        <P>
          Put <Code>--model</Code> before the harness name. This works the same way for every
          harness:
        </P>
        <CopyBox text="nconnect --model moonshotai/Kimi-K3 hermes" />
        <Callout tone="warning" title="Flag order matters">
          Everything after the harness name is forwarded to the agent. Only Codex and Unreal Agent
          read a <Code>--model</Code> placed there; every other harness drops it so NConnect can pin
          the provider, which means <Code>nclaude --model ...</Code> silently uses the default
          model. Use <Code>nconnect --model &lt;id&gt; &lt;harness&gt;</Code>, which works for all
          of them.
        </Callout>
        <P>
          Model ids are listed on the <a href="/docs/models">Models</a> page.
        </P>
      </>
    );
  },
};
