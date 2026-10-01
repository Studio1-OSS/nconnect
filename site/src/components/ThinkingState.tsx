"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

const STAGES = [800, 600, 1800, 2600, 1600];

export function useSequence(steps: number[]) {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (stage >= steps.length) {
      const t = setTimeout(() => setStage(0), 3000); // Wait 3s then restart
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setStage((s) => s + 1), steps[stage]);
    return () => clearTimeout(t);
  }, [stage, steps]);
  return stage;
}

type Row = {
  primary: string;
  secondary?: string;
  mono?: boolean;
  add?: number;
  del?: number;
  href?: string;
  total?: boolean;
};

const VARIANTS: Record<
  string,
  { active: string; done: string; rows: Row[]; query?: string }
> = {
  Steps: {
    active: "Thinking",
    done: "Thought for 4 seconds",
    rows: [
      { primary: "Reading flavor briefs" },
      { primary: "Scanning supplier lists" },
      { primary: "Comparing tasting notes", secondary: "6 flavors" },
      { primary: "Writing the scoop report" },
    ],
  },
  Reasoning: {
    active: "Thinking",
    done: "Thought for 4 seconds",
    rows: [
      { primary: "Summer demand spikes for stone-fruit flavors — peach and apricot lead." },
      { primary: "I should check cone inventory before promoting a waffle-bowl special." },
    ],
  },
  Search: {
    active: "Searching the web",
    done: "Searched the web",
    query: "best waffle cone supplier",
    rows: [
      { primary: "Joy Cone", secondary: "joycone.com", href: "https://joycone.com/fs_products/waffle-cones/" },
      { primary: "WebstaurantStore", secondary: "webstaurantstore.com", href: "https://www.webstaurantstore.com/ice-cream-shop-supplies.html" },
      { primary: "The Konery", secondary: "thekonery.com", href: "https://www.thekonery.com/" },
    ],
  },
  Coding: {
    active: "Running tools",
    done: "Ran 2 tools",
    rows: [
      { primary: "Read", secondary: "api/relay.ts, settings.ts", mono: true },
      { primary: "Edit", secondary: "api/relay.ts", mono: true, add: 12, del: 2 },
    ],
  },
  Config: {
    active: "Injecting config",
    done: "Injected provider config",
    rows: [
      { primary: "Generate temporary keys", secondary: "Success" },
      { primary: "Route local endpoints", secondary: "Active" },
    ],
  },
  Cost: {
    active: "Estimating cost",
    done: "Estimated session cost",
    rows: [
      { primary: "Prompt tokens", secondary: "24,000", mono: true },
      { primary: "Completion tokens", secondary: "3,500", mono: true },
      { primary: "Total cost", secondary: "$0.14", mono: true, total: true },
    ],
  },
};

function Dot({ tone }: { tone: string }) {
  return (
    <span className={`flex w-3.5 h-3.5 shrink-0 items-center justify-center rounded-full text-white ${tone}`}>
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <circle cx="12" cy="12" r="9" />
        <path d="M3.5 12h17M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
      </svg>
    </span>
  );
}

const TONES = ["bg-purple-500", "bg-orange-500", "bg-green-500"];

export interface ThinkingStateProps {
  variant?: string;
  theme?: "light" | "dark";
  onSettled?: () => void;
  rows?: Row[];
  active?: string;
  done?: string;
  icon?: ReactNode;
}

