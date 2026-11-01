import { describe, expect, test } from "vitest";
import { CACHE_READ_RATIO_ENV, CostTracker, cacheReadRatio } from "../../cli/src/lib/cost.js";
import { getDefaultModel } from "../../models/src/index.js";

describe("cached-token price ratio", () => {
  // For a model with no published cached price. Billing cache hits at zero - the
  // old behavior - under-reports spend, and on a long session most input tokens
  // are cache hits, so the error compounds.
  test("defaults to the full input rate, not free", () => {
    expect(cacheReadRatio({})).toBe(1);
  });

  test("an explicit discount is honored", () => {
    expect(cacheReadRatio({ [CACHE_READ_RATIO_ENV]: "0.1" })).toBeCloseTo(0.1);
    expect(cacheReadRatio({ [CACHE_READ_RATIO_ENV]: "0" })).toBe(0);
  });

  // A ratio >1 would mean caching costs more than not caching, and a negative
  // one would credit the user. Both are misconfiguration.
  test("out-of-range and unparseable values fall back rather than mislead", () => {
    for (const value of ["1.5", "-0.2", "cheap", ""]) {
      expect(cacheReadRatio({ [CACHE_READ_RATIO_ENV]: value })).toBe(1);
    }
  });
});

describe("cached tokens are billed", () => {
  test("a published cached rate is what a cache hit costs", () => {
    const model = getDefaultModel();
    expect(model.cost.cache_read).toBeGreaterThan(0);
    const tracker = new CostTracker(model);
    tracker.addUsage(10_000, 10_000, 0, model);

    expect(tracker.totals.costUsd).toBeCloseTo((10_000 * model.cost.cache_read) / 1_000_000, 10);
  });

  test("with no published rate, a fully-cached prompt still costs money", () => {
    const published = getDefaultModel();
    const model = { ...published, cost: { ...published.cost, cache_read: 0 } };
    const tracker = new CostTracker(model);
    tracker.addUsage(10_000, 10_000, 0, model);
    const totals = tracker.totals;

    expect(totals.cachedTokens).toBe(10_000);
    // The whole prompt was a cache hit; at the default ratio it is priced the
    // same as an uncached prompt of the same size.
    const expected = (10_000 * model.cost.input) / 1_000_000;
    expect(totals.costUsd).toBeCloseTo(expected, 10);
    expect(totals.costUsd).toBeGreaterThan(0);
  });
});
