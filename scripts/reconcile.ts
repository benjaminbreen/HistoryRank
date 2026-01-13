/**
 * Reconcile script for HistoryRank
 *
 * Handles:
 * - Merging duplicate figures (moves rankings, updates aliases)
 * - Renaming figures
 * - Fetching Wikipedia data for figures missing info
 * - Downloading missing thumbnails
 * - Adding aliases
 *
 * Usage:
 *   npx tsx scripts/reconcile.ts              # Run all reconciliation
 *   npx tsx scripts/reconcile.ts --dry-run    # Preview changes without applying
 *   npx tsx scripts/reconcile.ts --thumbnails # Only download missing thumbnails
 */

import { db, figures, rankings, nameAliases } from '../src/lib/db';
import { eq, inArray, sql } from 'drizzle-orm';
import { normalizeName, generateSlug, determineEra } from '../src/lib/utils/nameNormalization';
import * as fs from 'fs';
import * as path from 'path';
import https from 'https';
import http from 'http';
import * as wikipedia from './lib/wikipedia.js';

const OVERRIDES_PATH = path.join(process.cwd(), 'data', 'figure-overrides.json');
const THUMBNAILS_DIR = path.join(process.cwd(), 'public', 'thumbnails');

interface Overrides {
  merges: Record<string, string[]>;
  renames: Record<string, string>;
  updates: Record<string, {
    canonical_name?: string;
    wikipedia_slug?: string;
    birth_year?: number;
    death_year?: number;
    birth_place?: string;
    domain?: string;
    era?: string;
  }>;
  aliases: Record<string, string[]>;
  compound_names: Record<string, string[]>;
}

interface WikipediaData {
  title: string;
  extract?: string;
  description?: string;
  thumbnail?: { source: string; width: number; height: number };
  birthYear?: number;
  deathYear?: number;
  birthPlace?: string;
  occupation?: string;
}

// ============================================
// UTILITIES
// ============================================

function loadOverrides(): Overrides {
  if (!fs.existsSync(OVERRIDES_PATH)) {
    console.error(`❌ Overrides file not found: ${OVERRIDES_PATH}`);
    process.exit(1);
  }
  const content = fs.readFileSync(OVERRIDES_PATH, 'utf-8');
  return JSON.parse(content);
}

/**
 * Parse year from various date formats
 * Examples: "1819", "1819-08-09", "563 BC", "c. 372 BCE"
 */
function parseYear(dateStr: string | undefined | null): number | null {
  if (!dateStr) return null;

  // Handle BC/BCE dates
  const bcMatch = dateStr.match(/(\d+)\s*(BC|BCE)/i);
  if (bcMatch) return -parseInt(bcMatch[1]);

  // Handle AD/CE dates or plain years
  const yearMatch = dateStr.match(/(\d{1,4})/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1]);
    // Sanity check - years should be between -5000 and 2100
    if (year >= -5000 && year <= 2100) return year;
  }

  return null;
}

/**
 * Infer domain from occupation/description
 */
function inferDomain(description: string | undefined, occupation: string | undefined): string | null {
  const text = `${description || ''} ${occupation || ''}`.toLowerCase();

  if (/physicist|chemist|mathematician|biologist|astronomer|scientist|inventor|engineer/.test(text)) return 'Science';
  if (/pope|religious|theologian|saint|prophet|monk|priest|bishop|cardinal|imam|rabbi/.test(text)) return 'Religion';
  if (/philosopher|thinker/.test(text)) return 'Philosophy';
  if (/politician|president|emperor|king|queen|monarch|statesman|prime minister|chancellor/.test(text)) return 'Politics';
  if (/general|military|soldier|conqueror|admiral|commander|warrior/.test(text)) return 'Military';
  if (/writer|poet|novelist|playwright|author|composer|musician|artist|painter|sculptor|architect/.test(text)) return 'Arts';
  if (/explorer|navigator/.test(text)) return 'Exploration';
  if (/economist|businessman|industrialist/.test(text)) return 'Economics';
  if (/physician|doctor|surgeon|medical/.test(text)) return 'Medicine';
  if (/activist|reformer|revolutionary|abolitionist/.test(text)) return 'Social Reform';

  return null;
}

