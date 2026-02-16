#!/usr/bin/env node
/**
 * HistoryBench v1.0: Final Aggregation.
 *
 * Combines all layers into a per-model scorecard:
 *   Layer 1 (40%): Objective metrics (consistency, temporal, substantiveness, inversions)
 *   Layer 2 (40%): Multi-judge description quality scores
 *   Layer 3 (20%): Expert calibration adjustment
 *
 * Output: data/derived/historybench-results-v1.json
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const LAYER1_PATH = path.join(ROOT, 'data', 'derived', 'historybench-layer1.json');
const AGREEMENT_PATH = path.join(ROOT, 'data', 'derived', 'historybench-judge-agreement.json');
const EXPERT_PATH = path.join(ROOT, 'data', 'derived', 'historybench-expert-calibration.json');
const OUT_PATH = path.join(ROOT, 'data', 'derived', 'historybench-results-v1.json');

const DIMENSIONS = ['factualPrecision', 'causalSpecificity', 'proportionality', 'nuance', 'knowledgeDepth'];

function round2(n) { return Math.round(n * 100) / 100; }
function round3(n) { return Math.round(n * 1000) / 1000; }

function avg(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

/** Normalize values to 0-1 range (higher = better). */
function normalize(values, higherIsBetter = true) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return values.map(() => 0.5);
  return values.map(v => {
    const norm = (v - min) / (max - min);
    return higherIsBetter ? norm : 1 - norm;
  });
}

