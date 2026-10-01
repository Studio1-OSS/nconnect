import type { DocPage } from "../types";
import { githubUrl } from "../data";
import { Code, CopyBox, Faq, Link, P } from "../ui";

export const troubleshooting: DocPage = {
  slug: "troubleshooting",
  title: "Troubleshooting",
  description:
    "Fix common NConnect problems: configuration errors, command not found after install, missing Tavily key, ignored --model flags, and spawned agents reporting zero cost.",
  group: "Reference",
  Content() {
    return (
      <>
        <Faq question="Configuration crashes or cannot read a key">
          <P>
            Update the installed CLI, then run configuration again in an interactive terminal.
            Required keys cannot be blank; press Enter to skip the optional Tavily key.
          </P>
          <CopyBox text="nconnect update" />
          <CopyBox text="nconnect configure" />
        </Faq>
        <Faq question="Command not found after installation">
          <P>
            Open a new terminal so your shell picks up the installer&apos;s PATH change. You can
            also run the installed executable directly:
          </P>
          <CopyBox text="~/.nconnect/bin/nconnect configure" />
        </Faq>
        <Faq question="Web search says TAVILY_API_KEY is not set">
          <P>
            Add a Tavily key with <Code>nconnect configure</Code>, then launch a new agent session.
            A Nebius key alone does not enable web search.
          </P>
        </Faq>
        <Faq question="My --model flag is ignored">
          <P>
            Put <Code>--model</Code> before the harness name. Only Codex and Unreal Agent read a{" "}
            <Code>--model</Code> that comes after it; every other harness drops it:
          </P>
          <CopyBox text="nconnect --model moonshotai/Kimi-K3 grok" />
        </Faq>
        <Faq question="A spawned agent reports zero cost">
          <P>
            Enable daemon metering for that launch. See{" "}
            <a href="/docs/cost-metering">Cost metering</a>.
          </P>
          <CopyBox text="NCONNECT_METER=1 npi" />
        </Faq>
        <P>
          Still stuck? <Link href={`${githubUrl}/issues`}>Open an issue on GitHub</Link>.
        </P>
      </>
    );
  },
};
