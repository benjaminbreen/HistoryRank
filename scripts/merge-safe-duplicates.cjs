const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { recalculateConsensus } = require('./recalculate-consensus.cjs');

const REPORT_PATH = path.join(process.cwd(), 'data', 'reports', 'top-300-duplicate-safe.csv');

function normalizeAlias(name) {
  return name
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

function scoreFigure(fig) {
  let score = 0;
  if (hasValue(fig.wikipedia_slug)) score += 5;
  if (hasValue(fig.hpi_rank)) score += 3;
  if (hasValue(fig.hpi_score)) score += 2;
  if (hasValue(fig.birth_year)) score += 1;
  if (hasValue(fig.death_year)) score += 1;
  if (hasValue(fig.domain)) score += 1;
  if (hasValue(fig.era)) score += 1;
  if (hasValue(fig.region_sub)) score += 1;
  if (hasValue(fig.region_macro)) score += 1;
  if (hasValue(fig.birth_lat) && hasValue(fig.birth_lon)) score += 1;
  if (hasValue(fig.pageviews_2024)) score += 1;
  if (hasValue(fig.pageviews_2025)) score += 1;
  if (hasValue(fig.llm_consensus_rank)) score += 1;
  return score;
}

function choosePrimary(a, b) {
  const scoreA = scoreFigure(a);
  const scoreB = scoreFigure(b);
  if (scoreA !== scoreB) return scoreA > scoreB ? a : b;

  const llmA = a.llm_consensus_rank ?? Number.POSITIVE_INFINITY;
  const llmB = b.llm_consensus_rank ?? Number.POSITIVE_INFINITY;
  if (llmA !== llmB) return llmA < llmB ? a : b;

  const hpiA = a.hpi_rank ?? Number.POSITIVE_INFINITY;
  const hpiB = b.hpi_rank ?? Number.POSITIVE_INFINITY;
  if (hpiA !== hpiB) return hpiA < hpiB ? a : b;

  return a.id < b.id ? a : b;
}

function mergeFigureData(primary, secondary) {
  const fields = [
    'birth_year',
    'death_year',
    'domain',
    'occupation',
    'era',
    'region_macro',
    'region_sub',
    'birth_polity',
    'birth_place',
    'birth_lat',
    'birth_lon',
    'wikipedia_slug',
    'wikipedia_extract',
    'pageviews_2024',
    'pageviews_2025',
    'hpi_rank',
    'hpi_score',
  ];

  const updates = {};
  for (const field of fields) {
    if (!hasValue(primary[field]) && hasValue(secondary[field])) {
      updates[field] = secondary[field];
    }
  }
  return updates;
}

function parseSafePairs() {
  if (!fs.existsSync(REPORT_PATH)) {
    throw new Error(`Missing report: ${REPORT_PATH}`);
  }
  const lines = fs.readFileSync(REPORT_PATH, 'utf8').trim().split('\n');
  const pairs = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const parts = line.split(',');
    const idA = parts[0];
    const idB = parts[2];
    if (idA && idB) pairs.push([idA, idB]);
  }
  return pairs;
}

function main() {
  const pairs = parseSafePairs();
  if (pairs.length === 0) {
    console.log('No safe pairs found to merge.');
    return;
  }

  const db = new Database('historyrank.db');
  db.pragma('foreign_keys = ON');

  const getFigure = db.prepare('SELECT * FROM figures WHERE id = ?');
  const updateFigure = db.prepare(`
    UPDATE figures
    SET birth_year = COALESCE(?, birth_year),
        death_year = COALESCE(?, death_year),
        domain = COALESCE(?, domain),
        occupation = COALESCE(?, occupation),
        era = COALESCE(?, era),
        region_macro = COALESCE(?, region_macro),
        region_sub = COALESCE(?, region_sub),
        birth_polity = COALESCE(?, birth_polity),
        birth_place = COALESCE(?, birth_place),
        birth_lat = COALESCE(?, birth_lat),
        birth_lon = COALESCE(?, birth_lon),
        wikipedia_slug = COALESCE(?, wikipedia_slug),
        wikipedia_extract = COALESCE(?, wikipedia_extract),
        pageviews_2024 = COALESCE(?, pageviews_2024),
        pageviews_2025 = COALESCE(?, pageviews_2025),
        hpi_rank = COALESCE(?, hpi_rank),
        hpi_score = COALESCE(?, hpi_score),
        updated_at = ?
    WHERE id = ?
  `);

  const updateRankings = db.prepare('UPDATE rankings SET figure_id = ? WHERE figure_id = ?');
  const updateAliases = db.prepare('UPDATE name_aliases SET figure_id = ? WHERE figure_id = ?');
  const insertAlias = db.prepare('INSERT OR IGNORE INTO name_aliases (alias, figure_id) VALUES (?, ?)');
  const deleteFigure = db.prepare('DELETE FROM figures WHERE id = ?');

  const merged = [];
  for (const [idA, idB] of pairs) {
    const figA = getFigure.get(idA);
    const figB = getFigure.get(idB);
    if (!figA || !figB) continue;

    const primary = choosePrimary(figA, figB);
    const secondary = primary.id === figA.id ? figB : figA;
    const updates = mergeFigureData(primary, secondary);

    updateFigure.run(
      updates.birth_year ?? null,
      updates.death_year ?? null,
      updates.domain ?? null,
      updates.occupation ?? null,
      updates.era ?? null,
      updates.region_macro ?? null,
      updates.region_sub ?? null,
      updates.birth_polity ?? null,
      updates.birth_place ?? null,
      updates.birth_lat ?? null,
      updates.birth_lon ?? null,
      updates.wikipedia_slug ?? null,
      updates.wikipedia_extract ?? null,
      updates.pageviews_2024 ?? null,
      updates.pageviews_2025 ?? null,
      updates.hpi_rank ?? null,
      updates.hpi_score ?? null,
      new Date().toISOString(),
      primary.id
    );

    updateRankings.run(primary.id, secondary.id);
    updateAliases.run(primary.id, secondary.id);

    const primaryAlias = normalizeAlias(primary.canonical_name);
    const secondaryAlias = normalizeAlias(secondary.canonical_name);
    if (primaryAlias) insertAlias.run(primaryAlias, primary.id);
    if (secondaryAlias) insertAlias.run(secondaryAlias, primary.id);

    deleteFigure.run(secondary.id);
    merged.push([secondary.id, primary.id]);
  }

  console.log(`✅ Merged ${merged.length} safe duplicate pairs.`);
  recalculateConsensus(db);
  db.close();
}

main();