function main() {
  // Load Layer 1
  if (!fs.existsSync(LAYER1_PATH)) {
    console.error('Layer 1 data not found. Run run-layer1.cjs first.');
    process.exit(1);
  }
  const layer1 = JSON.parse(fs.readFileSync(LAYER1_PATH, 'utf-8'));
  const models = Object.keys(layer1.selfConsistency).sort();

  console.log(`Found ${models.length} models in Layer 1 data`);

  // ── Layer 1 Composite (0-1) ──
  // Four sub-metrics, each normalized 0-1, then averaged
  const l1Composites = {};
  const rhoVals = models.map(m => layer1.selfConsistency[m].meanRho);
  const rhoNorm = normalize(rhoVals, true);

  // Temporal: lower % living = better calibration
  const livingVals = models.map(m => layer1.temporalCalibration[m].pctLiving);
  const livingNorm = normalize(livingVals, false);

  // Substantiveness: higher mean length = better (but cap effect)
  const lengthVals = models.map(m => layer1.substantiveness[m].meanLength);
  const lengthNorm = normalize(lengthVals, true);

  // Also factor in keyword-only % (lower = better)
  const kwVals = models.map(m => layer1.substantiveness[m].pctKeywordOnly);
  const kwNorm = normalize(kwVals, false);

  // Inversions: lower = better
  const invVals = models.map(m => layer1.consensusInversions[m].inversionRate);
  const invNorm = normalize(invVals, false);

  for (let i = 0; i < models.length; i++) {
    // Substantiveness is average of length and keyword-avoidance
    const substScore = (lengthNorm[i] + kwNorm[i]) / 2;
    l1Composites[models[i]] = round3(avg([rhoNorm[i], livingNorm[i], substScore, invNorm[i]]));
  }

  // ── Layer 2: Judge Scores ──
  let l2Composites = {};
  let hasJudgeData = false;
  let judgeAgreement = null;

  if (fs.existsSync(AGREEMENT_PATH)) {
    const agreement = JSON.parse(fs.readFileSync(AGREEMENT_PATH, 'utf-8'));
    judgeAgreement = agreement.agreement;

    if (agreement.modelScores) {
      hasJudgeData = true;
      for (const model of models) {
        const scores = agreement.modelScores[model];
        if (!scores) {
          l2Composites[model] = null;
          continue;
        }
        // Use multiJudge if available, else first judge
        const scoreKey = scores.multiJudge ? 'multiJudge' : Object.keys(scores)[0];
        const s = scores[scoreKey];
        // Normalize the 1-5 score to 0-1
        l2Composites[model] = round3((s.overall - 1) / 4);
      }
    }
  }

  // ── Layer 3: Expert Calibration ──
  let l3Adjustments = {};
  let expertData = null;
  if (fs.existsSync(EXPERT_PATH)) {
    expertData = JSON.parse(fs.readFileSync(EXPERT_PATH, 'utf-8'));

    // If factual calibration exists, compute per-model adjustment
    // based on error detection rate
    if (expertData.factual && expertData.factual.perJudge) {
      // Average detection rate across judges
      const rates = Object.values(expertData.factual.perJudge)
        .map(j => j.errorDetectionRate)
        .filter(r => r !== null);
      const avgRate = rates.length > 0 ? avg(rates) : 1;

      // Apply as a multiplier to factual precision dimension
      // Models with more historian-flagged errors get a penalty
      for (const model of models) {
        l3Adjustments[model] = round3(avgRate); // uniform for now; per-model when we have more data
      }
    }
  }

  // ── Final Holistic Score ──
  // Weights: Layer1 40%, Layer2 40%, Layer3 20% (or rebalance if layers missing)
  const results = {};
  for (const model of models) {
    const l1 = l1Composites[model];
    const l2 = hasJudgeData ? l2Composites[model] : null;
    const l3 = l3Adjustments[model] || null;

    let holistic;
    if (l2 !== null && l3 !== null) {
      // Full formula
      holistic = round3(l1 * 0.4 + l2 * 0.4 + l3 * 0.2);
    } else if (l2 !== null) {
      // No expert data yet
      holistic = round3(l1 * 0.5 + l2 * 0.5);
    } else {
      // Only Layer 1
      holistic = l1;
    }

    results[model] = {
      holistic,
      layer1Composite: l1,
      layer2Composite: l2,
      layer3Adjustment: l3,
      objective: {
        selfConsistency: layer1.selfConsistency[model],
        temporalCalibration: layer1.temporalCalibration[model],
        substantiveness: layer1.substantiveness[model],
        consensusInversions: layer1.consensusInversions[model],
      },
    };
  }

  // Sort by holistic score
  const ranked = Object.entries(results)
    .sort(([, a], [, b]) => b.holistic - a.holistic)
    .map(([model, data], i) => ({ rank: i + 1, model, ...data }));

  const output = {
    meta: {
      version: '1.0',
      date: new Date().toISOString().split('T')[0],
      models: models.length,
      layers: {
        layer1: 'Objective metrics (self-consistency, temporal calibration, substantiveness, consensus inversions)',
        layer2: hasJudgeData ? 'Multi-judge description quality (blinded evaluation)' : 'Pending — judges not yet run',
        layer3: expertData?.factual ? 'Expert calibration (historian factual verification)' : 'Pending — historian review not yet completed',
      },
      weights: hasJudgeData && expertData?.factual
        ? { layer1: 0.4, layer2: 0.4, layer3: 0.2 }
        : hasJudgeData
          ? { layer1: 0.5, layer2: 0.5 }
          : { layer1: 1.0 },
      formula: 'Layer1 composite: mean of normalized (self-consistency, temporal calibration, substantiveness, inversions). Layer2: multi-judge mean 1-5 rescaled to 0-1. Layer3: expert calibration multiplier.',
    },
    rankings: ranked,
    judgeAgreement,
    expertCalibration: expertData,
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\nResults written to ${OUT_PATH}`);

  // Print summary
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║          HistoryBench v1.0 — Combined Scorecard                ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log('');

  const hdr = `${'#'.padStart(2)}  ${'Model'.padEnd(26)} ${'HOLISTIC'.padStart(8)}  ${'L1'.padStart(5)} ${'L2'.padStart(5)} ${'L3'.padStart(5)}`;
  console.log(hdr);
  console.log('-'.repeat(hdr.length));

  for (const r of ranked) {
    const l2Str = r.layer2Composite !== null ? r.layer2Composite.toFixed(3) : ' N/A';
    const l3Str = r.layer3Adjustment !== null ? r.layer3Adjustment.toFixed(3) : ' N/A';
    console.log(
      `${String(r.rank).padStart(2)}  ${r.model.padEnd(26)} ${r.holistic.toFixed(3).padStart(8)}  ${r.layer1Composite.toFixed(3).padStart(5)} ${l2Str.padStart(5)} ${l3Str.padStart(5)}`
    );
  }

  console.log('');
  console.log(`Weights: ${JSON.stringify(output.meta.weights)}`);
  console.log('');
}

main();