async function fetchWikipediaData(slug: string): Promise<WikipediaData | null> {
  try {
    const json = await wikipedia.fetchWikipediaSummary(slug);
    if (!json) return null;

    // Try to extract birth/death years from description
    // Common formats: "American physician (1819–1868)", "Greek philosopher (c. 470 – 399 BC)"
    let birthYear: number | null = null;
    let deathYear: number | null = null;

    const description = json.description || '';

    // Pattern: (YEAR–YEAR) or (YEAR - YEAR) or (born YEAR) or (YEAR BC – YEAR BC)
    const dateRangeMatch = description.match(/\((?:c\.\s*)?(\d+)\s*(BC|BCE|AD|CE)?\s*[–\-]\s*(?:c\.\s*)?(\d+)\s*(BC|BCE|AD|CE)?\)/i);
    if (dateRangeMatch) {
      const birth = dateRangeMatch[1];
      const birthEra = dateRangeMatch[2];
      const death = dateRangeMatch[3];
      const deathEra = dateRangeMatch[4];

      birthYear = birthEra?.match(/BC|BCE/i) ? -parseInt(birth) : parseInt(birth);
      deathYear = deathEra?.match(/BC|BCE/i) ? -parseInt(death) : parseInt(death);
    }

    // Pattern: "born YEAR" or "b. YEAR"
    if (!birthYear) {
      const bornMatch = description.match(/(?:born|b\.)\s+(?:c\.\s*)?(\d+)\s*(BC|BCE|AD|CE)?/i);
      if (bornMatch) {
        birthYear = bornMatch[2]?.match(/BC|BCE/i) ? -parseInt(bornMatch[1]) : parseInt(bornMatch[1]);
      }
    }

    // Also check the extract for dates
    if (!birthYear && json.extract) {
      const extractMatch = json.extract.match(/born\s+(?:c\.\s*)?(\d+)\s*(BC|BCE|AD|CE)?/i);
      if (extractMatch) {
        birthYear = extractMatch[2]?.match(/BC|BCE/i) ? -parseInt(extractMatch[1]) : parseInt(extractMatch[1]);
      }
    }

    return {
      title: json.title,
      extract: json.extract,
      description: json.description,
      thumbnail: json.thumbnail,
      birthYear,
      deathYear,
    };
  } catch {
    return null;
  }
}

async function fetchPageviews(slug: string): Promise<number | null> {
  // Fetch pageviews for 2025 (or last available year)
  const today = new Date();
  const endDate = today.toISOString().slice(0, 10).replace(/-/g, '');
  const startDate = '20250101';
  try {
    return await wikipedia.fetchWikipediaPageviews(slug, startDate, endDate);
  } catch {
    return null;
  }
}

async function downloadThumbnail(figureId: string, imageUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    const ext = imageUrl.includes('.png') ? 'png' : imageUrl.includes('.webp') ? 'webp' : 'jpg';
    const filePath = path.join(THUMBNAILS_DIR, `${figureId}.${ext}`);

    // Skip if already exists
    if (fs.existsSync(filePath)) {
      resolve(true);
      return;
    }

    const protocol = imageUrl.startsWith('https') ? https : http;

    protocol.get(imageUrl, { headers: { 'User-Agent': 'HistoryRank/1.0' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const redirect = res.headers.location;
        if (redirect) {
          downloadThumbnail(figureId, redirect).then(resolve);
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
      fileStream.on('error', () => resolve(false));
    }).on('error', () => resolve(false));
  });
}

function thumbnailExists(figureId: string): boolean {
  const extensions = ['jpg', 'png', 'webp'];
  return extensions.some(ext =>
    fs.existsSync(path.join(THUMBNAILS_DIR, `${figureId}.${ext}`))
  );
}