export function ThinkingState({
  variant = "Steps",
  theme = "light",
  onSettled,
  rows,
  active,
  done,
  icon,
}: {
  variant?: string;
  theme?: "light" | "dark";
  onSettled?: () => void;
  rows?: Row[];
  active?: string;
  done?: string;
  icon?: ReactNode;
}) {
  const stage = useSequence(STAGES);
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const base = VARIANTS[variant] ?? VARIANTS.Steps;
  const v = {
    ...base,
    rows: rows ?? base.rows,
    active: active ?? base.active,
    done: done ?? base.done,
  };
  const autoExpanded = stage >= 1 && stage < 4;
  const expanded = manualExpanded ?? autoExpanded;
  const working = stage < 3;
  const visible = stage < 2 ? 0 : stage === 2 ? Math.min(2, v.rows.length) : v.rows.length;
  const traceRef = useRef<HTMLDivElement>(null);
  const [lineHeight, setLineHeight] = useState(0);
  useLayoutEffect(() => {
    if (traceRef.current) setLineHeight(traceRef.current.offsetHeight);
  }, [visible, expanded, variant, stage]);

  const settledRef = useRef(false);
  useEffect(() => {
    if (working || settledRef.current) return;
    settledRef.current = true;
    onSettled?.();
  }, [working, onSettled]);

  return (
    <div
      key={variant}
      className="flex w-full max-w-[380px] flex-col font-mono"
      style={{
        minHeight: working || expanded ? 100 : undefined,
        transition: "min-height 400ms cubic-bezier(0.23,1,0.32,1)",
      }}
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setManualExpanded((current) => !(current ?? autoExpanded))}
        className={`flex w-fit items-center gap-2.5 rounded-lg px-3 py-1.5 transition-all duration-200 shadow-sm border ${
          theme === "dark"
            ? "bg-[#1a1a1a] border-[#333] hover:bg-[#262626]"
            : "bg-[#f4f4f5] border-gray-200/60 hover:bg-[#e4e4e7]"
        }`}
      >
        {working ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={theme === "dark" ? "#e5e5e5" : "var(--relay-ink)"} strokeWidth="2.5" className="shrink-0" style={{ animation: "spin 1s linear infinite" }}>
            <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
            <path d="M12 2a10 10 0 0 1 10 10" />
          </svg>
        ) : icon ? (
          <span className={`flex shrink-0 transition-colors duration-200 ${theme === "dark" ? "text-gray-400" : "text-[var(--relay-muted)]"}`}>
            {icon}
          </span>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill={theme === "dark" ? "#a3a3a3" : "var(--relay-muted)"}>
            <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
          </svg>
        )}
        <span role="status" className="contents">
          {working ? (
            <span
              className="bg-clip-text text-[13px] font-medium whitespace-nowrap text-transparent"
              style={{
                backgroundImage: theme === "dark" 
                  ? "linear-gradient(90deg, #a3a3a3 35%, #e5e5e5 50%, #a3a3a3 65%)"
                  : "linear-gradient(90deg, var(--relay-muted) 35%, var(--relay-ink) 50%, var(--relay-muted) 65%)",
                backgroundSize: "200% 100%",
                animation: "shimmer-text 1.4s linear infinite",
              }}
            >
              {v.active}
            </span>
          ) : (
            <span
              className="text-[13px] font-medium whitespace-nowrap"
              style={{ color: theme === "dark" ? "#a3a3a3" : "var(--relay-muted)", animation: "fade-in 350ms ease-out both" }}
            >
              {v.done}
            </span>
          )}
        </span>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={theme === "dark" ? "#a3a3a3" : "var(--relay-muted)"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
          className="transition-transform duration-300"
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)" }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      <div
        className="grid transition-[grid-template-rows,opacity] duration-400"
        style={{
          gridTemplateRows: expanded ? "1fr" : "0fr",
          opacity: expanded ? 1 : 0,
          transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
        }}
      >
        <div className="overflow-hidden">
          <div className="relative mt-1 ml-[5px] pl-4">
            <span
              aria-hidden
              className="absolute left-[3px] w-px"
              style={{ background: theme === "dark" ? "#333" : "var(--relay-line)", top: -8, height: lineHeight ? lineHeight - 2 : 0, transition: "height 500ms cubic-bezier(0.23,1,0.32,1)" }}
            />
            <div ref={traceRef} className="flex flex-col gap-1 py-1">
            {v.query && (
              <div className="flex h-6 items-center gap-2 px-1.5" style={{ animation: expanded ? "fade-up 300ms cubic-bezier(0.23,1,0.32,1) both" : undefined }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={theme === "dark" ? "#737373" : "var(--relay-muted)"} strokeWidth="2" strokeLinecap="round" className="shrink-0">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4.3-4.3" />
                </svg>
                <span className="text-[12.5px]" style={{ color: theme === "dark" ? "#737373" : "var(--relay-muted)" }}>{v.query}</span>
              </div>
            )}
            {v.rows.slice(0, visible).map((row, i) => {
              const content = (
                <>
                {variant === "Search" && <Dot tone={TONES[i % 3]} />}
                {variant === "Steps" && (
                  i < visible - 1 || !working ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={theme === "dark" ? "#737373" : "var(--relay-muted)"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  ) : (
                    <span className="w-3 h-3 shrink-0 rounded-full border-[1.5px]" style={{ borderColor: theme === "dark" ? "#333" : "var(--relay-line)", borderTopColor: theme === "dark" ? "#737373" : "var(--relay-muted)", animation: "spin 700ms linear infinite" }} />
                  )
                )}
                <span className={`min-w-0 truncate text-[12.5px] ${variant === "Reasoning" ? "whitespace-normal leading-relaxed" : "font-medium"} ${variant === "Search" ? "animated-underline" : ""} ${row.total ? "font-semibold" : ""}`} style={{ color: variant === "Reasoning" ? (theme === "dark" ? "#a3a3a3" : "var(--relay-muted)") : (theme === "dark" ? "#e5e5e5" : "var(--relay-ink)") }}>
                  {row.primary}
                </span>
                {row.secondary && (
                  <span className={`shrink-0 ml-auto text-[11.5px] ${row.mono ? "font-mono" : ""} ${row.total ? "font-semibold" : ""}`} style={{ color: row.total ? (theme === "dark" ? "#e5e5e5" : "var(--relay-ink)") : (theme === "dark" ? "#a3a3a3" : "var(--relay-muted)") }}>
                    {row.secondary}
                  </span>
                )}
                {row.add !== undefined && (
                  <span className="shrink-0 ml-auto font-mono text-[11px] tabular-nums">
                    <span className="text-green-500">+{row.add}</span>{" "}
                    <span className="text-red-500">−{row.del}</span>
                  </span>
                )}
                </>
              );
              const rowClass = "flex min-h-7 min-w-0 w-full sm:w-[240px] max-w-[260px] items-center gap-2 rounded-[6px] px-1.5 py-1 text-left";
              const animation = { animation: `fade-up 320ms cubic-bezier(0.23,1,0.32,1) ${i * 120}ms both` };

              if (variant === "Search") {
                return (
                  <a
                    key={row.primary}
                    href={row.href}
                    target="_blank"
                    rel="noreferrer"
                    className={`${rowClass} transition-colors duration-150 hover:bg-black/5`}
                    style={animation}
                  >
                    {content}
                  </a>
                );
              }

              if (variant === "Coding") {
                const selected = selectedTool === row.primary;
                return (
                  <button
                    key={row.primary}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setSelectedTool(selected ? null : row.primary)}
                    className={`${rowClass} transition-colors duration-150 ${selected ? "bg-black/10" : "hover:bg-black/5"}`}
                    style={animation}
                  >
                    {content}
                  </button>
                );
              }

              return (
                <div key={row.primary} className={rowClass} style={animation}>
                  {content}
                </div>
              );
            })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
