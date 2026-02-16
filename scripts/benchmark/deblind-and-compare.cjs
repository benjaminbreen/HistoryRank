#!/usr/bin/env node
/**
 * HistoryBench v1.0: De-blind judge scores and compute agreement metrics.
 *
 * Supports multiple runs per judge:
 *   judge-scores-codex-run1.json, judge-scores-codex-run2.json, ...
 *   judge-scores-claude-run1.json, judge-scores-claude-run2.json, ...
 *
 * Also supports legacy single-file format:
 *   judge-scores-codex.json, judge-scores-claude.json
 *
 * Computes:
 *   - Intra-rater reliability (consistency across runs within each judge)
 *   - Averaged scores per judge (mean across runs)
 *   - Inter-rater agreement (Codex vs Claude on averaged scores)
 *   - Per-model multi-judge means
 *
 * Output: data/derived/historybench-judge-agreement.json
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DERIVED = path.join(ROOT, 'data', 'derived');
const KEY_PATH = path.join(DERIVED, 'historybench-blind-key.json');
const OUT_PATH = path.join(DERIVED, 'historybench-judge-agreement.json');

const JUDGE_NAMES = ['codex', 'claude'];
const DIMENSIONS = ['factualPrecision', 'causalSpecificity', 'proportionality', 'nuance', 'knowledgeDepth'];

function round3(n) { return Math.round(n * 1000) / 1000; }
function round2(n) { return Math.round(n * 100) / 100; }

function avg(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

/** Pearson correlation between two arrays */
function pearson(xs, ys) {
  const n = xs.length;
  if (n < 2) return NaN;
  const mx = avg(xs), my = avg(ys);
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  return dx2 && dy2 ? num / Math.sqrt(dx2 * dy2) : 0;
}

/**
 * Cohen's weighted kappa for ordinal data (linear weights).
 */
function cohenWeightedKappa(xs, ys) {
  const n = xs.length;
  if (n < 2) return NaN;

  const k = 5; // rating scale 1-5
  const matrix = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let i = 0; i < n; i++) {
    const a = Math.round(xs[i]) - 1;
    const b = Math.round(ys[i]) - 1;
    if (a >= 0 && a < k && b >= 0 && b < k) {
      matrix[a][b]++;
    }
  }

  const rowSums = matrix.map(row => row.reduce((a, b) => a + b, 0));
  const colSums = Array.from({ length: k }, (_, j) => matrix.reduce((a, row) => a + row[j], 0));

  let po = 0, pe = 0;
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      const w = 1 - Math.abs(i - j) / (k - 1);
      po += w * (matrix[i][j] / n);
      pe += w * (rowSums[i] * colSums[j]) / (n * n);
    }
  }

  return pe < 1 ? (po - pe) / (1 - pe) : 1;
}

/**
 * Discover run files for a judge.
 * Checks for: judge-scores-{name}-run1.json, run2, run3, ...
 * Falls back to: judge-scores-{name}.json (single file = 1 run)
 */
function loadJudgeRuns(judgeName) {
  const runs = [];

  // Check for numbered run files
  for (let i = 1; i <= 20; i++) {
    const runPath = path.join(DERIVED, `judge-scores-${judgeName}-run${i}.json`);
    if (fs.existsSync(runPath)) {
      runs.push(JSON.parse(fs.readFileSync(runPath, 'utf-8')));
    } else if (i > 1) {
      break; // stop after first gap
    }
  }

  // Fall back to single file
  if (runs.length === 0) {
    const singlePath = path.join(DERIVED, `judge-scores-${judgeName}.json`);
    if (fs.existsSync(singlePath)) {
      runs.push(JSON.parse(fs.readFileSync(singlePath, 'utf-8')));
    }
  }

  return runs;
}

/**
 * Average scores across multiple runs for the same judge.
 * Returns one entry per blindId with averaged dimension scores.
 */
function averageRuns(runs) {
  if (runs.length === 1) return runs[0];

  // Index all entries by blindId
  const byBlindId = {};
  for (const run of runs) {
    for (const entry of run) {
      if (!byBlindId[entry.blindId]) {
        byBlindId[entry.blindId] = {
          blindId: entry.blindId,
          figureName: entry.figureName,
          runs: [],
        };
      }
      byBlindId[entry.blindId].runs.push(entry.scores);
    }
  }

  // Average the scores
  return Object.values(byBlindId).map(({ blindId, figureName, runs: entryRuns }) => {
    const scores = {};
    for (const dim of DIMENSIONS) {
      const vals = entryRuns.map(r => r[dim]).filter(v => v != null);
      scores[dim] = vals.length ? round2(avg(vals)) : null;
    }
    return { blindId, figureName, scores, runsAveraged: entryRuns.length };
  });
}

