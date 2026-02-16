/**
 * Deduplicate figures across the entire database.
 *
 * Handles four duplicate categories:
 *   A. Diacritics (Hugo Chavez / Hugo Chávez)
 *   B. Spelling/transliteration (Michaelangelo / Michelangelo)
 *   C. Short vs full name (Niels Abel / Niels Henrik Abel)
 *   D. Title/prefix variants (Thomas Aquinas / Saint Thomas Aquinas)
 *
 * For each pair the entry with more complete data is kept.
 * All foreign-key references are reassigned before the duplicate is deleted.
 *
 * Usage:
 *   node scripts/dedup-all.cjs --dry-run   # preview only
 *   node scripts/dedup-all.cjs             # execute merge
 */

const Database = require('better-sqlite3');
const { recalculateConsensus } = require('./recalculate-consensus.cjs');

const dryRun = process.argv.includes('--dry-run');

// ── Duplicate pairs ─────────────────────────────────────────────────
// Each pair is [idA, idB]. The script picks the richer entry to keep.
// Round 2: additional duplicates found via substring, title, and surname matching.
const PAIRS = [
  // ── E. "X of Y" pattern ─────────────────────────────────────────────
  ['euclid-of-alexandria',  'euclid'],
  ['sappho-of-lesbos',     'sappho'],
  ['diogenes-of-sinope',   'diogenes'],
  ['louis-xvi-of-france',  'louis-xvi'],
  ['artaxerxes-i-of-persia','artaxerxes-i'],
  ['king-john-of-england', 'king-john'],
  ['george-iii-of-the-united-kingdom', 'george-iii'],
  ['richard-iii-of-england','richard-iii'],
  ['alcuin-of-york',       'alcuin'],
  ['king-hussein-of-jordan','king-hussein'],
  ['thales',               'thales-of-miletus'],
  ['saadi',                'saadi-shirazi'],

  // ── F. Title-prefixed (Emperor, King, Saint, Amir) ─────────────────
  ['emperor-ashoka',       'ashoka'],
  ['amir-timur',           'timur'],
  ['king-david',           'david'],
  ['emperor-diocletian',   'diocletian'],
  ['emperor-hadrian',      'hadrian'],
  ['empress-theodora',     'theodora'],
  ['emperor-trajan',       'trajan'],
  ['emperor-basil-ii',     'basil-ii'],
  ['emperor-nero',         'nero'],
  ['emperor-claudius',     'claudius'],
  ['emperor-menelik-ii',   'menelik-ii'],
  ['saint-jerome',         'jerome'],

  // ── G. Surname-only vs full name ───────────────────────────────────
  ['malthus',              'thomas-malthus'],
  ['maximilien-de-robespierre', 'robespierre'],
  ['vesalius',             'andreas-vesalius'],
  ['jalal-ad-din-rumi',   'rumi'],
  ['diderot',              'denis-diderot'],
  ['boccaccio',            'giovanni-boccaccio'],
  ['rasputin',             'grigori-rasputin'],
  ['metternich',           'klemens-von-metternich'],
  ['avogadro',             'amedeo-avogadro'],
  ['tito',                 'josip-broz-tito'],
  ['baudelaire',           'charles-baudelaire'],
  ['mazzini',              'giuseppe-mazzini'],
  ['malinowski',           'bronis-aw-malinowski'],
  ['shivaji-bhonsle',      'shivaji'],
  ['viking-leader-leif-erikson', 'leif-erikson'],
  ['salazar',              'ant-nio-de-oliveira-salazar'],
  ['lula-da-silva',        'luiz-in-cio-lula-da-silva'],
  ['reza-shah-pahlavi',    'reza-shah'],
  ['sinan',                'mimar-sinan'],
  ['miguel-hidalgo',       'miguel-hidalgo-y-costilla'],

  // ── H. Longer qualifier duplicates ─────────────────────────────────
  ['otto-i-holy-roman-emperor',   'otto-i'],
  ['wilhelm-ii-german-emperor',   'wilhelm-ii'],
  ['joseph-ii-holy-roman-emperor','joseph-ii'],
  ['muhammad-ali-pasha',          'muhammad-ali-of-egypt'],
  ['aisha-bint-abi-bakr',         'aisha'],
  ['moses-in-islam',              'moses'],
];