function parseBirthYear(dateStr: string | undefined): number | null {
  if (!dateStr) return null;

  const bcMatch = dateStr.match(/(\d+)\s*(BC|BCE)/i);
  if (bcMatch) return -parseInt(bcMatch[1]);

  const adMatch = dateStr.match(/(\d+)\s*(AD|CE)?/i);
  if (adMatch) return parseInt(adMatch[1]);

  return null;
}

// ============================================
// RECONCILIATION STEPS
// ============================================

async function performMerges(merges: Record<string, string[]>, dryRun: boolean) {
  console.log('\n🔀 Performing merges...');

  for (const [keepId, deleteIds] of Object.entries(merges)) {
    if (keepId.startsWith('_')) continue;

    // Check if the target figure exists
    const keepFigure = await db.query.figures.findFirst({
      where: eq(figures.id, keepId)
    });

    if (!keepFigure) {
      console.log(`   ⚠️ Target figure "${keepId}" not found, skipping merge`);
      continue;
    }

    for (const deleteId of deleteIds) {
      const deleteFigure = await db.query.figures.findFirst({
        where: eq(figures.id, deleteId)
      });

      if (!deleteFigure) {
        console.log(`   ⚠️ Source figure "${deleteId}" not found, skipping`);
        continue;
      }

      // Count rankings to move
      const rankingsToMove = await db
        .select({ count: sql<number>`count(*)` })
        .from(rankings)
        .where(eq(rankings.figureId, deleteId));

      console.log(`   ${deleteId} → ${keepId} (${rankingsToMove[0].count} rankings)`);

      if (!dryRun) {
        // Move rankings
        await db.update(rankings)
          .set({ figureId: keepId })
          .where(eq(rankings.figureId, deleteId));

        // Add alias for the old name
        const normalizedOldName = normalizeName(deleteFigure.canonicalName);
        await db.insert(nameAliases)
          .values({ alias: normalizedOldName, figureId: keepId })
          .onConflictDoNothing();

        // Also add the old ID as an alias
        await db.insert(nameAliases)
          .values({ alias: deleteId, figureId: keepId })
          .onConflictDoNothing();

        // Delete old aliases pointing to the deleted figure
        await db.delete(nameAliases)
          .where(eq(nameAliases.figureId, deleteId));

        // Delete the figure
        await db.delete(figures)
          .where(eq(figures.id, deleteId));
      }
    }
  }
}

async function performRenames(renames: Record<string, string>, dryRun: boolean) {
  console.log('\n✏️ Performing renames...');

  for (const [figureId, newName] of Object.entries(renames)) {
    if (figureId.startsWith('_')) continue;

    const figure = await db.query.figures.findFirst({
      where: eq(figures.id, figureId)
    });

    if (!figure) {
      console.log(`   ⚠️ Figure "${figureId}" not found, skipping rename`);
      continue;
    }

    console.log(`   "${figure.canonicalName}" → "${newName}"`);

    if (!dryRun) {
      // Add old name as alias
      const normalizedOldName = normalizeName(figure.canonicalName);
      await db.insert(nameAliases)
        .values({ alias: normalizedOldName, figureId })
        .onConflictDoNothing();

      // Update canonical name
      await db.update(figures)
        .set({ canonicalName: newName, updatedAt: new Date() })
        .where(eq(figures.id, figureId));

      // Add new name as alias too
      const normalizedNewName = normalizeName(newName);
      await db.insert(nameAliases)
        .values({ alias: normalizedNewName, figureId })
        .onConflictDoNothing();
    }
  }
}

