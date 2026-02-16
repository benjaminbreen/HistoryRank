const Database = require('better-sqlite3');

function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function recalculateConsensus(db) {
  console.log('📊 Recalculating consensus and variance...');
  db.prepare('UPDATE figures SET llm_consensus_rank = NULL, variance_score = NULL').run();

  const totalModelsRow = db
    .prepare("SELECT count(distinct source) as count FROM rankings WHERE source != 'pantheon'")
    .get();
  const totalModels = totalModelsRow?.count || 1;
  const missingPenalty = 1001;

  // Count total samples per source for within-source coverage weighting
  const sampleCountRows = db
    .prepare("SELECT source, COUNT(DISTINCT sample_id) as samples FROM rankings WHERE source != 'pantheon' GROUP BY source")
    .all();
  const samplesPerSource = {};
  for (const row of sampleCountRows) {
    samplesPerSource[row.source] = row.samples;
  }

  const rankingRows = db
    .prepare("SELECT figure_id, source, sample_id, rank FROM rankings WHERE source != 'pantheon'")
    .all();

  const byFigure = new Map();
  for (const row of rankingRows) {
    if (!byFigure.has(row.figure_id)) byFigure.set(row.figure_id, {});
    const bySource = byFigure.get(row.figure_id);
    if (!bySource[row.source]) bySource[row.source] = { ranks: [], samples: new Set() };
    bySource[row.source].ranks.push(row.rank);
    bySource[row.source].samples.add(row.sample_id);
  }

  const updateStmt = db.prepare(`
    UPDATE figures
    SET llm_consensus_rank = ?, variance_score = ?, updated_at = ?
    WHERE id = ?
  `);

  const now = new Date().toISOString();
  for (const [figureId, bySource] of byFigure.entries()) {
    // For each source the figure appears in, compute a coverage-weighted score.
    // If a figure appears in 2 of 10 samples with median rank 5:
    //   score = (5 * 0.2) + (1001 * 0.8) = 801.8
    // If it appears in 10 of 10 samples with median rank 5:
    //   score = (5 * 1.0) + (1001 * 0.0) = 5.0
    const sourceScores = Object.entries(bySource).map(([source, data]) => {
      const avg = median(data.ranks);
      const totalSamples = samplesPerSource[source] || 1;
      const coverage = data.samples.size / totalSamples;
      return (avg * coverage) + (missingPenalty * (1 - coverage));
    });

    if (sourceScores.length === 0) continue;

    // Pad with missingPenalty for sources that never ranked this figure
    const missingCount = Math.max(totalModels - sourceScores.length, 0);
    const padded = sourceScores.concat(Array.from({ length: missingCount }, () => missingPenalty));
    const mean = padded.reduce((a, b) => a + b, 0) / padded.length;

    // Variance: measure actual disagreement among sources that rank this figure,
    // using raw per-source medians (not coverage-weighted, not padded).
    // This way variance reflects genuine disagreement, not just low coverage.
    let variance = 0;
    const rawMedians = Object.values(bySource).map((data) => median(data.ranks));
    if (rawMedians.length > 1) {
      const rawMean = rawMedians.reduce((a, b) => a + b, 0) / rawMedians.length;
      if (rawMean > 0) {
        const squaredDiffs = rawMedians.map((r) => Math.pow(r - rawMean, 2));
        const stdDev = Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / rawMedians.length);
        variance = Math.min(stdDev / rawMean, 1);
      }
    }

    updateStmt.run(
      Math.round(mean * 10) / 10,
      Math.round(variance * 1000) / 1000,
      now,
      figureId
    );
  }

  console.log(`✅ Consensus recalculated for ${byFigure.size} figures`);
}

if (require.main === module) {
  const db = new Database('historyrank.db');
  recalculateConsensus(db);
  db.close();
}

module.exports = { recalculateConsensus };
