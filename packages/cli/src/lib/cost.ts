import {
  costPerToken,
  findModelById,
  getDefaultModel,
  type ModelDefinition,
} from "@nconnect/models";
import { APPROX_CHARS_PER_TOKEN } from "./claude/context-budget.js";

/**
 * Proxy-side cost tracking for the selected Nebius model.
 *
 * Claude Code computes the `/usage` dollar figure locally from an Anthropic
 * pricing table it can't apply to non-Anthropic Nebius models,
 * so its estimate is wrong for us. Since the proxy is the one talking to
 * Nebius and holds the real token counts, it tracks cost itself using the
 * selected model's rates from @nconnect/models.
 */

/**
 * What a cached input token costs, as a fraction of the normal input price.
 *
 * Nebius serves cached prompts - `prompt_tokens_details.cached_tokens` comes
 * back populated - but its catalog publishes no cached-input price, so we have
 * no rate to read. Assuming they are free (the old behavior, `cache_read: 0`)
 * silently under-reports spend, and on a long agentic session most input
 * tokens are cache hits, so the error is not small. Default to charging them
 * at the normal input rate: an upper bound is a safer thing to show someone
 * watching their budget than a free lunch we cannot verify. Anyone who knows
 * their actual rate can set it - e.g. 0.1 for a 90%-off cache.
 */
export const CACHE_READ_RATIO_ENV = "NCONNECT_CACHE_READ_RATIO";
const DEFAULT_CACHE_READ_RATIO = 1;

export function cacheReadRatio(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[CACHE_READ_RATIO_ENV]?.trim();
  if (!raw) {
    return DEFAULT_CACHE_READ_RATIO;
  }
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    // A ratio above 1 would mean caching costs more than not caching, and a
    // negative one would credit the user. Both are misconfiguration - ignore
    // rather than report a number we know is wrong.
    return DEFAULT_CACHE_READ_RATIO;
  }
  return parsed;
}

function pricingFor(model: ModelDefinition): {
  inputPerToken: number;
  cachedInputPerToken: number;
  outputPerToken: number;
} {
  const inputPerToken = costPerToken(model.cost.input);
  // A catalog that does publish a cached price wins over the ratio; the ratio
  // only fills the gap Nebius leaves.
  const publishedCached = costPerToken(model.cost.cache_read);
  return {
    inputPerToken,
    cachedInputPerToken: publishedCached > 0 ? publishedCached : inputPerToken * cacheReadRatio(),
    outputPerToken: costPerToken(model.cost.output),
  };
}

export type TokenUsage = {
  promptTokens: number;
  cachedTokens: number;
  completionTokens: number;
  costUsd: number;
};

export type ModelTokenUsage = TokenUsage & { model: string };

export type TokenEstimator = { estimate(bytes: number): number };

// Calibration guards. The bytes-per-token ratio is only meaningful when the
// prompt is large enough that tokenizer overhead (system/special tokens) is
// negligible; tiny samples are skipped. The ratio is clamped to a sane range:
// ~1 byte/token (extremely token-dense) up to 16 bytes/token (e.g. CJK UTF-8
// or image/base64-heavy bodies that Nebius counts far more cheaply than the
// raw byte size suggests). Anything outside this range is a degenerate sample
// (vision expansion, mostly-binary content) - clamp rather than trust it.
const MIN_CALIBRATION_PROMPT_TOKENS = 64;
const MIN_BYTES_PER_TOKEN = 1;
const MAX_BYTES_PER_TOKEN = 16;

