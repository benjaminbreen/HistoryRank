#!/usr/bin/env node
/**
 * Split blinded samples into batches for judges that hit output token limits.
 *
 * Usage: node scripts/benchmark/split-blinded.cjs [batchSize]
 *   Default batch size: 65 (gives 4 batches of ~64 entries from 256 total)
 *
 * Output: data/derived/historybench-samples-blinded-batch{N}.json
 *
 * After judges score each batch, use merge-judge-batches.cjs to combine.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const INPUT = path.join(ROOT, 'data', 'derived', 'historybench-samples-blinded.json');
const DERIVED = path.join(ROOT, 'data', 'derived');

const batchSize = parseInt(process.argv[2]) || 65;

const samples = JSON.parse(fs.readFileSync(INPUT, 'utf-8'));
const totalBatches = Math.ceil(samples.length / batchSize);

console.log(`Splitting ${samples.length} entries into ${totalBatches} batches of ~${batchSize}`);

for (let i = 0; i < totalBatches; i++) {
  const batch = samples.slice(i * batchSize, (i + 1) * batchSize);
  const outPath = path.join(DERIVED, `historybench-samples-blinded-batch${i + 1}.json`);
  fs.writeFileSync(outPath, JSON.stringify(batch, null, 2));
  console.log(`  Batch ${i + 1}: ${batch.length} entries → ${path.basename(outPath)}`);
}

console.log(`\nDone. Judge each batch separately, then run merge-judge-batches.cjs to combine.`);
