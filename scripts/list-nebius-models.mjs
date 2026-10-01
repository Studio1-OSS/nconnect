#!/usr/bin/env node
/**
 * List the live Nebius Token Factory model catalog with modality and pricing.
 *
 * nconnect builds its model catalog dynamically from this same endpoint
 * (`GET /v1/models?verbose=true`), which returns id, name, context_length,
 * `architecture.modality` ("text->text" vs "text+image->text"), and per-token
 * pricing. This script prints it so you can see exactly what the tool will pick
 * up. Note: Nebius reports a placeholder context_length (8000) for a few
 * flagships; nconnect floors those via a small curated override.
 *
 * Usage:
 *   NEBIUS_API_KEY=... node scripts/list-nebius-models.mjs
 */

const BASE_URL = process.env.NEBIUS_BASE_URL ?? "https://api.tokenfactory.nebius.com/v1";
const apiKey = process.env.NEBIUS_API_KEY;

if (!apiKey) {
  console.error("NEBIUS_API_KEY is not set. Export it and re-run.");
  process.exit(1);
}

const res = await fetch(`${BASE_URL}/models?verbose=true`, {
  headers: { Authorization: `Bearer ${apiKey}` },
});

if (!res.ok) {
  console.error(`GET /models?verbose=true failed: ${res.status} ${res.statusText}`);
  console.error(await res.text());
  process.exit(1);
}

const body = await res.json();
const models = Array.isArray(body?.data) ? body.data : [];
models.sort((a, b) => String(a.id).localeCompare(String(b.id)));

const perMillion = (v) => {
  const n = typeof v === "string" ? Number.parseFloat(v) : (v ?? 0);
  return Number.isFinite(n) ? (n * 1_000_000).toFixed(2) : "0.00";
};

console.log(`${models.length} models on ${BASE_URL}:\n`);
console.log(
  `  ${"id".padEnd(42)} ${"modality".padEnd(18)} ${"ctx".padStart(8)}  $in/$out per Mtok`,
);
for (const model of models) {
  const modality = model.architecture?.modality ?? "?";
  const ctx = String(model.context_length ?? "?").padStart(8);
  const price = `${perMillion(model.pricing?.prompt)}/${perMillion(model.pricing?.completion)}`;
  console.log(`  ${String(model.id).padEnd(42)} ${modality.padEnd(18)} ${ctx}  ${price}`);
}
