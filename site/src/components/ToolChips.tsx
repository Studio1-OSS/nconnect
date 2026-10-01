"use client";

import { useEffect, useState } from "react";

const STEP_MS = 750;

const Icons: Record<string, React.ReactNode> = {
  think: <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />,
  write: (
    <g
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
    </g>
  ),
  run: (
    <g
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 17l6-5-6-5M12 19h8" />
    </g>
  ),
  read: (
    <g
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </g>
  ),
};

export type ToolDetailLine = { text: string; tone?: "add" };
export type ToolStep = {
  icon: string;
  label: string;
  chip: string;
  mono: boolean;
  detailMono: boolean;
  detail: ToolDetailLine[];
};
export type ToolDiff = { file: string; add: number; del: number };
export type ToolChipsLabels = { header: string; more: string };

const DEFAULT_LABELS: ToolChipsLabels = { header: "4 tool calls, 2 messages", more: "+2 more" };

const ROWS: ToolStep[] = [
  {
    icon: "think",
    label: "Thinking",
    chip: "Planning the churn schedule…",
    mono: false,
    detailMono: false,
    detail: [
      { text: "Weekend demand carries pistachio, so it churns first." },
      { text: "Batch capacity leaves two evening freezer windows." },
    ],
  },
  {
    icon: "write",
    label: "Write 204 lines",
    chip: "ChurnSchedule.tsx",
    mono: true,
    detailMono: true,
    detail: [
      { text: "+ const windows = slots.filter((s) => s.temp <= -12)", tone: "add" },
      { text: '+ return schedule(windows, { hero: "pistachio" })', tone: "add" },
    ],
  },
  {
    icon: "run",
    label: "Rebuild and verify",
    chip: "npm run freeze",
    mono: true,
    detailMono: true,
    detail: [{ text: "✓ built in 1.2s" }, { text: "✓ 34 checks passed" }],
  },
  {
    icon: "read",
    label: "Read image",
    chip: "flavor-chart.png",
    mono: true,
    detailMono: false,
    detail: [
      { text: "1280 × 720 · line chart, three summers." },
      { text: "Mint chip trends up 12% through July." },
    ],
  },
];

const DIFFS: ToolDiff[] = [
  { file: "flavors.css", add: 13, del: 0 },
  { file: "ChurnSchedule.tsx", add: 74, del: 41 },
  { file: "menu.ts", add: 8, del: 2 },
];

function Cursor() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const t = setInterval(() => setOn((v) => !v), 500);
    return () => clearInterval(t);
  }, []);
  return (
    <span
      style={{
        display: "inline-block",
        width: 1.5,
        height: "0.85em",
        background: "currentColor",
        verticalAlign: "middle",
        marginLeft: 2,
        opacity: on ? 1 : 0,
        transition: "opacity 80ms",
      }}
    />
  );
}

export default function ToolChips({
  steps = ROWS,
  diffs = DIFFS,
  labels,
  className,
}: {
  variant?: string;
  steps?: ToolStep[];
  diffs?: ToolDiff[];
  diffLines?: Record<string, unknown[]>;
  labels?: Partial<ToolChipsLabels>;
  className?: string;
  onOpenChange?: (open: boolean) => void;
  onToggleRow?: (label: string, open: boolean) => void;
} = {}) {
  const copy = { ...DEFAULT_LABELS, ...labels };
  const [step, setStep] = useState(0);
  const total = steps.length + 1;
  const done = step >= total;

  useEffect(() => {
    if (step >= total) return;
    const t = setTimeout(() => setStep((s) => s + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [step, total]);

  const mono: React.CSSProperties = {
    fontFamily: "SF Mono, JetBrains Mono, ui-monospace, Menlo, monospace",
  };

  return (
    <div className={className} style={{ width: "100%", paddingBottom: 8 }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: "var(--relay-muted)", flexShrink: 0 }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
        <span
          style={{
            fontSize: 12,
            color: "var(--relay-muted)",
            fontVariantNumeric: "tabular-nums",
            letterSpacing: 0,
          }}
        >
          {copy.header}
        </span>
      </div>

      {/* tool rows — plain list, no card chrome */}
      <div style={{ display: "flex", flexDirection: "column", gap: 0, paddingLeft: 4 }}>
        {steps.slice(0, step).map((row, i) => {
          const isLast = i === step - 1 && !done;
          return (
            <div
              key={row.label}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 8,
                padding: "4px 0",
                animation: "fade-up 280ms cubic-bezier(0.23,1,0.32,1) both",
              }}
            >
              {/* icon */}
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  width: 14,
                  height: 14,
                  flexShrink: 0,
                  color: "var(--relay-muted)",
                  marginTop: 1,
                }}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill={row.icon === "think" ? "currentColor" : "none"}
                  stroke="currentColor"
                >
                  {Icons[row.icon]}
                </svg>
              </span>

              {/* label */}
              <span
                style={{
                  fontSize: 12.5,
                  fontWeight: 500,
                  color: "var(--relay-ink)",
                  flexShrink: 0,
                  whiteSpace: "nowrap",
                }}
              >
                {row.label}
              </span>

              {/* chip — no border, no bg, just muted mono text */}
              <span
                style={{
                  fontSize: row.mono ? 11 : 11.5,
                  color: "var(--relay-muted)",
                  ...(row.mono ? mono : {}),
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {row.chip}
                {isLast && <Cursor />}
              </span>
            </div>
          );
        })}

        {/* active spinner row while more steps are coming */}
        {!done && step < total && step === steps.length && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
            <span
              style={{
                width: 14,
                height: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  border: "1.5px solid var(--relay-line)",
                  borderTopColor: "var(--relay-muted)",
                  borderRadius: "50%",
                  display: "inline-block",
                  animation: "spin 700ms linear infinite",
                }}
              />
            </span>
            <span style={{ fontSize: 12.5, color: "var(--relay-muted)" }}>Computing…</span>
          </div>
        )}
      </div>

      {/* diff chips */}
      {done && diffs.length > 0 && (
        <div
          style={{
            marginTop: 12,
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            borderTop: "1px solid rgba(0,0,0,0.06)",
            paddingTop: 10,
          }}
        >
          {diffs.map((d, i) => (
            <span
              key={d.file}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                height: 24,
                padding: "0 8px",
                borderRadius: 5,
                background: "#fff",
                border: "1px solid var(--relay-line)",
                ...mono,
                fontSize: 10.5,
                color: "var(--relay-ink)",
                boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                animation: `fade-up 300ms cubic-bezier(0.23,1,0.32,1) ${i * 60}ms both`,
              }}
            >
              <span
                style={{
                  maxWidth: 110,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {d.file}
              </span>
              <span style={{ color: "#16a34a" }}>+{d.add}</span>
              {d.del > 0 && <span style={{ color: "#dc2626" }}>−{d.del}</span>}
            </span>
          ))}
          {copy.more && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: 24,
                fontSize: 10.5,
                color: "var(--relay-muted)",
                ...mono,
                animation: `fade-up 300ms cubic-bezier(0.23,1,0.32,1) ${diffs.length * 60}ms both`,
              }}
            >
              {copy.more}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
