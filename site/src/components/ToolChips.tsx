"use client";

import { useEffect, useState } from "react";

const STEP_MS = 700;

const Icons: Record<string, React.ReactNode> = {
  think: <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />,
  write: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" /></g>,
  run: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 17l6-5-6-5M12 19h8" /></g>,
  read: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></g>,
};

export type ToolDetailLine = { text: string; tone?: "add" };
export type ToolStep = { icon: string; label: string; chip: string; mono: boolean; detailMono: boolean; detail: ToolDetailLine[] };
export type ToolDiff = { file: string; add: number; del: number };
export type ToolDiffLine = { text: string; tone: "add" | "del" | "ctx" };
export type ToolChipsLabels = { header: string; more: string };

const DEFAULT_LABELS: ToolChipsLabels = { header: "4 tool calls, 2 messages", more: "+2 more" };

const ROWS: ToolStep[] = [
  { icon: "think", label: "Thinking", chip: "Planning the churn schedule…", mono: false, detailMono: false, detail: [{ text: "Weekend demand carries pistachio, so it churns first." }, { text: "Batch capacity leaves two evening freezer windows." }] },
  { icon: "write", label: "Write 204 lines", chip: "ChurnSchedule.tsx", mono: true, detailMono: true, detail: [{ text: "+ const windows = slots.filter((s) => s.temp <= -12)", tone: "add" }, { text: "+ return schedule(windows, { hero: \"pistachio\" })", tone: "add" }] },
  { icon: "run", label: "Rebuild and verify", chip: "npm run freeze", mono: true, detailMono: true, detail: [{ text: "✓ built in 1.2s" }, { text: "✓ 34 checks passed" }] },
  { icon: "read", label: "Read image", chip: "flavor-chart.png", mono: true, detailMono: false, detail: [{ text: "1280 × 720 · line chart, three summers." }, { text: "Mint chip trends up 12% through July." }] },
];

const DIFFS: ToolDiff[] = [
  { file: "flavors.css", add: 13, del: 0 },
  { file: "ChurnSchedule.tsx", add: 74, del: 41 },
  { file: "menu.ts", add: 8, del: 2 },
];

const DIFF_LINES: Record<string, ToolDiffLine[]> = {
  "flavors.css": [{ text: ".scoop-card {", tone: "ctx" }, { text: "  gap: 14px;", tone: "del" }, { text: "  gap: 12px;", tone: "add" }, { text: "  container-type: inline-size;", tone: "add" }, { text: "}", tone: "ctx" }],
  "ChurnSchedule.tsx": [{ text: "const slots = coldSlots(week);", tone: "ctx" }, { text: "const windows = slots;", tone: "del" }, { text: "const windows = slots.filter(", tone: "add" }, { text: "  (s) => s.temp <= -12,", tone: "add" }, { text: ");", tone: "add" }],
  "menu.ts": [{ text: "export const hero = \"mint-chip\";", tone: "del" }, { text: "export const hero = \"pistachio\";", tone: "add" }],
};

