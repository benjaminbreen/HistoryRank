/**
 * Enrich LLM candidates with Wikipedia/Wikidata data
 *
 * This script:
 * 1. Reads unmatched candidates from llm_candidates table
 * 2. Searches Wikipedia/Wikidata for each
 * 3. Creates figures with full metadata for confident matches
 * 4. Downloads thumbnails
 * 5. Re-imports rankings for newly created figures
 *
 * Usage:
 *   npm run enrich              # Full enrichment
 *   npm run enrich -- --dry-run # Preview without changes
 *   npm run enrich -- --limit 50 # Process only 50 candidates
 *   npm run enrich -- --min-sources 2 # Only candidates from 2+ models
 */

import { db, figures, rankings, nameAliases, llmCandidates } from '../src/lib/db';
import { eq, sql, and, isNull, desc } from 'drizzle-orm';
import { normalizeName, generateSlug, determineEra, occupationToDomain } from '../src/lib/utils/nameNormalization';
import { enrichFromWikipedia, type EnrichmentData } from './lib/wikidata';
import * as fs from 'fs';
import * as path from 'path';
import https from 'https';
import http from 'http';

// Configuration
const THUMBNAILS_DIR = path.join(process.cwd(), 'public', 'thumbnails');
const DATA_DIR = path.join(process.cwd(), 'data', 'raw');

// Thresholds for auto-creation
const HIGH_CONFIDENCE_AUTO_CREATE = true;
const MEDIUM_CONFIDENCE_MIN_SOURCES = 2; // Need 2+ models for medium confidence
const MEDIUM_CONFIDENCE_MIN_SAMPLES = 3; // Or 3+ total samples
const MEDIUM_CONFIDENCE_MAX_RANK = 500; // Or avg rank <= 500

// Region mapping from coordinates
function mapRegionSub(lat: number | null, lon: number | null): string | null {
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

function mapRegionMacro(regionSub: string | null): string | null {
  if (!regionSub) return null;
  const map: Record<string, string> = {
    'Northern Europe': 'Europe',
    'Western Europe': 'Europe',
    'Southern Europe': 'Europe',
    'Eastern Europe': 'Europe',
    'North America': 'Americas',
    'Mesoamerica & Caribbean': 'Americas',
    'South America': 'Americas',
    'North Africa': 'Africa',
    'West Africa': 'Africa',
    'East Africa': 'Africa',
    'Central Africa': 'Africa',
    'Southern Africa': 'Africa',
    'Western Asia': 'Asia',
    'Central Asia': 'Asia',
    'South Asia': 'Asia',
    'Southeast Asia': 'Asia',
    'East Asia': 'Asia',
    'Oceania': 'Oceania',
  };
  return map[regionSub] || null;
}

// Download thumbnail
async function downloadThumbnail(figureId: string, imageUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    // Determine extension from URL
    let ext = 'jpg';
    if (imageUrl.includes('.png')) ext = 'png';
    else if (imageUrl.includes('.webp')) ext = 'webp';

    const filePath = path.join(THUMBNAILS_DIR, `${figureId}.${ext}`);

    const makeRequest = (requestUrl: string, redirectCount = 0) => {
      if (redirectCount > 5) {
        resolve(false);
        return;
      }

      const protocol = requestUrl.startsWith('https') ? https : http;

      protocol.get(requestUrl, { headers: { 'User-Agent': 'HistoryRank/1.0' } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const redirect = res.headers.location;
          if (redirect) {
            makeRequest(redirect, redirectCount + 1);
            return;
          }
        }

        if (res.statusCode !== 200) {
          resolve(false);
          return;
        }

        const fileStream = fs.createWriteStream(filePath);
        res.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          resolve(true);
        });
        fileStream.on('error', () => {
          fs.unlink(filePath, () => {});
          resolve(false);
        });
      }).on('error', () => resolve(false));
    };

    makeRequest(imageUrl);
  });
}

// Check if figure already exists
async function figureExists(slug: string): Promise<boolean> {
  const existing = await db.query.figures.findFirst({
    where: eq(figures.id, slug),
    columns: { id: true },
  });
  return !!existing;
}

