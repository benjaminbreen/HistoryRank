const Database = require('better-sqlite3');

function recalculateConsensus(db) {
  console.log('📊 Recalculating consensus and variance...');
  db.prepare('UPDATE figures SET llm_consensus_rank = NULL, variance_score = NULL').run();

  const totalModelsRow = db
    .prepare("SELECT count(distinct source) as count FROM rankings WHERE source != 'pantheon'")
    .get();
  const totalModels = totalModelsRow?.count || 1;
  const missingPenalty = 1001;

  const rankingRows = db
    .prepare("SELECT figure_id, source, rank FROM rankings WHERE source != 'pantheon'")
    .all();

  const byFigure = new Map();
  for (const row of rankingRows) {
    if (!byFigure.has(row.figure_id)) byFigure.set(row.figure_id, {});
    const bySource = byFigure.get(row.figure_id);
    if (!bySource[row.source]) bySource[row.source] = [];
    bySource[row.source].push(row.rank);
  }

  const updateStmt = db.prepare(`
    UPDATE figures
    SET llm_consensus_rank = ?, variance_score = ?, updated_at = ?
    WHERE id = ?
  `);

  const now = new Date().toISOString();
  for (const [figureId, bySource] of byFigure.entries()) {
    const sourceAverages = Object.values(bySource).map((ranks) => {
      const sum = ranks.reduce((a, b) => a + b, 0);
      return sum / ranks.length;
    });

    if (sourceAverages.length === 0) continue;

    const missingCount = Math.max(totalModels - sourceAverages.length, 0);
    const padded = sourceAverages.concat(Array.from({ length: missingCount }, () => missingPenalty));
    const mean = padded.reduce((a, b) => a + b, 0) / padded.length;

    let variance = 0;
    if (padded.length > 1) {
      const squaredDiffs = padded.map((r) => Math.pow(r - mean, 2));
      const stdDev = Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / padded.length);
      variance = Math.min(stdDev / mean, 1);
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