export class CostTracker {
  private readonly defaultMainModel: ModelDefinition;
  private promptTokens = 0;
  private cachedTokens = 0;
  private completionTokens = 0;
  private costUsd = 0;
  // Per-model breakdown, keyed by the real Nebius model id used for each
  // call. addUsage already resolves the actual model per request (it can
  // differ from the session's launch-time model when Claude Code's own
  // /model picker switches tiers without relaunching), so this is the only
  // place that knows the true usage split - the flat totals above discard it.
  private readonly byModel = new Map<string, TokenUsage>();
  // Vision sub-call spend is tracked separately so the summary can show it
  // distinctly and so we never mix GLM-5.2 rates with vision-model rates.
  private visionCalls = 0;
  private visionPromptTokens = 0;
  private visionCompletionTokens = 0;
  private visionCostUsd = 0;
  private externalSummary: string | undefined;
  // Running totals snapshot at the start of the current /v1/messages request,
  // so we can report a per-request delta on top of the session total.
  private requestStartCost = 0;
  private requestStartPrompt = 0;
  private requestStartCached = 0;
  private requestStartCompletion = 0;
  // Self-calibrating token-estimator state. `lastRequestRawBytes` is the inbound
  // body byte length recorded at request start (noteRequestBytes); `bytesPerToken`
  // is the calibrated ratio from the previous turn's real prompt_tokens. We only
  // calibrate on the FIRST addUsage of a request - tool loops make several Nebius
  // calls per inbound request, and only the first call's prompt_tokens corresponds
  // 1:1 to the inbound body. `pendingCalibration` is reset by beginRequest() so the
  // first addUsage of each request gets exactly one calibration shot.
  private lastRequestRawBytes: number | undefined;
  private bytesPerToken: number | undefined;
  private pendingCalibration = false;
  private readonly estimator: TokenEstimator = {
    estimate: (bytes: number): number => {
      const ratio = this.bytesPerToken ?? APPROX_CHARS_PER_TOKEN;
      return Math.max(1, Math.ceil(bytes / ratio));
    },
  };

  constructor(mainModel: ModelDefinition = getDefaultModel()) {
    this.defaultMainModel = mainModel;
  }

  /**
   * Begin a new /v1/messages request. A single request can span several
   * Nebius calls (tool loops); call this once per inbound request so the
   * per-request delta resets cleanly.
   */
  beginRequest(): void {
    this.requestStartCost = this.costUsd;
    this.requestStartPrompt = this.promptTokens;
    this.requestStartCached = this.cachedTokens;
    this.requestStartCompletion = this.completionTokens;
    // A new inbound request is starting: the next addUsage is the first call
    // for this request and is eligible to calibrate the estimator.
    this.pendingCalibration = true;
  }

  /**
   * Record the raw byte length of the inbound request body, captured at request
   * start by the proxy (via readJsonBodyWithSize). Used together with the first
   * addUsage's real prompt_tokens to self-calibrate the bytes-per-token ratio.
   */
  noteRequestBytes(rawBytes: number): void {
    this.lastRequestRawBytes = rawBytes > 0 ? rawBytes : undefined;
  }

  /**
   * Self-calibrating token estimator. estimate(bytes) returns an approximate
   * token count from a raw byte length, using the calibrated bytes-per-token
   * ratio when at least one turn of ground truth exists, else falling back to
   * APPROX_CHARS_PER_TOKEN (4). Lets the proxy estimate input tokens without
   * re-serializing the payload every turn.
   */
  get tokenEstimator(): TokenEstimator {
    return this.estimator;
  }

  /**
   * Record one Nebius chat-completions call. `promptTokens` is the total
   * input token count Nebius reports; `cachedTokens` is the subset that hit
   * the shared prefix cache (Nebius's `cached_tokens` field) and is billed at
   * the cached rate (see cacheReadRatio). Returns this call's incremental cost.
   */
  addUsage(
    promptTokens: number,
    cachedTokens: number,
    completionTokens: number,
    model: ModelDefinition = this.defaultMainModel,
  ): number {
    // Calibrate the estimator on the first Nebius call of this inbound
    // request only. The first call's prompt_tokens corresponds 1:1 to the
    // inbound body we measured with noteRequestBytes; later tool-loop calls
    // see an accumulated (different) prompt and must not recalibrate. Vision
    // sub-calls go through addVisionUsage and never reach here.
    if (this.pendingCalibration) {
      this.pendingCalibration = false;
      if (this.lastRequestRawBytes !== undefined && promptTokens >= MIN_CALIBRATION_PROMPT_TOKENS) {
        const ratio = this.lastRequestRawBytes / promptTokens;
        if (Number.isFinite(ratio) && ratio > 0) {
          this.bytesPerToken = Math.min(MAX_BYTES_PER_TOKEN, Math.max(MIN_BYTES_PER_TOKEN, ratio));
        }
      }
    }
    const pricing = pricingFor(model);
    const cached = Math.max(0, Math.min(cachedTokens, promptTokens));
    const nonCachedInput = Math.max(0, promptTokens - cached);
    const cost =
      nonCachedInput * pricing.inputPerToken +
      cached * pricing.cachedInputPerToken +
      completionTokens * pricing.outputPerToken;

    this.promptTokens += promptTokens;
    this.cachedTokens += cached;
    this.completionTokens += completionTokens;
    this.costUsd += cost;

    const bucket = this.byModel.get(model.id) ?? {
      promptTokens: 0,
      cachedTokens: 0,
      completionTokens: 0,
      costUsd: 0,
    };
    bucket.promptTokens += promptTokens;
    bucket.cachedTokens += cached;
    bucket.completionTokens += completionTokens;
    bucket.costUsd += cost;
    this.byModel.set(model.id, bucket);

    return cost;
  }