// Create figure from enrichment data
async function createFigure(
  enrichment: EnrichmentData,
  candidate: { displayName: string; sources: string[]; sampleCount: number; avgRank: number | null }
): Promise<string | null> {
  const slug = generateSlug(enrichment.canonicalName);

  // Check if already exists
  if (await figureExists(slug)) {
    return null;
  }

  // Derive additional fields
  const era = determineEra(enrichment.birthYear);
  const domain = enrichment.occupation ? occupationToDomain(enrichment.occupation) : null;
  const regionSub = mapRegionSub(enrichment.birthLat, enrichment.birthLon);
  const regionMacro = mapRegionMacro(regionSub);

  // Insert figure
  await db.insert(figures).values({
    id: slug,
    canonicalName: enrichment.canonicalName,
    birthYear: enrichment.birthYear,
    deathYear: enrichment.deathYear,
    domain,
    occupation: enrichment.occupation,
    era,
    regionMacro,
    regionSub,
    birthPlace: enrichment.birthPlace,
    birthLat: enrichment.birthLat,
    birthLon: enrichment.birthLon,
    wikipediaSlug: enrichment.wikipediaSlug,
    wikipediaExtract: enrichment.wikipediaExtract,
    wikidataQid: enrichment.wikidataQid,
    sourceConfidence: enrichment.confidence,
  });

  // Add aliases
  const normalizedName = normalizeName(enrichment.canonicalName);
  await db.insert(nameAliases)
    .values({ alias: normalizedName, figureId: slug })
    .onConflictDoNothing();

  // Also add the original display name as alias
  const displayNormalized = normalizeName(candidate.displayName);
  if (displayNormalized !== normalizedName) {
    await db.insert(nameAliases)
      .values({ alias: displayNormalized, figureId: slug })
      .onConflictDoNothing();
  }

  return slug;
}

// Decide if candidate should be auto-created
function shouldAutoCreate(
  confidence: 'high' | 'medium' | 'low',
  sources: string[],
  sampleCount: number,
  avgRank: number | null
): { create: boolean; reason: string } {
  if (confidence === 'high' && HIGH_CONFIDENCE_AUTO_CREATE) {
    return { create: true, reason: 'High confidence match' };
  }

  if (confidence === 'medium') {
    if (sources.length >= MEDIUM_CONFIDENCE_MIN_SOURCES) {
      return { create: true, reason: `Medium confidence + ${sources.length} models` };
    }
    if (sampleCount >= MEDIUM_CONFIDENCE_MIN_SAMPLES) {
      return { create: true, reason: `Medium confidence + ${sampleCount} samples` };
    }
    if (avgRank !== null && avgRank <= MEDIUM_CONFIDENCE_MAX_RANK) {
      return { create: true, reason: `Medium confidence + avg rank ${avgRank.toFixed(0)}` };
    }
  }

  return { create: false, reason: `${confidence} confidence, insufficient support` };
}

// Parse LLM files to get rankings for a figure
interface LLMEntry {
  rank: number;
  name: string;
  primary_contribution: string;
}

function parseLLMFile(content: string): LLMEntry[] {
  const allEntries: LLMEntry[] = [];
  let searchStart = 0;

  while (true) {
    const jsonStart = content.indexOf('[', searchStart);
    if (jsonStart === -1) break;

    let depth = 0;
    let jsonEnd = -1;
    let inString = false;
    let escape = false;

    for (let i = jsonStart; i < content.length; i++) {
      const char = content[i];

      if (escape) {
        escape = false;
        continue;
      }

      if (char === '\\' && inString) {
        escape = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '[') depth++;
        else if (char === ']') {
          depth--;
          if (depth === 0) {
            jsonEnd = i + 1;
            break;
          }
        }
      }
    }

    if (jsonEnd === -1) break;

    const jsonStr = content.slice(jsonStart, jsonEnd);
    try {
      const entries = JSON.parse(jsonStr) as LLMEntry[];
      allEntries.push(...entries);
    } catch {
      // Skip invalid JSON
    }

    searchStart = jsonEnd;
  }

  return allEntries;
}

