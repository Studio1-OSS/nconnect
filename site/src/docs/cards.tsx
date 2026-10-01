import { ArrowUpRight, Clock } from "lucide-react";
import type { DocPage, Tutorial } from "./types";

export function PageCards({ pages }: { pages: DocPage[] }) {
  return (
    <div className="docs-link-cards">
      {pages.map((page) => (
        <a key={page.slug} href={`/docs/${page.slug}`} className="docs-link-card">
          <span className="docs-link-card-title">
            {page.navLabel ?? page.title}
            <ArrowUpRight size={15} />
          </span>
          <span className="docs-link-card-body">{page.description}</span>
        </a>
      ))}
    </div>
  );
}

/** "PT5M" -> "5 min". Only handles the minute-level durations tutorials use. */
function readableDuration(iso: string): string {
  const minutes = /PT(\d+)M/.exec(iso)?.[1];
  return minutes ? `${minutes} min` : iso;
}

export function TutorialCards({ items }: { items: Tutorial[] }) {
  return (
    <div className="docs-tutorial-cards">
      {items.map((t) => (
        <a key={t.slug} href={`/docs/tutorials/${t.slug}`} className="docs-tutorial-card">
          <span className="docs-tags">
            <span className="docs-tag">{t.model}</span>
            <span className="docs-tag">{t.harness}</span>
          </span>
          <span className="docs-tutorial-card-title">{t.title}</span>
          <span className="docs-link-card-body">{t.description}</span>
          <span className="docs-tutorial-card-foot">
            <span>
              <Clock size={13} /> {readableDuration(t.totalTime)}
            </span>
            <span>
              Read tutorial <ArrowUpRight size={14} />
            </span>
          </span>
        </a>
      ))}
    </div>
  );
}

export { readableDuration };
