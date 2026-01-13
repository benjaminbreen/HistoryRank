const fs = require('fs');
const path = require('path');

const INPUT_PATH = process.env.REGION_CSV || path.join(process.cwd(), 'data', 'regions', 'region-map.csv');
const BACKUP_PATH = process.env.REGION_BACKUP || path.join(process.cwd(), 'data', 'regions', 'region-map.backup.csv');

const {
  getWikidataIdFromSlug,
  getWikidataEntity,
  getLabel,
  getEntityId,
  getCoordinates,
} = require('./lib/wikipedia');

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result.map((v) => v.trim());
}

function toCsvRow(values) {
  return values
    .map((value) => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes('"') || str.includes(',') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    })
    .join(',');
}

function mapRegionSub(lat, lon) {
  if (lat === null || lon === null) return null;

  // Oceania
  if (lon >= 110 && lon <= 180 && lat <= 5 && lat >= -50) return 'Oceania';
  if ((lon >= 140 || lon <= -140) && lat <= 30 && lat >= -30) return 'Oceania';

  // Americas
  if (lon <= -30 && lon >= -170) {
    if (lat >= 15) return 'North America';
    if (lat >= 5 && lat < 15) return 'Mesoamerica & Caribbean';
    if (lat < 5) return 'South America';
  }

  // Europe
  if (lon >= -25 && lon <= 45 && lat >= 35 && lat <= 72) {
    if (lat >= 55) return 'Northern Europe';
    if (lat < 45) return 'Southern Europe';
    if (lon < 20) return 'Western Europe';
    return 'Eastern Europe';
  }

  // Africa
  if (lon >= -25 && lon <= 55 && lat >= -35 && lat <= 35) {
    if (lat >= 15) return 'North Africa';
    if (lon < 10 && lat >= 0) return 'West Africa';
    if (lon >= 25 && lat >= -5) return 'East Africa';
    if (lat < -5) return 'Southern Africa';
    return 'Central Africa';
  }

  // Asia
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

async function enrichRow(row) {
  if (!row.wikipedia_slug) return row;

  const wikidataId = await getWikidataIdFromSlug(row.wikipedia_slug);
  const entity = await getWikidataEntity(wikidataId);
  if (!entity) return row;

  const birthplaceId = getEntityId(entity, 'P19');
  const birthplaceEntity = await getWikidataEntity(birthplaceId);

  const birthPlace = row.birth_place || getLabel(birthplaceEntity);
  const birthPolity =
    row.birth_polity ||
    getLabel(await getWikidataEntity(getEntityId(birthplaceEntity, 'P17'))) ||
    getLabel(await getWikidataEntity(getEntityId(entity, 'P27')));

  let coords = null;
  if (birthplaceEntity) coords = getCoordinates(birthplaceEntity);
  if (!coords) coords = getCoordinates(entity);

  const lat = row.birth_lat || (coords ? coords.lat : '');
  const lon = row.birth_lon || (coords ? coords.lon : '');

  const regionSub = row.region_sub || mapRegionSub(
    typeof lat === 'number' ? lat : Number(lat || null),
    typeof lon === 'number' ? lon : Number(lon || null)
  );
  const regionMacro = row.region_macro || mapRegionMacro(regionSub);

  return {
    ...row,
    birth_place: birthPlace || '',
    birth_polity: birthPolity || '',
    birth_lat: lat !== null && lat !== undefined ? lat : '',
    birth_lon: lon !== null && lon !== undefined ? lon : '',
    region_sub: regionSub || '',
    region_macro: regionMacro || '',
  };
}

async function main() {
  if (!fs.existsSync(INPUT_PATH)) {
    console.error(`Missing ${INPUT_PATH}. Run "npm run export:regions" first.`);
    process.exit(1);
  }

  const content = fs.readFileSync(INPUT_PATH, 'utf-8').trim();
  const lines = content.split('\n');
  const headers = parseCsvLine(lines[0]);

  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] || '';
    });
    return row;
  });

  fs.copyFileSync(INPUT_PATH, BACKUP_PATH);

  const enriched = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const hasGeo =
        row.region_sub &&
        row.region_macro &&
        row.birth_place &&
        row.birth_polity &&
        row.birth_lat &&
        row.birth_lon;
      if (hasGeo) {
        enriched.push(row);
        continue;
      }
      const next = await enrichRow(row);
      enriched.push(next);
    } catch (error) {
      console.error(`Failed to enrich ${row.id}:`, error.message || error);
      enriched.push(row);
    }
    await sleep(450);
  }

  const out = [toCsvRow(headers)];
  enriched.forEach((row) => {
    out.push(toCsvRow(headers.map((h) => row[h] ?? '')));
  });

  fs.writeFileSync(INPUT_PATH, `${out.join('\n')}\n`, 'utf-8');
  console.log(`Updated ${INPUT_PATH} (backup at ${BACKUP_PATH})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