// ── Helpers ──────────────────────────────────────────────────────────

function hasValue(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  return true;
}

/** Score a figure row by data completeness + ranking depth */
function scoreFigure(fig, rankingCount) {
  let s = 0;
  if (hasValue(fig.wikipedia_slug))      s += 5;
  if (hasValue(fig.hpi_rank))            s += 3;
  if (hasValue(fig.hpi_score))           s += 2;
  if (hasValue(fig.birth_year))          s += 1;
  if (hasValue(fig.death_year))          s += 1;
  if (hasValue(fig.domain))              s += 1;
  if (hasValue(fig.era))                 s += 1;
  if (hasValue(fig.region_sub))          s += 1;
  if (hasValue(fig.region_macro))        s += 1;
  if (hasValue(fig.birth_lat))           s += 1;
  if (hasValue(fig.birth_lon))           s += 1;
  if (hasValue(fig.pageviews_2024))      s += 2;
  if (hasValue(fig.pageviews_2025))      s += 2;
  if (hasValue(fig.pageviews_global))    s += 1;
  if (hasValue(fig.llm_consensus_rank))  s += 1;
  if (hasValue(fig.wikidata_qid))        s += 1;
  if (hasValue(fig.wikipedia_extract))   s += 1;
  // Ranking depth — strong signal that this is the "real" entry
  if (rankingCount >= 20) s += 5;
  else if (rankingCount >= 5) s += 3;
  else if (rankingCount >= 2) s += 1;
  return s;
}

/** Pick the richer figure as primary */
function choosePrimary(a, b, rankingsA, rankingsB) {
  const sa = scoreFigure(a, rankingsA), sb = scoreFigure(b, rankingsB);
  if (sa !== sb) return sa > sb ? [a, b] : [b, a];
  // tie-break: better consensus rank
  const ra = a.llm_consensus_rank ?? Infinity;
  const rb = b.llm_consensus_rank ?? Infinity;
  if (ra !== rb) return ra < rb ? [a, b] : [b, a];
  // tie-break: more pageviews
  const va = (a.pageviews_2024 ?? 0) + (a.pageviews_2025 ?? 0);
  const vb = (b.pageviews_2024 ?? 0) + (b.pageviews_2025 ?? 0);
  if (va !== vb) return va > vb ? [a, b] : [b, a];
  // arbitrary stable tie-break
  return a.id < b.id ? [a, b] : [b, a];
}

// ── Main ─────────────────────────────────────────────────────────────