/**
 * Compute intra-rater reliability for a judge with multiple runs.
 * For each pair of runs, computes per-dimension agreement.
 */
function computeIntraRater(runs) {
  if (runs.length < 2) return null;

  // Index each run by blindId
  const indexed = runs.map(run => {
    const map = {};
    for (const entry of run) map[entry.blindId] = entry;
    return map;
  });

  // Compute pairwise agreement across all run pairs
  const pairResults = [];
  for (let a = 0; a < runs.length; a++) {
    for (let b = a + 1; b < runs.length; b++) {
      const runA = indexed[a];
      const runB = indexed[b];

      // Find shared blindIds
      const sharedIds = Object.keys(runA).filter(id => runB[id]);

      const dimStats = {};
      for (const dim of DIMENSIONS) {
        const xs = sharedIds.map(id => runA[id].scores[dim]);
        const ys = sharedIds.map(id => runB[id].scores[dim]);
        const r = pearson(xs, ys);
        const kappa = cohenWeightedKappa(xs, ys);
        const within1 = sharedIds.filter(id =>
          Math.abs(runA[id].scores[dim] - runB[id].scores[dim]) <= 1
        ).length;

        dimStats[dim] = {
          pearsonR: round3(r),
          weightedKappa: round3(kappa),
          pctWithin1: round2((within1 / sharedIds.length) * 100),
        };
      }

      // Overall across all dimensions
      const allXs = sharedIds.flatMap(id => DIMENSIONS.map(d => runA[id].scores[d]));
      const allYs = sharedIds.flatMap(id => DIMENSIONS.map(d => runB[id].scores[d]));
      const within1All = allXs.filter((_, i) => Math.abs(allXs[i] - allYs[i]) <= 1).length;

      pairResults.push({
        runs: [a + 1, b + 1],
        pairedCount: sharedIds.length,
        perDimension: dimStats,
        overall: {
          pearsonR: round3(pearson(allXs, allYs)),
          weightedKappa: round3(cohenWeightedKappa(allXs, allYs)),
          pctWithin1: round2((within1All / allXs.length) * 100),
        },
      });
    }
  }

  // Compute mean across all run pairs
  const meanOverall = {
    pearsonR: round3(avg(pairResults.map(p => p.overall.pearsonR))),
    weightedKappa: round3(avg(pairResults.map(p => p.overall.weightedKappa))),
    pctWithin1: round2(avg(pairResults.map(p => p.overall.pctWithin1))),
  };

  const meanPerDim = {};
  for (const dim of DIMENSIONS) {
    meanPerDim[dim] = {
      pearsonR: round3(avg(pairResults.map(p => p.perDimension[dim].pearsonR))),
      weightedKappa: round3(avg(pairResults.map(p => p.perDimension[dim].weightedKappa))),
      pctWithin1: round2(avg(pairResults.map(p => p.perDimension[dim].pctWithin1))),
    };
  }

  return {
    numRuns: runs.length,
    numPairs: pairResults.length,
    meanOverall,
    meanPerDimension: meanPerDim,
    pairwise: pairResults,
  };
}

