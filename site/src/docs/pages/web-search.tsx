import type { DocPage } from "../types";
import { tavilyUrl } from "../data";
import {
  Callout,
  Cell,
  Code,
  CodeBlock,
  CopyBox,
  Faq,
  H2,
  Link,
  P,
  Row,
  Step,
  Steps,
  Table,
} from "../ui";

const tavilySite = "https://www.tavily.com";
const tavilyPricing = "https://www.tavily.com/pricing";
const tavilyCredits = "https://docs.tavily.com/documentation/api-credits";

export const webSearch: DocPage = {
  slug: "web-search",
  title: "Web search with Tavily",
  navLabel: "Web search",
  description:
    "Give Claude Code and Codex live, cited web search on open models. NConnect backs their built-in web_search tool with Tavily, the search API built for AI agents.",
  group: "Features",
  Content() {
    return (
      <>
        <P>
          Claude Code and Codex both ship a built-in <Code>web_search</Code> tool, but they expect
          their own provider to run the search. Nebius serves models, not search, so on its own that
          tool has nothing behind it. NConnect fills the gap: when your agent searches, the local
          daemon runs the query through Tavily and hands back real results with source URLs.
        </P>

        <H2 id="about-tavily">About Tavily</H2>
        <P>
          <Link href={tavilySite}>Tavily</Link> is a web search API built for AI agents. A normal
          search engine returns a page of links for a person to click through. Tavily returns ranked
          results with the relevant page text already extracted, so a model can read the sources
          directly and cite them.
        </P>
        <P>
          Search is one of several Tavily APIs, alongside Extract, Crawl, Map and Research. NConnect
          uses Search only.
        </P>
        <Callout title="Free to start">
          Tavily&apos;s free plan includes 1,000 API credits a month with no credit card required.
          NConnect runs basic-depth searches, which cost 1 credit each, so that covers about 1,000
          searches a month. See Tavily&apos;s <Link href={tavilyPricing}>pricing</Link> and{" "}
          <Link href={tavilyCredits}>credit costs</Link> for current numbers.
        </Callout>

        <H2 id="setup">Set it up</H2>
        <Steps>
          <Step title="Get a Tavily API key">
            <P>
              Sign up at <Link href={tavilyUrl}>app.tavily.com</Link> and copy your API key.
            </P>
          </Step>
          <Step title="Add it to NConnect">
            <P>
              Run configuration and paste the key when asked. Exporting <Code>TAVILY_API_KEY</Code>{" "}
              works too.
            </P>
            <CopyBox text="nconnect configure" />
          </Step>
          <Step title="Start a new session and ask something current">
            <P>Keys are read at launch, so open a fresh agent session.</P>
            <CopyBox
              text={'nclaude -p "What changed in the latest Node.js release? Cite sources."'}
            />
          </Step>
        </Steps>

        <H2 id="harnesses">Which harnesses use it</H2>
        <Table head={["Harness", "Web search"]}>
          <Row>
            <Cell strong>Claude Code</Cell>
            <Cell>
              Built-in <Code>web_search</Code> tool, backed by Tavily.
            </Cell>
          </Row>
          <Row>
            <Cell strong>Codex CLI</Cell>
            <Cell>
              Built-in <Code>web_search</Code> tool, backed by Tavily.
            </Cell>
          </Row>
          <Row>
            <Cell strong>Other harnesses</Cell>
            <Cell>
              Keep their own web tools, if they have any. NConnect doesn&apos;t change them.
            </Cell>
          </Row>
        </Table>

        <H2 id="how-it-works">What happens when your agent searches</H2>
        <ol className="docs-numbered">
          <li>
            The agent calls <Code>web_search</Code> with a query.
          </li>
          <li>
            The local daemon sends one Tavily Search request: basic depth, up to five results, plus
            Tavily&apos;s short answer.
          </li>
          <li>
            The model receives each result&apos;s title, URL and a snippet of the page, and is told
            to answer from those sources and include their URLs.
          </li>
        </ol>
        <CodeBlock label="What the model sees">
          {`Web search results for "node.js latest release" via Tavily:

Answer: ...

1. Node.js — Release notes
URL: https://nodejs.org/en/blog/release/...
Snippet: ...`}
        </CodeBlock>
        <ul>
          <li>
            <strong>Domain filters carry over.</strong> Allowed and blocked domains set on the
            agent&apos;s search tool are passed to Tavily as include and exclude lists.
          </li>
          <li>
            <strong>Search is capped per request.</strong> NConnect honours the tool&apos;s{" "}
            <Code>max_uses</Code> limit, five searches by default, so a runaway loop can&apos;t
            drain your credits.
          </li>
        </ul>

        <H2 id="privacy">Where your data goes</H2>
        <P>
          Searches go straight from your machine to <Code>api.tavily.com</Code> with your key. Only
          the search query and any domain filters are sent, never your code or conversation. Your
          key is stored in <Code>~/.nconnect/config.json</Code>. Tavily&apos;s own privacy policy
          covers the queries it receives.
        </P>

        <H2 id="troubleshooting">Troubleshooting</H2>
        <Faq question={'The agent says "TAVILY_API_KEY is not set"'}>
          <P>
            No key was found when the session started. Add one with <Code>nconnect configure</Code>{" "}
            and start a new session. A Nebius key alone does not enable search.
          </P>
        </Faq>
        <Faq question="Searches fail with a 429 error from Tavily">
          <P>
            You&apos;ve hit Tavily&apos;s rate limit or used your monthly credits. Check usage in
            your <Link href={tavilyUrl}>Tavily dashboard</Link>, wait, or move to a larger plan.
          </P>
        </Faq>
      </>
    );
  },
};
