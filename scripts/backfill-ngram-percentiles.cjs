/**
 * Backfill ngram_avg and ngram_percentile columns from existing ngram_data
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(process.cwd(), 'historyrank.db');

function main() {
  console.log('📊 Backfilling ngram averages and percentiles...\n');

  const db = new Database(DB_PATH);

  // Get all figures with ngram data
  const figures = db.prepare(`
    SELECT id, ngram_data FROM figures WHERE ngram_data IS NOT NULL
  `).all();

  console.log(`Found ${figures.length} figures with ngram data`);

  // Calculate averages
  const averages = [];
  for (const fig of figures) {
    try {
      const data = JSON.parse(fig.ngram_data);
      if (data?.values && Array.isArray(data.values) && data.values.length > 0) {
        const avg = data.values.reduce((a, b) => a + b, 0) / data.values.length;
        averages.push({ id: fig.id, avg });
      }
    } catch (e) {
      console.log(`  ⚠️ Failed to parse ngram_data for ${fig.id}`);
    }
  }

  console.log(`Calculated averages for ${averages.length} figures`);

  // Sort by average to calculate percentiles
  averages.sort((a, b) => a.avg - b.avg);

  // Assign percentiles (0-100)
  const total = averages.length;
  for (let i = 0; i < total; i++) {
    averages[i].percentile = Math.round((i / (total - 1)) * 100);
  }

  // Update database
  const updateStmt = db.prepare(`
    UPDATE figures SET ngram_avg = ?, ngram_percentile = ? WHERE id = ?
  `);

  const updateMany = db.transaction((items) => {
    for (const item of items) {
      updateStmt.run(item.avg, item.percentile, item.id);
    }
  });

  updateMany(averages);

  // Show some examples
  console.log('\n📈 Sample results (sorted by percentile):');
  const samples = db.prepare(`
    SELECT canonical_name, ngram_avg, ngram_percentile
    FROM figures
    WHERE ngram_percentile IS NOT NULL
    ORDER BY ngram_percentile DESC
    LIMIT 10
  `).all();

  for (const s of samples) {
    console.log(`   ${s.ngram_percentile}th percentile: ${s.canonical_name} (avg: ${(s.ngram_avg * 1000000).toFixed(2)} ppm)`);
  }

  console.log('\n   ...');

  const bottom = db.prepare(`
    SELECT canonical_name, ngram_avg, ngram_percentile
    FROM figures
    WHERE ngram_percentile IS NOT NULL
    ORDER BY ngram_percentile ASC
    LIMIT 5
  `).all();

  for (const s of bottom) {
    console.log(`   ${s.ngram_percentile}th percentile: ${s.canonical_name} (avg: ${(s.ngram_avg * 1000000).toFixed(2)} ppm)`);
  }

  db.close();
  console.log(`\n✅ Updated ${averages.length} figures with ngram percentiles`);
}

main();
