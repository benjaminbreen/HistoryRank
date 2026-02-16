#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// blind-samples.cjs
// Blinds HistoryBench samples by replacing model names with deterministic
// random 4-letter uppercase codes, then shuffles entries so evaluators
// cannot infer model identity from ordering.
// ---------------------------------------------------------------------------

const ROOT = path.resolve(__dirname, '..', '..');
const INPUT = path.join(ROOT, 'data', 'derived', 'historybench-samples-v1.json');
const OUTPUT_BLINDED = path.join(ROOT, 'data', 'derived', 'historybench-samples-blinded.json');
const OUTPUT_KEY = path.join(ROOT, 'data', 'derived', 'historybench-blind-key.json');

// --- Step 1: Read input samples -------------------------------------------

if (!fs.existsSync(INPUT)) {
  console.error(`Input file not found: ${INPUT}`);
  process.exit(1);
}

const samples = JSON.parse(fs.readFileSync(INPUT, 'utf-8'));
console.log(`Read ${samples.length} samples from ${path.relative(ROOT, INPUT)}`);

// --- Step 2: Assign each unique model a deterministic 4-letter code -------

/**
 * Derive a 4-letter uppercase code (A-Z only) from a model name.
 * Uses SHA-256 with a fixed prefix so the mapping is reproducible.
 * We take the first 8 hex chars and map each pair to a letter A-Z.
 */
function modelToCode(model) {
  const hash = crypto
    .createHash('sha256')
    .update('historybench-v1-blind-' + model)
    .digest('hex');

  // Map 4 pairs of hex digits -> letters A-Z (0-25)
  let code = '';
  for (let i = 0; i < 4; i++) {
    const byte = parseInt(hash.slice(i * 2, i * 2 + 2), 16); // 0-255
    const letter = String.fromCharCode(65 + (byte % 26));      // A-Z
    code += letter;
  }
  return code;
}

const models = [...new Set(samples.map((s) => s.model))].sort();
const codeMap = {};    // code -> modelName
const modelMap = {};   // modelName -> code

// Ensure no code collisions (extremely unlikely but worth checking)
const usedCodes = new Set();
for (const model of models) {
  let code = modelToCode(model);
  // On the off-chance of a collision, append hash bytes until unique
  if (usedCodes.has(code)) {
    const hash = crypto
      .createHash('sha256')
      .update('historybench-v1-blind-' + model)
      .digest('hex');
    let offset = 4;
    while (usedCodes.has(code)) {
      const byte = parseInt(hash.slice(offset * 2, offset * 2 + 2), 16);
      code = code.slice(0, 3) + String.fromCharCode(65 + (byte % 26));
      offset++;
    }
  }
  usedCodes.add(code);
  codeMap[code] = model;
  modelMap[model] = code;
}

// --- Step 3: Create blinded entries ---------------------------------------

const blinded = samples.map((s, idx) => ({
  blindId: `${modelMap[s.model]}-${idx}`,
  figureId: s.figureId,
  figureName: s.figureName,
  rank: s.rank,
  tier: s.tier,
  contribution: s.contribution,
}));

// --- Step 4: Seeded Fisher-Yates shuffle ----------------------------------

/**
 * Produce a deterministic sequence of pseudo-random 32-bit uints from a seed
 * string by repeatedly hashing with an incrementing counter.
 */
function seededShuffle(arr, seed) {
  const result = [...arr];
  // Pre-generate enough random bytes
  // We need (result.length - 1) random values
  const n = result.length;
  let hashState = crypto.createHash('sha256').update(seed).digest();

  let byteOffset = 0;

  function nextUint32() {
    // If we've exhausted our current hash buffer, extend it
    if (byteOffset + 4 > hashState.length) {
      hashState = crypto
        .createHash('sha256')
        .update(Buffer.concat([hashState, Buffer.from([byteOffset & 0xff])]))
        .digest();
      byteOffset = 0;
    }
    const val = hashState.readUInt32BE(byteOffset);
    byteOffset += 4;
    return val;
  }

  // Fisher-Yates (Knuth) shuffle
  for (let i = n - 1; i > 0; i--) {
    const j = nextUint32() % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

const shuffled = seededShuffle(blinded, 'historybench-v1-shuffle');

// --- Step 5: Write blinded output -----------------------------------------

fs.writeFileSync(OUTPUT_BLINDED, JSON.stringify(shuffled, null, 2) + '\n');
console.log(`Wrote ${shuffled.length} blinded entries to ${path.relative(ROOT, OUTPUT_BLINDED)}`);

// --- Step 6: Write key file -----------------------------------------------

const key = {};
for (const [code, model] of Object.entries(codeMap)) {
  key[code] = model;
  key[model] = code;
}

fs.writeFileSync(OUTPUT_KEY, JSON.stringify(key, null, 2) + '\n');
console.log(`Wrote blind key to ${path.relative(ROOT, OUTPUT_KEY)}`);

// --- Summary --------------------------------------------------------------

console.log('\n--- Blinding Summary ---');
console.log(`Entries blinded: ${shuffled.length}`);
console.log(`Models:          ${models.length}`);
console.log('Code mappings:');
for (const model of models) {
  console.log(`  ${modelMap[model]} -> ${model}`);
}
