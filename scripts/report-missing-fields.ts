import fs from 'fs';
import path from 'path';
import { db } from '../src/lib/db';

type FigureRow = {
  id: string;
  canonicalName: string;
  birthYear: number | null;
  deathYear: number | null;
  domain: string | null;
  occupation: string | null;
  era: string | null;
  regionMacro: string | null;
  regionSub: string | null;
  birthPolity: string | null;
  birthPlace: string | null;
  birthLat: number | null;
  birthLon: number | null;
  wikipediaSlug: string | null;
  wikipediaExtract: string | null;
  wikidataQid: string | null;
  sourceConfidence: string | null;
  pageviews2024: number | null;
  pageviews2025: number | null;
  hpiRank: number | null;
  llmConsensusRank: number | null;
  varianceScore: number | null;
};

type FieldCheck = {
  label: string;
  get: (figure: FigureRow) => unknown;
};

const THUMBNAIL_DIR = path.join(process.cwd(), 'public', 'thumbnails');
const THUMBNAIL_EXTS = ['.jpg', '.png', '.webp'];

const FIELD_CHECKS: FieldCheck[] = [
  { label: 'wikipedia_slug', get: (f) => f.wikipediaSlug },
  { label: 'birth_year', get: (f) => f.birthYear },
  { label: 'domain', get: (f) => f.domain },
  { label: 'occupation', get: (f) => f.occupation },
  { label: 'era', get: (f) => f.era },
  { label: 'region_sub', get: (f) => f.regionSub },
  { label: 'birth_place', get: (f) => f.birthPlace },
  { label: 'birth_polity', get: (f) => f.birthPolity },
  { label: 'birth_lat', get: (f) => f.birthLat },
  { label: 'birth_lon', get: (f) => f.birthLon },
  { label: 'pageviews_2025', get: (f) => f.pageviews2025 },
  { label: 'hpi_rank', get: (f) => f.hpiRank },
  { label: 'llm_consensus_rank', get: (f) => f.llmConsensusRank },
  { label: 'variance_score', get: (f) => f.varianceScore },
];

const PROFILE_FIELDS: Record<string, string[]> = {
  table: [
    'wikipedia_slug',
    'birth_year',
    'region_sub',
    'domain',
    'era',
    'pageviews_2025',
    'hpi_rank',
    'llm_consensus_rank',
    'variance_score',
  ],
  detail: [
    'wikipedia_slug',
    'birth_year',
    'occupation',
    'region_sub',
    'era',
    'pageviews_2025',
    'hpi_rank',
    'llm_consensus_rank',
    'variance_score',
    'birth_place',
    'birth_polity',
    'birth_lat',
    'birth_lon',
  ],
};

const DEFAULT_PROFILE = 'detail';

function isMissing(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (typeof value === 'number') return Number.isNaN(value);
  return false;
}

function hasThumbnail(id: string): boolean {
  for (const ext of THUMBNAIL_EXTS) {
    const candidate = path.join(THUMBNAIL_DIR, `${id}${ext}`);
    if (fs.existsSync(candidate)) return true;
  }
  return false;
}

async function main() {
  const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : null;
  const onlyArg = process.argv.find((arg) => arg.startsWith('--only='));
  const ignoreArg = process.argv.find((arg) => arg.startsWith('--ignore='));
  const profileArg = process.argv.find((arg) => arg.startsWith('--profile='));
  const noThumbnails = process.argv.includes('--no-thumbnails');

  const profile = profileArg ? profileArg.split('=')[1].trim() : DEFAULT_PROFILE;
  const profileFields = PROFILE_FIELDS[profile];

  const only = onlyArg
    ? new Set(onlyArg.split('=')[1].split(',').map((item) => item.trim()).filter(Boolean))
    : null;
  const ignore = ignoreArg
    ? new Set(ignoreArg.split('=')[1].split(',').map((item) => item.trim()).filter(Boolean))
    : new Set<string>();

  const fieldChecks = FIELD_CHECKS.filter((field) => {
    if (profileFields && !profileFields.includes(field.label)) return false;
    if (only && !only.has(field.label)) return false;
    if (ignore.has(field.label)) return false;
    return true;
  });

  const figures = await db.query.figures.findMany({
    columns: {
      id: true,
      canonicalName: true,
      birthYear: true,
      deathYear: true,
      domain: true,
      occupation: true,
      era: true,
      regionMacro: true,
      regionSub: true,
      birthPolity: true,
      birthPlace: true,
      birthLat: true,
      birthLon: true,
      wikipediaSlug: true,
      wikipediaExtract: true,
      wikidataQid: true,
      sourceConfidence: true,
      pageviews2024: true,
      pageviews2025: true,
      hpiRank: true,
      llmConsensusRank: true,
      varianceScore: true,
    },
  });

  const missingCounts = new Map<string, number>();
  const lines: string[] = [];
  let totalMissingFields = 0;
  let missingFigures = 0;

  for (const figure of figures as FigureRow[]) {
    const missing: string[] = [];

    for (const field of fieldChecks) {
      if (isMissing(field.get(figure))) {
        missing.push(field.label);
      }
    }

    if (!noThumbnails && !hasThumbnail(figure.id)) {
      missing.push('thumbnail');
    }

    if (missing.length > 0) {
      missingFigures += 1;
      totalMissingFields += missing.length;
      lines.push(`${figure.id} (${figure.canonicalName}): ${missing.join(', ')}`);

      for (const field of missing) {
        missingCounts.set(field, (missingCounts.get(field) || 0) + 1);
      }
    }
  }

  console.log('Missing fields report');
  console.log(`Figures with missing fields: ${missingFigures}/${figures.length}`);
  console.log(`Total missing fields: ${totalMissingFields}`);

  if (missingCounts.size === 0) {
    console.log('No missing fields found.');
    return;
  }

  const sortedCounts = [...missingCounts.entries()].sort((a, b) => b[1] - a[1]);
  console.log('\nMissing field counts:');
  for (const [field, count] of sortedCounts) {
    console.log(`- ${field}: ${count}`);
  }

  console.log('\nFigures:');
  const outputLines = limit ? lines.slice(0, limit) : lines;
  for (const line of outputLines) {
    console.log(`- ${line}`);
  }

  if (limit && lines.length > limit) {
    console.log(`\n...and ${lines.length - limit} more (use --limit=${lines.length} for all).`);
  }
}

main().catch((error) => {
  console.error('❌ Report failed:', error);
  process.exit(1);
});
