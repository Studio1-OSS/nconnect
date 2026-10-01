import type { ReactNode, RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, ArrowUpRight, Search } from "lucide-react";
import { pageHead, siteUrl, structuredData } from "../lib/seo";
import { changelogUrl, githubUrl } from "./data";
import { docGroups, docPages, neighbours, tutorials, type NavItem } from "./registry";

type NavSection = { label: string; items: NavItem[] };

const navSections: NavSection[] = [
  {
    label: "Get started",
    items: [{ href: "/docs", label: "Overview" }, ...pagesIn("Get started")],
  },
  ...docGroups
    .filter((group) => group !== "Get started")
    .map((group) => ({
      label: group,
      items: pagesIn(group),
    })),
  {
    label: "Tutorials",
    items: [
      { href: "/docs/tutorials", label: "All tutorials" },
      ...tutorials.map((t) => ({ href: `/docs/tutorials/${t.slug}`, label: t.navLabel })),
    ],
  },
];

function pagesIn(group: string): NavItem[] {
  return docPages
    .filter((page) => page.group === group)
    .map((page) => ({ href: `/docs/${page.slug}`, label: page.navLabel ?? page.title }));
}

function usePathname(): string {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
}

function NavList({ query = "" }: { query?: string }) {
  const pathname = usePathname();
  const needle = query.trim().toLowerCase();
  const sections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.label.toLowerCase().includes(needle)),
    }))
    .filter((section) => section.items.length > 0);

  if (sections.length === 0) {
    return (
      <p className="docs-no-results" role="status">
        No matching pages.
      </p>
    );
  }
  return (
    <>
      {sections.map((section) => (
        <div className="docs-nav-group" key={section.label}>
          <p className="docs-nav-label">{section.label}</p>
          <ul>
            {section.items.map((item) => (
              <li key={item.href}>
                <a href={item.href} aria-current={pathname === item.href ? "page" : undefined}>
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

export function DocsSidebar() {
  const [query, setQuery] = useState("");
  return (
    <aside className="docs-sidebar" aria-label="Documentation">
      <div className="docs-sidebar-inner">
        <label className="docs-search">
          <Search size={15} />
          <input
            type="search"
            placeholder="Filter pages"
            aria-label="Filter documentation pages"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <nav aria-label="Documentation pages">
          <NavList query={query} />
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
  );
}

/** Collapsible page list shown above the article below the sidebar breakpoint. */
export function DocsMobileNav() {
  const pathname = usePathname();
  const current =
    navSections.flatMap((s) => s.items).find((item) => item.href === pathname)?.label ?? "Menu";
  return (
    <details className="docs-mobile-nav">
      <summary>
        <span className="docs-nav-label">Docs</span>
        <span>{current}</span>
      </summary>
      <nav aria-label="Documentation pages">
        <NavList />
      </nav>
    </details>
  );
}

type TocItem = { id: string; label: string };

/** "On this page" list built from the rendered h2s, with scroll-spy. */
function useToc(container: RefObject<HTMLElement | null>, key: string) {
  const [items, setItems] = useState<TocItem[]>([]);
  const [active, setActive] = useState<string | undefined>();

  useEffect(() => {
    const root = container.current;
    if (!root) {
      return;
    }
    const headings = [...root.querySelectorAll<HTMLHeadingElement>("h2[id]")];
    setItems(headings.map((h) => ({ id: h.id, label: h.textContent ?? h.id })));

    let frame = 0;
    const update = () => {
      const current = [...headings].reverse().find((h) => h.getBoundingClientRect().top <= 120);
      setActive(current?.id ?? headings[0]?.id);
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
  }, [container, key]);

  return { items, active };
}

export function DocArticle({
  href,
  crumb,
  eyebrow,
  title,
  lead,
  meta,
  children,
}: {
  href: string;
  /** Sidebar group the page belongs to, shown in the breadcrumb. */
  crumb: string;
  eyebrow: string;
  title: string;
  lead: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
}) {
  const body = useRef<HTMLDivElement>(null);
  const { items, active } = useToc(body, href);
  const { prev, next } = neighbours(href);

  return (
    <div className="docs-article-grid">
      <article className="docs-article">
        <nav className="docs-breadcrumb" aria-label="Breadcrumb">
          <a href="/docs">Docs</a>
          <span aria-hidden="true">/</span>
          <span>{crumb}</span>
        </nav>
        <header className="docs-article-header">
          <p className="docs-eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="docs-lead">{lead}</p>
          {meta}
        </header>
        <div className="docs-prose" ref={body}>
          {children}
        </div>
        {(prev || next) && (
          <nav className="docs-pager" aria-label="Previous and next pages">
            {prev ? (
              <a href={prev.href} rel="prev">
                <small>
                  <ArrowLeft size={13} /> Previous
                </small>
                <span>{prev.label}</span>
              </a>
            ) : (
              <span />
            )}
            {next ? (
              <a href={next.href} rel="next" className="is-next">
                <small>
                  Next <ArrowRight size={13} />
                </small>
                <span>{next.label}</span>
              </a>
            ) : null}
          </nav>
        )}
      </article>
      <aside className="docs-toc" aria-label="On this page">
        {items.length > 0 && (
          <div className="docs-toc-inner">
            <p className="docs-nav-label">On this page</p>
            <ul>
              {items.map((item) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    aria-current={active === item.id ? "location" : undefined}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}

export function DocNotFound() {
  return (
    <div className="docs-article">
      <header className="docs-article-header">
        <p className="docs-eyebrow">404</p>
        <h1>Page not found</h1>
        <p className="docs-lead">
          This page may have moved when the docs were reorganised. Try the{" "}
          <a href="/docs">documentation overview</a> or the menu.
        </p>
      </header>
    </div>
  );
}

export function DocsFooter() {
  return (
    <footer className="docs-footer">
      <span>An open-source project by Studio1 · MIT licensed</span>
      <nav aria-label="Footer navigation">
        <a href={githubUrl} target="_blank" rel="noopener noreferrer">
          GitHub
        </a>
        <a href={`${githubUrl}/issues`} target="_blank" rel="noopener noreferrer">
          Report an issue
        </a>
        <a href="/llms.txt">llms.txt</a>
      </nav>
    </footer>
  );
}

/** <head> for a docs page: meta + TechArticle + breadcrumb structured data. */
export function docHead({
  title,
  description,
  path,
  crumbs,
  type = "TechArticle",
  extra = [],
}: {
  title: string;
  description: string;
  path: string;
  crumbs: Array<{ name: string; path: string }>;
  type?: "TechArticle" | "CollectionPage";
  extra?: Array<Record<string, unknown>>;
}) {
  const url = `${siteUrl}${path}`;
  return {
    ...pageHead(title, description, path),
    scripts: [
      structuredData({
        "@context": "https://schema.org",
        "@type": type,
        headline: title,
        url,
        description,
        about: { "@type": "SoftwareApplication", name: "NConnect", url: `${siteUrl}/` },
      }),
      structuredData({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [{ name: "Home", path: "/" }, ...crumbs].map((crumb, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: crumb.name,
          item: `${siteUrl}${crumb.path}`,
        })),
      }),
      ...extra.map((data) => structuredData(data)),
    ],
  };
}