export default function ToolChips({
  steps = ROWS,
  diffs = DIFFS,
  diffLines = DIFF_LINES,
  labels,
  className,
  onOpenChange,
  onToggleRow,
}: {
  variant?: string;
  steps?: ToolStep[];
  diffs?: ToolDiff[];
  diffLines?: Record<string, ToolDiffLine[]>;
  labels?: Partial<ToolChipsLabels>;
  className?: string;
  onOpenChange?: (open: boolean) => void;
  onToggleRow?: (label: string, open: boolean) => void;
} = {}) {
  const copy = { ...DEFAULT_LABELS, ...labels };
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(true);
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  const total = steps.length + 1;

  useEffect(() => {
    if (step >= total) return;
    const t = setTimeout(() => setStep((s) => s + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [step, total]);

  const toggleRow = (label: string) =>
    setOpenRows((current) => {
      const next = new Set(current);
      next.has(label) ? next.delete(label) : next.add(label);
      onToggleRow?.(label, next.has(label));
      return next;
    });

  return (
    <div
      className={className}
      style={{ width: "100%", minHeight: 180, paddingBottom: 4, fontFamily: "var(--font-sans, system-ui)" }}
    >
      {/* header */}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(v => { onOpenChange?.(!v); return !v; })}
        style={{
          display: "flex", alignItems: "center", gap: 6, padding: "4px 6px",
          marginLeft: -6, borderRadius: 6, border: "none", background: "transparent",
          cursor: "pointer", fontSize: 12.5, color: "var(--relay-muted)", transition: "background 100ms",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,0,0,0.04)")}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
          style={{ transition: "transform 200ms", transform: open ? "rotate(0deg)" : "rotate(-90deg)", flexShrink: 0 }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{copy.header}</span>
      </button>

      {/* rows */}
      <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0, transition: "grid-template-rows 300ms cubic-bezier(0.23,1,0.32,1), opacity 300ms" }}>
        <div style={{ overflow: "hidden", paddingLeft: 2, paddingRight: 2 }}>
          <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>
            {steps.slice(0, step).map((row) => {
              const rowOpen = openRows.has(row.label);
              return (
                <div key={row.label} style={{ animation: "fade-up 300ms cubic-bezier(0.23,1,0.32,1) both" }}>
                  <button
                    type="button"
                    aria-expanded={rowOpen}
                    onClick={() => toggleRow(row.label)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      width: "100%", minWidth: 0, height: 30,
                      padding: "0 4px", margin: "0 -4px", width: "calc(100% + 8px)",
                      background: "transparent", border: "none", borderRadius: 6,
                      cursor: "pointer", textAlign: "left", transition: "background 100ms",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,0,0,0.04)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    {/* icon */}
                    <span style={{ position: "relative", display: "flex", width: 16, height: 16, flexShrink: 0, alignItems: "center", justifyContent: "center", color: "var(--relay-muted)" }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill={row.icon === "think" ? "currentColor" : "none"} stroke="currentColor">
                        {Icons[row.icon]}
                      </svg>
                    </span>
                    {/* label */}
                    <span style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 500, color: "var(--relay-ink)" }}>{row.label}</span>
                    {/* chip */}
                    <span style={{
                      display: "inline-flex", alignItems: "center", flex: 1, minWidth: 0,
                      height: 22, padding: "0 6px", borderRadius: 5,
                      background: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.07)",
                      fontSize: row.mono ? 11 : 11.5, color: "var(--relay-muted)",
                      fontFamily: row.mono ? "SF Mono, JetBrains Mono, Menlo, monospace" : "inherit",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {row.chip}
                    </span>
                    {/* chevron */}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                      style={{ flexShrink: 0, color: "var(--relay-muted)", opacity: 0.5, transform: rowOpen ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 200ms" }}>
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>

                  {/* expanded detail */}
                  <div style={{ display: "grid", gridTemplateRows: rowOpen ? "1fr" : "0fr", opacity: rowOpen ? 1 : 0, transition: "grid-template-rows 300ms cubic-bezier(0.23,1,0.32,1), opacity 300ms" }}>
                    <div style={{ overflow: "hidden" }}>
                      <div style={{ marginTop: 2, marginBottom: 4, marginLeft: 8, paddingLeft: 14, paddingTop: 2, paddingBottom: 2, borderLeft: "1px solid var(--relay-line)", display: "flex", flexDirection: "column", gap: 2 }}>
                        {row.detail.map((line) => (
                          <span key={line.text} style={{ fontSize: 11.5, lineHeight: 1.6, color: line.tone === "add" ? "#16a34a" : "var(--relay-muted)", fontFamily: row.detailMono ? "SF Mono, JetBrains Mono, Menlo, monospace" : "inherit", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {line.text}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* file-diff chips */}
          {step >= total && diffs.length > 0 && (
            <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6, borderTop: "1px solid var(--relay-line)", paddingTop: 10 }}>
              {diffs.map((d, i) => (
                <span key={d.file} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 26, padding: "0 8px", borderRadius: 6, background: "#fff", border: "1px solid var(--relay-line)", fontFamily: "SF Mono, JetBrains Mono, Menlo, monospace", fontSize: 11, color: "var(--relay-ink)", boxShadow: "0 1px 2px rgba(0,0,0,0.04)", animation: `fade-up 250ms cubic-bezier(0.23,1,0.32,1) ${i * 60}ms both` }}>
                  <span style={{ maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.file}</span>
                  <span style={{ color: "#16a34a", fontVariantNumeric: "tabular-nums" }}>+{d.add}</span>
                  {d.del > 0 && <span style={{ color: "#dc2626", fontVariantNumeric: "tabular-nums" }}>−{d.del}</span>}
                </span>
              ))}
              {copy.more && (
                <span style={{ display: "inline-flex", alignItems: "center", height: 26, padding: "0 6px", fontSize: 11, fontFamily: "SF Mono, JetBrains Mono, Menlo, monospace", color: "var(--relay-muted)", animation: `fade-up 250ms cubic-bezier(0.23,1,0.32,1) ${diffs.length * 60}ms both` }}>
                  {copy.more}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
