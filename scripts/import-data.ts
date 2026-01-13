/**
 * Import script for HistoryRank data
 *
 * Usage:
 *   npx tsx scripts/import-data.ts --pantheon    # Import Pantheon/Wikipedia data
 *   npx tsx scripts/import-data.ts --llm         # Import all LLM rankings
 *   npx tsx scripts/import-data.ts --all         # Import everything
 */

import { db, figures, rankings, nameAliases, importLogs } from '../src/lib/db';
import { eq, sql } from 'drizzle-orm';
import { normalizeName, generateSlug, determineEra, occupationToDomain, levenshteinDistance } from '../src/lib/utils/nameNormalization';
import * as fs from 'fs';
import * as path from 'path';
import { knownAliases } from './seed-aliases';

const DATA_DIR = path.join(process.cwd(), 'data', 'raw');

// ============================================
// PANTHEON DATA IMPORT
// ============================================

interface PantheonRow {
  Name: string;
  Slug: string;
  Occupation: string;
  Born: string;
  'HPI Rank': string;
  'HPI Score': string;
  '2025 Views': string;
  '2024 Views': string;
  Gap: string;
  'Gap Score': string;
  'YoY Change %': string;
  'Momentum Q1-Q3 %': string;
  Label: string;
}

function parseCSV(content: string): PantheonRow[] {
  const lines = content.trim().split('\n');
  const headers = parseCSVLine(lines[0]) as Array<keyof PantheonRow>;
  const rows: PantheonRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row = {} as PantheonRow;
    headers.forEach((header, idx) => {
      row[header] = values[idx] || '';
    });
    rows.push(row);
  }

  return rows;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());

  return result;
}

async function importPantheonData() {
  console.log('\n📚 Importing Pantheon/Wikipedia data...');

  const csvPath = path.join(DATA_DIR, 'attention-gap-data.csv');
  if (!fs.existsSync(csvPath)) {
    console.error('❌ attention-gap-data.csv not found in data/raw/');
    return;
  }

  const content = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(content);

  console.log(`   Found ${rows.length} figures in Pantheon data`);

  let imported = 0;
  let updated = 0;

  for (const row of rows) {
    const slug = generateSlug(row.Name);
    const birthYear = row.Born ? parseInt(row.Born) : null;
    const domain = occupationToDomain(row.Occupation);
    const era = determineEra(birthYear);

    // Upsert figure
    const existing = await db.query.figures.findFirst({
      where: eq(figures.id, slug)
    });

    if (existing) {
      // Update with Pantheon data
      await db.update(figures)
        .set({
          hpiRank: parseInt(row['HPI Rank']) || null,
          hpiScore: parseFloat(row['HPI Score']) || null,
          pageviews2024: parseInt(row['2024 Views'].replace(/,/g, '')) || null,
          pageviews2025: parseInt(row['2025 Views'].replace(/,/g, '')) || null,
          wikipediaSlug: row.Slug,
          occupation: row.Occupation,
          domain: domain,
          era: era,
          birthYear: birthYear,
          updatedAt: new Date(),
        })
        .where(eq(figures.id, slug));
      updated++;
    } else {
      // Create new figure
      await db.insert(figures).values({
        id: slug,
        canonicalName: row.Name,
        birthYear: birthYear,
        occupation: row.Occupation,
        domain: domain,
        era: era,
        wikipediaSlug: row.Slug,
        hpiRank: parseInt(row['HPI Rank']) || null,
        hpiScore: parseFloat(row['HPI Score']) || null,
        pageviews2024: parseInt(row['2024 Views'].replace(/,/g, '')) || null,
        pageviews2025: parseInt(row['2025 Views'].replace(/,/g, '')) || null,
      });
      imported++;

      // Add normalized name as alias
      const normalizedName = normalizeName(row.Name);
      if (normalizedName !== slug) {
        await db.insert(nameAliases)
          .values({ alias: normalizedName, figureId: slug })
          .onConflictDoNothing();
      }
    }
  }

  // Log import
  await db.insert(importLogs).values({
    source: 'pantheon',
    filename: 'attention-gap-data.csv',
    recordCount: rows.length,
    unmatchedCount: 0,
  });

  console.log(`   ✅ Imported ${imported} new figures, updated ${updated} existing`);
}

