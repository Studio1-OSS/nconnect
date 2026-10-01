import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { ProviderBrand } from "../../components/ProviderBrand";
import { PageCards, TutorialCards } from "../../docs/cards";
import { installCommand } from "../../docs/data";
import { DocArticle, docHead } from "../../docs/layout";
import { docPages, legacyAnchors, tutorials } from "../../docs/registry";
import { CopyBox, H2, P } from "../../docs/ui";

const title = "NConnect documentation";
const description =
  "Install NConnect, connect Claude Code, Codex, Hermes, Grok Build and more to open models on Nebius Token Factory, and follow step-by-step tutorials.";

export const Route = createFileRoute("/docs/")({
  component: DocsOverview,
  head: () =>
    docHead({
      title: "Documentation | NConnect",
      description,
      path: "/docs",
      crumbs: [{ name: "Documentation", path: "/docs" }],
      type: "CollectionPage",
    }),
});

const bySlug = (...slugs: string[]) => docPages.filter((page) => slugs.includes(page.slug));

function DocsOverview() {
  // The docs used to be one long page; send old /docs#anchor links to the new page.
  useEffect(() => {
    const target = legacyAnchors[window.location.hash.slice(1)];
    if (target) {
      window.location.replace(target);
    }
  }, []);

  return (
    <DocArticle
      href="/docs"
      crumb="Overview"
      eyebrow="NCONNECT / DOCS"
      title={title}
      lead="Run the coding agents you already use on open models served by Nebius Token Factory, with optional Tavily web search."
      meta={
        <div className="docs-provider-row">
          <ProviderBrand provider="nebius" />
          <ProviderBrand provider="tavily" />
        </div>
      }
    >
      <H2 id="quick-start">Quick start</H2>
      <P>Install on macOS or Linux, add your Nebius key, then launch any harness.</P>
      <CopyBox text={installCommand} />
      <CopyBox text="nconnect configure" />

      <H2 id="get-started">Get started</H2>
      <PageCards pages={bySlug("installation", "how-it-works", "harnesses", "models")} />

      <H2 id="tutorials">Tutorials</H2>
      <P>
        Step-by-step guides for running a specific model in a specific harness.{" "}
        <a href="/docs/tutorials">See all tutorials</a>.
      </P>
      <TutorialCards items={tutorials.slice(0, 4)} />

      <H2 id="reference">Reference</H2>
      <PageCards
        pages={bySlug("commands", "environment", "web-search", "cost-metering", "troubleshooting")}
      />
    </DocArticle>
  );
}
