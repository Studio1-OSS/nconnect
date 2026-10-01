export const siteUrl = "https://nebius-tf-relay.vercel.app";

export function pageHead(title: string, description: string, path: string) {
  const url = `${siteUrl}${path}`;
  const image = `${siteUrl}/relay-og.png`;
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:url", content: url },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "NConnect" },
      { property: "og:locale", content: "en_US" },
      { property: "og:image", content: image },
      {
        property: "og:image:alt",
        content: "NConnect: Use open models with your existing harness.",
      },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: image },
      {
        name: "twitter:image:alt",
        content: "NConnect: Use open models with your existing harness.",
      },
    ],
    links: [{ rel: "canonical", href: url }],
  };
}

export function structuredData(data: Record<string, unknown>) {
  return { type: "application/ld+json", children: JSON.stringify(data).replace(/</g, "\\u003c") };
}
