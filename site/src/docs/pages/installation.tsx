import type { DocPage } from "../types";
import { installCommand, nebiusApiKeysUrl, tavilyUrl } from "../data";
import { Callout, Cell, Code, CopyBox, H2, Link, P, Row, Step, Steps, Table } from "../ui";

export const installation: DocPage = {
  slug: "installation",
  title: "Install and configure NConnect",
  navLabel: "Installation",
  description:
    "Install NConnect on macOS or Linux with one command, add your Nebius Token Factory and Tavily API keys, and launch your first coding agent on open models.",
  group: "Get started",
  Content() {
    return (
      <>
        <Steps>
          <Step title="Run the installer">
            <P>
              The one-liner installs <Code>nconnect</Code> plus a short alias per harness into{" "}
              <Code>~/.nconnect/bin/</Code>, and installs Bun for you if it is not already present.
            </P>
            <CopyBox text={installCommand} />
          </Step>
          <Step title="Add your API keys">
            <P>The first run walks you through configuration, or run it directly:</P>
            <CopyBox text="nconnect configure" />
            <Table head={["Key", "Where to get it", "Required"]}>
              <Row>
                <Cell strong>Nebius API key</Cell>
                <Cell>
                  <Link href={nebiusApiKeysUrl}>tokenfactory.nebius.com</Link>
                </Cell>
                <Cell>Yes</Cell>
              </Row>
              <Row>
                <Cell strong>Tavily API key</Cell>
                <Cell>
                  <Link href={tavilyUrl}>app.tavily.com</Link>
                </Cell>
                <Cell>Optional, enables web search</Cell>
              </Row>
            </Table>
          </Step>
          <Step title="Launch an agent">
            <P>
              Run <Code>nconnect</Code> to pick a harness interactively, or call one directly. Extra
              arguments pass straight through to the agent.
            </P>
            <CopyBox text={'nclaude -p "explain this repo"'} />
          </Step>
        </Steps>

        <Callout title="Where your keys live">
          Keys are saved in <Code>~/.nconnect/config.json</Code> and used only to authenticate
          requests to Nebius and Tavily. In an interactive terminal, a missing agent can be
          installed after you confirm its displayed install command. Non-interactive runs print
          installation instructions instead.
        </Callout>

        <H2 id="updates">Updates</H2>
        <P>
          The installed binary keeps itself up to date from nconnect.sh. Update immediately with:
        </P>
        <CopyBox text="nconnect update" />
        <P>
          Set <Code>NCONNECT_DISABLE_AUTOUPDATE=1</Code> to pin the current version. See{" "}
          <a href="/docs/environment">Environment variables</a>.
        </P>

        <H2 id="next">Next steps</H2>
        <P>
          Read <a href="/docs/how-it-works">how NConnect works</a>, browse the{" "}
          <a href="/docs/harnesses">supported harnesses</a>, or follow a{" "}
          <a href="/docs/tutorials">step-by-step tutorial</a>.
        </P>
      </>
    );
  },
};