function main() {
  if (!fs.existsSync(KEY_PATH)) {
    console.error('Blind key not found. Run blind-samples.cjs first.');
    process.exit(1);
  }

  const key = JSON.parse(fs.readFileSync(KEY_PATH, 'utf-8'));

  // ── Load judge runs ──
  const judgeRuns = {};    // { codex: [run1[], run2[], ...], claude: [...] }
  const judgeAvg = {};     // { codex: averaged[], claude: averaged[] }

  for (const name of JUDGE_NAMES) {
    const runs = loadJudgeRuns(name);
    if (runs.length > 0) {
      judgeRuns[name] = runs;
      judgeAvg[name] = averageRuns(runs);
      console.log(`${name}: ${runs.length} run(s), ${judgeAvg[name].length} entries (averaged)`);
    }
  }

  const judgeNames = Object.keys(judgeAvg);
  if (judgeNames.length === 0) {
    console.error('No judge score files found. Run the judges first.');
    console.error('Expected files: judge-scores-{codex,claude}-run{1,2,3}.json');
    process.exit(1);
  }

  // ── De-blind ──
  function deblind(entries) {
    return entries.map(e => {
      const code = e.blindId.split('-')[0];
      const model = key[code] || 'unknown';
      return { ...e, model };
    });
  }

  const deblinded = {};
  for (const [judge, entries] of Object.entries(judgeAvg)) {
    deblinded[judge] = deblind(entries);
  }

  // ── Intra-rater reliability ──
  const intraRater = {};
  for (const [judge, runs] of Object.entries(judgeRuns)) {
    const result = computeIntraRater(runs);
    if (result) {
      intraRater[judge] = result;
      console.log(`\n${judge} intra-rater: ${result.numRuns} runs, ${result.numPairs} pairs`);
      console.log(`  Overall: r=${result.meanOverall.pearsonR}, kappa=${result.meanOverall.weightedKappa}, %±1=${result.meanOverall.pctWithin1}%`);
    }
  }

  // ── Inter-rater agreement (using averaged scores) ──
  let agreement = null;
  if (judgeNames.length >= 2) {
    const j1 = deblinded[judgeNames[0]];
    const j2 = deblinded[judgeNames[1]];

    const j2Map = {};
    for (const entry of j2) j2Map[entry.blindId] = entry;

    const paired = [];
    for (const e1 of j1) {
      const e2 = j2Map[e1.blindId];
      if (e2) paired.push({ j1: e1, j2: e2 });
    }

    console.log(`\nInter-rater paired entries: ${paired.length}`);

    const dimAgreement = {};
    for (const dim of DIMENSIONS) {
      const xs = paired.map(p => p.j1.scores[dim]);
      const ys = paired.map(p => p.j2.scores[dim]);

      dimAgreement[dim] = {
        pearsonR: round3(pearson(xs, ys)),
        weightedKappa: round3(cohenWeightedKappa(xs, ys)),
        pctWithin1: round2((paired.filter(p => Math.abs(p.j1.scores[dim] - p.j2.scores[dim]) <= 1).length / paired.length) * 100),
      };
    }

    const allXs = paired.flatMap(p => DIMENSIONS.map(d => p.j1.scores[d]));
    const allYs = paired.flatMap(p => DIMENSIONS.map(d => p.j2.scores[d]));
    const overallWithin1 = allXs.filter((_, i) => Math.abs(allXs[i] - allYs[i]) <= 1).length;

    const disagreements = [];
    for (const p of paired) {
      for (const dim of DIMENSIONS) {
        const diff = Math.abs(p.j1.scores[dim] - p.j2.scores[dim]);
        if (diff > 2) {
          disagreements.push({
            blindId: p.j1.blindId,
            model: p.j1.model,
            figureName: p.j1.figureName,
            dimension: dim,
            [judgeNames[0]]: p.j1.scores[dim],
            [judgeNames[1]]: p.j2.scores[dim],
            diff: round2(diff),
          });
        }
      }
    }

    agreement = {
      judges: judgeNames,
      pairedCount: paired.length,
      runsPerJudge: Object.fromEntries(judgeNames.map(j => [j, judgeRuns[j].length])),
      perDimension: dimAgreement,
      overall: {
        pearsonR: round3(pearson(allXs, allYs)),
        weightedKappa: round3(cohenWeightedKappa(allXs, allYs)),
        pctWithin1: round2((overallWithin1 / allXs.length) * 100),
      },
      largeDisagreements: disagreements,
    };
  }

  // ── Per-model mean scores ──
  const modelScores = {};
  for (const [judge, entries] of Object.entries(deblinded)) {
    for (const entry of entries) {
      if (!modelScores[entry.model]) modelScores[entry.model] = {};
      if (!modelScores[entry.model][judge]) modelScores[entry.model][judge] = [];
      const overall = avg(DIMENSIONS.map(d => entry.scores[d]));
      modelScores[entry.model][judge].push({ overall, ...entry.scores });
    }
  }

  const multiJudgeMeans = {};
  for (const [model, judgeData] of Object.entries(modelScores)) {
    const means = {};
    for (const [judge, entries] of Object.entries(judgeData)) {
      means[judge] = {};
      for (const dim of DIMENSIONS) {
        means[judge][dim] = round2(avg(entries.map(e => e[dim])));
      }
      means[judge].overall = round2(avg(entries.map(e => e.overall)));
    }

    if (Object.keys(means).length >= 2) {
      means.multiJudge = {};
      for (const dim of [...DIMENSIONS, 'overall']) {
        const judgeVals = Object.entries(means)
          .filter(([k]) => k !== 'multiJudge')
          .map(([, v]) => v[dim]);
        means.multiJudge[dim] = round2(avg(judgeVals));
      }
    }

    multiJudgeMeans[model] = means;
  }

  // ── Output ──
  const output = {
    meta: {
      version: '1.0',
      date: new Date().toISOString().split('T')[0],
      judges: judgeNames,
      runsPerJudge: Object.fromEntries(judgeNames.map(j => [j, judgeRuns[j].length])),
      dimensions: DIMENSIONS,
      note: 'Scores are averaged across runs before computing inter-rater agreement.',
    },
    intraRater: Object.keys(intraRater).length > 0 ? intraRater : null,
    agreement,
    modelScores: multiJudgeMeans,
    deblindedScores: deblinded,
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\nResults written to ${OUT_PATH}`);

  // ── Print summary ──
  if (Object.keys(intraRater).length > 0) {
    console.log('\n══ Intra-Rater Reliability ══');
    for (const [judge, data] of Object.entries(intraRater)) {
      console.log(`\n  ${judge} (${data.numRuns} runs):`);
      const hdr = `    ${'Dimension'.padEnd(22)} ${'Pearson r'.padStart(10)} ${'w-Kappa'.padStart(8)} ${'%±1'.padStart(6)}`;
      console.log(hdr);
      console.log('    ' + '-'.repeat(hdr.length - 4));
      for (const dim of DIMENSIONS) {
        const d = data.meanPerDimension[dim];
        console.log(`    ${dim.padEnd(22)} ${d.pearsonR.toFixed(3).padStart(10)} ${d.weightedKappa.toFixed(3).padStart(8)} ${(d.pctWithin1 + '%').padStart(6)}`);
      }
      console.log(`    ${'OVERALL'.padEnd(22)} ${data.meanOverall.pearsonR.toFixed(3).padStart(10)} ${data.meanOverall.weightedKappa.toFixed(3).padStart(8)} ${(data.meanOverall.pctWithin1 + '%').padStart(6)}`);
    }
  }

  if (agreement) {
    console.log('\n══ Inter-Rater Agreement ══');
    console.log(`Judges: ${judgeNames.join(' vs ')} (runs: ${judgeNames.map(j => judgeRuns[j].length).join(' vs ')})`);
    console.log(`Paired entries: ${agreement.pairedCount}`);
    console.log(`\nPer-dimension (on run-averaged scores):`);
    const hdr = `  ${'Dimension'.padEnd(22)} ${'Pearson r'.padStart(10)} ${'w-Kappa'.padStart(8)} ${'%±1'.padStart(6)}`;
    console.log(hdr);
    console.log('  ' + '-'.repeat(hdr.length - 2));
    for (const dim of DIMENSIONS) {
      const d = agreement.perDimension[dim];
      console.log(`  ${dim.padEnd(22)} ${d.pearsonR.toFixed(3).padStart(10)} ${d.weightedKappa.toFixed(3).padStart(8)} ${(d.pctWithin1 + '%').padStart(6)}`);
    }
    console.log(`\n  Overall: r=${agreement.overall.pearsonR}, kappa=${agreement.overall.weightedKappa}, %±1=${agreement.overall.pctWithin1}%`);
    if (agreement.largeDisagreements.length > 0) {
      console.log(`\n  Large disagreements (>2 pts on averaged scores): ${agreement.largeDisagreements.length}`);
    }
  }

  console.log('\n══ Multi-Judge Model Scores ══');
  const modelList = Object.entries(multiJudgeMeans)
    .map(([model, means]) => {
      const scoreKey = means.multiJudge ? 'multiJudge' : Object.keys(means)[0];
      return { model, overall: means[scoreKey].overall };
    })
    .sort((a, b) => b.overall - a.overall);

  for (const { model, overall } of modelList) {
    console.log(`  ${model.padEnd(26)} ${overall.toFixed(2)}`);
  }
  console.log('');
}

main();
