#!/usr/bin/env node
/**
 * Temporal Calibration Metrics for HistoryRank models.
 *
 * For each model (sample_id = 'list-1'), joins rankings with figures on
 * figure_id and computes for the top-100 ranked figures:
 *   - Median birth year
 *   - % living (death_year IS NULL)
 *   - % born after 1900
 *   - % born after 1950
 *
 * Exports a compute() function and prints a table when run directly.
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'historyrank.db');

function median(arr) {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function compute() {
  const db = new Database(DB_PATH, { readonly: true });

  const models = db
    .prepare("SELECT DISTINCT source FROM rankings WHERE sample_id = 'list-1' ORDER BY source")
    .all()
    .map(r => r.source);

  const stmt = db.prepare(`
    SELECT f.birth_year, f.death_year
    FROM rankings r
    JOIN figures f ON r.figure_id = f.id
    WHERE r.source = ?
      AND r.sample_id = 'list-1'
      AND r.rank <= 100
    ORDER BY r.rank
  `);

  const temporalCalibration = {};

  for (const model of models) {
    const rows = stmt.all(model);

    // Only consider rows that have a birth_year for birth-year-based metrics
    const withBirth = rows.filter(r => r.birth_year != null);
    const birthYears = withBirth.map(r => r.birth_year);

    const medianBirthYear = median(birthYears);
    const pctLiving = rows.length > 0
      ? round1((rows.filter(r => r.death_year == null).length / rows.length) * 100)
      : 0;
    const pctBornAfter1900 = withBirth.length > 0
      ? round1((withBirth.filter(r => r.birth_year > 1900).length / withBirth.length) * 100)
      : 0;
    const pctBornAfter1950 = withBirth.length > 0
      ? round1((withBirth.filter(r => r.birth_year > 1950).length / withBirth.length) * 100)
      : 0;

    temporalCalibration[model] = {
      medianBirthYear,
      pctLiving,
      pctBornAfter1900,
      pctBornAfter1950,
      sampleSize: rows.length,
    };
  }

  db.close();

  return { temporalCalibration };
}

// --- Main: run directly for console output ---
if (require.main === module) {
  const { temporalCalibration } = compute();

  console.log('');
  console.log('Temporal Calibration — Top-100 Figures per Model (list-1)');
  console.log('');

  const hdr = `${'Model'.padEnd(26)} ${'Median BY'.padStart(10)} ${'% Living'.padStart(9)} ${'% >1900'.padStart(9)} ${'% >1950'.padStart(9)} ${'n'.padStart(4)}`;
  console.log(hdr);
  console.log('-'.repeat(hdr.length));

  // Sort by median birth year (ascending = most ancient-leaning first)
  const entries = Object.entries(temporalCalibration)
    .sort(([, a], [, b]) => (a.medianBirthYear || 0) - (b.medianBirthYear || 0));

  for (const [model, m] of entries) {
    const byStr = m.medianBirthYear != null ? String(m.medianBirthYear) : 'N/A';
    console.log(
      `${model.padEnd(26)} ${byStr.padStart(10)} ${(m.pctLiving + '%').padStart(9)} ${(m.pctBornAfter1900 + '%').padStart(9)} ${(m.pctBornAfter1950 + '%').padStart(9)} ${String(m.sampleSize).padStart(4)}`
    );
  }

  // Summary stats across models
  const allMedians = entries.map(([, m]) => m.medianBirthYear).filter(v => v != null);
  const allPctLiving = entries.map(([, m]) => m.pctLiving);
  const allPct1900 = entries.map(([, m]) => m.pctBornAfter1900);
  const allPct1950 = entries.map(([, m]) => m.pctBornAfter1950);

  const avg = arr => arr.length ? round1(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
  const minMax = arr => arr.length ? { min: Math.min(...arr), max: Math.max(...arr) } : { min: 0, max: 0 };

  console.log('-'.repeat(hdr.length));
  console.log(
    `${'Average'.padEnd(26)} ${String(Math.round(avg(allMedians))).padStart(10)} ${(avg(allPctLiving) + '%').padStart(9)} ${(avg(allPct1900) + '%').padStart(9)} ${(avg(allPct1950) + '%').padStart(9)}`
  );

  const mmBY = minMax(allMedians);
  const mmLiving = minMax(allPctLiving);
  console.log('');
  console.log('Summary:');
  console.log(`  Median birth year range: ${mmBY.min} - ${mmBY.max}`);
  console.log(`  % Living range:          ${mmLiving.min}% - ${mmLiving.max}%`);

  // Flag potential recency bias
  const recencyBias = entries.filter(([, m]) => m.pctBornAfter1900 > 50);
  if (recencyBias.length > 0) {
    console.log('');
    console.log('  Recency bias flag (>50% born after 1900):');
    for (const [model, m] of recencyBias) {
      console.log(`    ${model}: ${m.pctBornAfter1900}%`);
    }
  }

  console.log('');
}

module.exports = { compute };
