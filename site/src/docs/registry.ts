import type { DocGroup, DocPage, Tutorial } from "./types";
import { installation } from "./pages/installation";
import { howItWorks } from "./pages/how-it-works";
import { harnessesPage } from "./pages/harnesses";
import { desktop } from "./pages/desktop";
import { modelsPage } from "./pages/models";
import { vision } from "./pages/vision";
import { webSearch } from "./pages/web-search";
import { costMetering } from "./pages/cost-metering";
import { commandsPage } from "./pages/commands";
import { environment } from "./pages/environment";
import { troubleshooting } from "./pages/troubleshooting";
import { aiAgents } from "./pages/ai-agents";
import { kimiK3ClaudeCode } from "./tutorials/kimi-k3-claude-code";
import { glm53Codex } from "./tutorials/glm-5-3-codex";
import { qwen35OpenCode } from "./tutorials/qwen-3-5-opencode";
import { minimaxM3Pi } from "./tutorials/minimax-m3-pi";
import { deepseekV4FlashPrime } from "./tutorials/deepseek-v4-flash-prime-agent";
import { kimiK3Hermes } from "./tutorials/kimi-k3-hermes";
import { deepseekV4ProHarness } from "./tutorials/deepseek-v4-pro-deepseek-harness";
import { kimiK3GrokBuild } from "./tutorials/kimi-k3-grok-build";
import { kimiK27CodeUnreal } from "./tutorials/kimi-k2-7-code-unreal-agent";

/**
 * Reading order of the reference docs. The sidebar, prev/next links and the
 * sitemap all follow this list. To add a page: create it under pages/, then
 * add it here.
 */
export const docPages: DocPage[] = [
  installation,
  howItWorks,
  harnessesPage,
  desktop,
  modelsPage,
  vision,
  webSearch,
  costMetering,
  commandsPage,
  environment,
  troubleshooting,
  aiAgents,
];

/**
 * Tutorials, in the same order as the harness table: one per harness so every
 * tool has a working example. To add one: create it under tutorials/ (see
 * tutorials/shared.tsx), then add it here.
 */
export const tutorials: Tutorial[] = [
  kimiK3ClaudeCode,
  glm53Codex,
  qwen35OpenCode,
  minimaxM3Pi,
  deepseekV4FlashPrime,
  kimiK3Hermes,
  deepseekV4ProHarness,
  kimiK3GrokBuild,
  kimiK27CodeUnreal,
];

export const docGroups: DocGroup[] = [
  "Get started",
  "Harnesses",
  "Models",
  "Features",
  "Reference",
];

export function getDocPage(slug: string): DocPage | undefined {
  return docPages.find((page) => page.slug === slug);
}

export function getTutorial(slug: string): Tutorial | undefined {
  return tutorials.find((tutorial) => tutorial.slug === slug);
}

export type NavItem = { href: string; label: string };

/** Overview + reference pages + tutorials, in one linear order for prev/next. */
export const readingOrder: NavItem[] = [
  { href: "/docs", label: "Overview" },
  ...docPages.map((page) => ({ href: `/docs/${page.slug}`, label: page.navLabel ?? page.title })),
  { href: "/docs/tutorials", label: "All tutorials" },
  ...tutorials.map((t) => ({ href: `/docs/tutorials/${t.slug}`, label: t.navLabel })),
];

export function neighbours(href: string): { prev?: NavItem; next?: NavItem } {
  const index = readingOrder.findIndex((item) => item.href === href);
  if (index === -1) {
    return {};
  }
  return { prev: readingOrder[index - 1], next: readingOrder[index + 1] };
}

/**
 * Old single-page anchors (/docs#install) mapped to their new pages, so links
 * already shared on the web keep landing somewhere sensible.
 */
export const legacyAnchors: Record<string, string> = {
  "what-it-does": "/docs/how-it-works",
  install: "/docs/installation",
  harnesses: "/docs/harnesses",
  desktop: "/docs/desktop",
  commands: "/docs/commands",
  models: "/docs/models",
  images: "/docs/vision",
  "web-search": "/docs/web-search",
  metering: "/docs/cost-metering",
  env: "/docs/environment",
  troubleshooting: "/docs/troubleshooting",
  agents: "/docs/ai-agents",
};
