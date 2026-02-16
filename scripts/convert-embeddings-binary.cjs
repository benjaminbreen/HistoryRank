#!/usr/bin/env node
/**
 * Convert figures.json (149MB JSON) → binary format for Vercel deployment.
 *
 * Output:
 *   data/embeddings/figures-meta.json  (~100KB)  - { model, dims, createdAt, count, ids }
 *   data/embeddings/figures-vectors.bin (~29MB)   - raw Float32LE, count × dims × 4 bytes
 *
 * The two files share the same ordering: ids[i] corresponds to the vector
 * starting at byte offset i * dims * 4 in the binary file.
 *
 * Usage:  node scripts/convert-embeddings-binary.cjs
 */

const fs = require('fs');
const path = require('path');

const INPUT = path.join(__dirname, '..', 'data', 'embeddings', 'figures.json');
const META_OUT = path.join(__dirname, '..', 'data', 'embeddings', 'figures-meta.json');
const BIN_OUT = path.join(__dirname, '..', 'data', 'embeddings', 'figures-vectors.bin');

console.log('[convert] Reading', INPUT);
const raw = fs.readFileSync(INPUT, 'utf8');
if (!raw.startsWith('{')) {
  console.error('[convert] figures.json appears to be an LFS pointer, not actual data. Run `git lfs pull` first.');
  process.exit(1);
}

const data = JSON.parse(raw);
const { model, dims, createdAt, figures } = data;

if (!Array.isArray(figures) || figures.length === 0) {
  console.error('[convert] No figures found in embeddings file');
  process.exit(1);
}

const count = figures.length;
console.log(`[convert] ${count} figures, ${dims} dims, model=${model}`);

// Validate all vectors have the expected dimension
for (let i = 0; i < count; i++) {
  const fig = figures[i];
  if (!fig.id || !Array.isArray(fig.vector)) {
    console.error(`[convert] Invalid figure at index ${i}: missing id or vector`);
    process.exit(1);
  }
  if (fig.vector.length !== dims) {
    console.error(`[convert] Figure "${fig.id}" has ${fig.vector.length} dims, expected ${dims}`);
    process.exit(1);
  }
}

// Write meta JSON
const ids = figures.map((f) => f.id);
const meta = { model, dims, createdAt, count, ids };
fs.writeFileSync(META_OUT, JSON.stringify(meta));
const metaSize = fs.statSync(META_OUT).size;
console.log(`[convert] Wrote ${META_OUT} (${(metaSize / 1024).toFixed(1)} KB)`);

// Write binary vectors (Float32LE)
const expectedBytes = count * dims * 4;
const buffer = Buffer.alloc(expectedBytes);
for (let i = 0; i < count; i++) {
  const vec = figures[i].vector;
  const offset = i * dims * 4;
  for (let j = 0; j < dims; j++) {
    buffer.writeFloatLE(vec[j], offset + j * 4);
  }
}
fs.writeFileSync(BIN_OUT, buffer);
const binSize = fs.statSync(BIN_OUT).size;
console.log(`[convert] Wrote ${BIN_OUT} (${(binSize / 1024 / 1024).toFixed(1)} MB)`);

// Validate
if (binSize !== expectedBytes) {
  console.error(`[convert] Binary size mismatch: got ${binSize}, expected ${expectedBytes}`);
  process.exit(1);
}

// Quick sanity check: read back first vector and compare
const checkBuf = fs.readFileSync(BIN_OUT);
const firstVec = figures[0].vector;
let maxDiff = 0;
for (let j = 0; j < dims; j++) {
  const diff = Math.abs(checkBuf.readFloatLE(j * 4) - firstVec[j]);
  if (diff > maxDiff) maxDiff = diff;
}
console.log(`[convert] Sanity check: max float diff for first vector = ${maxDiff.toExponential(2)} (should be ~0)`);

console.log('[convert] Done! You can now commit figures-meta.json and figures-vectors.bin (and remove figures.json from LFS).');