async function performUpdates(updates: Record<string, any>, dryRun: boolean) {
  console.log('\n📝 Performing updates (fetching Wikipedia data)...');

  for (const [figureId, updateData] of Object.entries(updates)) {
    if (figureId.startsWith('_')) continue;

    let figure = await db.query.figures.findFirst({
      where: eq(figures.id, figureId)
    });

    // If figure doesn't exist but we have canonical_name, create it
    if (!figure && updateData.canonical_name) {
      console.log(`   Creating new figure: ${figureId}`);
      if (!dryRun) {
        await db.insert(figures).values({
          id: figureId,
          canonicalName: updateData.canonical_name,
        });
        figure = await db.query.figures.findFirst({
          where: eq(figures.id, figureId)
        });
      }
    }

    if (!figure && !dryRun) {
      console.log(`   ⚠️ Figure "${figureId}" not found, skipping update`);
      continue;
    }

    const wikiSlug = updateData.wikipedia_slug;
    let wikiData: WikipediaData | null = null;

    if (wikiSlug) {
      console.log(`   Fetching Wikipedia data for ${figureId} (${wikiSlug})...`);
      wikiData = await fetchWikipediaData(wikiSlug);

      if (wikiData) {
        console.log(`   ✓ Found: ${wikiData.title}`);
      } else {
        console.log(`   ⚠️ Could not fetch Wikipedia data for ${wikiSlug}`);
      }
    }

    if (!dryRun) {
      const updateFields: any = { updatedAt: new Date() };

      if (updateData.canonical_name) {
        updateFields.canonicalName = updateData.canonical_name;
      }
      if (wikiSlug) {
        updateFields.wikipediaSlug = wikiSlug;
      }
      if (wikiData?.extract) {
        updateFields.wikipediaExtract = wikiData.extract;
      }

      // Birth year: prefer override, then wikiData
      if (updateData.birth_year) {
        updateFields.birthYear = updateData.birth_year;
      } else if (wikiData?.birthYear && !figure?.birthYear) {
        updateFields.birthYear = wikiData.birthYear;
        console.log(`      → Birth year: ${wikiData.birthYear}`);
      }

      // Death year: prefer override, then wikiData
      if (updateData.death_year) {
        updateFields.deathYear = updateData.death_year;
      } else if (wikiData?.deathYear && !figure?.deathYear) {
        updateFields.deathYear = wikiData.deathYear;
        console.log(`      → Death year: ${wikiData.deathYear}`);
      }

      if (updateData.birth_place) {
        updateFields.birthPlace = updateData.birth_place;
      }

      // Domain: prefer override, then infer from description
      if (updateData.domain) {
        updateFields.domain = updateData.domain;
      } else if (!figure?.domain && wikiData?.description) {
        const inferredDomain = inferDomain(wikiData.description, wikiData.extract);
        if (inferredDomain) {
          updateFields.domain = inferredDomain;
          console.log(`      → Domain: ${inferredDomain}`);
        }
      }

      // Era: prefer override, then calculate from birth year
      if (updateData.era) {
        updateFields.era = updateData.era;
      } else if (!figure?.era) {
        const birthYr = updateFields.birthYear || figure?.birthYear;
        if (birthYr) {
          updateFields.era = determineEra(birthYr);
          console.log(`      → Era: ${updateFields.era}`);
        }
      }

      // Fetch pageviews if not already set
      if (wikiSlug && !figure?.pageviews2025) {
        const pageviews = await fetchPageviews(wikiSlug);
        if (pageviews) {
          updateFields.pageviews2025 = pageviews;
          console.log(`      → Pageviews 2025: ${pageviews.toLocaleString()}`);
        }
      }

      await db.update(figures)
        .set(updateFields)
        .where(eq(figures.id, figureId));

      // Download thumbnail if available
      if (wikiData?.thumbnail?.source) {
        const downloaded = await downloadThumbnail(figureId, wikiData.thumbnail.source);
        if (downloaded) {
          console.log(`   ✓ Downloaded thumbnail for ${figureId}`);
        }
      }
    }
  }
}