// ============================================
// LLM DATA IMPORT
// ============================================

interface LLMEntry {
  rank: number;
  name: string;
  primary_contribution: string;
}

function parseLLMFile(content: string): LLMEntry[] {
  // Files may have multiple JSON arrays concatenated - we merge them all
  const allEntries: LLMEntry[] = [];
  const seenRanks = new Set<number>();
  const seenNames = new Set<string>();

  // Find all JSON arrays in the file using a string-aware bracket counter
  let searchStart = 0;
  while (true) {
    const jsonStart = content.indexOf('[', searchStart);
    if (jsonStart === -1) break;

    // Find the matching closing bracket, accounting for strings
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
      for (const entry of entries) {
        const nameKey = entry.name.trim().toLowerCase();
        // Skip duplicate names or ranks (keep first occurrence)
        if (!seenRanks.has(entry.rank) && !seenNames.has(nameKey)) {
          seenRanks.add(entry.rank);
          seenNames.add(nameKey);
          allEntries.push(entry);
        }
      }
    } catch (e) {
      // Try to continue with other arrays
      console.log(`      Warning: Failed to parse JSON array at position ${jsonStart}`);
    }

    searchStart = jsonEnd;
  }

  if (allEntries.length === 0) {
    throw new Error('No valid JSON arrays found in file');
  }

  // Sort by rank
  allEntries.sort((a, b) => a.rank - b.rank);

  return allEntries;
}

// Cache for figures to avoid repeated DB queries
let figuresCache: Array<{ id: string; canonicalName: string }> | null = null;

async function getFiguresCache() {
  if (!figuresCache) {
    figuresCache = await db.query.figures.findMany({
      columns: { id: true, canonicalName: true }
    });
  }
  return figuresCache;
}

// Load compound names from overrides
let compoundNamesCache: Record<string, string[]> | null = null;

function loadCompoundNames(): Record<string, string[]> {
  if (compoundNamesCache) return compoundNamesCache;

  const overridesPath = path.join(process.cwd(), 'data', 'figure-overrides.json');
  if (fs.existsSync(overridesPath)) {
    try {
      const content = JSON.parse(fs.readFileSync(overridesPath, 'utf-8'));
      compoundNamesCache = content.compound_names || {};
    } catch {
      compoundNamesCache = {};
    }
  } else {
    compoundNamesCache = {};
  }
  return compoundNamesCache;
}

/**
 * Find figure ID(s) for a raw name.
 * Returns an array because compound names like "Watson and Crick" map to multiple figures.
 */
async function findFigureIds(rawName: string): Promise<string[]> {
  const normalized = normalizeName(rawName);
  const slug = generateSlug(rawName);
  const variants = buildNameVariants(rawName);

  // 0. Check compound names first
  const compoundNames = loadCompoundNames();
  for (const [compound, figureIds] of Object.entries(compoundNames)) {
    if (normalizeName(compound) === normalized) {
      return figureIds;
    }
  }

  // 1. Try exact slug match
  const bySlug = await db.query.figures.findFirst({
    where: eq(figures.id, slug)
  });
  if (bySlug) return [bySlug.id];

  // 2. Try alias lookup
  for (const variant of variants) {
    const byAlias = await db.query.nameAliases.findFirst({
      where: eq(nameAliases.alias, variant)
    });
    if (byAlias) return [byAlias.figureId];
  }

  // 3. Try normalized canonical name match
  const allFigures = await getFiguresCache();
  for (const fig of allFigures) {
    if (normalizeName(fig.canonicalName) === normalized) {
      return [fig.id];
    }
  }

  // 4. Try last name match for single-word names
  const lastName = normalized.split(' ').pop();
  if (normalized.split(' ').length === 1 && lastName) {
    for (const fig of allFigures) {
      const figLastName = normalizeName(fig.canonicalName).split(' ').pop();
      if (lastName === figLastName) {
        return [fig.id];
      }
    }
  }

  // 5. Fuzzy matching - find best match with low Levenshtein distance
  let bestMatch: { id: string; distance: number } | null = null;
  for (const fig of allFigures) {
    const figNormalized = normalizeName(fig.canonicalName);
    const distance = levenshteinDistance(normalized, figNormalized);

    // Only accept very close matches (distance <= 2 for short names, <= 3 for longer)
    const threshold = normalized.length <= 10 ? 2 : 3;
    if (distance <= threshold) {
      if (!bestMatch || distance < bestMatch.distance) {
        bestMatch = { id: fig.id, distance };
      }
    }
  }

  if (bestMatch) {
    return [bestMatch.id];
  }

  return [];
}

