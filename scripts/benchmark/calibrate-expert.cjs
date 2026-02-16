#!/usr/bin/env node
/**
 * HistoryBench v1.0: Expert Calibration.
 *
 * Compares historian's factual verdicts against both judges' factual precision scores.
 * Also compares pairwise ranking tests against judges' scores.
 *
 * Output: data/derived/historybench-expert-calibration.json
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const FACTUAL_PATH = path.join(ROOT, 'data', 'derived', 'historian-review-factual.json');
const PAIRS_PATH = path.join(ROOT, 'data', 'derived', 'historian-review-pairs.json');
const KEY_PATH = path.join(ROOT, 'data', 'derived', 'historybench-blind-key.json');
const CODEX_PATH = path.join(ROOT, 'data', 'derived', 'judge-scores-codex.json');
const CLAUDE_PATH = path.join(ROOT, 'data', 'derived', 'judge-scores-claude.json');
const OUT_PATH = path.join(ROOT, 'data', 'derived', 'historybench-expert-calibration.json');

function round2(n) { return Math.round(n * 100) / 100; }

function main() {
  const key = fs.existsSync(KEY_PATH) ? JSON.parse(fs.readFileSync(KEY_PATH, 'utf-8')) : null;

  // Load historian reviews
  const factualReview = fs.existsSync(FACTUAL_PATH)
    ? JSON.parse(fs.readFileSync(FACTUAL_PATH, 'utf-8'))
    : [];
  const pairsReview = fs.existsSync(PAIRS_PATH)
    ? JSON.parse(fs.readFileSync(PAIRS_PATH, 'utf-8'))
    : [];

  // Check if historian has filled in any reviews
  const completedFactual = factualReview.filter(r => r.historianVerdict !== null);
  const completedPairs = pairsReview.filter(r => r.historianChoice !== null);

  console.log(`Factual reviews: ${completedFactual.length}/${factualReview.length} completed`);
  console.log(`Pairwise reviews: ${completedPairs.length}/${pairsReview.length} completed`);

  if (completedFactual.length === 0 && completedPairs.length === 0) {
    console.log('\nNo historian reviews completed yet. Fill in:');
    console.log(`  ${FACTUAL_PATH}`);
    console.log(`  ${PAIRS_PATH}`);
    console.log('Then re-run this script.');

    // Write empty placeholder
    fs.writeFileSync(OUT_PATH, JSON.stringify({
      meta: { status: 'pending', date: new Date().toISOString().split('T')[0] },
      factual: null,
      pairwise: null,
    }, null, 2));
    return;
  }

  // Load judge scores
  const judges = {};
  if (fs.existsSync(CODEX_PATH)) judges.codex = JSON.parse(fs.readFileSync(CODEX_PATH, 'utf-8'));
  if (fs.existsSync(CLAUDE_PATH)) judges.claude = JSON.parse(fs.readFileSync(CLAUDE_PATH, 'utf-8'));

  // Index judge scores by blindId
  const judgeByBlindId = {};
  for (const [judge, scores] of Object.entries(judges)) {
    for (const entry of scores) {
      if (!judgeByBlindId[entry.blindId]) judgeByBlindId[entry.blindId] = {};
      judgeByBlindId[entry.blindId][judge] = entry;
    }
  }

  // ── Factual Calibration ──
  let factualCalibration = null;
  if (completedFactual.length > 0) {
    const judgeNames = Object.keys(judges);
    const perJudge = {};

    for (const judgeName of judgeNames) {
      let errorsCaught = 0;
      let errorsMissed = 0;
      let totalErrors = 0;
      let totalChecked = 0;

      for (const review of completedFactual) {
        const judgeEntry = judgeByBlindId[review.blindId]?.[judgeName];
        if (!judgeEntry) continue;

        totalChecked++;
        const fp = judgeEntry.scores.factualPrecision;
        const isError = review.historianVerdict === 'INCORRECT' || review.historianVerdict === 'PARTIALLY_CORRECT';

        if (isError) {
          totalErrors++;
          // Judge caught error if they scored factualPrecision <= 2
          if (fp <= 2) errorsCaught++;
          else errorsMissed++;
        }
      }

      perJudge[judgeName] = {
        totalChecked,
        totalErrors,
        errorsCaught,
        errorsMissed,
        errorDetectionRate: totalErrors > 0 ? round2(errorsCaught / totalErrors) : null,
      };
    }

    // Verdict summary
    const verdictCounts = { CORRECT: 0, PARTIALLY_CORRECT: 0, INCORRECT: 0 };
    for (const review of completedFactual) {
      if (review.historianVerdict in verdictCounts) {
        verdictCounts[review.historianVerdict]++;
      }
    }

    factualCalibration = {
      totalReviewed: completedFactual.length,
      verdictCounts,
      perJudge,
    };
  }

  // ── Pairwise Calibration ──
  let pairwiseCalibration = null;
  if (completedPairs.length > 0) {
    pairwiseCalibration = {
      totalReviewed: completedPairs.length,
      results: completedPairs.map(p => ({
        pairId: p.pairId,
        figureA: p.figureA.name,
        figureB: p.figureB.name,
        historianChoice: p.historianChoice,
        historianNote: p.historianNote,
        context: p.context,
      })),
      tooCloseCount: completedPairs.filter(p => p.historianChoice === 'TOO_CLOSE').length,
    };
  }

  const output = {
    meta: {
      version: '1.0',
      date: new Date().toISOString().split('T')[0],
      description: 'Expert calibration: historian verdicts vs LLM judge scores',
    },
    factual: factualCalibration,
    pairwise: pairwiseCalibration,
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\nExpert calibration written to ${OUT_PATH}`);

  // Print summary
  if (factualCalibration) {
    console.log('\n── Factual Calibration ──');
    console.log(`Verdicts: ${factualCalibration.verdictCounts.CORRECT} correct, ${factualCalibration.verdictCounts.PARTIALLY_CORRECT} partial, ${factualCalibration.verdictCounts.INCORRECT} incorrect`);
    for (const [judge, data] of Object.entries(factualCalibration.perJudge)) {
      console.log(`  ${judge}: detection rate = ${data.errorDetectionRate !== null ? (data.errorDetectionRate * 100).toFixed(0) + '%' : 'N/A'} (${data.errorsCaught}/${data.totalErrors} errors caught)`);
    }
  }

  if (pairwiseCalibration) {
    console.log('\n── Pairwise Calibration ──');
    console.log(`Reviewed: ${pairwiseCalibration.totalReviewed} pairs`);
    console.log(`Too close to call: ${pairwiseCalibration.tooCloseCount}`);
  }
}

main();
