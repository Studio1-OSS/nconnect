import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, Copy, Link as LinkIcon, Search } from "lucide-react";
import { ProviderBrand } from "../components/ProviderBrand";
import { pageHead, siteUrl, structuredData } from "../lib/seo";
import "../styles/landing.css";
import "../styles/docs.css";

const installCommand = "curl -fsSL https://nebius-tf-relay.vercel.app/install.sh | bash";
const githubUrl = "https://github.com/Studio1-OSS/nconnect";
const changelogUrl = "https://github.com/Studio1-OSS/nconnect/blob/main/CHANGELOG.md";
const nebiusApiKeysUrl = "https://tokenfactory.nebius.com/?modals=create-api-key";
const tavilyUrl = "https://app.tavily.com";
const llmsUrl = "https://nebius-tf-relay.vercel.app/llms.txt";

export const Route = createFileRoute("/docs")({
  component: Docs,
  head: () => ({
    ...pageHead(
      "Documentation | Install & Configure NConnect",
      "Install NConnect, configure Nebius and Tavily API keys, choose coding agents and models, track costs, and troubleshoot your local relay.",
      "/docs",
    ),
    scripts: [
      structuredData({
        "@context": "https://schema.org",
        "@type": "TechArticle",
        headline: "NConnect documentation",
        url: `${siteUrl}/docs`,
        description:
          "Installation, configuration, commands, web search, and troubleshooting for NConnect.",
        about: { "@type": "SoftwareApplication", name: "NConnect", url: `${siteUrl}/` },
      }),
      structuredData({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/` },
          { "@type": "ListItem", position: 2, name: "Documentation", item: `${siteUrl}/docs` },
        ],
      }),
    ],
  }),
});

/** Section ids drive both the sidebar and the scroll-spy highlight. */
const sections = [
  { id: "what-it-does", label: "What it does" },
  { id: "install", label: "Install" },
  { id: "harnesses", label: "Harnesses" },
  { id: "desktop", label: "Desktop (alpha)" },
  { id: "commands", label: "Commands" },
  { id: "models", label: "Models" },
  { id: "images", label: "Images & vision" },
  { id: "web-search", label: "Web search" },
  { id: "metering", label: "Cost metering" },
  { id: "env", label: "Environment" },
  { id: "troubleshooting", label: "Troubleshooting" },
  { id: "agents", label: "For AI agents" },
];

const harnesses = [
  ["Claude Code", "nclaude", "Proxied", "Anthropic Messages API translated to Nebius."],
  ["Codex CLI", "ncodex", "Proxied", "OpenAI Responses API translated to Nebius."],
  ["OpenCode", "nopencode", "Spawned", "Nebius wired in as an OpenAI-compatible provider."],
  ["Pi Code", "npi", "Spawned", "Custom Nebius provider in a temporary config directory."],
  ["Prime Agent", "nprime", "Spawned", "PrimeIntellect's RLM agent on Nebius models."],
  ["Hermes Agent", "nhermes", "Spawned", "Nous Research's agent, isolated home overlay."],
  ["DeepSeek Harness", "ndeepseek", "Spawned", "DeepSeek's web profile with Nebius layered in."],
  ["Grok Build", "ngrok", "Spawned", "xAI's terminal harness; your key never reaches api.x.ai."],
  [
    "Unreal Agent",
    "nunreal",
    "Proxied",
    "Unreal Labs' async-first runner; its Responses API traffic translated to Nebius.",
  ],
];

const models = [
  ["GLM 5.3 Flash", "Fast, very low cost, agentic", "1M", "No", true],
  ["GLM 5.3", "Coding, reasoning, tool use", "1,024K", "No", false],
  ["DeepSeek V4 Pro 0813", "Reasoning and agentic coding", "979K", "No", false],
  ["Kimi K3", "Frontier coding + agentic", "1M", "No", false],
  ["Kimi K2.6", "Vision flagship", "262K", "Yes", false],
  ["Kimi K2.7 Code", "Coding", "262K", "No", false],
  ["MiniMax M3", "Fast, cheap", "196K", "No", false],
  ["Qwen 3.5 397B", "General / coding flagship", "262K", "No", false],
  ["DeepSeek V4 Flash", "Fast DeepSeek V4", "1M", "No", false],
  ["DeepSeek V4 Pro", "Long-context reasoning", "1M", "No", false],
  ["Qwen2.5-VL 72B", "Vision fallback", "32K", "Yes", false],
];

const envVars: Array<[string, ReactNode]> = [
  [
    "NEBIUS_API_KEY",
    <>
      Nebius Token Factory key (or set it via <Code>configure</Code>).
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
      Nebius publishes no cached rate - so the total is an upper bound.
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

function Docs() {
  const [active, setActive] = useState(sections[0]!.id);

  const [query, setQuery] = useState("");
  const filteredSections = sections.filter((section) =>
    section.label.toLowerCase().includes(query.trim().toLowerCase()),
  );

  useEffect(() => {
    let frame = 0;
    const update = () => {
      const current = [...sections].reverse().find(({ id }) => {
        const element = document.getElementById(id);
        return element && element.getBoundingClientRect().top <= 150;
      });
      setActive(current?.id ?? sections[0].id);
    };
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="relay-home docs-page">
      <a className="skip-link" href="#docs-content">
        Skip to documentation
      </a>
      <header className="relay-nav wrap docs-header">
        <a className="relay-brand" href="/" aria-label="NConnect home">
          <img src="/relay-logo.png" alt="" width="36" height="36" />
          <span>
            <b>NConnect</b>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <a href="/">Home</a>
          <a href={githubUrl} target="_blank" rel="noopener noreferrer">
            GitHub <ArrowUpRight size={14} />
          </a>
          <a className="button button-dark" href="#install">
            Quick start <ArrowUpRight size={14} />
          </a>
        </nav>
      </header>
      <div className="docs-layout wrap">
        <aside className="docs-sidebar">
          <div className="docs-sidebar-inner">
            <a className="docs-back" href="/">
              Home / <strong>Documentation</strong>
            </a>
            <label className="docs-search">
              <Search size={16} />
              <input
                type="search"
                placeholder="Find a section"
                aria-label="Find a documentation section"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <p className="eyebrow">DOCUMENTATION</p>
            <nav aria-label="Documentation sections">
              {filteredSections.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  aria-current={active === section.id ? "location" : undefined}
                >
                  {section.label}
                </a>
              ))}
              {filteredSections.length === 0 && (
                <p className="docs-no-results" role="status">
                  No matching sections.
                </p>
              )}
            </nav>
            <div className="docs-sidebar-links">
              <a href={changelogUrl} target="_blank" rel="noopener noreferrer">
                Changelog <ArrowUpRight size={14} />
              </a>
              <a href="/llms.txt">
                llms.txt <ArrowUpRight size={14} />
              </a>
            </div>
          </div>
        </aside>
        <main id="docs-content" className="docs-content">
          <div className="docs-mobile-nav">
            <label htmlFor="docs-jump">On this page</label>
            <select
              id="docs-jump"
              value={active}
              onChange={(event) => {
                window.location.hash = event.target.value;
                setActive(event.target.value);
              }}
            >
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.label}
                </option>
              ))}
            </select>
          </div>
          <div className="docs-intro">
            <p className="eyebrow">
              <span className="relay-name">NCONNECT</span> / DOCS
            </p>
            <h1>Documentation</h1>
            <p>
              Everything you need to run your coding agents on Nebius Token Factory, with optional
              Tavily web search.
            </p>
            <div className="docs-provider-row">
              <ProviderBrand provider="nebius" />
              <ProviderBrand provider="tavily" />
            </div>
            <div className="docs-quick-links">
              <a href="#install">
                Install & configure <ArrowUpRight size={14} />
              </a>
              <a href="#commands">
                Command reference <ArrowUpRight size={14} />
              </a>
              <a href="#troubleshooting">
                Troubleshooting <ArrowUpRight size={14} />
              </a>
            </div>
          </div>
          <Section id="what-it-does" title="What it does">
            <P>
              Nebius Token Factory serves open models over an OpenAI-compatible API. It does not
              speak the Anthropic Messages API that Claude Code uses, nor the OpenAI Responses API
              that Codex uses. The relay runs a small local daemon that translates those wire
              formats to Nebius <Code>/chat/completions</Code> on the fly - your agent believes it
              is talking to its native backend, while every token is served by Nebius.
            </P>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Card title="Proxied harnesses">
                Claude Code and Codex. The daemon translates each request and response, tracks cost,
                retries transient failures, trims context to fit, and emulates native web search.
              </Card>
              <Card title="Spawned harnesses">
                Everything else. Launched with a generated provider config pointed at Nebius - no
                proxy needed, since they already speak the OpenAI-compatible format.
              </Card>
            </div>
            <Callout>
              CLI launches use temporary provider settings. The optional Codex / ChatGPT Desktop
              integration manages a persistent config separately; <Code>nconnect chatgpt off</Code>
              restores that integration.
            </Callout>
          </Section>

          <Section id="install" title="Install">
            <P>
              The one-liner installs <Code>nconnect</Code> plus a short alias per harness into{" "}
              <Code>~/.nconnect/bin/</Code>, and installs Bun for you if it is not already present.
            </P>
            <CopyBox className="mt-4" text={installCommand} />
            <P className="mt-5">First run walks you through configuration, or run it directly:</P>
            <CopyBox className="mt-3" text="nconnect configure" />
            <P className="mt-5">You will be asked for two keys:</P>
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
                <Cell>Optional - enables web search</Cell>
              </Row>
            </Table>
            <Callout>
              Keys are saved in <Code>~/.nconnect/config.json</Code> and used to authenticate
              requests to Nebius and Tavily. In an interactive terminal, a missing agent can be
              installed after you confirm its displayed install command. Non-interactive runs print
              installation instructions.
            </Callout>
          </Section>

          <Section id="harnesses" title="Harnesses">
            <P>
              Launch any of them directly. Extra arguments are passed straight through to the
              underlying agent.
            </P>
            <Table head={["Harness", "Command", "Mode", "Notes"]}>
              {harnesses.map(([name, cmd, mode, note]) => (
                <Row key={cmd}>
                  <Cell strong>{name}</Cell>
                  <Cell>
                    <Code>{cmd}</Code>
                  </Cell>
                  <Cell>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[12px] font-medium ${
                        mode === "Proxied"
                          ? "bg-violet-soft text-violet"
                          : "bg-lime/25 text-lime-ink"
                      }`}
                    >
                      {mode}
                    </span>
                  </Cell>
                  <Cell>{note}</Cell>
                </Row>
              ))}
            </Table>
            <CopyBox className="mt-5" text={'nclaude -p "explain this repo"'} />
          </Section>

          <Section id="commands" title="Commands">
            <Table head={["Command", "What it does"]}>
              {[
                ["nconnect", "Interactive launcher - pick a harness."],
                ["nconnect configure", "Set your API keys."],
                ["nconnect usage --last 7d", "Local spend by model and tool. Never uploaded."],
                ["nconnect update", "Update to the latest release now."],
                ["nconnect daemon install", "Start the daemon at login (launchd / systemd)."],
                ["nconnect daemon status", "Show auto-start status."],
                ["nconnect daemon stop", "Stop the running daemon."],
                ["nconnect chatgpt off", "Restore your previous Codex / ChatGPT config."],
              ].map(([cmd, what]) => (
                <Row key={cmd}>
                  <Cell>
                    <Code>{cmd}</Code>
                  </Cell>
                  <Cell>{what}</Cell>
                </Row>
              ))}
            </Table>
          </Section>

          <Section id="desktop" title="ChatGPT / Codex Desktop (alpha)">
            <P>
              The released CLI includes <Code>nconnect chatgpt</Code> (alias:
              <Code> codex-app</Code>) for compatible desktop coding tasks. It configures a local
              Responses provider in <Code>~/.codex/config.toml</Code>, writes a model catalog, and
              attempts to open the desktop app.
            </P>
            <CopyBox text="nconnect chatgpt" />
            <Callout>
              This integration is explicitly alpha in the CLI. It uses a provider-auth workaround
              and changes persistent configuration shared with Codex CLI, unlike the temporary
              settings used by the harness wrappers. It does not change the model selection for
              ordinary ChatGPT web chats. Desktop compatibility depends on the installed app
              version.
            </Callout>
            <P>Restore the backed-up configuration when you are finished:</P>
            <CopyBox text="nconnect chatgpt off" />
          </Section>
          <Section id="models" title="Models">
            <div className="docs-provider-inline">
              <ProviderBrand provider="nebius" />
            </div>
            <P>
              The model list is fetched live from Nebius at startup, so every model they serve is
              available and each model's vision support comes from the API's own modality field -
              never a hand-maintained list. Results are cached locally and fall back to a bundled
              snapshot when offline.
            </P>
            <Table head={["Model", "Best for", "Context", "Vision"]}>
              {models.map(([name, best, ctx, vision, isDefault]) => (
                <Row key={name as string}>
                  <Cell strong>
                    {name}
                    {isDefault ? (
                      <span className="ml-2 rounded-full bg-lime/25 px-2 py-0.5 text-[11px] font-semibold text-lime-ink">
                        DEFAULT
                      </span>
                    ) : null}
                  </Cell>
                  <Cell>{best}</Cell>
                  <Cell>{ctx}</Cell>
                  <Cell>{vision}</Cell>
                </Row>
              ))}
            </Table>
            <P>
              Relay 0.15.4 adds bundled support for GLM 5.3 and DeepSeek V4 Pro 0813. GLM 5.3 Flash
              remains the default. Select either new model explicitly:
            </P>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-code px-4 py-3 font-mono text-[13px] leading-relaxed text-muted">
              <code>{`nconnect --model zai-org/GLM-5.3 codex
nconnect --model deepseek-ai/DeepSeek-V4-Pro-0813 codex`}</code>
            </pre>
            <Callout>
              In Codex, select a vision-capable model before attaching images. Claude Code uses a
              separate vision-description path. Image input controls depend on your harness and
              terminal.
            </Callout>
          </Section>

          <Section id="images" title="Images & vision">
            <P>
              In Relay 0.15.3 and later, select a vision-capable model explicitly when launching
              Codex. The default GLM model is text-only. Image options belong to Codex, not every
              harness; other agents keep their native attachment controls.
            </P>
            <CopyBox text="ncodex --model moonshotai/Kimi-K2.6" />
            <P>
              Use Codex&apos;s clipboard-image shortcut where your terminal supports it. Normal
              terminal paste may paste text only; the relay does not monitor your clipboard. For a
              reliable file-based alternative, save the image on the machine running Codex:
            </P>
            <CopyBox
              text={
                'ncodex --model moonshotai/Kimi-K2.6 --image "/path/to/screenshot.png" "Describe this image"'
              }
            />
            <Callout>
              A plain file path in prompt text is not the same as attaching image bytes. Use the
              native image option and a model whose catalog lists image input. Clipboard access may
              be unavailable over SSH or in some terminal environments.
            </Callout>
          </Section>
          <Section id="web-search" title="Web search">
            <div className="docs-provider-inline">
              <ProviderBrand provider="tavily" />
            </div>
            <P>
              Claude Code and Codex expose a native <Code>web_search</Code> tool. The relay backs it
              with Tavily: with a key configured, searches return real results with citations.
              Without one, a search returns a clear "TAVILY_API_KEY not set" message rather than
              failing silently. Nebius has no hosted search tool, so this is how agents get live web
              access.
            </P>
          </Section>

          <Section id="metering" title="Cost metering">
            <P>
              Claude and Codex are proxied, so the daemon meters every turn. The other harnesses
              hold the key and call Nebius directly, which is why they report $0.00.{" "}
              <Code>NCONNECT_METER=1</Code> points them at the daemon instead:
            </P>
            <CopyBox className="mt-4" text={'NCONNECT_METER=1 npi --print "..."'} />
            <pre className="mt-3 overflow-x-auto rounded-xl bg-code px-4 py-3 font-mono text-[13px] leading-relaxed text-muted">
              {
                "NConnect ▸ Launching Pi Code with Nebius Token Factory.\n[nconnect cost] session total: $0.0056 (1,518 in, 69 out)"
              }
            </pre>
            <P className="mt-4">
              They then share the same client as everyone else - automatic model fallback, the
              per-model circuit breaker, transient-fault retries - and the real Nebius key stays
              inside the daemon, since the harness only ever sees a local session token. If the
              daemon is unreachable the launcher says so and connects directly, so metering can
              never be the reason a session fails to start.
            </P>
          </Section>

          <Section id="env" title="Environment">
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
          </Section>

          <Section id="troubleshooting" title="Troubleshooting">
            <details className="docs-faq">
              <summary>Configuration crashes or cannot read a key</summary>
              <P>
                Update the installed CLI, then run configuration again in an interactive terminal.
                Required keys cannot be blank; press Enter to skip the optional Tavily key.
              </P>
              <CopyBox text="nconnect update" />
              <CopyBox text="nconnect configure" />
            </details>
            <details className="docs-faq">
              <summary>Command not found after installation</summary>
              <P>
                Open a new terminal so your shell picks up the installer&apos;s PATH change. You can
                also run the installed executable directly:
              </P>
              <CopyBox text="~/.nconnect/bin/nconnect configure" />
            </details>
            <details className="docs-faq">
              <summary>Web search says TAVILY_API_KEY is not set</summary>
              <P>
                Add a Tavily key with <Code>nconnect configure</Code>, then launch a new agent
                session. A Nebius key alone does not enable web search.
              </P>
            </details>
            <details className="docs-faq">
              <summary>A spawned agent reports zero cost</summary>
              <P>
                Enable daemon metering for that launch. See <a href="#metering">Cost metering</a>{" "}
                for details.
              </P>
              <CopyBox text="NCONNECT_METER=1 npi" />
            </details>
          </Section>
          <Section id="agents" title="For AI agents">
            <P>
              An LLM-readable doc is published at <Link href={llmsUrl}>llms.txt</Link>. If you are
              an agent asked to install, configure or drive nconnect - including headless - read
              that first. It covers install, configure, every command, the models, and headless
              usage patterns.
            </P>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-4 py-2.5 text-[14px] font-semibold text-white transition hover:brightness-110"
                href={githubUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Source on GitHub
                <ArrowUpRight />
              </a>
              <a
                className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-4 py-2.5 text-[14px] font-semibold text-ink transition hover:bg-code"
                href={changelogUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Changelog
                <ArrowUpRight />
              </a>
            </div>
          </Section>
          <footer className="docs-footer">
            <span>MIT licensed · Studio1</span>
            <a href={githubUrl + "/issues"} target="_blank" rel="noopener noreferrer">
              Report an issue <ArrowUpRight size={14} />
            </a>
          </footer>
        </main>
      </div>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="docs-section">
      <h2>
        {title}
        <a
          className="section-anchor"
          href={`#${id}`}
          aria-label={`Link to ${title}`}
          title={`Link to ${title}`}
        >
          <LinkIcon size={16} />
        </a>
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function P({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`max-w-[680px] text-[16px] leading-relaxed text-muted ${className}`}>
      {children}
    </p>
  );
}

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-md bg-code px-1.5 py-0.5 font-mono text-[13px] text-ink">
      {children}
    </code>
  );
}

function Link({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      className="text-violet underline underline-offset-2 transition hover:text-ink"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line p-4">
      <div className="text-[15px] font-semibold text-ink">{title}</div>
      <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted">{children}</p>
    </div>
  );
}

function Callout({ children }: { children: ReactNode }) {
  return (
    <div className="mt-5 max-w-[680px] rounded-xl border border-line bg-code/60 px-4 py-3 text-[14.5px] leading-relaxed text-muted">
      {children}
    </div>
  );
}

function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div
      className="docs-table"
      tabIndex={0}
      role="region"
      aria-label={`${head[0]} reference table`}
    >
      <table className="w-full border-collapse text-left text-[14.5px]">
        <thead>
          <tr className="border-b border-line bg-code/50">
            {head.map((h) => (
              <th
                key={h}
                scope="col"
                className="px-4 py-2.5 text-[12.5px] font-semibold tracking-wide text-faint uppercase"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <tr className="border-b border-line last:border-0">{children}</tr>;
}

function Cell({ children, strong = false }: { children: ReactNode; strong?: boolean }) {
  return (
    <td className={`px-4 py-2.5 align-top ${strong ? "font-semibold text-ink" : "text-muted"}`}>
      {children}
    </td>
  );
}

function CopyBox({ text, className = "" }: { text: string; className?: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const code = useRef<HTMLElement>(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy() {
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
    } catch {
      if (code.current) {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(code.current);
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      setStatus("failed");
    }
    timer.current = setTimeout(() => setStatus("idle"), 2200);
  }
  return (
    <div className={`docs-copy-block ${className}`}>
      <div className="docs-command">
        <span aria-hidden="true">$</span>
        <code ref={code}>{text}</code>
        <button
          type="button"
          className="copy-button"
          onClick={copy}
          aria-label={`Copy command: ${text}`}
          title="Copy command"
        >
          {status === "copied" ? <Check size={16} /> : <Copy size={16} />}
        </button>
      </div>
      <span className="docs-copy-status" role="status">
        {status === "copied"
          ? "Copied to clipboard"
          : status === "failed"
            ? "Clipboard unavailable. Command selected for copying."
            : ""}
      </span>
    </div>
  );
}
