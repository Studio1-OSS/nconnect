import type { DocPage } from "../types";
import { llmsUrl } from "../data";
import { Code, CopyBox, Link, P } from "../ui";

export const aiAgents: DocPage = {
  slug: "ai-agents",
  title: "For AI agents",
  description:
    "An LLM-readable llms.txt covers installing, configuring and driving NConnect headlessly, so coding agents can set it up without a human in the loop.",
  group: "Reference",
  Content() {
    return (
      <>
        <P>
          An LLM-readable doc is published at <Link href={llmsUrl}>llms.txt</Link>. If you are an
          agent asked to install, configure or drive NConnect, including headless, read that first.
          It covers install, configure, every command, the models, and headless usage patterns.
        </P>
        <CopyBox text="curl -fsSL https://nconnect.sh/llms.txt" />
        <P>
          For headless runs, pass the key with <Code>--api-key</Code> or <Code>NEBIUS_API_KEY</Code>
          . A non-interactive run prints a missing agent&apos;s install command instead of
          installing it.
        </P>
      </>
    );
  },
};
