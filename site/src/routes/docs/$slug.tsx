import { createFileRoute, notFound } from "@tanstack/react-router";
import { DocArticle, DocNotFound, docHead } from "../../docs/layout";
import { docGroups, getDocPage } from "../../docs/registry";

export const Route = createFileRoute("/docs/$slug")({
  loader: ({ params }) => {
    const page = getDocPage(params.slug);
    if (!page) {
      throw notFound();
    }
    return { slug: page.slug };
  },
  head: ({ loaderData }) => {
    const page = loaderData && getDocPage(loaderData.slug);
    if (!page) {
      return {};
    }
    const path = `/docs/${page.slug}`;
    return docHead({
      title: `${page.title} | NConnect Docs`,
      description: page.description,
      path,
      crumbs: [
        { name: "Documentation", path: "/docs" },
        { name: page.navLabel ?? page.title, path },
      ],
    });
  },
  notFoundComponent: DocNotFound,
  component: DocPageRoute,
});

function DocPageRoute() {
  const { slug } = Route.useLoaderData();
  const page = getDocPage(slug)!;
  const sectionNumber = String(docGroups.indexOf(page.group) + 1).padStart(2, "0");
  return (
    <DocArticle
      key={page.slug}
      href={`/docs/${page.slug}`}
      crumb={page.group}
      eyebrow={`${sectionNumber} / ${page.group.toUpperCase()}`}
      title={page.title}
      lead={page.description}
    >
      <page.Content />
    </DocArticle>
  );
}