// Backward compatibility wrapper
async function findFigureId(rawName: string): Promise<string | null> {
  const ids = await findFigureIds(rawName);
  return ids.length > 0 ? ids[0] : null;
}

function buildNameVariants(rawName: string): string[] {
  const base = normalizeName(rawName);
  const variants = new Set<string>([base]);

  const withoutDiacritics = base.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  variants.add(withoutDiacritics);

  const noPunct = base.replace(/[’'".,;:!?/\\]/g, '');
  variants.add(noPunct);

  variants.add(base.replace(/&/g, 'and'));
  variants.add(base.replace(/^st\s+/i, 'saint '));
  variants.add(base.replace(/^saint\s+/i, 'st '));
  variants.add(base.replace(/\bthe\b/g, '').replace(/\s+/g, ' ').trim());
  variants.add(base.replace(/\s+of\s+/g, ' ').trim());
  variants.add(base.replace(/-/g, ' ').trim());

  return Array.from(variants).filter(Boolean);
}

async function seedAliasesFromSources() {
  const allAliases: Array<{ alias: string; figureId: string }> = [...knownAliases];

  const existing = new Set<string>();
  const figureRows = await db.select({ id: figures.id }).from(figures);
  figureRows.forEach((row) => existing.add(row.id));

  const csvPath = path.join(process.cwd(), 'data', 'aliases.csv');
  if (fs.existsSync(csvPath)) {
    const lines = fs.readFileSync(csvPath, 'utf-8').split('\n').map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
      if (line.startsWith('alias,')) continue;
      const [alias, figureId] = line.split(',').map((v) => v.trim());
      if (alias && figureId) {
        allAliases.push({ alias, figureId });
      }
    }
  }

  for (const { alias, figureId } of allAliases) {
    if (!existing.has(figureId)) {
      continue;
    }
    const normalizedAlias = normalizeName(alias);
    await db.insert(nameAliases)
      .values({ alias: normalizedAlias, figureId })
      .onConflictDoNothing();
  }
}

interface LLMFileConfig {
  filename: string;
  source: string;
  sampleId: string;
}

/**
 * Auto-detect LLM files in the data/raw directory.
 * Expects filenames like: "MODEL NAME LIST N (Date).txt"
 * Examples:
 *   - CLAUDE SONNET 4.5 LIST 1 (January 12, 2025).txt
 *   - GEMINI FLASH 3 PREVIEW LIST 2 (January 12, 2025).txt
 *   - GPT-4O LIST 1 (January 15, 2025).txt
 */
function detectLLMFiles(): LLMFileConfig[] {
  const files = fs.readdirSync(DATA_DIR);
  const configs: LLMFileConfig[] = [];

  // Pattern: anything with "LIST N" in the name
  const llmFilePattern = /^(.+?)\s+LIST\s+(\d+)\s*\(.*\)\.txt$/i;

  for (const filename of files) {
    const match = filename.match(llmFilePattern);
    if (match) {
      const modelName = match[1].trim();
      const listNum = match[2];

      // Convert model name to source ID (lowercase, replace spaces with dashes)
      const source = modelName.toLowerCase().replace(/\s+/g, '-');

      configs.push({
        filename,
        source,
        sampleId: `list-${listNum}`,
      });
    }
  }

  // Sort by source then by sample ID for consistent ordering
  configs.sort((a, b) => {
    if (a.source !== b.source) return a.source.localeCompare(b.source);
    return a.sampleId.localeCompare(b.sampleId);
  });

  return configs;
}

async function importLLMFile(config: LLMFileConfig) {
  const filePath = path.join(DATA_DIR, config.filename);

  if (!fs.existsSync(filePath)) {
    console.log(`   ⚠️ Skipping ${config.filename} (not found)`);
    return;
  }

  console.log(`   📄 Importing ${config.source} ${config.sampleId}...`);

  const content = fs.readFileSync(filePath, 'utf-8');
  let entries: LLMEntry[];

  try {
    entries = parseLLMFile(content);
  } catch (e) {
    console.error(`   ❌ Failed to parse ${config.filename}:`, e);
    return;
  }

  let matched = 0;
  let unmatched = 0;
  const unmatchedNames: string[] = [];
  const seenFigureIds = new Set<string>();

  for (const entry of entries) {
    const figureIds = await findFigureIds(entry.name);

    if (figureIds.length > 0) {
      // Handle compound names (e.g., "Watson and Crick" → both get a ranking)
      for (const figureId of figureIds) {
        if (seenFigureIds.has(figureId)) {
          continue;
        }
        seenFigureIds.add(figureId);
        // Insert ranking (use onConflictDoNothing to prevent duplicates)
        await db.insert(rankings).values({
          figureId,
          source: config.source,
          sampleId: config.sampleId,
          rank: entry.rank,
          contribution: entry.primary_contribution,
          rawName: entry.name,
        }).onConflictDoNothing();
        matched++;
      }
    } else {
      unmatched++;
      unmatchedNames.push(`${entry.rank}. ${entry.name}`);
    }
  }

  // Write unmatched names for review
  if (unmatchedNames.length > 0) {
    const unmatchedDir = path.join(process.cwd(), 'data', 'unmatched');
    fs.mkdirSync(unmatchedDir, { recursive: true });
    const outPath = path.join(unmatchedDir, `${config.source}-${config.sampleId}.txt`);
    fs.writeFileSync(outPath, `${unmatchedNames.join('\n')}\n`, 'utf-8');
  }

  // Log import
  await db.insert(importLogs).values({
    source: config.source,
    sampleId: config.sampleId,
    filename: config.filename,
    recordCount: entries.length,
    unmatchedCount: unmatched,
  });

  console.log(`      ✅ Matched: ${matched}, Unmatched: ${unmatched}`);

  if (unmatchedNames.length > 0 && unmatchedNames.length <= 20) {
    console.log(`      Unmatched: ${unmatchedNames.join(', ')}`);
  } else if (unmatchedNames.length > 20) {
    console.log(`      First 20 unmatched: ${unmatchedNames.slice(0, 20).join(', ')}...`);
  }
}

async function importAllLLMData() {
  console.log('\n🤖 Importing LLM ranking data...');

  // Auto-detect LLM files
  const llmFiles = detectLLMFiles();

  if (llmFiles.length === 0) {
    console.log('   ⚠️ No LLM files found in data/raw/');
    console.log('   Expected format: "MODEL NAME LIST N (Date).txt"');
    return;
  }

  console.log(`   Found ${llmFiles.length} LLM files:`);
  const sources = [...new Set(llmFiles.map(f => f.source))];
  for (const source of sources) {
    const count = llmFiles.filter(f => f.source === source).length;
    console.log(`      - ${source}: ${count} list(s)`);
  }

  // Clear existing rankings first
  await db.delete(rankings);
  console.log('   Cleared existing rankings');

  for (const config of llmFiles) {
    await importLLMFile(config);
  }
}

// ============================================
// MAIN
// ============================================

async function main() {
  const args = process.argv.slice(2);

  const importPantheon = args.includes('--pantheon') || args.includes('--all');
  const importLLM = args.includes('--llm') || args.includes('--all');

  if (!importPantheon && !importLLM) {
    console.log('Usage:');
    console.log('  npx tsx scripts/import-data.ts --pantheon  # Import Pantheon data');
    console.log('  npx tsx scripts/import-data.ts --llm       # Import LLM rankings');
    console.log('  npx tsx scripts/import-data.ts --all       # Import everything');
    process.exit(0);
  }

  console.log('🚀 Starting HistoryRank data import...');

  await seedAliasesFromSources();

  if (importPantheon) {
    await importPantheonData();
  }

  if (importLLM) {
    await importAllLLMData();
  }

  // Print summary
  const figureCount = await db.select({ count: sql<number>`count(*)` }).from(figures);
  const rankingCount = await db.select({ count: sql<number>`count(*)` }).from(rankings);

  console.log('\n📈 Import Summary:');
  console.log(`   Total figures: ${figureCount[0].count}`);
  console.log(`   Total rankings: ${rankingCount[0].count}`);

  console.log('\n✅ Import complete!');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Import failed:', err);
    process.exit(1);
  });
