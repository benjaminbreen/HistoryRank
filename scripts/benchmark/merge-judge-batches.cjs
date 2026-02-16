#!/usr/bin/env node
/**
 * Merge batch judge outputs into a single run file.
 *
 * Usage: node scripts/benchmark/merge-judge-batches.cjs <judge> <run>
 *   e.g.: node scripts/benchmark/merge-judge-batches.cjs claude 1
 *
 * Expects batch files named:
 *   judge-scores-{judge}-run{run}-batch{N}.json
 *
 * Output:
 *   judge-scores-{judge}-run{run}.json
 *
 * Also validates that all entries have proper scores.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DERIVED = path.join(ROOT, 'data', 'derived');
const DIMENSIONS = ['factualPrecision', 'causalSpecificity', 'proportionality', 'nuance', 'knowledgeDepth'];

const judge = process.argv[2];
const run = process.argv[3];

if (!judge || !run) {
  console.error('Usage: node merge-judge-batches.cjs <judge> <run>');
  console.error('  e.g.: node merge-judge-batches.cjs claude 1');
  process.exit(1);
}

// Find all batch files for this judge+run
const merged = [];
const errors = [];
let batchNum = 1;

while (true) {
  const batchPath = path.join(DERIVED, `judge-scores-${judge}-run${run}-batch${batchNum}.json`);
  if (!fs.existsSync(batchPath)) break;

  const batch = JSON.parse(fs.readFileSync(batchPath, 'utf-8'));
  console.log(`  Batch ${batchNum}: ${batch.length} entries`);

  // Validate each entry
  for (const entry of batch) {
    if (!entry.blindId) {
      errors.push(`Batch ${batchNum}: entry missing blindId`);
      continue;
    }
    if (!entry.scores) {
      errors.push(`Batch ${batchNum}: ${entry.blindId} missing scores`);
      continue;
    }
    for (const dim of DIMENSIONS) {
      const v = entry.scores[dim];
      if (v == null || v < 1 || v > 5) {
        errors.push(`Batch ${batchNum}: ${entry.blindId} invalid ${dim}=${v}`);
      }
    }
    merged.push(entry);
  }

  batchNum++;
}

if (batchNum === 1) {
  console.error(`No batch files found for judge="${judge}" run="${run}".`);
  console.error(`Expected: judge-scores-${judge}-run${run}-batch1.json, etc.`);
  process.exit(1);
}

const totalBatches = batchNum - 1;

// Check for duplicate blindIds
const seen = new Set();
const dupes = [];
for (const entry of merged) {
  if (seen.has(entry.blindId)) dupes.push(entry.blindId);
  seen.add(entry.blindId);
}

console.log(`\nMerged ${totalBatches} batches → ${merged.length} total entries`);

if (dupes.length > 0) {
  console.warn(`WARNING: ${dupes.length} duplicate blindIds found: ${dupes.slice(0, 5).join(', ')}...`);
}
if (errors.length > 0) {
  console.warn(`\nValidation issues (${errors.length}):`);
  for (const e of errors.slice(0, 10)) console.warn(`  ${e}`);
  if (errors.length > 10) console.warn(`  ... and ${errors.length - 10} more`);
}

// Check coverage against blinded samples
const blindedPath = path.join(DERIVED, 'historybench-samples-blinded.json');
if (fs.existsSync(blindedPath)) {
  const blinded = JSON.parse(fs.readFileSync(blindedPath, 'utf-8'));
  const scoredIds = new Set(merged.map(e => e.blindId));
  const missing = blinded.filter(e => !scoredIds.has(e.blindId));
  if (missing.length > 0) {
    console.warn(`\nWARNING: ${missing.length} entries from blinded samples not scored:`);
    for (const m of missing.slice(0, 5)) {
      console.warn(`  ${m.blindId} (${m.figureName})`);
    }
    if (missing.length > 5) console.warn(`  ... and ${missing.length - 5} more`);
  } else {
    console.log(`Coverage: all ${blinded.length} blinded entries scored ✓`);
  }
}

const outPath = path.join(DERIVED, `judge-scores-${judge}-run${run}.json`);
fs.writeFileSync(outPath, JSON.stringify(merged, null, 2));
console.log(`\nWritten to ${outPath}`);
