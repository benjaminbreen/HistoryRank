#!/usr/bin/env node
/**
 * HistoryBench v1.0: Extract stratified samples for LLM historical reasoning benchmark.
 *
 * Pulls 20 descriptions per model (4 per rank tier) from the rankings table.
 * Tiers: top-10, 11-50, 51-100, 101-500, 500+
 * Uses deterministic hashing so results are reproducible.
 *
 * Output: data/derived/historybench-samples-v1.json (v1.0 expanded samples)
 *         data/derived/historybench-samples.json    (kept for backwards compat)
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, '..', '..', 'historyrank.db');
const OUT_PATH_V1 = path.join(__dirname, '..', '..', 'data', 'derived', 'historybench-samples-v1.json');
const OUT_PATH_LEGACY = path.join(__dirname, '..', '..', 'data', 'derived', 'historybench-samples.json');

const SAMPLES_PER_TIER = 4;

// Deterministic hash for seeded sampling
function hashSeed(str) {
  return parseInt(crypto.createHash('md5').update(str).digest('hex').slice(0, 8), 16);
}

// Pick N items deterministically from an array using a seed string (without replacement)
function seededPickN(arr, n, seed) {
  if (arr.length === 0) return [];
  if (arr.length <= n) return [...arr];

  // Seeded Fisher-Yates to shuffle, then take first n
  const shuffled = [...arr];
  let s = hashSeed(seed);
  for (let i = shuffled.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, n);
}

const TIERS = [
  { label: 'top-10',   min: 1,   max: 10 },
  { label: '11-50',    min: 11,  max: 50 },
  { label: '51-100',   min: 51,  max: 100 },
  { label: '101-500',  min: 101, max: 500 },
  { label: '500+',     min: 501, max: 999999 },
];

function main() {
  const db = new Database(DB_PATH, { readonly: true });

  // Get all models
  const models = db.prepare('SELECT DISTINCT source FROM rankings ORDER BY source').all().map(r => r.source);
  console.log(`Found ${models.length} models: ${models.join(', ')}`);
  console.log(`Sampling ${SAMPLES_PER_TIER} per tier × ${TIERS.length} tiers = ${SAMPLES_PER_TIER * TIERS.length} per model`);
  console.log(`Target total: ${models.length * SAMPLES_PER_TIER * TIERS.length} samples\n`);

  const samples = [];

  for (const model of models) {
    for (const tier of TIERS) {
      // Get all rankings for this model in this tier that have a non-empty contribution
      // Prefer sample_id = 'list-1' for consistency across models
      let rows = db.prepare(`
        SELECT r.figure_id, f.canonical_name, r.rank, r.contribution, r.sample_id
        FROM rankings r
        JOIN figures f ON r.figure_id = f.id
        WHERE r.source = ?
          AND r.rank >= ? AND r.rank <= ?
          AND r.contribution IS NOT NULL
          AND LENGTH(TRIM(r.contribution)) > 10
          AND r.sample_id = 'list-1'
        ORDER BY r.rank
      `).all(model, tier.min, tier.max);

      if (rows.length === 0) {
        // Fallback: try any sample_id
        rows = db.prepare(`
          SELECT r.figure_id, f.canonical_name, r.rank, r.contribution, r.sample_id
          FROM rankings r
          JOIN figures f ON r.figure_id = f.id
          WHERE r.source = ?
            AND r.rank >= ? AND r.rank <= ?
            AND r.contribution IS NOT NULL
            AND LENGTH(TRIM(r.contribution)) > 10
          ORDER BY r.rank
        `).all(model, tier.min, tier.max);
      }

      if (rows.length === 0) {
        console.warn(`  Warning: ${model} has no entries in tier ${tier.label}`);
        continue;
      }

      const picks = seededPickN(rows, SAMPLES_PER_TIER, `v1-${model}-${tier.label}-bench`);
      for (const pick of picks) {
        samples.push({
          model,
          figureId: pick.figure_id,
          figureName: pick.canonical_name,
          rank: pick.rank,
          tier: tier.label,
          sampleId: pick.sample_id,
          contribution: pick.contribution.trim(),
        });
      }
    }
  }

  db.close();

  // Sort by model, then tier order, then rank
  const tierOrder = Object.fromEntries(TIERS.map((t, i) => [t.label, i]));
  samples.sort((a, b) =>
    a.model.localeCompare(b.model) ||
    tierOrder[a.tier] - tierOrder[b.tier] ||
    a.rank - b.rank
  );

  // Write v1 output
  fs.writeFileSync(OUT_PATH_V1, JSON.stringify(samples, null, 2));
  console.log(`Extracted ${samples.length} samples → ${OUT_PATH_V1}`);

  // Also write legacy path for backwards compat
  fs.writeFileSync(OUT_PATH_LEGACY, JSON.stringify(samples, null, 2));

  // Summary table
  console.log('\nSamples per model:');
  const byModel = {};
  for (const s of samples) {
    byModel[s.model] = (byModel[s.model] || 0) + 1;
  }
  for (const [model, count] of Object.entries(byModel).sort()) {
    console.log(`  ${model.padEnd(28)} ${count}`);
  }

  // Tier summary
  console.log('\nSamples per tier:');
  const byTier = {};
  for (const s of samples) {
    byTier[s.tier] = (byTier[s.tier] || 0) + 1;
  }
  for (const tier of TIERS) {
    console.log(`  ${tier.label.padEnd(12)} ${byTier[tier.label] || 0}`);
  }
}

main();
