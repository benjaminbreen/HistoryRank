/**
 * Merge duplicate figures that share the same Wikipedia slug
 *
 * For each set of duplicates:
 * 1. Keep the entry with the best (lowest) llm_consensus_rank
 * 2. Move all rankings from duplicates to the canonical entry
 * 3. Add alternate names to name_aliases table
 * 4. Merge any enrichment data (birth_lat, era, etc.)
 * 5. Delete the duplicate figures
 *
 * Usage:
 *   node scripts/merge-duplicates.cjs [--dry-run]
 */

const Database = require('better-sqlite3');
const { recalculateConsensus } = require('./recalculate-consensus.cjs');

const dryRun = process.argv.includes('--dry-run');

function main() {
  const db = new Database('historyrank.db');

  console.log('\n🔄 Merging Duplicate Figures');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (dryRun) console.log('(DRY RUN - no changes will be made)\n');

  // Find all duplicate wikipedia_slugs
  const duplicates = db.prepare(`
    SELECT wikipedia_slug, COUNT(*) as count
    FROM figures
    WHERE wikipedia_slug IS NOT NULL
    GROUP BY wikipedia_slug
    HAVING COUNT(*) > 1
    ORDER BY count DESC
  `).all();

  console.log(`Found ${duplicates.length} duplicate Wikipedia slugs\n`);

  // Prepare statements
  const getFiguresBySlug = db.prepare(`
    SELECT id, canonical_name, llm_consensus_rank, birth_lat, birth_lon,
           era, birth_place, birth_polity, region_sub, region_macro,
           wikidata_qid, domain, occupation
    FROM figures
    WHERE wikipedia_slug = ?
    ORDER BY llm_consensus_rank ASC NULLS LAST
  `);

  const moveRankings = db.prepare(`
    UPDATE rankings SET figure_id = ? WHERE figure_id = ?
  `);

  const addAlias = db.prepare(`
    INSERT OR IGNORE INTO name_aliases (alias, figure_id) VALUES (?, ?)
  `);

  const moveAliases = db.prepare(`
    UPDATE name_aliases SET figure_id = ? WHERE figure_id = ?
  `);

  const deleteAliases = db.prepare(`
    DELETE FROM name_aliases WHERE figure_id = ?
  `);

  const updateFigure = db.prepare(`
    UPDATE figures SET
      birth_lat = COALESCE(birth_lat, ?),
      birth_lon = COALESCE(birth_lon, ?),
      era = COALESCE(era, ?),
      birth_place = COALESCE(birth_place, ?),
      birth_polity = COALESCE(birth_polity, ?),
      region_sub = COALESCE(region_sub, ?),
      region_macro = COALESCE(region_macro, ?),
      wikidata_qid = COALESCE(wikidata_qid, ?),
      domain = COALESCE(domain, ?),
      occupation = COALESCE(occupation, ?)
    WHERE id = ?
  `);

  const deleteFigure = db.prepare(`DELETE FROM figures WHERE id = ?`);

  const countRankings = db.prepare(`SELECT COUNT(*) as count FROM rankings WHERE figure_id = ?`);

  let mergedCount = 0;
  let deletedCount = 0;
  let aliasesAdded = 0;
  let rankingsMoved = 0;

  for (const dup of duplicates) {
    const figures = getFiguresBySlug.all(dup.wikipedia_slug);

    // The first one (best rank) is canonical
    const canonical = figures[0];
    const duplicatesToMerge = figures.slice(1);

    const canonicalRankings = countRankings.get(canonical.id).count;

    console.log(`\n📎 ${dup.wikipedia_slug}`);
    console.log(`   Keeping: ${canonical.canonical_name} (id: ${canonical.id}, rank: ${canonical.llm_consensus_rank || 'unranked'}, ${canonicalRankings} rankings)`);

    for (const duplicate of duplicatesToMerge) {
      const dupRankings = countRankings.get(duplicate.id).count;
      console.log(`   Merging: ${duplicate.canonical_name} (id: ${duplicate.id}, rank: ${duplicate.llm_consensus_rank || 'unranked'}, ${dupRankings} rankings)`);

      if (!dryRun) {
        // 1. Move rankings
        moveRankings.run(canonical.id, duplicate.id);
        rankingsMoved += dupRankings;

        // 2. Add alias for the alternate name
        addAlias.run(duplicate.canonical_name, canonical.id);
        // Also add the duplicate's id as an alias (useful for lookups)
        addAlias.run(duplicate.id, canonical.id);
        aliasesAdded += 2;

        // 3. Merge enrichment data (fill in any nulls in canonical)
        updateFigure.run(
          duplicate.birth_lat,
          duplicate.birth_lon,
          duplicate.era,
          duplicate.birth_place,
          duplicate.birth_polity,
          duplicate.region_sub,
          duplicate.region_macro,
          duplicate.wikidata_qid,
          duplicate.domain,
          duplicate.occupation,
          canonical.id
        );

        // 4. Handle existing aliases - move them to canonical, then delete any remaining
        moveAliases.run(canonical.id, duplicate.id);
        deleteAliases.run(duplicate.id);

        // 5. Delete the duplicate
        deleteFigure.run(duplicate.id);
        deletedCount++;
      }

      mergedCount++;
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 MERGE SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   Duplicate sets processed: ${duplicates.length}`);
  console.log(`   Figures merged: ${mergedCount}`);
  console.log(`   Figures deleted: ${deletedCount}`);
  console.log(`   Rankings reassigned: ${rankingsMoved}`);
  console.log(`   Aliases added: ${aliasesAdded}`);

  if (!dryRun) {
    console.log('\n🔄 Recalculating consensus rankings...');
    recalculateConsensus(db);
  } else {
    console.log('\n   (Dry run - no changes made)');
  }

  // Final count
  const finalCount = db.prepare('SELECT COUNT(*) as count FROM figures').get();
  console.log(`\n📈 Final figure count: ${finalCount.count}`);

  db.close();
  console.log('\n✅ Done!\n');
}

main();
