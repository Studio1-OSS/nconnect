import { createFileRoute } from "@tanstack/react-router";
import { docPages, tutorials } from "../docs/registry";
import { siteUrl } from "../lib/seo";

/** Built from the docs registry, so a new page or tutorial is listed automatically. */
function sitemap(): string {
  const entries: Array<{ path: string; lastmod?: string }> = [
    { path: "/" },
    { path: "/docs" },
    ...docPages.map((page) => ({ path: `/docs/${page.slug}` })),
    { path: "/docs/tutorials" },
    ...tutorials.map((t) => ({ path: `/docs/tutorials/${t.slug}`, lastmod: t.updated })),
  ];
  const urls = entries
    .map(
      ({ path, lastmod }) =>
        `  <url><loc>${siteUrl}${path}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: () =>
        new Response(sitemap(), {
          headers: {
            "content-type": "application/xml; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        }),
    },
  },
});
