/**
 * Fix duplicate rankings within the same LLM response.
 *
 * When an LLM lists the same person under two different name spellings
 * (e.g. "Ts'ai Lun" and "Cai Lun"), both get matched to the same figure_id,
 * resulting in duplicate (figure_id, source, sample_id) rows.
 *
 * For each duplicate group this script keeps ONLY the row with the lowest
 * (best) rank value and deletes the rest.
 *
 * Usage:
 *   node scripts/fix-duplicate-rankings.cjs --dry-run   # preview only
 *   node scripts/fix-duplicate-rankings.cjs             # execute fix
 */

const Database = require('better-sqlite3');
const { recalculateConsensus } = require('./recalculate-consensus.cjs');

const dryRun = process.argv.includes('--dry-run');

function main() {
  const db = new Database('historyrank.db');

  console.log('\n=== Fix Duplicate Rankings ===');
  if (dryRun) console.log('(DRY RUN — no changes will be made)\n');
  else console.log('');

  // Find all (figure_id, source, sample_id) groups with more than one row
  const dupeGroups = db.prepare(`
    SELECT figure_id, source, sample_id, COUNT(*) as cnt
    FROM rankings
    GROUP BY figure_id, source, sample_id
    HAVING cnt > 1
    ORDER BY figure_id, source, sample_id
  `).all();

  console.log(`Found ${dupeGroups.length} duplicate groups\n`);

  if (dupeGroups.length === 0) {
    console.log('Nothing to fix.');
    db.close();
    return;
  }

  // Prepared statements
  const getRows = db.prepare(`
    SELECT r.id, r.figure_id, r.source, r.sample_id, r.rank, r.raw_name,
           f.canonical_name
    FROM rankings r
    JOIN figures f ON r.figure_id = f.id
    WHERE r.figure_id = ? AND r.source = ? AND r.sample_id = ?
    ORDER BY r.rank ASC
  `);

  const deleteRow = db.prepare('DELETE FROM rankings WHERE id = ?');

  let fixed = 0;
  let totalDeleted = 0;

  const runFix = db.transaction(() => {
    for (const group of dupeGroups) {
      const rows = getRows.all(group.figure_id, group.source, group.sample_id);
      if (rows.length < 2) continue;

      // Keep the row with the lowest (best) rank; delete the rest
      const kept = rows[0];
      const toDelete = rows.slice(1);

      for (const row of toDelete) {
        console.log(
          `  FIX  "${kept.canonical_name}" | ${group.source} | ${group.sample_id}` +
          ` | keep rank=${kept.rank} ("${kept.raw_name}")` +
          ` | delete rank=${row.rank} ("${row.raw_name}")`
        );

        if (!dryRun) {
          deleteRow.run(row.id);
        }
        totalDeleted++;
      }

      fixed++;
    }
  });

  runFix();

  // Recalculate consensus after fixing
  if (!dryRun && fixed > 0) {
    console.log('\nRecalculating consensus rankings...');
    recalculateConsensus(db);
  }

  // Summary
  console.log('\n=== SUMMARY ===');
  console.log(`  Duplicate groups found:  ${dupeGroups.length}`);
  console.log(`  Groups fixed:            ${fixed}`);
  console.log(`  Rows deleted:            ${totalDeleted}`);
  if (dryRun) console.log('  (no changes made — dry run)');
  console.log('');

  db.close();
}

main();
