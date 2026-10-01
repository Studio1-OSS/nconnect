import type { DocPage } from "../types";
import { tavilyUrl } from "../data";
import { Code, CopyBox, Link, P } from "../ui";

export const webSearch: DocPage = {
  slug: "web-search",
  title: "Web search",
  description:
    "Give Claude Code and Codex live web search on Nebius models. NConnect backs their native web_search tool with Tavily and returns real results with citations.",
  group: "Features",
  Content() {
    return (
      <>
        <P>
          Claude Code and Codex expose a native <Code>web_search</Code> tool. NConnect backs it with
          Tavily: with a key configured, searches return real results with citations. Without one, a
          search returns a clear &quot;TAVILY_API_KEY not set&quot; message rather than failing
          silently. Nebius has no hosted search tool, so this is how agents get live web access.
        </P>
        <P>
          Get a key at <Link href={tavilyUrl}>app.tavily.com</Link>, then add it:
        </P>
        <CopyBox text="nconnect configure" />
        <P>
          You can also export <Code>TAVILY_API_KEY</Code> instead. Start a new agent session for the
          key to take effect.
        </P>
      </>
    );
  },
};
