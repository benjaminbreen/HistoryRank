#!/usr/bin/env node
/**
 * HistoryBench v1.0: Run all Layer 1 (objective) metrics.
 *
 * Runs: consistency, temporal calibration, substantiveness, consensus inversions.
 * Writes combined output to data/derived/historybench-layer1.json
 */

const path = require('path');
const fs = require('fs');

const OUT_PATH = path.join(__dirname, '..', '..', 'data', 'derived', 'historybench-layer1.json');

function main() {
  console.log('HistoryBench v1.0 — Layer 1 Objective Metrics');
  console.log('==============================================\n');

  // Run all four computations
  console.log('1/4 Computing self-consistency...');
  const { compute: computeConsistency } = require('./compute-consistency.cjs');
  const consistency = computeConsistency();

  console.log('2/4 Computing temporal calibration...');
  const { compute: computeTemporal } = require('./compute-temporal.cjs');
  const temporal = computeTemporal();

  console.log('3/4 Computing description substantiveness...');
  const { compute: computeSubstantiveness } = require('./compute-substantiveness.cjs');
  const substantiveness = computeSubstantiveness();

  console.log('4/4 Computing consensus inversions...');
  const { compute: computeInversions } = require('./compute-inversions.cjs');
  const inversions = computeInversions();

  // Combine into single output
  const layer1 = {
    meta: {
      version: '1.0',
      date: new Date().toISOString().split('T')[0],
      description: 'Layer 1 objective metrics — no LLM judge required',
    },
    ...consistency,
    ...temporal,
    ...substantiveness,
    ...inversions,
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(layer1, null, 2));
  console.log(`\nAll Layer 1 metrics written to ${OUT_PATH}`);

  // Print summary table
  const models = Object.keys(layer1.selfConsistency).sort();
  console.log('\n── Summary ──\n');
  const hdr = `${'Model'.padEnd(26)} ${'Rho'.padStart(6)} ${'Med BY'.padStart(7)} ${'%Live'.padStart(6)} ${'MeanL'.padStart(6)} ${'%Kw'.padStart(5)} ${'Inv'.padStart(5)} ${'InvR%'.padStart(6)}`;
  console.log(hdr);
  console.log('-'.repeat(hdr.length));
  for (const m of models) {
    const sc = layer1.selfConsistency[m];
    const tc = layer1.temporalCalibration[m];
    const su = layer1.substantiveness[m];
    const ci = layer1.consensusInversions[m];
    console.log(
      `${m.padEnd(26)} ${(isNaN(sc.meanRho) ? 'N/A' : sc.meanRho.toFixed(3)).padStart(6)} ${String(tc.medianBirthYear || 'N/A').padStart(7)} ${(tc.pctLiving + '').padStart(6)} ${String(su.meanLength).padStart(6)} ${su.pctKeywordOnly.toFixed(1).padStart(5)} ${String(ci.inversions).padStart(5)} ${(ci.inversionRate * 100).toFixed(1).padStart(6)}`
    );
  }
  console.log('');
}

main();
