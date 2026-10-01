import { createFileRoute } from "@tanstack/react-router";
import { TutorialCards } from "../../../docs/cards";
import { DocArticle, docHead } from "../../../docs/layout";
import { tutorials } from "../../../docs/registry";
import { siteUrl } from "../../../lib/seo";

const description =
  "Step-by-step NConnect tutorials for running open models like Kimi K3 in Hermes Agent, Grok Build, Claude Code, Codex and other coding agents on Nebius Token Factory.";

export const Route = createFileRoute("/docs/tutorials/")({
  component: TutorialsIndex,
  head: () =>
    docHead({
      title: "Tutorials | NConnect Docs",
      description,
      path: "/docs/tutorials",
      type: "CollectionPage",
      crumbs: [
        { name: "Documentation", path: "/docs" },
        { name: "Tutorials", path: "/docs/tutorials" },
      ],
      extra: [
        {
          "@context": "https://schema.org",
          "@type": "ItemList",
          itemListElement: tutorials.map((t, i) => ({
            "@type": "ListItem",
            position: i + 1,
            url: `${siteUrl}/docs/tutorials/${t.slug}`,
            name: t.title,
          })),
        },
      ],
    }),
});

function TutorialsIndex() {
  return (
    <DocArticle
      href="/docs/tutorials"
      crumb="Tutorials"
      eyebrow="TUTORIALS"
      title="Tutorials"
      lead="Short, copy-paste guides for running a specific open model in a specific coding agent."
    >
      <TutorialCards items={tutorials} />
    </DocArticle>
  );
}