// Re-import rankings for a newly created figure
async function importRankingsForFigure(figureId: string, displayName: string): Promise<number> {
  const normalizedTarget = normalizeName(displayName);
  const files = fs.readdirSync(DATA_DIR).filter(f => f.includes('LIST') && f.endsWith('.txt'));

  let importedCount = 0;

  for (const filename of files) {
    const match = filename.match(/^(.+?)\s+LIST\s+(\d+)\s*\(.*\)\.txt$/i);
    if (!match) continue;

    const source = match[1].trim().toLowerCase().replace(/\s+/g, '-');
    const sampleId = `list-${match[2]}`;

    const content = fs.readFileSync(path.join(DATA_DIR, filename), 'utf-8');
    const entries = parseLLMFile(content);

    for (const entry of entries) {
      const entryNormalized = normalizeName(entry.name);
      if (entryNormalized === normalizedTarget) {
        // Found a match - insert ranking
        await db.insert(rankings).values({
          figureId,
          source,
          sampleId,
          rank: entry.rank,
          contribution: entry.primary_contribution,
          rawName: entry.name,
        }).onConflictDoNothing();
        importedCount++;
        break;
      }
    }
  }

  return importedCount;
}

// Main enrichment function
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitArg = args.find(a => a.startsWith('--limit=') || a.startsWith('--limit '));
  const limit = limitArg ? parseInt(limitArg.split(/[= ]/)[1]) : undefined;
  const minSourcesArg = args.find(a => a.startsWith('--min-sources='));
  const minSources = minSourcesArg ? parseInt(minSourcesArg.split('=')[1]) : 1;

  console.log('🔍 HistoryRank Candidate Enrichment');
  console.log('━'.repeat(50));
  if (dryRun) console.log('   Mode: DRY RUN (no changes will be made)\n');

  // Ensure directories exist
  fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });

  // Step 1: Build candidates from unmatched files
  console.log('\n📋 Step 1: Building candidate list...');

  // First, rebuild the candidates table from current data
  const unmatchedDir = path.join(process.cwd(), 'data', 'unmatched');
  if (fs.existsSync(unmatchedDir)) {
    const candidateMap = new Map<string, {
      normalizedName: string;
      displayName: string;
      sources: Set<string>;
      sampleCount: number;
      totalRank: number;
    }>();

    const unmatchedFiles = fs.readdirSync(unmatchedDir).filter(f => f.endsWith('.txt'));

    for (const file of unmatchedFiles) {
      // Extract source from filename like "claude-opus-4.5-list-1.txt"
      const match = file.match(/^(.+?)-list-\d+\.txt$/);
      if (!match) continue;
      const source = match[1];

      const content = fs.readFileSync(path.join(unmatchedDir, file), 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());

      for (const line of lines) {
        // Parse "123. Name" format
        const lineMatch = line.match(/^(\d+)\.\s+(.+)$/);
        if (!lineMatch) continue;

        const rank = parseInt(lineMatch[1]);
        const name = lineMatch[2].trim();
        const normalized = normalizeName(name);

        const existing = candidateMap.get(normalized);
        if (existing) {
          existing.sources.add(source);
          existing.sampleCount++;
          existing.totalRank += rank;
        } else {
          candidateMap.set(normalized, {
            normalizedName: normalized,
            displayName: name,
            sources: new Set([source]),
            sampleCount: 1,
            totalRank: rank,
          });
        }
      }
    }

    // Update llm_candidates table
    if (!dryRun) {
      await db.delete(llmCandidates);

      for (const entry of candidateMap.values()) {
        await db.insert(llmCandidates).values({
          normalizedName: entry.normalizedName,
          displayName: entry.displayName,
          sources: JSON.stringify(Array.from(entry.sources)),
          sampleCount: entry.sampleCount,
          avgRank: entry.totalRank / entry.sampleCount,
        });
      }
    }

    console.log(`   Found ${candidateMap.size} unique candidates from ${unmatchedFiles.length} files`);
  }

  // Step 2: Get candidates to process
  console.log('\n📊 Step 2: Filtering candidates...');

  let candidates = await db.query.llmCandidates.findMany({
    orderBy: [desc(llmCandidates.sampleCount)],
  });

  // Filter by min sources
  candidates = candidates.filter(c => {
    const sources = JSON.parse(c.sources || '[]') as string[];
    return sources.length >= minSources;
  });

  if (limit) {
    candidates = candidates.slice(0, limit);
  }

  console.log(`   Processing ${candidates.length} candidates`);

  // Step 3: Enrich each candidate
  console.log('\n🌐 Step 3: Enriching from Wikipedia/Wikidata...\n');

  const stats = {
    processed: 0,
    created: 0,
    skipped: 0,
    failed: 0,
    thumbnails: 0,
    rankings: 0,
  };

  const skippedReasons: Record<string, number> = {};
  const createdFigures: Array<{ name: string; slug: string; confidence: string; reason: string }> = [];

  for (const candidate of candidates) {
    stats.processed++;
    const sources = JSON.parse(candidate.sources || '[]') as string[];

    process.stdout.write(`[${stats.processed}/${candidates.length}] ${candidate.displayName.padEnd(35).slice(0, 35)} `);

    // Check if already exists (might have been created by another name variant)
    const possibleSlug = generateSlug(candidate.displayName);
    if (await figureExists(possibleSlug)) {
      console.log('⏭️  Already exists');
      stats.skipped++;
      skippedReasons['Already exists'] = (skippedReasons['Already exists'] || 0) + 1;
      continue;
    }

    // Enrich from Wikipedia/Wikidata
    const enrichment = await enrichFromWikipedia(candidate.displayName, candidate.normalizedName);

    if (!enrichment) {
      console.log('❌ Not found on Wikipedia');
      stats.failed++;
      skippedReasons['Not found on Wikipedia'] = (skippedReasons['Not found on Wikipedia'] || 0) + 1;
      continue;
    }

    // Check if should auto-create
    const { create, reason } = shouldAutoCreate(
      enrichment.confidence,
      sources,
      candidate.sampleCount,
      candidate.avgRank
    );

    if (!create) {
      console.log(`⚠️  ${enrichment.confidence} confidence - skipped (${reason})`);
      stats.skipped++;
      skippedReasons[reason] = (skippedReasons[reason] || 0) + 1;
      continue;
    }

    // Create the figure
    if (dryRun) {
      console.log(`✅ Would create: ${enrichment.canonicalName} (${enrichment.confidence})`);
      stats.created++;
      createdFigures.push({
        name: enrichment.canonicalName,
        slug: generateSlug(enrichment.canonicalName),
        confidence: enrichment.confidence,
        reason,
      });
    } else {
      const slug = await createFigure(enrichment, {
        displayName: candidate.displayName,
        sources,
        sampleCount: candidate.sampleCount,
        avgRank: candidate.avgRank,
      });

      if (slug) {
        // Download thumbnail
        if (enrichment.thumbnailUrl) {
          const downloaded = await downloadThumbnail(slug, enrichment.thumbnailUrl);
          if (downloaded) stats.thumbnails++;
        }

        // Import rankings from LLM files
        const rankingsImported = await importRankingsForFigure(slug, candidate.displayName);
        stats.rankings += rankingsImported;

        console.log(`✅ Created: ${slug} (${enrichment.confidence}, ${rankingsImported} rankings)`);
        stats.created++;
        createdFigures.push({
          name: enrichment.canonicalName,
          slug,
          confidence: enrichment.confidence,
          reason,
        });
      } else {
        console.log('⏭️  Slug conflict');
        stats.skipped++;
      }
    }
  }

  // Step 4: Recalculate consensus (if not dry run and we created figures)
  if (!dryRun && stats.created > 0) {
    console.log('\n📈 Step 4: Recalculating consensus...');
    const { execSync } = await import('child_process');
    execSync('node scripts/recalculate-consensus.cjs', { stdio: 'inherit' });
  }

  // Print summary
  console.log('\n' + '━'.repeat(50));
  console.log('📊 ENRICHMENT SUMMARY');
  console.log('━'.repeat(50));
  console.log(`   Processed:   ${stats.processed}`);
  console.log(`   Created:     ${stats.created}`);
  console.log(`   Skipped:     ${stats.skipped}`);
  console.log(`   Failed:      ${stats.failed}`);
  if (!dryRun) {
    console.log(`   Thumbnails:  ${stats.thumbnails}`);
    console.log(`   Rankings:    ${stats.rankings}`);
  }

  if (Object.keys(skippedReasons).length > 0) {
    console.log('\n   Skip reasons:');
    for (const [reason, count] of Object.entries(skippedReasons).sort((a, b) => b[1] - a[1])) {
      console.log(`      ${reason}: ${count}`);
    }
  }

  if (createdFigures.length > 0 && createdFigures.length <= 50) {
    console.log('\n   Created figures:');
    for (const fig of createdFigures) {
      console.log(`      ${fig.confidence.toUpperCase().padEnd(6)} ${fig.name}`);
    }
  }

  console.log('\n✅ Enrichment complete!');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ Enrichment failed:', err);
    process.exit(1);
  });
