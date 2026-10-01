import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Check, Copy, Link as LinkIcon } from "lucide-react";

/**
 * Prose primitives for docs pages. Styling lives in styles/docs.css and reads
 * the shared palette tokens from styles/app.css - keep colour out of here.
 */

export function H2({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id}>
      {children}
      <a className="section-anchor" href={`#${id}`} aria-label="Link to this section">
        <LinkIcon size={15} />
      </a>
    </h2>
  );
}

export function H3({ id, children }: { id?: string; children: ReactNode }) {
  return <h3 id={id}>{children}</h3>;
}

export function P({ children }: { children: ReactNode }) {
  return <p>{children}</p>;
}

export function Code({ children }: { children: ReactNode }) {
  return <code className="docs-inline-code">{children}</code>;
}

/** External link. Internal docs links are plain `<a href="/docs/...">`. */
export function Link({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

export function Callout({
  children,
  tone = "note",
  title,
}: {
  children: ReactNode;
  tone?: "note" | "warning";
  title?: string;
}) {
  return (
    <aside className={`docs-callout docs-callout-${tone}`}>
      {title ? <strong>{title}</strong> : null}
      <div>{children}</div>
    </aside>
  );
}

export function Cards({ children }: { children: ReactNode }) {
  return <div className="docs-cards">{children}</div>;
}

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="docs-card">
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

export function Badge({
  tone,
  children,
}: {
  tone: "brand" | "amber" | "neutral";
  children: ReactNode;
}) {
  return <span className={`docs-badge docs-badge-${tone}`}>{children}</span>;
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div
      className="docs-table"
      tabIndex={0}
      role="region"
      aria-label={`${head[0]} reference table`}
    >
      <table>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <tr>{children}</tr>;
}

export function Cell({ children, strong = false }: { children: ReactNode; strong?: boolean }) {
  return <td className={strong ? "is-strong" : undefined}>{children}</td>;
}

/** Ordered walkthrough. Each child is a <Step>. */
export function Steps({ children }: { children: ReactNode }) {
  return <ol className="docs-steps">{children}</ol>;
}

export function Step({ title, children }: { title: string; children: ReactNode }) {
  return (
    <li>
      <h3>{title}</h3>
      {children}
    </li>
  );
}

/** Multi-line, non-copyable output (terminal transcripts, file contents). */
export function CodeBlock({ children, label }: { children: string; label?: string }) {
  return (
    <figure className="docs-terminal docs-codeblock">
      {label ? <figcaption className="docs-terminal-bar">{label}</figcaption> : null}
      <pre>
        <code>{children}</code>
      </pre>
    </figure>
  );
}

/** A single shell command with a copy button, styled like the landing terminal. */
export function CopyBox({ text }: { text: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const code = useRef<HTMLElement>(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy() {
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
    } catch {
      if (code.current) {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(code.current);
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      setStatus("failed");
    }
    timer.current = setTimeout(() => setStatus("idle"), 2200);
  }
  return (
    <div className="docs-terminal">
      <div className="docs-command">
        <span aria-hidden="true">$</span>
        <code ref={code}>{text}</code>
        <span className="docs-copy-status" role="status">
          {status === "copied" ? "Copied" : status === "failed" ? "Selected - copy manually" : ""}
        </span>
        <button
          type="button"
          className="copy-button"
          onClick={copy}
          aria-label={`Copy command: ${text}`}
          title="Copy command"
        >
          {status === "copied" ? <Check size={15} /> : <Copy size={15} />}
        </button>
      </div>
    </div>
  );
}

export function Faq({ question, children }: { question: string; children: ReactNode }) {
  return (
    <details className="docs-faq">
      <summary>{question}</summary>
      <div>{children}</div>
    </details>
  );
}

/** Small brand mark slot so img-based and svg-based logos align in tables. */
export function Mark({ logo }: { logo: ReactNode }) {
  if (!logo) {
    return <span className="docs-mark" />;
  }
  return (
    <span className="docs-mark">{typeof logo === "string" ? <img src={logo} alt="" /> : logo}</span>
  );
}

/** Lazy, privacy-enhanced YouTube embed at 16:9. */
export function Video({ youtubeId, title }: { youtubeId: string; title: string }) {
  return (
    <figure className="docs-video">
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${youtubeId}`}
        title={title}
        loading="lazy"
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
      <figcaption>
        {title} ·{" "}
        <a
          href={`https://www.youtube.com/watch?v=${youtubeId}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Watch on YouTube
        </a>
      </figcaption>
    </figure>
  );
}
