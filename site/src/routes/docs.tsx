import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SiteHeader } from "../components/SiteHeader";
import { DocsFooter, DocsMobileNav, DocsSidebar } from "../docs/layout";
import "../styles/landing.css";
import "../styles/docs.css";

/**
 * Shell for every /docs page: the landing nav, a grouped sidebar, and an
 * <Outlet /> for the page. Pages live in src/docs/ and are listed in
 * src/docs/registry.ts; each child route sets its own <head>.
 */
export const Route = createFileRoute("/docs")({
  component: DocsLayout,
});

function DocsLayout() {
  return (
    <div className="relay-home docs-page">
      <div className="page-grid-lines" aria-hidden="true" />
      <a className="skip-link" href="#docs-content">
        Skip to documentation
      </a>
      <SiteHeader />
      <div className="docs-layout wrap">
        <DocsSidebar />
        <main id="docs-content" className="docs-main">
          <DocsMobileNav />
          <Outlet />
          <DocsFooter />
        </main>
      </div>
    </div>
  );
}