async function addAliases(aliases: Record<string, string[]>, dryRun: boolean) {
  console.log('\n🏷️ Adding aliases...');

  let added = 0;

  for (const [figureId, aliasList] of Object.entries(aliases)) {
    if (figureId.startsWith('_')) continue;

    const figure = await db.query.figures.findFirst({
      where: eq(figures.id, figureId)
    });

    if (!figure) {
      console.log(`   ⚠️ Figure "${figureId}" not found, skipping aliases`);
      continue;
    }

    for (const alias of aliasList) {
      const normalized = normalizeName(alias);

      if (!dryRun) {
        try {
          await db.insert(nameAliases)
            .values({ alias: normalized, figureId })
            .onConflictDoNothing();
          added++;
        } catch (e) {
          // Ignore conflicts
        }
      } else {
        console.log(`   Would add: "${normalized}" → ${figureId}`);
        added++;
      }
    }
  }

  console.log(`   Added ${added} aliases`);
}

async function downloadMissingThumbnails() {
  console.log('\n🖼️ Downloading missing thumbnails...');

  // Ensure thumbnails directory exists
  fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });

  // Get all figures with Wikipedia slugs
  const allFigures = await db.query.figures.findMany();

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const figure of allFigures) {
    // Skip if thumbnail already exists
    if (thumbnailExists(figure.id)) {
      skipped++;
      continue;
    }

    // Skip if no Wikipedia slug
    if (!figure.wikipediaSlug) {
      continue;
    }

    // Fetch Wikipedia data to get thumbnail URL
    const wikiData = await fetchWikipediaData(figure.wikipediaSlug);

    if (wikiData?.thumbnail?.source) {
      const success = await downloadThumbnail(figure.id, wikiData.thumbnail.source);
      if (success) {
        console.log(`   ✓ ${figure.id}`);
        downloaded++;
      } else {
        console.log(`   ✗ ${figure.id} (download failed)`);
        failed++;
      }
    } else {
      failed++;
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`   Downloaded: ${downloaded}, Skipped (existing): ${skipped}, Failed: ${failed}`);
}

async function autoGenerateAliases(dryRun: boolean) {
  console.log('\n🤖 Auto-generating aliases from canonical names...');

  const allFigures = await db.query.figures.findMany();
  let added = 0;

  for (const figure of allFigures) {
    const normalized = normalizeName(figure.canonicalName);
    const slug = generateSlug(figure.canonicalName);

    // Add normalized name as alias
    if (!dryRun) {
      try {
        await db.insert(nameAliases)
          .values({ alias: normalized, figureId: figure.id })
          .onConflictDoNothing();
        added++;
      } catch (e) {
        // Ignore
      }
    }

    // Add slug as alias (if different from normalized)
    if (slug !== normalized && !dryRun) {
      try {
        await db.insert(nameAliases)
          .values({ alias: slug, figureId: figure.id })
          .onConflictDoNothing();
        added++;
      } catch (e) {
        // Ignore
      }
    }
  }

  console.log(`   Added ${added} auto-generated aliases`);
}

