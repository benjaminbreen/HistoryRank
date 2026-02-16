#!/usr/bin/env node
/**
 * HistoryBench v1.0: Extract subsets for historian (expert) review.
 *
 * Subset A — Factual Verification (20 descriptions):
 *   Stratified sample across models/tiers. Historian marks each as
 *   CORRECT, PARTIALLY_CORRECT, or INCORRECT with a brief note.
 *
 * Subset B — Pairwise Ranking Tests (10 pairs):
 *   Figure pairs where models disagree most on relative ordering.
 *   Historian judges which figure had greater historical influence.
 *
 * Both subsets are blinded (no model names).
 *
 * Requires: data/derived/historybench-samples-blinded.json
 *           data/derived/historybench-blind-key.json
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, '..', '..', 'historyrank.db');
const BLINDED_PATH = path.join(__dirname, '..', '..', 'data', 'derived', 'historybench-samples-blinded.json');
const OUT_FACTUAL = path.join(__dirname, '..', '..', 'data', 'derived', 'historian-review-factual.json');
const OUT_PAIRS = path.join(__dirname, '..', '..', 'data', 'derived', 'historian-review-pairs.json');

function hashSeed(str) {
  return parseInt(crypto.createHash('md5').update(str).digest('hex').slice(0, 8), 16);
}

function seededShuffle(arr, seed) {
  const result = [...arr];
  let s = hashSeed(seed);
  for (let i = result.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function main() {
  // ── Subset A: Factual Verification ──
  console.log('── Subset A: Factual Verification ──\n');

  if (!fs.existsSync(BLINDED_PATH)) {
    console.error('Blinded samples not found. Run blind-samples.cjs first.');
    process.exit(1);
  }

  const blinded = JSON.parse(fs.readFileSync(BLINDED_PATH, 'utf-8'));

  // Group by tier for stratified sampling
  const byTier = {};
  for (const entry of blinded) {
    if (!byTier[entry.tier]) byTier[entry.tier] = [];
    byTier[entry.tier].push(entry);
  }

  const tiers = Object.keys(byTier);
  const perTier = Math.ceil(20 / tiers.length); // 4 per tier for 5 tiers = 20

  const factualSubset = [];
  for (const tier of tiers) {
    const shuffled = seededShuffle(byTier[tier], `historian-factual-${tier}`);
    const picks = shuffled.slice(0, perTier);
    for (const pick of picks) {
      factualSubset.push({
        blindId: pick.blindId,
        figureName: pick.figureName,
        rank: pick.rank,
        tier: pick.tier,
        contribution: pick.contribution,
        // Fields for historian to fill in:
        historianVerdict: null,  // "CORRECT" | "PARTIALLY_CORRECT" | "INCORRECT"
        historianNote: null,     // brief explanation
      });
    }
  }

  // Shuffle the final set so they're not grouped by tier
  const factualShuffled = seededShuffle(factualSubset, 'historian-factual-final');

  fs.writeFileSync(OUT_FACTUAL, JSON.stringify(factualShuffled, null, 2));
  console.log(`Extracted ${factualShuffled.length} descriptions for factual review → ${OUT_FACTUAL}`);
  console.log('Tiers represented:', tiers.join(', '));
  console.log('');

  // ── Subset B: Pairwise Ranking Tests ──
  console.log('── Subset B: Pairwise Ranking Tests ──\n');

  const db = new Database(DB_PATH, { readonly: true });

  // Get all models' list-1 rankings
  const models = db.prepare('SELECT DISTINCT source FROM rankings ORDER BY source').all().map(r => r.source);

  const modelRanks = {}; // { model: { figureId: rank } }
  for (const model of models) {
    const rows = db.prepare(`
      SELECT figure_id, rank FROM rankings
      WHERE source = ? AND sample_id = 'list-1'
      ORDER BY rank
    `).all(model);
    modelRanks[model] = {};
    for (const row of rows) {
      modelRanks[model][row.figure_id] = row.rank;
    }
  }

  // Find figures that appear in most models (at least 10 of 13) and are in top 200
  const figureCounts = {};
  for (const model of models) {
    for (const [figId, rank] of Object.entries(modelRanks[model])) {
      if (rank <= 200) {
        figureCounts[figId] = (figureCounts[figId] || 0) + 1;
      }
    }
  }

  const commonFigures = Object.entries(figureCounts)
    .filter(([, count]) => count >= 10)
    .map(([id]) => id);

  console.log(`Found ${commonFigures.length} figures appearing in 10+ models' top 200`);

  // For each pair of common figures, compute the maximum rank disagreement
  // (max difference in relative ordering across models)
  const pairs = [];
  for (let i = 0; i < commonFigures.length; i++) {
    for (let j = i + 1; j < commonFigures.length; j++) {
      const figA = commonFigures[i];
      const figB = commonFigures[j];

      let aAboveB = 0;
      let bAboveA = 0;
      let maxDiff = 0;

      for (const model of models) {
        const rankA = modelRanks[model][figA];
        const rankB = modelRanks[model][figB];
        if (rankA == null || rankB == null) continue;

        if (rankA < rankB) aAboveB++;
        else if (rankB < rankA) bAboveA++;

        const diff = Math.abs(rankA - rankB);
        if (diff > maxDiff) maxDiff = diff;
      }

      // We want pairs where there's significant disagreement
      // i.e., neither figure has overwhelming consensus
      const total = aAboveB + bAboveA;
      if (total < 10) continue;

      const minority = Math.min(aAboveB, bAboveA);
      const disagreementScore = minority * maxDiff; // more balanced + bigger rank swings = more interesting

      pairs.push({
        figureA: figA,
        figureB: figB,
        aAboveB,
        bAboveA,
        maxDiff,
        disagreementScore,
      });
    }
  }

  // Sort by disagreement score descending, take top 10
  pairs.sort((a, b) => b.disagreementScore - a.disagreementScore);
  const topPairs = pairs.slice(0, 10);

  // Get figure names
  const figNames = {};
  const nameRows = db.prepare('SELECT id, canonical_name FROM figures').all();
  for (const row of nameRows) {
    figNames[row.id] = row.canonical_name;
  }

  const pairReview = topPairs.map((p, i) => ({
    pairId: i + 1,
    figureA: {
      id: p.figureA,
      name: figNames[p.figureA] || p.figureA,
    },
    figureB: {
      id: p.figureB,
      name: figNames[p.figureB] || p.figureB,
    },
    context: `${p.aAboveB} models rank ${figNames[p.figureA] || p.figureA} higher; ${p.bAboveA} models rank ${figNames[p.figureB] || p.figureB} higher. Max rank difference: ${p.maxDiff}.`,
    // Fields for historian to fill in:
    historianChoice: null,   // "A" | "B" | "TOO_CLOSE"
    historianNote: null,     // brief explanation
  }));

  db.close();

  fs.writeFileSync(OUT_PAIRS, JSON.stringify(pairReview, null, 2));
  console.log(`Extracted ${pairReview.length} figure pairs for pairwise review → ${OUT_PAIRS}`);

  for (const p of pairReview) {
    console.log(`  Pair ${p.pairId}: ${p.figureA.name} vs ${p.figureB.name} — ${p.context}`);
  }
}

main();
