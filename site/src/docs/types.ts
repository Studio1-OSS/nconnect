import type { ComponentType } from "react";

export type DocGroup = "Get started" | "Harnesses" | "Models" | "Features" | "Reference";

export type DocPage = {
  /** URL segment under /docs/. */
  slug: string;
  /** Page <h1> and the start of the <title>. */
  title: string;
  /** Shorter sidebar label, when the title is long. */
  navLabel?: string;
  /** Meta description and the lead paragraph under the title. Aim for 140-160 chars. */
  description: string;
  group: DocGroup;
  Content: ComponentType;
};

export type Tutorial = {
  /** URL segment under /docs/tutorials/. */
  slug: string;
  /** Written as the search query people type: "How to run X with Y". */
  title: string;
  navLabel: string;
  description: string;
  /** Harness and model names, shown as tags and used in structured data. */
  harness: string;
  model: string;
  /** ISO-8601 duration for HowTo structured data, e.g. "PT5M". */
  totalTime: string;
  /** ISO date the steps were last checked against the CLI. */
  updated: string;
  /** Plain-text step summaries for HowTo structured data. Keep in sync with the page. */
  steps: Array<{ name: string; text: string }>;
  /** Optional walkthrough video, embedded on the page and described in structured data. */
  video?: { youtubeId: string; title: string; uploadDate: string };
  Content: ComponentType;
};
