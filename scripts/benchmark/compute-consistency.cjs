#!/usr/bin/env node
/**
 * Compute self-consistency scores (Spearman rank correlation) for each model.
 *
 * For every model, we look at all sample_ids (list-1, list-2, etc.) and compute
 * pairwise Spearman rho on the ranks of figures that appear in both lists.
 * The mean pairwise rho measures how consistently a model ranks figures across
 * independent runs.
 *
 * Exports a compute() function for programmatic use.
 * Run directly: node scripts/benchmark/compute-consistency.cjs
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'historyrank.db');

/**
 * Convert raw rank values to dense ranks (1..n).
 * Sorts items by their original rank and assigns sequential positions.
 * This is necessary because lists have different lengths, so raw ranks
 * (e.g., rank 50 out of 80 vs rank 50 out of 500) aren't comparable.
 *
 * @param {number[]} rawRanks - Original rank values
 * @returns {number[]} Dense ranks from 1 to n
 */
function toDenseRanks(rawRanks) {
  // Create index-value pairs, sort by raw rank, assign 1..n
  const indexed = rawRanks.map((r, i) => ({ i, r }));
  indexed.sort((a, b) => a.r - b.r);
  const dense = new Array(rawRanks.length);
  indexed.forEach((item, pos) => {
    dense[item.i] = pos + 1;
  });
  return dense;
}

/**
 * Spearman rank correlation coefficient.
 * Uses the standard formula: rho = 1 - (6 * sum(d_i^2)) / (n * (n^2 - 1))
 * where d_i is the rank difference for each shared figure.
 *
 * Input ranks must already be dense (1..n) for valid results.
 *
 * @param {number[]} ranksA - Dense ranks from list A (aligned with ranksB by figure)
 * @param {number[]} ranksB - Dense ranks from list B (aligned with ranksA by figure)
 * @returns {number} Spearman rho in [-1, 1]
 */
function spearmanRho(ranksA, ranksB) {
  const n = ranksA.length;
  if (n < 2) return NaN;

  let sumD2 = 0;
  for (let i = 0; i < n; i++) {
    const d = ranksA[i] - ranksB[i];
    sumD2 += d * d;
  }

  return 1 - (6 * sumD2) / (n * (n * n - 1));
}

/**
 * Compute self-consistency scores for all models in the database.
 *
 * @param {string} [dbPath] - Optional path to the SQLite database.
 * @returns {{ selfConsistency: Object.<string, { meanRho: number, pairCount: number, avgIntersectionSize: number }> }}
 */
function compute(dbPath) {
  const db = new Database(dbPath || DB_PATH, { readonly: true });

  // Get all distinct models
  const models = db.prepare(
    'SELECT DISTINCT source FROM rankings ORDER BY source'
  ).all().map(r => r.source);

  const selfConsistency = {};

  for (const model of models) {
    // Get all distinct sample_ids for this model
    const sampleIds = db.prepare(
      'SELECT DISTINCT sample_id FROM rankings WHERE source = ? ORDER BY sample_id'
    ).all(model).map(r => r.sample_id);

    if (sampleIds.length < 2) {
      selfConsistency[model] = {
        meanRho: NaN,
        pairCount: 0,
        avgIntersectionSize: 0,
      };
      continue;
    }

    // Build a map: sample_id -> { figure_id: rank }
    const listRanks = {};
    for (const sid of sampleIds) {
      const rows = db.prepare(
        'SELECT figure_id, rank FROM rankings WHERE source = ? AND sample_id = ?'
      ).all(model, sid);

      const rankMap = {};
      for (const row of rows) {
        rankMap[row.figure_id] = row.rank;
      }
      listRanks[sid] = rankMap;
    }

    // Compute pairwise Spearman rho for all (i, j) pairs where i < j
    const rhos = [];
    const intersectionSizes = [];

    for (let i = 0; i < sampleIds.length; i++) {
      for (let j = i + 1; j < sampleIds.length; j++) {
        const mapA = listRanks[sampleIds[i]];
        const mapB = listRanks[sampleIds[j]];

        // Find intersection of figure_ids
        const sharedFigures = Object.keys(mapA).filter(fid => fid in mapB);
        intersectionSizes.push(sharedFigures.length);

        if (sharedFigures.length < 2) continue;

        // Convert raw ranks to dense ranks (1..n) within the intersection,
        // so that lists of different lengths are comparable.
        const rawA = sharedFigures.map(fid => mapA[fid]);
        const rawB = sharedFigures.map(fid => mapB[fid]);
        const ranksA = toDenseRanks(rawA);
        const ranksB = toDenseRanks(rawB);

        const rho = spearmanRho(ranksA, ranksB);
        if (!isNaN(rho)) {
          rhos.push(rho);
        }
      }
    }

    const meanRho = rhos.length > 0
      ? rhos.reduce((a, b) => a + b, 0) / rhos.length
      : NaN;

    const avgIntersectionSize = intersectionSizes.length > 0
      ? intersectionSizes.reduce((a, b) => a + b, 0) / intersectionSizes.length
      : 0;

    selfConsistency[model] = {
      meanRho: Math.round(meanRho * 10000) / 10000,
      pairCount: rhos.length,
      avgIntersectionSize: Math.round(avgIntersectionSize * 10) / 10,
    };
  }

  db.close();

  return { selfConsistency };
}

// --- Main: run if called directly ---
if (require.main === module) {
  const { selfConsistency } = compute();

  // Sort by meanRho descending
  const sorted = Object.entries(selfConsistency)
    .sort(([, a], [, b]) => {
      if (isNaN(a.meanRho) && isNaN(b.meanRho)) return 0;
      if (isNaN(a.meanRho)) return 1;
      if (isNaN(b.meanRho)) return -1;
      return b.meanRho - a.meanRho;
    });

  console.log('');
  console.log('Self-Consistency Scores (Spearman rho, pairwise across sample lists)');
  console.log('====================================================================');
  console.log('');

  const hdr = `${'#'.padStart(2)}  ${'Model'.padEnd(26)} ${'Mean rho'.padStart(9)}  ${'Pairs'.padStart(5)}  ${'Avg Intersection'.padStart(16)}`;
  console.log(hdr);
  console.log('-'.repeat(hdr.length));

  sorted.forEach(([model, data], i) => {
    const rhoStr = isNaN(data.meanRho) ? '    N/A' : data.meanRho.toFixed(4).padStart(9);
    console.log(
      `${String(i + 1).padStart(2)}  ${model.padEnd(26)} ${rhoStr}  ${String(data.pairCount).padStart(5)}  ${String(data.avgIntersectionSize).padStart(16)}`
    );
  });

  console.log('');
}

module.exports = { compute };
