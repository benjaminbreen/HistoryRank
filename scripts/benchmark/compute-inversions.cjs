#!/usr/bin/env node
/**
 * Compute consensus inversion counts for each model in the HistoryRank database.
 *
 * A "consensus pair" is an ordered pair (A, B) of figures where at least
 * `THRESHOLD` out of 13 models agree that A should be ranked above B
 * (lower rank number = higher). An "inversion" for a given model is when
 * that model disagrees with the consensus ordering.
 *
 * Only considers list-1 rankings with rank <= 200, and only figures that
 * appear in at least THRESHOLD models' list-1, to keep the computation
 * tractable and meaningful.
 *
 * Exports a `compute()` function for programmatic use and runs as a CLI
 * tool when invoked directly.
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'historyrank.db');
const THRESHOLD = 10;
const MAX_RANK = 200;

/**
 * Compute consensus inversions for all models.
 *
 * @param {string} [dbPath] - Path to the SQLite database. Defaults to historyrank.db.
 * @returns {{
 *   consensusInversions: { [model: string]: { inversions: number, totalConsensusPairs: number, inversionRate: number } },
 *   meta: { totalConsensusPairs: number, threshold: number }
 * }}
 */
function compute(dbPath) {
  const db = new Database(dbPath || DB_PATH, { readonly: true });

  // Step 1: Get all models
  const models = db.prepare(
    `SELECT DISTINCT source FROM rankings WHERE sample_id = 'list-1' ORDER BY source`
  ).all().map(r => r.source);

  const totalModels = models.length;

  // Step 2: For each model, build figure_id -> rank mapping (list-1, rank <= MAX_RANK)
  const modelRankings = {}; // { model: { figure_id: rank } }
  for (const model of models) {
    const rows = db.prepare(`
      SELECT figure_id, rank
      FROM rankings
      WHERE source = ? AND sample_id = 'list-1' AND rank <= ?
      ORDER BY rank
    `).all(model, MAX_RANK);

    const rankMap = {};
    for (const row of rows) {
      rankMap[row.figure_id] = row.rank;
    }
    modelRankings[model] = rankMap;
  }

  // Step 3: Find figures that appear in at least THRESHOLD models' list-1 (rank <= MAX_RANK)
  const figureModelCount = {}; // figure_id -> count of models that include it
  for (const model of models) {
    for (const figureId of Object.keys(modelRankings[model])) {
      figureModelCount[figureId] = (figureModelCount[figureId] || 0) + 1;
    }
  }

  const eligibleFigures = Object.keys(figureModelCount)
    .filter(fid => figureModelCount[fid] >= THRESHOLD)
    .sort(); // sort for deterministic pair ordering

  console.log(`Found ${eligibleFigures.length} eligible figures (appear in ${THRESHOLD}+ models, rank <= ${MAX_RANK})`);
  console.log(`Total models: ${totalModels}`);

  // Step 4: For each pair of eligible figures, determine if there is a near-unanimous consensus
  // A consensus pair (A, B) means: THRESHOLD+ models rank A above B (i.e., A has lower rank number)
  // We only need to check each unordered pair once, then determine direction.
  const consensusPairs = []; // { a: figureId, b: figureId } where consensus says a is ranked above b

  for (let i = 0; i < eligibleFigures.length; i++) {
    for (let j = i + 1; j < eligibleFigures.length; j++) {
      const figA = eligibleFigures[i];
      const figB = eligibleFigures[j];

      let aAboveB = 0; // count of models that rank A above B (lower rank number)
      let bAboveA = 0;
      let bothPresent = 0;

      for (const model of models) {
        const rankA = modelRankings[model][figA];
        const rankB = modelRankings[model][figB];

        if (rankA === undefined || rankB === undefined) continue;
        bothPresent++;

        if (rankA < rankB) {
          aAboveB++;
        } else if (rankB < rankA) {
          bAboveA++;
        }
        // ties are ignored (neither counts)
      }

      // Only consider pairs where both figures are present in enough models
      if (bothPresent < THRESHOLD) continue;

      if (aAboveB >= THRESHOLD) {
        consensusPairs.push({ a: figA, b: figB });
      } else if (bAboveA >= THRESHOLD) {
        consensusPairs.push({ a: figB, b: figA });
      }
    }
  }

  console.log(`Found ${consensusPairs.length} consensus pairs (${THRESHOLD}+ models agree on ordering)`);

  // Step 5: For each model, count inversions against consensus
  const consensusInversions = {};
  for (const model of models) {
    const rankMap = modelRankings[model];
    let inversions = 0;

    for (const pair of consensusPairs) {
      const rankA = rankMap[pair.a];
      const rankB = rankMap[pair.b];

      // If the model doesn't rank one of the figures, skip
      if (rankA === undefined || rankB === undefined) continue;

      // Consensus says A is ranked above B (lower rank number = higher ranked).
      // Inversion: this model has rankA > rankB (A ranked below B)
      if (rankA > rankB) {
        inversions++;
      }
    }

    const totalConsensusPairs = consensusPairs.filter(pair => {
      return rankMap[pair.a] !== undefined && rankMap[pair.b] !== undefined;
    }).length;

    consensusInversions[model] = {
      inversions,
      totalConsensusPairs,
      inversionRate: totalConsensusPairs > 0
        ? Math.round((inversions / totalConsensusPairs) * 10000) / 10000
        : 0,
    };
  }

  db.close();

  return {
    consensusInversions,
    meta: {
      totalConsensusPairs: consensusPairs.length,
      threshold: THRESHOLD,
      maxRank: MAX_RANK,
      eligibleFigures: eligibleFigures.length,
      models: totalModels,
    },
  };
}

// --- CLI entry point ---
if (require.main === module) {
  console.log('Computing consensus inversions...\n');

  const result = compute();
  const { consensusInversions, meta } = result;

  // Sort models by inversion count (ascending = best first)
  const sorted = Object.entries(consensusInversions)
    .sort(([, a], [, b]) => a.inversions - b.inversions);

  console.log('');
  const hdr = `${'#'.padStart(2)}  ${'Model'.padEnd(26)} ${'Inversions'.padStart(10)}  ${'/ Pairs'.padStart(8)}  ${'Rate'.padStart(7)}`;
  console.log(hdr);
  console.log('-'.repeat(hdr.length));

  sorted.forEach(([model, data], i) => {
    console.log(
      `${String(i + 1).padStart(2)}  ${model.padEnd(26)} ${String(data.inversions).padStart(10)}  ${String(data.totalConsensusPairs).padStart(8)}  ${(data.inversionRate * 100).toFixed(2).padStart(6)}%`
    );
  });

  console.log('');
  console.log(`Consensus threshold: ${meta.threshold}+ models must agree on pair ordering`);
  console.log(`Max rank considered: ${meta.maxRank}`);
  console.log(`Eligible figures: ${meta.eligibleFigures} (appear in ${meta.threshold}+ models)`);
  console.log(`Total consensus pairs: ${meta.totalConsensusPairs}`);
  console.log('');
}

module.exports = { compute };
