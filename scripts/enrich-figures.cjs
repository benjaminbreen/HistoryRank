const Database = require('better-sqlite3');

const {
  getWikidataIdFromSlug,
  getWikidataEntity,
  getLabel,
  getEntityId,
  getCoordinates,
} = require('./lib/wikipedia');

const TARGETS = [
  { id: 'ananda', slug: 'Ananda' },
  { id: 'gautama-buddha', slug: 'Gautama_Buddha' },
  { id: 'hern-n-cort-s', slug: 'Hernan_Cortes' },
  { id: 'gamal-abdel-nasser', slug: 'Gamal_Abdel_Nasser' },
  { id: 'kangxi-emperor', slug: 'Kangxi_Emperor' },
  { id: 'sui-wendi', slug: 'Emperor_Wen_of_Sui' },
  { id: 'kwanggaeto-the-great', slug: 'Gwanggaeto_the_Great' },
  { id: 'saladin', slug: 'Saladin' },
  { id: 'mustafa-kemal-atat-rk', slug: 'Mustafa_Kemal_Ataturk' },
  { id: 'noam-chomsky', slug: 'Noam_Chomsky' },
  { id: 'pierre-simon-laplace', slug: 'Pierre-Simon_Laplace' },
];

function mapRegionSub(lat, lon) {
  if (lat === null || lon === null) return null;

  if (lon >= 110 && lon <= 180 && lat <= 5 && lat >= -50) return 'Oceania';
  if ((lon >= 140 || lon <= -140) && lat <= 30 && lat >= -30) return 'Oceania';

  if (lon <= -30 && lon >= -170) {
    if (lat >= 15) return 'North America';
    if (lat >= 5 && lat < 15) return 'Mesoamerica & Caribbean';
    if (lat < 5) return 'South America';
  }

  if (lon >= -25 && lon <= 45 && lat >= 35 && lat <= 72) {
    if (lat >= 55) return 'Northern Europe';
    if (lat < 45) return 'Southern Europe';
    if (lon < 20) return 'Western Europe';
    return 'Eastern Europe';
  }

  if (lon >= -25 && lon <= 55 && lat >= -35 && lat <= 35) {
    if (lat >= 15) return 'North Africa';
    if (lon < 10 && lat >= 0) return 'West Africa';
    if (lon >= 25 && lat >= -5) return 'East Africa';
    if (lat < -5) return 'Southern Africa';
    return 'Central Africa';
  }

  if (lon >= 30 && lon <= 150 && lat >= -5 && lat <= 60) {
    if (lon >= 30 && lon < 60) return 'Western Asia';
    if (lon >= 60 && lon < 90 && lat >= 30) return 'Central Asia';
    if (lon >= 65 && lon < 95 && lat < 30) return 'South Asia';
    if (lon >= 95 && lon < 125 && lat < 25) return 'Southeast Asia';
    return 'East Asia';
  }

  return null;
}

function mapRegionMacro(regionSub) {
  if (!regionSub) return null;
  const map = {
    'Northern Europe': 'Europe',
    'Western Europe': 'Europe',
    'Southern Europe': 'Europe',
    'Eastern Europe': 'Europe',
    'North Africa': 'Africa',
    'West Africa': 'Africa',
    'East Africa': 'Africa',
    'Central Africa': 'Africa',
    'Southern Africa': 'Africa',
    'Western Asia': 'Asia',
    'Central Asia': 'Asia',
    'South Asia': 'Asia',
    'East Asia': 'Asia',
    'Southeast Asia': 'Asia',
    'North America': 'Americas',
    'Mesoamerica & Caribbean': 'Americas',
    'South America': 'Americas',
    'Oceania': 'Oceania',
  };
  return map[regionSub] || null;
}

async function enrichFigure(target) {
  const wikidataId = await getWikidataIdFromSlug(target.slug);
  const entity = await getWikidataEntity(wikidataId);
  if (!entity) return null;

  const birthplaceId = getEntityId(entity, 'P19');
  const birthplaceEntity = await getWikidataEntity(birthplaceId);
  const birthPlace = getLabel(birthplaceEntity);

  const birthPolity =
    getLabel(await getWikidataEntity(getEntityId(birthplaceEntity, 'P17'))) ||
    getLabel(await getWikidataEntity(getEntityId(entity, 'P27')));

  let coords = null;
  if (birthplaceEntity) coords = getCoordinates(birthplaceEntity);
  if (!coords) coords = getCoordinates(entity);

  const lat = coords ? coords.lat : null;
  const lon = coords ? coords.lon : null;
  const regionSub = mapRegionSub(lat, lon);
  const regionMacro = mapRegionMacro(regionSub);

  return {
    birth_place: birthPlace,
    birth_polity: birthPolity,
    birth_lat: lat,
    birth_lon: lon,
    region_sub: regionSub,
    region_macro: regionMacro,
  };
}

async function main() {
  const db = new Database('historyrank.db');
  const updateSlug = db.prepare('UPDATE figures SET wikipedia_slug = ? WHERE id = ?');
  const updateData = db.prepare(`
    UPDATE figures
    SET region_macro = ?,
        region_sub = ?,
        birth_polity = ?,
        birth_place = ?,
        birth_lat = ?,
        birth_lon = ?
    WHERE id = ?
  `);

  for (const target of TARGETS) {
    updateSlug.run(target.slug, target.id);
  }

  for (const target of TARGETS) {
    const data = await enrichFigure(target);
    if (!data) continue;
    updateData.run(
      data.region_macro || null,
      data.region_sub || null,
      data.birth_polity || null,
      data.birth_place || null,
      data.birth_lat ?? null,
      data.birth_lon ?? null,
      target.id
    );
  }

  db.close();
  console.log(`✅ Enriched ${TARGETS.length} figures.`);
}

main().catch((err) => {
  console.error('❌ Enrichment failed:', err);
  process.exit(1);
});