function main() {
  const db = new Database('historyrank.db');
  db.pragma('foreign_keys = OFF');  // we handle FK integrity manually

  console.log('\n=== Deduplicating Figures ===');
  if (dryRun) console.log('(DRY RUN — no changes will be made)\n');
  else console.log('');

  const startCount = db.prepare('SELECT COUNT(*) as c FROM figures').get().c;
  console.log(`Starting figure count: ${startCount}\n`);

  // Prepared statements ──────────────────────────────────────────────
  const getFigure = db.prepare('SELECT * FROM figures WHERE id = ?');
  const countRankings = db.prepare('SELECT COUNT(*) as c FROM rankings WHERE figure_id = ?');

  // Reassign FKs (OR IGNORE where unique constraints exist)
  const moveRankings       = db.prepare('UPDATE rankings SET figure_id = ? WHERE figure_id = ?');
  const moveAliases        = db.prepare('UPDATE OR IGNORE name_aliases SET figure_id = ? WHERE figure_id = ?');
  const moveSources        = db.prepare('UPDATE OR IGNORE figure_research_sources SET figure_id = ? WHERE figure_id = ?');
  const moveQuotes         = db.prepare('UPDATE OR IGNORE figure_quotes SET figure_id = ? WHERE figure_id = ?');
  const moveSnippets       = db.prepare('UPDATE OR IGNORE figure_historical_snippets SET figure_id = ? WHERE figure_id = ?');
  const moveAssessments    = db.prepare('UPDATE OR IGNORE figure_assessments SET figure_id = ? WHERE figure_id = ?');
  const moveTimeline       = db.prepare('UPDATE OR IGNORE figure_timeline_events SET figure_id = ? WHERE figure_id = ?');
  const moveInfluenceFrom  = db.prepare('UPDATE OR IGNORE influence_edges SET from_figure_id = ? WHERE from_figure_id = ?');
  const moveInfluenceTo    = db.prepare('UPDATE OR IGNORE influence_edges SET to_figure_id = ? WHERE to_figure_id = ?');

  // Merge enrichment data into primary (fill NULLs only)
  const updateFigure = db.prepare(`
    UPDATE figures SET
      birth_year       = COALESCE(birth_year, ?),
      death_year       = COALESCE(death_year, ?),
      domain           = COALESCE(domain, ?),
      occupation       = COALESCE(occupation, ?),
      era              = COALESCE(era, ?),
      region_macro     = COALESCE(region_macro, ?),
      region_sub       = COALESCE(region_sub, ?),
      birth_polity     = COALESCE(birth_polity, ?),
      birth_place      = COALESCE(birth_place, ?),
      birth_lat        = COALESCE(birth_lat, ?),
      birth_lon        = COALESCE(birth_lon, ?),
      wikipedia_slug   = COALESCE(wikipedia_slug, ?),
      wikipedia_extract= COALESCE(wikipedia_extract, ?),
      pageviews_2024   = COALESCE(pageviews_2024, ?),
      pageviews_2025   = COALESCE(pageviews_2025, ?),
      pageviews_global = COALESCE(pageviews_global, ?),
      hpi_rank         = COALESCE(hpi_rank, ?),
      hpi_score        = COALESCE(hpi_score, ?),
      wikidata_qid     = COALESCE(wikidata_qid, ?),
      ngram_data       = COALESCE(ngram_data, ?),
      ngram_avg        = COALESCE(ngram_avg, ?),
      ngram_percentile = COALESCE(ngram_percentile, ?),
      related_figures  = COALESCE(related_figures, ?),
      updated_at       = ?
    WHERE id = ?
  `);

  const insertAlias = db.prepare('INSERT OR IGNORE INTO name_aliases (alias, figure_id) VALUES (?, ?)');
  // Delete orphan rows left behind when OR IGNORE skips a conflicting UPDATE
  const deleteOrphanAliases    = db.prepare('DELETE FROM name_aliases WHERE figure_id = ?');
  const deleteOrphanSources    = db.prepare('DELETE FROM figure_research_sources WHERE figure_id = ?');
  const deleteOrphanQuotes     = db.prepare('DELETE FROM figure_quotes WHERE figure_id = ?');
  const deleteOrphanSnippets   = db.prepare('DELETE FROM figure_historical_snippets WHERE figure_id = ?');
  const deleteOrphanAssessments= db.prepare('DELETE FROM figure_assessments WHERE figure_id = ?');
  const deleteOrphanTimeline   = db.prepare('DELETE FROM figure_timeline_events WHERE figure_id = ?');
  const deleteOrphanInfluence  = db.prepare('DELETE FROM influence_edges WHERE from_figure_id = ? OR to_figure_id = ?');
  const deleteFigure = db.prepare('DELETE FROM figures WHERE id = ?');

  // ── Process pairs ──────────────────────────────────────────────────
  let merged = 0, skipped = 0;
  const stats = { rankings: 0, aliases: 0, sources: 0, quotes: 0, snippets: 0, assessments: 0, timeline: 0, influence: 0 };

  const runMerge = db.transaction(() => {
    for (const [idA, idB] of PAIRS) {
      const figA = getFigure.get(idA);
      const figB = getFigure.get(idB);

      if (!figA && !figB) {
        console.log(`  SKIP  neither exists: ${idA} / ${idB}`);
        skipped++;
        continue;
      }
      if (!figA) {
        console.log(`  SKIP  already merged: ${idA} (into ${idB})`);
        skipped++;
        continue;
      }
      if (!figB) {
        console.log(`  SKIP  already merged: ${idB} (into ${idA})`);
        skipped++;
        continue;
      }

      const rankingsA = countRankings.get(figA.id).c;
      const rankingsB = countRankings.get(figB.id).c;
      const [primary, secondary] = choosePrimary(figA, figB, rankingsA, rankingsB);
      const pRankings = countRankings.get(primary.id).c;
      const sRankings = countRankings.get(secondary.id).c;

      console.log(`  MERGE "${secondary.canonical_name}" (${secondary.id})  -->  "${primary.canonical_name}" (${primary.id})`);
      console.log(`         scores: keep=${scoreFigure(primary)} drop=${scoreFigure(secondary)}  rankings: keep=${pRankings} drop=${sRankings}`);

      if (dryRun) { merged++; continue; }

      // 1. Reassign rankings
      const r = moveRankings.run(primary.id, secondary.id);
      stats.rankings += r.changes;

      // 2. Reassign child tables
      stats.sources     += moveSources.run(primary.id, secondary.id).changes;
      stats.quotes      += moveQuotes.run(primary.id, secondary.id).changes;
      stats.snippets    += moveSnippets.run(primary.id, secondary.id).changes;
      stats.assessments += moveAssessments.run(primary.id, secondary.id).changes;
      stats.timeline    += moveTimeline.run(primary.id, secondary.id).changes;

      // 3. Reassign influence edges (OR IGNORE handles unique constraint)
      stats.influence += moveInfluenceFrom.run(primary.id, secondary.id).changes;
      stats.influence += moveInfluenceTo.run(primary.id, secondary.id).changes;

      // 4. Add aliases
      moveAliases.run(primary.id, secondary.id);
      insertAlias.run(secondary.canonical_name, primary.id);
      insertAlias.run(secondary.id, primary.id);
      stats.aliases += 2;

      // 5. Merge enrichment data into primary
      updateFigure.run(
        secondary.birth_year,
        secondary.death_year,
        secondary.domain,
        secondary.occupation,
        secondary.era,
        secondary.region_macro,
        secondary.region_sub,
        secondary.birth_polity,
        secondary.birth_place,
        secondary.birth_lat,
        secondary.birth_lon,
        secondary.wikipedia_slug,
        secondary.wikipedia_extract,
        secondary.pageviews_2024,
        secondary.pageviews_2025,
        secondary.pageviews_global,
        secondary.hpi_rank,
        secondary.hpi_score,
        secondary.wikidata_qid,
        secondary.ngram_data,
        secondary.ngram_avg,
        secondary.ngram_percentile,
        secondary.related_figures,
        Date.now(),
        primary.id
      );

      // 6. Clean up remaining orphan rows, then delete duplicate
      deleteOrphanAliases.run(secondary.id);
      deleteOrphanSources.run(secondary.id);
      deleteOrphanQuotes.run(secondary.id);
      deleteOrphanSnippets.run(secondary.id);
      deleteOrphanAssessments.run(secondary.id);
      deleteOrphanTimeline.run(secondary.id);
      deleteOrphanInfluence.run(secondary.id, secondary.id);
      deleteFigure.run(secondary.id);

      merged++;
    }
  });

  runMerge();

  // ── Recalculate consensus ──────────────────────────────────────────
  if (!dryRun) {
    console.log('\nRecalculating consensus rankings...');
    recalculateConsensus(db);
  }

  const endCount = db.prepare('SELECT COUNT(*) as c FROM figures').get().c;

  // ── Summary ────────────────────────────────────────────────────────
  console.log('\n=== SUMMARY ===');
  console.log(`  Pairs processed:    ${merged}`);
  console.log(`  Pairs skipped:      ${skipped}`);
  console.log(`  Figures before:     ${startCount}`);
  console.log(`  Figures after:      ${endCount}`);
  console.log(`  Figures removed:    ${startCount - endCount}`);
  if (!dryRun) {
    console.log(`  Rankings moved:     ${stats.rankings}`);
    console.log(`  Aliases added:      ${stats.aliases}`);
    console.log(`  Sources moved:      ${stats.sources}`);
    console.log(`  Quotes moved:       ${stats.quotes}`);
    console.log(`  Snippets moved:     ${stats.snippets}`);
    console.log(`  Assessments moved:  ${stats.assessments}`);
    console.log(`  Timeline moved:     ${stats.timeline}`);
    console.log(`  Influence moved:    ${stats.influence}`);
  }
  console.log('');

  db.close();
}

main();
