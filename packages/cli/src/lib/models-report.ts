import {
  getAllModels,
  getDefaultModel,
  getSelectableModels,
  isInSourceCatalog,
  type ModelDefinition,
} from "@nconnect/models";
import { claudeTierModels, type ClaudeTier } from "./claude/core.js";
import { backgroundModel } from "./claude/request-routing.js";

/**
 * `nconnect models`: the live Nebius lineup NConnect routes to - what each
 * model costs, how much context it takes, and where it shows up (the default,
 * the Claude Code `/model` tier it fills, the background model). Reads the
 * catalog the CLI already loaded from Nebius (plus models.dev metadata); no
 * a separate network path: it loads the catalog exactly as a launch does
 * (cached for hours, so usually no request at all).
 */

export type ModelRow = {
  id: string;
  name: string;
  contextTokens: number;
  outputTokens: number;
  /** USD per million tokens. */
  inputPrice: number;
  outputPrice: number;
  vision: boolean;
  toolCall: boolean;
  reasoning: boolean;
  default: boolean;
  /** Claude Code `/model` tiers this model fills, e.g. ["Opus"]. */
  claudeTiers: string[];
  /** Runs Claude Code's background calls (classifier, titles). */
  background: boolean;
  /** Listed in the harness model pickers (false: reachable via --model only). */
  inPicker: boolean;
  /**
   * In Nebius's own model list. False for bundled fallbacks NConnect adds when
   * the list omits them (they may not be served), and for a model a Claude tier
   * points at that the list lacks - shown so every tier in Claude Code's menu
   * has a row.
   */
  inCatalog: boolean;
};

const TIER_LABEL: Record<ClaudeTier, string> = {
  OPUS: "Opus",
  SONNET: "Sonnet",
  HAIKU: "Haiku",
  FABLE: "Fable",
};

export function buildModelRows(options: { all?: boolean } = {}): ModelRow[] {
  const picker = getSelectableModels();
  const pickerIds = new Set(picker.map((m) => m.id));
  const hidden = options.all ? getAllModels().filter((m) => !pickerIds.has(m.id)) : [];
  const defaultId = getDefaultModel().id;
  const backgroundId = backgroundModel()?.definition.id;
  const tiers = claudeTierModels();
  const tiersById = new Map<string, string[]>();
  for (const tier of ["OPUS", "SONNET", "HAIKU", "FABLE"] as const) {
    const id = tiers[tier].definition.id;
    tiersById.set(id, [...(tiersById.get(id) ?? []), TIER_LABEL[tier]]);
  }
  const row = (m: ModelDefinition, inPicker: boolean): ModelRow => ({
    id: m.id,
    name: m.name,
    contextTokens: m.limit.context,
    outputTokens: m.limit.output,
    inputPrice: m.cost.input,
    outputPrice: m.cost.output,
    vision: m.attachment,
    toolCall: m.tool_call,
    reasoning: m.reasoning,
    default: m.id === defaultId,
    claudeTiers: tiersById.get(m.id) ?? [],
    background: m.id === backgroundId,
    inPicker,
    inCatalog: isInSourceCatalog(m.id),
  });
  const rows = [...picker.map((m) => row(m, true)), ...hidden.map((m) => row(m, false))];
  // Every model a Claude tier points at gets a row, even if it is not in the
  // listed set (e.g. the Haiku-tier backend absent from the live catalog), so
  // the report cannot drift from the menu Claude Code is launched with.
  for (const tier of ["OPUS", "SONNET", "HAIKU", "FABLE"] as const) {
    const definition = tiers[tier].definition;
    if (!rows.some((r) => r.id === definition.id)) {
      rows.push(row(definition, false));
    }
  }
  return rows;
}

/**
 * Context in the units Nebius and our docs use: decimal, one decimal place
 * where it matters. 1048576 -> "1M", 1024000 -> "1M", 979000 -> "979K",
 * 262144 -> "262K", 1500000 -> "1.5M".
 */
export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    const m = Math.round(tokens / 100_000) / 10;
    return `${Number.isInteger(m) ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${Math.round(tokens / 1_000)}K`;
  }
  return String(tokens);
}

/** USD per million: two decimals, three only below a cent. 0 means not published. */
export function formatPrice(perMillion: number): string {
  if (!Number.isFinite(perMillion) || perMillion <= 0) {
    return "n/a";
  }
  return perMillion < 0.01 ? perMillion.toFixed(3) : perMillion.toFixed(2);
}

function notes(row: ModelRow): string {
  const parts: string[] = [];
  if (row.default) parts.push("default");
  if (row.claudeTiers.length > 0) parts.push(`Claude ${row.claudeTiers.join("/")}`);
  if (row.background) parts.push("background calls");
  if (row.vision) parts.push("vision");
  if (!row.reasoning) parts.push("no reasoning");
  if (!row.toolCall) parts.push("no tools");
  if (!row.inCatalog) parts.push("not in Nebius's live catalog");
  else if (row.inputPrice <= 0 && row.outputPrice <= 0) {
    parts.push("price not published by Nebius");
  }
  return parts.join(", ");
}

/** Render the table. Returns the exact text to print. */
export function formatModelsReport(
  rows: readonly ModelRow[],
  options: { all?: boolean } = {},
): string {
  const picker = rows.filter((r) => r.inPicker);
  const hidden = rows.filter((r) => !r.inPicker && r.inCatalog);
  // Picker rows stay in the picker list (flagged in Notes); only tier models
  // that are neither listed nor in Nebius's list get their own section.
  const tierOnly = rows.filter((r) => !r.inPicker && !r.inCatalog);
  const idWidth = Math.max(8, ...rows.map((r) => r.id.length));
  const header =
    `  ${"Model ID".padEnd(idWidth)}  ${"Context".padStart(7)}  ${"$/M in".padStart(7)}  ` +
    `${"$/M out".padStart(7)}  Notes`;
  const line = (r: ModelRow) =>
    `  ${r.id.padEnd(idWidth)}  ${formatTokens(r.contextTokens).padStart(7)}  ` +
    `${formatPrice(r.inputPrice).padStart(7)}  ${formatPrice(r.outputPrice).padStart(7)}  ${notes(r)}`.trimEnd();

  const out: string[] = [];
  out.push(`NConnect models - live Nebius Token Factory catalog (${picker.length} in the picker)`);
  out.push("");
  out.push(header);
  out.push(...picker.map(line));
  if (tierOnly.length > 0) {
    out.push("");
    out.push("Used by a Claude Code tier but missing from Nebius's live catalog:");
    out.push(...tierOnly.map(line));
  }
  if (options.all) {
    out.push("");
    out.push(
      hidden.length > 0
        ? `Not in the picker (no tool calling) - still usable with --model:`
        : "Every model is in the picker.",
    );
    out.push(...hidden.map(line));
  }
  out.push("");
  out.push("Use one:   nconnect --model <model-id> claude   (or codex, opencode, ...)");
  out.push(
    "Prices are Nebius list prices per million tokens; cached input bills at the full rate.",
  );
  if (!options.all) {
    out.push("Add --all for models kept out of the picker, --json for machine-readable output.");
  }
  return out.join("\n");
}
