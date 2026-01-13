const Database = require('better-sqlite3');
const { recalculateConsensus } = require('./recalculate-consensus.cjs');

const MERGE_MAP = {
  'wright-brothers': [
    'orville-and-wilbur-wright',
    'orville-wilbur-wright',
    'thomas-wright-orville-wright',
    'wilbur-and-orville-wright',
    'orville-wright',
    'wilbur-wright',
  ],
  'constantine-the-great': ['constantine-i'],
  'qin-shi-huang': ['shih-huang-ti', 'shi-huangdi'],
  'augustus': ['augustus-caesar'],
  'akbar': ['akbar-the-great', 'emperor-akbar'],
  'suleiman-the-magnificent': ['suleiman-i'],
  'saladin': ['salah-ad-din'],
  'muhammad-ibn-musa-al-khwarizmi': ['al-khwarizmi'],
  'mahavira': ['gutama-mahavira', 'jainism-mahavira'],
  'ramesses-ii': ['ramses-ii'],
  'mustafa-kemal-atat-rk': ['mustafa-kemal-ataturk', 'ataturk'],
  'montesquieu': ['charles-louis-de-secondat', 'baron-de-montesquieu'],
  'gottfried-wilhelm-leibniz': ['leibniz', 'gottfried-leibniz', 'wilhelm-leibniz'],
  'giuseppe-garibaldi': ['garibaldi'],
  'mansa-musa': ['mansua-musa'],
  'isabella-i-of-castile': ['queen-isabella-i', 'isabella-i'],
  'elizabeth-i-of-england': ['elizabeth-i', 'queen-elizabeth-i'],
  'harun-al-rashid': ['harun'],
  'akhenaten': ['amenhotep-iv'],
  'galen': ['claudius-galen'],
  'genghis-khan': ['temujin'],
  'nicolaus-copernicus': ['nikolaus-copernicus', 'nikolas-copernicus', 'copernicus'],
  'ren-descartes': ['rene-descartes'],
  'niccol-machiavelli': ['niccolo-machiavelli'],
  'zoroaster': ['zarathustra'],
  'avicenna': ['ibn-sina'],
  'cardinal-richelieu': ['richelieu'],
  'khufu': ['cheops'],
  'zoser': ['djoser'],
  'louis-xiv-of-france': ['louis-xiv'],
  'john-calvin': ['jean-calvin'],
  'sigmund-freud': ['sigismund-freud', 'simeon-freud'],
  'adi-shankara': ['shankara'],
  'averroes': ['ibn-rushd'],
  'variste-galois': ['galois-evariste'],
  'johannes-brahms': ['brahms-johannes'],
  'jose-de-san-martin': ['san-martin'],
  'gautama-buddha': ['siddhartha-gautama-buddha', 'siddhartha-gautama'],
  'ananda': ['gautama-buddha-s-disciple-ananda', 'siddhartha-gautama-s-disciples'],
  'hern-n-cort-s': ['hernan-cortes', 'hernando-cort-s', 'hernando-cortez'],
  'gamal-abdel-nasser': ['gam-l-abdel-nasser'],
  'kangxi-emperor': ['emperor-kangxi'],
  'sui-wendi': ['sui-wen-ti'],
  'kwanggaeto-the-great': ['kwanggaet-o-the-great'],
  'saladin': ['salah-al-din-al-ayyubi'],
  'mustafa-kemal-atat-rk': ['kemal-atat-rk'],
  'noam-chomsky': ['avram-noam-chomsky'],
  'pierre-simon-laplace': ['simon-laplace'],
  'william-thomson-1st-baron-kelvin': ['lord-kelvin'],
  'marie-curie': ['maria-sklodowska-curie'],
  'li-shimin': ['emperor-taizong-of-tang', 'tang-taizong', 'emperor-taizong'],
  'kautilya': ['chanakya'],
};

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

function main() {
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

  let mergedCount = 0;
  for (const [primaryId, dupIds] of Object.entries(MERGE_MAP)) {
    const primary = getFigure.get(primaryId);
    if (!primary) {
      console.warn(`⚠️  Primary missing: ${primaryId}`);
      continue;
    }
    const primaryAlias = normalizeAlias(primary.canonical_name);
    if (primaryAlias) insertAlias.run(primaryAlias, primaryId);

    for (const dupId of dupIds) {
      const secondary = getFigure.get(dupId);
      if (!secondary) continue;

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
        primaryId
      );

      updateRankings.run(primaryId, secondary.id);
      updateAliases.run(primaryId, secondary.id);

      const secondaryAlias = normalizeAlias(secondary.canonical_name);
      if (secondaryAlias) insertAlias.run(secondaryAlias, primaryId);

      deleteFigure.run(secondary.id);
      mergedCount++;
    }
  }

  console.log(`✅ Merged ${mergedCount} manual duplicates.`);
  recalculateConsensus(db);
  db.close();
}

main();
