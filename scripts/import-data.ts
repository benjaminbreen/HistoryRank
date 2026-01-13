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
import { normalizeName, generateSlug, determineEra, occupationToDomain } from '../src/lib/utils/nameNormalization';
import * as fs from 'fs';
import * as path from 'path';

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
        // Skip duplicate ranks (keep first occurrence)
        if (!seenRanks.has(entry.rank)) {
          seenRanks.add(entry.rank);
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

async function findFigureId(rawName: string): Promise<string | null> {
  const normalized = normalizeName(rawName);
  const slug = generateSlug(rawName);

  // 1. Try exact slug match
  const bySlug = await db.query.figures.findFirst({
    where: eq(figures.id, slug)
  });
  if (bySlug) return bySlug.id;

  // 2. Try alias lookup
  const byAlias = await db.query.nameAliases.findFirst({
    where: eq(nameAliases.alias, normalized)
  });
  if (byAlias) return byAlias.figureId;

  // 3. Try normalized canonical name match
  const allFigures = await db.query.figures.findMany();
  for (const fig of allFigures) {
    if (normalizeName(fig.canonicalName) === normalized) {
      return fig.id;
    }
    // Also try last name match for short names
    const lastName = normalized.split(' ').pop();
    const figLastName = normalizeName(fig.canonicalName).split(' ').pop();
    if (lastName === figLastName && normalized.split(' ').length === 1) {
      // Single word name matches last name
      return fig.id;
    }
  }

  return null;
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

  for (const entry of entries) {
    const figureId = await findFigureId(entry.name);

    if (figureId) {
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
    } else {
      unmatched++;
      unmatchedNames.push(`${entry.rank}. ${entry.name}`);
    }
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
// CONSENSUS CALCULATION
// ============================================

async function calculateConsensus() {
  console.log('\n📊 Calculating consensus rankings and variance...');

  const allFigures = await db.query.figures.findMany();

  for (const figure of allFigures) {
    // Get all rankings for this figure
    const figureRankings = await db.query.rankings.findMany({
      where: eq(rankings.figureId, figure.id)
    });

    if (figureRankings.length === 0) continue;

    // Group by source (to average samples from same model)
    const bySource: Record<string, number[]> = {};
    for (const r of figureRankings) {
      if (!bySource[r.source]) bySource[r.source] = [];
      bySource[r.source].push(r.rank);
    }

    // Get one average rank per source
    const sourceAverages = Object.values(bySource).map(ranks => {
      return ranks.reduce((a, b) => a + b, 0) / ranks.length;
    });

    if (sourceAverages.length === 0) continue;

    // Calculate consensus (mean of source averages)
    const mean = sourceAverages.reduce((a, b) => a + b, 0) / sourceAverages.length;

    // Calculate variance (coefficient of variation)
    let variance = 0;
    if (sourceAverages.length > 1) {
      const squaredDiffs = sourceAverages.map(r => Math.pow(r - mean, 2));
      const stdDev = Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / sourceAverages.length);
      variance = Math.min(stdDev / mean, 1); // Coefficient of variation, capped at 1
    }

    // Update figure
    await db.update(figures)
      .set({
        llmConsensusRank: Math.round(mean * 10) / 10,
        varianceScore: Math.round(variance * 1000) / 1000,
        updatedAt: new Date(),
      })
      .where(eq(figures.id, figure.id));
  }

  console.log('   ✅ Consensus rankings calculated');
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

  if (importPantheon) {
    await importPantheonData();
  }

  if (importLLM) {
    await importAllLLMData();
  }

  // Always recalculate consensus after imports
  await calculateConsensus();

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
