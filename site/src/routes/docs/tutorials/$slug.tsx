import { createFileRoute, notFound } from "@tanstack/react-router";
import { Clock } from "lucide-react";
import { readableDuration, TutorialCards } from "../../../docs/cards";
import { DocArticle, DocNotFound, docHead } from "../../../docs/layout";
import { getTutorial, tutorials } from "../../../docs/registry";
import { H2 } from "../../../docs/ui";
import { siteUrl } from "../../../lib/seo";

export const Route = createFileRoute("/docs/tutorials/$slug")({
  loader: ({ params }) => {
    const tutorial = getTutorial(params.slug);
    if (!tutorial) {
      throw notFound();
    }
    return { slug: tutorial.slug };
  },
  head: ({ loaderData }) => {
    const t = loaderData && getTutorial(loaderData.slug);
    if (!t) {
      return {};
    }
    const path = `/docs/tutorials/${t.slug}`;
    return docHead({
      title: `${t.title} | NConnect`,
      description: t.description,
      path,
      crumbs: [
        { name: "Documentation", path: "/docs" },
        { name: "Tutorials", path: "/docs/tutorials" },
        { name: t.navLabel, path },
      ],
      extra: [
        {
          "@context": "https://schema.org",
          "@type": "HowTo",
          name: t.title,
          description: t.description,
          url: `${siteUrl}${path}`,
          totalTime: t.totalTime,
          dateModified: t.updated,
          tool: [
            { "@type": "HowToTool", name: "NConnect" },
            { "@type": "HowToTool", name: t.harness },
          ],
          step: t.steps.map((step, i) => ({
            "@type": "HowToStep",
            position: i + 1,
            name: step.name,
            text: step.text,
            url: `${siteUrl}${path}#steps`,
          })),
          ...(t.video
            ? {
                video: {
                  "@type": "VideoObject",
                  name: t.video.title,
                  description: t.description,
                  uploadDate: t.video.uploadDate,
                  thumbnailUrl: `https://i.ytimg.com/vi/${t.video.youtubeId}/hqdefault.jpg`,
                  contentUrl: `https://www.youtube.com/watch?v=${t.video.youtubeId}`,
                  embedUrl: `https://www.youtube-nocookie.com/embed/${t.video.youtubeId}`,
                },
              }
            : {}),
        },
      ],
    });
  },
  notFoundComponent: DocNotFound,
  component: TutorialRoute,
});

function TutorialRoute() {
  const { slug } = Route.useLoaderData();
  const t = getTutorial(slug)!;
  return (
    <DocArticle
      key={t.slug}
      href={`/docs/tutorials/${t.slug}`}
      crumb="Tutorials"
      eyebrow="TUTORIAL"
      title={t.title}
      lead={t.description}
      meta={
        <div className="docs-tutorial-meta">
          <span className="docs-tag">{t.model}</span>
          <span className="docs-tag">{t.harness}</span>
          <span>
            <Clock size={13} /> {readableDuration(t.totalTime)}
          </span>
          <span>
            Updated{" "}
            <time dateTime={t.updated}>
              {new Date(`${t.updated}T00:00:00Z`).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                timeZone: "UTC",
              })}
            </time>
          </span>
        </div>
      }
    >
      <t.Content />
      <H2 id="more-tutorials">More tutorials</H2>
      <TutorialCards items={moreTutorials(t.slug)} />
    </DocArticle>
  );
}

/** Up to four other tutorials, preferring the same model or harness. */
function moreTutorials(slug: string) {
  const current = getTutorial(slug)!;
  const others = tutorials.filter((t) => t.slug !== slug);
  const related = (t: (typeof tutorials)[number]) =>
    t.model === current.model || t.harness === current.harness ? 0 : 1;
  return [...others].sort((a, b) => related(a) - related(b)).slice(0, 4);
}
