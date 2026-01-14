/**
 * Enrich figures with Wikidata information (birthplace, coordinates, etc.)
 *
 * Usage:
 *   node scripts/enrich-from-wikidata.cjs [--limit=N] [--dry-run]
 */

const Database = require('better-sqlite3');
const path = require('path');

const {
  getWikidataIdFromSlug,
  getWikidataEntity,
  getLabel,
  getEntityId,
  getCoordinates,
  getClaimValue,
} = require('./lib/wikipedia');

const DB_PATH = path.join(process.cwd(), 'historyrank.db');

// Parse args
const args = process.argv.slice(2);
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : null;
const dryRun = args.includes('--dry-run');
const forceArg = args.includes('--force');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Map coordinates to sub-region
function mapRegionSub(lat, lon) {
  if (lat === null || lon === null) return null;

  // Oceania
  if (lon >= 110 && lon <= 180 && lat <= 5 && lat >= -50) return 'Oceania';
  if ((lon >= 140 || lon <= -140) && lat <= 30 && lat >= -30) return 'Oceania';

  // Americas
  if (lon <= -30 && lon >= -170) {
    if (lat >= 15) return 'North America';
    if (lat >= 5 && lat < 15) return 'Central America';
    if (lat < 5) return 'South America';
  }

  // Europe
  if (lon >= -25 && lon <= 45 && lat >= 35 && lat <= 72) {
    if (lat >= 55) return 'Northern Europe';
    if (lat < 45) return 'Southern Europe';
    if (lon < 20) return 'Western Europe';
    return 'Eastern Europe';
  }

  // Africa (eastern boundary at ~33°E - roughly the Sinai/Red Sea)
  if (lon >= -25 && lon <= 33 && lat >= -35 && lat <= 35) {
    if (lat >= 15) return 'North Africa';
    if (lon < 10 && lat >= 0) return 'West Africa';
    if (lon >= 25 && lat >= -5) return 'East Africa';
    if (lat < -5) return 'Southern Africa';
    return 'Central Africa';
  }

  // Asia
  if (lon >= 30 && lon <= 150 && lat >= -10 && lat <= 60) {
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

// Determine era from birth year
function determineEra(birthYear) {
  if (birthYear === null) return null;
  if (birthYear < -800) return 'Ancient';
  if (birthYear < 500) return 'Classical';
  if (birthYear < 1500) return 'Medieval';
  if (birthYear < 1800) return 'Early Modern';
  if (birthYear < 1950) return 'Modern';
  return 'Contemporary';
}

// Extract birth year from Wikidata
function getBirthYear(entity) {
  const value = getClaimValue(entity, 'P569'); // date of birth
  if (!value || !value.time) return null;

  // Wikidata time format: +1879-03-14T00:00:00Z or -0500-01-01T00:00:00Z
  const match = value.time.match(/^([+-]?\d+)-/);
  if (match) {
    return parseInt(match[1]);
  }
  return null;
}

async function enrichFigure(slug) {
  try {
    const wikidataId = await getWikidataIdFromSlug(slug);
    if (!wikidataId) return null;

    const entity = await getWikidataEntity(wikidataId);
    if (!entity) return null;

    // Get birthplace
    const birthplaceId = getEntityId(entity, 'P19');
    const birthplaceEntity = birthplaceId ? await getWikidataEntity(birthplaceId) : null;
    const birthPlace = getLabel(birthplaceEntity);

    // Get country/polity
    let birthPolity = null;
    if (birthplaceEntity) {
      const countryId = getEntityId(birthplaceEntity, 'P17');
      if (countryId) {
        const countryEntity = await getWikidataEntity(countryId);
        birthPolity = getLabel(countryEntity);
      }
    }
    if (!birthPolity) {
      const citizenshipId = getEntityId(entity, 'P27');
      if (citizenshipId) {
        const citizenshipEntity = await getWikidataEntity(citizenshipId);
        birthPolity = getLabel(citizenshipEntity);
      }
    }

    // Get coordinates (try birthplace first, then person's coords)
    let coords = null;
    if (birthplaceEntity) {
      coords = getCoordinates(birthplaceEntity);
    }
    if (!coords) {
      coords = getCoordinates(entity);
    }

    const lat = coords ? coords.lat : null;
    const lon = coords ? coords.lon : null;
    const regionSub = mapRegionSub(lat, lon);
    const regionMacro = mapRegionMacro(regionSub);

    // Get birth year for era
    const birthYear = getBirthYear(entity);
    const era = determineEra(birthYear);

    return {
      wikidataQid: wikidataId,
      birthPlace,
      birthPolity,
      birthLat: lat,
      birthLon: lon,
      regionSub,
      regionMacro,
      birthYear,
      era,
    };
  } catch (error) {
    console.error(`Error enriching ${slug}:`, error.message);
    return null;
  }
}

async function main() {
  const db = new Database(DB_PATH);

  // Find figures with slugs but missing geographic data
  let query = `
    SELECT id, canonical_name, wikipedia_slug, llm_consensus_rank, birth_lat, era
    FROM figures
    WHERE wikipedia_slug IS NOT NULL
  `;

  if (!forceArg) {
    query += ` AND (birth_lat IS NULL OR era IS NULL)`;
  }

  query += ` ORDER BY llm_consensus_rank ASC NULLS LAST`;

  if (limit) {
    query += ` LIMIT ${limit}`;
  }

  const figures = db.prepare(query).all();

  console.log(`\n🌍 Enriching Figures from Wikidata`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Processing ${figures.length} figures${dryRun ? ' (DRY RUN)' : ''}\n`);

  const updateStmt = db.prepare(`
    UPDATE figures
    SET wikidata_qid = COALESCE(?, wikidata_qid),
        birth_place = COALESCE(?, birth_place),
        birth_polity = COALESCE(?, birth_polity),
        birth_lat = COALESCE(?, birth_lat),
        birth_lon = COALESCE(?, birth_lon),
        region_sub = COALESCE(?, region_sub),
        region_macro = COALESCE(?, region_macro),
        birth_year = COALESCE(?, birth_year),
        era = COALESCE(?, era)
    WHERE id = ?
  `);

  let enriched = 0;
  let failed = 0;

  for (let i = 0; i < figures.length; i++) {
    const figure = figures[i];
    const progress = `[${i + 1}/${figures.length}]`;
    const rank = figure.llm_consensus_rank ? `#${Math.round(figure.llm_consensus_rank)}` : 'unranked';

    process.stdout.write(`${progress} ${figure.canonical_name.slice(0, 30).padEnd(30)} `);

    const data = await enrichFigure(figure.wikipedia_slug);

    if (data && (data.birthLat || data.era || data.birthPlace)) {
      enriched++;

      const parts = [];
      if (data.birthLat) parts.push(`${data.regionSub || 'coords'}`);
      if (data.era) parts.push(data.era);
      if (data.birthPlace) parts.push(data.birthPlace.slice(0, 15));

      console.log(`✅ ${parts.join(' | ')}`);

      if (!dryRun) {
        updateStmt.run(
          data.wikidataQid,
          data.birthPlace,
          data.birthPolity,
          data.birthLat,
          data.birthLon,
          data.regionSub,
          data.regionMacro,
          data.birthYear,
          data.era,
          figure.id
        );
      }
    } else {
      failed++;
      console.log(`❌ No data found`);
    }

    // Rate limiting - Wikidata API needs breathing room
    await sleep(500);
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📊 SUMMARY`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`   Enriched: ${enriched}`);
  console.log(`   Failed:   ${failed}`);
  if (dryRun) {
    console.log(`\n   (Dry run - no changes made)`);
  }
  console.log(`\n✅ Done!\n`);

  db.close();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
