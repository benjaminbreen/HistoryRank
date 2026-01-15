const fs = require('node:fs');
const path = require('node:path');

const MEDIA_PATH = path.join(process.cwd(), 'data', 'raw', 'media', 'ucsc-history-media.jsonl');

const ERA_LIST = [
  'Ancient',
  'Classical',
  'Late Antiquity',
  'Medieval',
  'Early Modern',
  'Industrial',
  'Modern',
  'Contemporary',
];

const SUB_ERA_LIST = [
  'Ancient',
  'Ancient Egypt',
  'Ancient Greece',
  'Ancient Rome',
  'Roman Republic',
  'Classical',
  'Hellenistic',
  'Late Antiquity',
  'Byzantine Empire',
  'Viking Age',
  'Early Middle Ages',
  'High Middle Ages',
  'Late Middle Ages',
  'Medieval',
  'Renaissance',
  'Reformation',
  "Age of Exploration",
  "Thirty Years' War",
  'English Civil War',
  'Glorious Revolution',
  'War of Spanish Succession',
  'Stuart England',
  'Tudor England',
  'Mongol Empire',
  'Ottoman Empire',
  'French Revolution',
  'Napoleonic Wars',
  'Ancien Régime',
  'Industrial Revolution',
  'Gilded Age',
  'Progressive Era',
  'Great Depression',
  'Interwar Period',
  'Post-War Britain',
  'Post-War America',
  '1950s America',
  '1960s America',
  '1970s America',
  '1980s America',
  '1990s America',
  'Civil Rights Movement',
  'Reconstruction',
  'Jim Crow',
  'Slavery',
  'Antebellum America',
  'American Civil War',
  'Watergate',
  'Cold War',
  'Space Race',
  'World War I',
  'World War II',
  'Nazi Germany',
  'Soviet Union',
  'Post-Soviet Era',
  'Korean War',
  'Vietnam War',
  'Iran-Iraq War',
  'Gulf War',
  'War on Terror',
  'Soviet-Afghan War',
  'Decolonization',
  'Apartheid South Africa',
  'Partition of India',
  'Colonial North America',
  'Colonial Latin America',
  'British Raj',
  'Ming Dynasty',
  'Qing Dynasty',
  'Mughal Empire',
  'Meiji Restoration',
  'Edo Period',
  'Warring States (China)',
  'Three Kingdoms (China)',
  'Han Dynasty',
  'Tang Dynasty',
  'Song Dynasty',
  'Roaring Twenties',
  'Prohibition',
  'Great Migration (U.S.)',
  'Modern History',
  'Contemporary',
  'Other',
];

const REGION_LIST = [
  'Global',
  'Northern Europe',
  'Western Europe',
  'Southern Europe',
  'Eastern Europe',
  'North Africa',
  'West Africa',
  'East Africa',
  'Central Africa',
  'Southern Africa',
  'Western Asia',
  'Central Asia',
  'South Asia',
  'East Asia',
  'Southeast Asia',
  'North America',
  'Central America',
  'South America',
  'Oceania',
];

const REGION_ALIASES = {
  Caribbean: 'Central America',
  'Northern Africa': 'North Africa',
  Europe: 'Global',
  Asia: 'Global',
  Africa: 'Global',
  Americas: 'Global',
  Global: 'Global',
};

const DOMAIN_LIST = [
  'Science',
  'Religion',
  'Philosophy',
  'Politics',
  'Law',
  'Military',
  'Arts',
  'Exploration',
  'Economics',
  'Medicine',
  'Social Reform',
  'Gender/Sexuality',
  'Society',
  'Other',
];

const TYPE_LIST = ['film', 'series', 'documentary', 'podcast', 'book', 'fiction', 'game', 'other'];

function normalizeTitle(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function loadMedia() {
  if (!fs.existsSync(MEDIA_PATH)) return [];
  const raw = fs.readFileSync(MEDIA_PATH, 'utf8');
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function saveMedia(items) {
  const lines = items.map((item) => JSON.stringify(item));
  fs.writeFileSync(MEDIA_PATH, `${lines.join('\n')}\n`);
}

function toArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === 'string');
}

function normalizeRegion(value) {
  return REGION_ALIASES[value] || value;
}

function normalizeRegions(values) {
  return values.map((value) => normalizeRegion(value));
}

function validateAllowed(value, allowed, field, context) {
  if (!allowed.includes(value)) {
    throw new Error(`Invalid ${field} "${value}" for ${context}.`);
  }
}

function validateArrayValues(values, allowed, field, context) {
  for (const value of values) {
    if (!allowed.includes(value)) {
      throw new Error(`Invalid ${field} value "${value}" for ${context}.`);
    }
  }
}

function unionStrings(a, b) {
  const set = new Set();
  toArray(a).forEach((item) => set.add(item));
  toArray(b).forEach((item) => set.add(item));
  return Array.from(set);
}