  /**
   * Record one image-description sub-call to a vision model. Billed at that
   * model's own rates (not GLM-5.2's). Vision cached-token discounts vary per
   * model and aren't always reported; treated as 0 when absent.
   */
  addVisionUsage(model: string, promptTokens: number, completionTokens: number): number {
    // Price from the live catalog so a newly added vision model is costed
    // correctly. Unknown ids (not in the catalog) contribute no cost.
    const definition = findModelById(model);
    if (!definition) {
      return 0;
    }
    const cost =
      promptTokens * costPerToken(definition.cost.input) +
      completionTokens * costPerToken(definition.cost.output);
    this.visionCalls += 1;
    this.visionPromptTokens += promptTokens;
    this.visionCompletionTokens += completionTokens;
    this.visionCostUsd += cost;
    this.costUsd += cost;

    const bucket = this.byModel.get(model) ?? {
      promptTokens: 0,
      cachedTokens: 0,
      completionTokens: 0,
      costUsd: 0,
    };
    bucket.promptTokens += promptTokens;
    bucket.completionTokens += completionTokens;
    bucket.costUsd += cost;
    this.byModel.set(model, bucket);

    return cost;
  }

  setExternalSummary(summary: string): void {
    this.externalSummary = summary;
  }

  hydrateUsage(totals: Partial<TokenUsage>, externalSummary?: string): void {
    this.promptTokens = totals.promptTokens ?? 0;
    this.cachedTokens = Math.max(0, Math.min(totals.cachedTokens ?? 0, this.promptTokens));
    this.completionTokens = totals.completionTokens ?? 0;
    this.costUsd = totals.costUsd ?? 0;
    this.externalSummary = externalSummary;
    // Hydration restores a flat snapshot (e.g. daemon restart recovery), which
    // has no per-model breakdown. Fold it into the default model's bucket
    // rather than losing it from the breakdown entirely.
    this.byModel.set(this.defaultMainModel.id, { ...this.totals });
    this.beginRequest();
  }

  get totals(): TokenUsage {
    return {
      promptTokens: this.promptTokens,
      cachedTokens: this.cachedTokens,
      completionTokens: this.completionTokens,
      costUsd: this.costUsd,
    };
  }

  /** Per-model usage breakdown, e.g. when Claude Code's /model picker switches tiers mid-session. */
  get totalsByModel(): ModelTokenUsage[] {
    return Array.from(this.byModel.entries()).map(([model, usage]) => ({ model, ...usage }));
  }

  get requestDelta(): TokenUsage {
    return {
      promptTokens: this.promptTokens - this.requestStartPrompt,
      cachedTokens: this.cachedTokens - this.requestStartCached,
      completionTokens: this.completionTokens - this.requestStartCompletion,
      costUsd: this.costUsd - this.requestStartCost,
    };
  }

  /** One-line session summary suitable for a single stderr line at shutdown. */
  summarize(): string {
    if (this.externalSummary) {
      return this.externalSummary;
    }
    const main =
      `[nconnect cost] session total: $${this.costUsd.toFixed(4)} ` +
      `(${this.formatTokens(this.promptTokens)} in` +
      (this.cachedTokens > 0 ? ` incl ${this.formatTokens(this.cachedTokens)} cached` : "") +
      `, ${this.formatTokens(this.completionTokens)} out)`;
    if (this.visionCalls > 0) {
      return (
        `${main}\n[nconnect cost] vision: ${this.visionCalls} image(s), ` +
        `$${this.visionCostUsd.toFixed(4)} ` +
        `(${this.formatTokens(this.visionPromptTokens)} in, ${this.formatTokens(this.visionCompletionTokens)} out)`
      );
    }
    return main;
  }

  private formatTokens(n: number): string {
    return n.toLocaleString("en-US");
  }
}
