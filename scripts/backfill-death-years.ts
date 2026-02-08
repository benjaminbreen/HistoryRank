import path from 'node:path';
import Database from 'better-sqlite3';
import { enrichFromWikipedia, fetchWikidataEntity, getWikidataQid } from './lib/wikidata';

type CliArgs = {
  dbPath: string;
  limit: number;
  figureId: string | null;
  dryRun: boolean;
};

type FigureRow = {
  id: string;
  canonical_name: string;
  wikipedia_slug: string | null;
  wikidata_qid: string | null;
  llm_consensus_rank: number | null;
  hpi_rank: number | null;
};

function parseArgs(argv: string[]): CliArgs {
  const get = (flag: string) => {
    const match = argv.find((arg) => arg.startsWith(`${flag}=`));
    return match ? match.slice(flag.length + 1) : null;
  };

  const dbPath = get('--db') || path.join(process.cwd(), 'historyrank.db');
  const figureId = get('--figure-id');
  const limitRaw = get('--limit');
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 400;
  const dryRun = argv.includes('--dry-run');

  if (!Number.isFinite(limit) || limit < 1 || limit > 5000) {
    throw new Error('Invalid --limit. Use a number between 1 and 5000.');
  }

  return { dbPath, limit, figureId, dryRun };
}

function getCandidates(db: Database.Database, args: CliArgs): FigureRow[] {
  if (args.figureId) {
    return db
      .prepare(
        `
        SELECT id, canonical_name, wikipedia_slug, wikidata_qid, llm_consensus_rank, hpi_rank
        FROM figures
        WHERE id = ?
          AND death_year IS NULL
        LIMIT 1
        `
      )
      .all(args.figureId) as FigureRow[];
  }

  return db
    .prepare(
      `
      SELECT id, canonical_name, wikipedia_slug, wikidata_qid, llm_consensus_rank, hpi_rank
      FROM figures
      WHERE death_year IS NULL
      ORDER BY
        CASE WHEN llm_consensus_rank IS NULL THEN 1 ELSE 0 END,
        llm_consensus_rank ASC,
        CASE WHEN hpi_rank IS NULL THEN 1 ELSE 0 END,
        hpi_rank ASC,
        canonical_name ASC
      LIMIT ?
      `
    )
    .all(args.limit) as FigureRow[];
}

function plausibleDeathYear(year: number | null): boolean {
  if (year === null) return false;
  return year >= -5000 && year <= 2026;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = new Database(args.dbPath);

  const candidates = getCandidates(db, args);
  if (candidates.length === 0) {
    console.log('No eligible figures found for death-year backfill.');
    db.close();
    return;
  }

  const updateStmt = db.prepare(
    `
    UPDATE figures
    SET death_year = ?,
        wikidata_qid = COALESCE(wikidata_qid, ?),
        wikipedia_slug = COALESCE(wikipedia_slug, ?),
        updated_at = ?
    WHERE id = ?
      AND death_year IS NULL
    `
  );

  let updated = 0;
  let missingQid = 0;
  let noDeathDate = 0;
  let nonHuman = 0;
  let fetchError = 0;

  const updatesPreview: Array<{ id: string; name: string; deathYear: number; qid: string }> = [];

  for (const row of candidates) {
    try {
      let qid = row.wikidata_qid || (row.wikipedia_slug ? await getWikidataQid(row.wikipedia_slug) : null);
      let resolvedSlug = row.wikipedia_slug;
      let deathYear: number | null = null;

      if (!qid) {
        const enrichment = await enrichFromWikipedia(row.canonical_name, row.canonical_name.toLowerCase());
        if (enrichment?.wikidataQid) {
          qid = enrichment.wikidataQid;
          resolvedSlug = enrichment.wikipediaSlug || resolvedSlug;
          deathYear = enrichment.deathYear;
        }
      }

      if (!qid) {
        missingQid += 1;
        continue;
      }

      if (deathYear === null) {
        const entity = await fetchWikidataEntity(qid);
        if (!entity) {
          fetchError += 1;
          continue;
        }
        if (!entity.isHuman) {
          nonHuman += 1;
          continue;
        }
        deathYear = entity.deathDate?.year ?? null;
      }

      if (!plausibleDeathYear(deathYear)) {
        noDeathDate += 1;
        continue;
      }

      updatesPreview.push({
        id: row.id,
        name: row.canonical_name,
        deathYear,
        qid,
      });

      if (!args.dryRun) {
        const result = updateStmt.run(deathYear, qid, resolvedSlug, new Date().toISOString(), row.id);
        if (result.changes > 0) updated += 1;
      } else {
        updated += 1;
      }
    } catch {
      fetchError += 1;
    }
  }

  const sample = updatesPreview.slice(0, 12);
  console.log(
    JSON.stringify(
      {
        mode: args.dryRun ? 'dry-run' : 'apply',
        scanned: candidates.length,
        updated,
        missingQid,
        noDeathDate,
        nonHuman,
        fetchError,
        sample,
      },
      null,
      2
    )
  );

  db.close();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