async function enrichMissingData(dryRun: boolean) {
  console.log('\n🔍 Enriching figures missing data...');

  // Find figures with wikipedia_slug but missing birth_year, era, domain, or pageviews
  const figuresNeedingEnrichment = await db.query.figures.findMany({
    columns: {
      id: true,
      canonicalName: true,
      wikipediaSlug: true,
      birthYear: true,
      deathYear: true,
      era: true,
      domain: true,
      pageviews2025: true,
    },
  });

  const toEnrich = figuresNeedingEnrichment.filter(f =>
    f.wikipediaSlug && (!f.birthYear || !f.era || !f.domain || !f.pageviews2025)
  );

  console.log(`   Found ${toEnrich.length} figures needing enrichment`);

  if (toEnrich.length === 0 || dryRun) {
    return;
  }

  let enriched = 0;

  for (const figure of toEnrich) {
    if (!figure.wikipediaSlug) continue;

    process.stdout.write(`   [${enriched + 1}/${toEnrich.length}] ${figure.id}... `);

    const wikiData = await fetchWikipediaData(figure.wikipediaSlug);
    const updateFields: any = { updatedAt: new Date() };
    const changes: string[] = [];

    // Birth year
    if (!figure.birthYear && wikiData?.birthYear) {
      updateFields.birthYear = wikiData.birthYear;
      changes.push(`birth:${wikiData.birthYear}`);
    }

    // Death year
    if (!figure.deathYear && wikiData?.deathYear) {
      updateFields.deathYear = wikiData.deathYear;
      changes.push(`death:${wikiData.deathYear}`);
    }

    // Era (calculate from birth year)
    if (!figure.era) {
      const birthYr = updateFields.birthYear || figure.birthYear;
      if (birthYr) {
        updateFields.era = determineEra(birthYr);
        changes.push(`era:${updateFields.era}`);
      }
    }

    // Domain (infer from description)
    if (!figure.domain && wikiData?.description) {
      const inferredDomain = inferDomain(wikiData.description, wikiData.extract);
      if (inferredDomain) {
        updateFields.domain = inferredDomain;
        changes.push(`domain:${inferredDomain}`);
      }
    }

    // Pageviews
    if (!figure.pageviews2025) {
      const pageviews = await fetchPageviews(figure.wikipediaSlug);
      if (pageviews) {
        updateFields.pageviews2025 = pageviews;
        changes.push(`views:${pageviews.toLocaleString()}`);
      }
    }

    if (changes.length > 0) {
      await db.update(figures)
        .set(updateFields)
        .where(eq(figures.id, figure.id));
      console.log(changes.join(', '));
      enriched++;
    } else {
      console.log('no new data');
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 150));
  }

  console.log(`   Enriched ${enriched} figures`);
}

async function updateConsensusRanks() {
  console.log('\n📊 Updating consensus ranks (coverage-weighted)...');
  const { recalculateConsensus } = await import('./recalculate-consensus.cjs');
  recalculateConsensus(db);
}

// ============================================
// MAIN
// ============================================

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const thumbnailsOnly = args.includes('--thumbnails');
  const enrichOnly = args.includes('--enrich');

  if (dryRun) {
    console.log('🔍 DRY RUN - No changes will be made\n');
  }

  console.log('🔧 HistoryRank Reconciliation\n');

  if (thumbnailsOnly) {
    await downloadMissingThumbnails();
    console.log('\n✅ Thumbnail download complete!');
    return;
  }

  if (enrichOnly) {
    await enrichMissingData(dryRun);
    console.log('\n✅ Enrichment complete!');
    return;
  }

  const overrides = loadOverrides();

  // 1. Perform merges
  await performMerges(overrides.merges, dryRun);

  // 2. Perform renames
  await performRenames(overrides.renames, dryRun);

  // 3. Apply updates (fetch Wikipedia data)
  await performUpdates(overrides.updates, dryRun);

  // 4. Add aliases
  await addAliases(overrides.aliases, dryRun);

  // 5. Enrich figures missing birth year, era, domain, pageviews
  await enrichMissingData(dryRun);

  // 6. Auto-generate aliases from canonical names
  await autoGenerateAliases(dryRun);

  // 7. Update consensus ranks
  if (!dryRun) {
    await updateConsensusRanks();
  }

  // Print summary
  const figureCount = await db.select({ count: sql<number>`count(*)` }).from(figures);
  const aliasCount = await db.select({ count: sql<number>`count(*)` }).from(nameAliases);
  const rankingCount = await db.select({ count: sql<number>`count(*)` }).from(rankings);

  console.log('\n📈 Summary:');
  console.log(`   Figures: ${figureCount[0].count}`);
  console.log(`   Aliases: ${aliasCount[0].count}`);
  console.log(`   Rankings: ${rankingCount[0].count}`);

  console.log('\n✅ Reconciliation complete!');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Reconciliation failed:', err);
    process.exit(1);
  });