function getScore(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function mergeScore(existing, incoming, field, countField) {
  const incomingScore = getScore(incoming[field]);
  if (incomingScore === null) return;

  const existingScore = getScore(existing[field]);
  const existingCountRaw = getScore(existing[countField]);
  const existingCount = existingCountRaw ? Math.max(1, Math.floor(existingCountRaw)) : (existingScore !== null ? 1 : 0);
  const nextCount = existingCount + 1;
  const nextScore = existingScore === null
    ? incomingScore
    : (existingScore * existingCount + incomingScore) / nextCount;

  existing[field] = Math.round(nextScore * 10) / 10;
  existing[countField] = nextCount;
}

function mergeMedia(existing, incoming) {
  existing.type = existing.type ?? incoming.type;
  existing.release_year = existing.release_year ?? incoming.release_year;
  existing.depicted_start_year = existing.depicted_start_year ?? incoming.depicted_start_year ?? null;
  existing.depicted_end_year = existing.depicted_end_year ?? incoming.depicted_end_year ?? null;
  existing.primary_era = existing.primary_era ?? incoming.primary_era;
  existing.sub_era = existing.sub_era ?? incoming.sub_era;
  existing.primary_region = existing.primary_region ?? incoming.primary_region;
  existing.locale = existing.locale ?? incoming.locale;
  existing.domain = existing.domain ?? incoming.domain;
  existing.wikipedia_slug = existing.wikipedia_slug ?? incoming.wikipedia_slug;
  existing.summary = existing.summary ?? incoming.summary;
  existing.notes = existing.notes ?? incoming.notes;

  existing.tags = unionStrings(existing.tags, incoming.tags);
  existing.eras_depicted = unionStrings(existing.eras_depicted, incoming.eras_depicted);
  existing.regions_depicted = unionStrings(existing.regions_depicted, incoming.regions_depicted);

  mergeScore(existing, incoming, 'llm_accuracy_score', 'llm_accuracy_count');
  mergeScore(existing, incoming, 'llm_quality_score', 'llm_quality_count');

  const inclusionCount = getScore(existing.llm_inclusion_count);
  existing.llm_inclusion_count = inclusionCount ? inclusionCount + 1 : 1;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = { file: null, dryRun: false };
  for (const arg of args) {
    if (arg.startsWith('--file=')) {
      options.file = arg.slice('--file='.length);
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    }
  }
  return options;
}

function main() {
  const options = parseArgs();
  if (!options.file) {
    throw new Error('Missing --file= path to the LLM media list.');
  }

  const listPath = path.resolve(options.file);
  const raw = fs.readFileSync(listPath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('LLM list must be a JSON array.');
  }

  const existing = loadMedia();
  const index = new Map();
  for (const item of existing) {
    const title = typeof item.title === 'string' ? item.title : '';
    if (!title) continue;
    const year = typeof item.release_year === 'number' ? String(item.release_year) : '';
    index.set(`${normalizeTitle(title)}::${year}`, item);
  }

  let added = 0;
  let updated = 0;

  for (const item of parsed) {
    const title = typeof item.title === 'string' ? item.title : '';
    if (!title) continue;
    const context = `"${title}"`;
    const releaseYear = typeof item.release_year === 'number' ? String(item.release_year) : '';
    if (typeof item.release_year !== 'number' || item.release_year < 1900) {
      throw new Error(`Invalid release_year for ${context}.`);
    }
    validateAllowed(item.type, TYPE_LIST, 'type', context);
    validateAllowed(item.primary_era, ERA_LIST, 'primary_era', context);
    if (typeof item.sub_era !== 'string' || !item.sub_era.trim()) {
      throw new Error(`Missing sub_era for ${context}.`);
    }
    validateAllowed(item.sub_era, SUB_ERA_LIST, 'sub_era', context);
    const primaryRegion = normalizeRegion(item.primary_region);
    validateAllowed(primaryRegion, REGION_LIST, 'primary_region', context);
    validateAllowed(item.domain, DOMAIN_LIST, 'domain', context);
    if (typeof item.locale !== 'string' || !item.locale.trim()) {
      throw new Error(`Missing locale for ${context}.`);
    }
    validateArrayValues(toArray(item.eras_depicted), ERA_LIST, 'eras_depicted', context);
    const normalizedRegions = normalizeRegions(toArray(item.regions_depicted));
    validateArrayValues(normalizedRegions, REGION_LIST, 'regions_depicted', context);

    const key = `${normalizeTitle(title)}::${releaseYear}`;
    const existingItem = index.get(key);

    const { rank: _rank, ...incoming } = item;
    incoming.primary_region = primaryRegion;
    incoming.regions_depicted = normalizedRegions;

    if (existingItem) {
      mergeMedia(existingItem, incoming);
      updated += 1;
    } else {
      const record = { ...incoming };
      record.llm_inclusion_count = 1;
      existing.push(record);
      index.set(key, record);
      added += 1;
    }
  }

  if (!options.dryRun) {
    saveMedia(existing);
  }

  console.log(`Media import complete. Added ${added}, updated ${updated}.`);
}

main();
