import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';

type HistoricalSnippetCandidate = {
  corpus: string;
  edition_year: number | null;
  source_title: string | null;
  source_url: string | null;
  snippet: string;
  match_score: number;
  why: string;
};

type CandidateFile = {
  figureId: string;
  figureName: string;
  candidates: HistoricalSnippetCandidate[];
};

type CliArgs = {
  dbPath: string;
  filePath: string | null;
  dirPath: string;
  figureId: string | null;
  limitPerFigure: number;
  prune: boolean;
  dryRun: boolean;
};

const ALLOWED_CORPORA = new Set([
  'britannica_1911',
  'britannica_1902',
  'wikisource',
  'project_gutenberg',
  'internet_archive',
  'other',
]);

function parseArgs(argv: string[]): CliArgs {
  const get = (flag: string) => {
    const match = argv.find((arg) => arg.startsWith(`${flag}=`));
    return match ? match.slice(flag.length + 1) : null;
  };

  const dbPath = get('--db') || path.join(process.cwd(), 'historyrank.db');
  const filePath = get('--file');
  const dirPath = get('--dir') || path.join(process.cwd(), 'data', 'research-candidates');
  const figureId = get('--figure-id');
  const limitRaw = get('--limit-per-figure');
  const limitPerFigure = limitRaw ? Number.parseInt(limitRaw, 10) : 2;
  const prune = argv.includes('--prune');
  const dryRun = argv.includes('--dry-run');

  if (!Number.isFinite(limitPerFigure) || limitPerFigure < 1 || limitPerFigure > 10) {
    throw new Error('Invalid --limit-per-figure. Use a number between 1 and 10.');
  }

  return { dbPath, filePath, dirPath, figureId, limitPerFigure, prune, dryRun };
}

async function loadCandidateFiles(args: CliArgs): Promise<CandidateFile[]> {
  if (args.filePath) {
    const raw = await readFile(args.filePath, 'utf8');
    return [JSON.parse(raw) as CandidateFile];
  }

  let files: string[] = [];
  try {
    files = await readdir(args.dirPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('ENOENT')) {
      return [];
    }
    throw error;
  }

  const targets = files
    .filter((file) => file.endsWith('.historical-snippets.json'))
    .map((file) => path.join(args.dirPath, file));

  const payloads = await Promise.all(
    targets.map(async (filePath) => {
      const raw = await readFile(filePath, 'utf8');
      return JSON.parse(raw) as CandidateFile;
    })
  );

  return payloads;
}

function pickTopCandidates(file: CandidateFile, limitPerFigure: number): HistoricalSnippetCandidate[] {
  return (file.candidates || [])
    .filter((row) => ALLOWED_CORPORA.has(row.corpus) && row.snippet && row.snippet.trim().length > 0)
    .sort((a, b) => (b.match_score || 0) - (a.match_score || 0))
    .slice(0, limitPerFigure);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = await loadCandidateFiles(args);
  const filtered = args.figureId ? files.filter((file) => file.figureId === args.figureId) : files;

  if (filtered.length === 0) {
    console.log('No historical snippet candidate files found to import.');
    return;
  }

  const db = new Database(args.dbPath);
  db.exec('PRAGMA foreign_keys = ON;');

  const figureExistsStmt = db.prepare('SELECT 1 FROM figures WHERE id = ? LIMIT 1');
  const findExistingStmt = db.prepare(`
    SELECT id
    FROM figure_historical_snippets
    WHERE figure_id = ?
      AND corpus = ?
      AND ifnull(source_title, '') = ifnull(?, '')
      AND ifnull(source_url, '') = ifnull(?, '')
    LIMIT 1
  `);

  const insertStmt = db.prepare(`
    INSERT INTO figure_historical_snippets (
      figure_id, corpus, edition_year, source_title, source_url, snippet,
      match_score, curation_status, metadata, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const updateStmt = db.prepare(`
    UPDATE figure_historical_snippets
    SET snippet = ?, match_score = ?, metadata = ?, updated_at = ?
    WHERE id = ?
  `);

  const pruneMissingStmt = db.prepare(`
    DELETE FROM figure_historical_snippets
    WHERE figure_id = ?
      AND curation_status = 'auto'
      AND (
        corpus || '::' || ifnull(source_title, '') || '::' || ifnull(source_url, '')
      ) NOT IN (SELECT value FROM json_each(?))
  `);

  const pruneAllAutoStmt = db.prepare(`
    DELETE FROM figure_historical_snippets
    WHERE figure_id = ?
      AND curation_status = 'auto'
  `);

  let inserted = 0;
  let updated = 0;
  let pruned = 0;
  let skippedMissingFigure = 0;

  const now = Math.floor(Date.now() / 1000);

  const runImport = db.transaction(() => {
    for (const file of filtered) {
      if (!figureExistsStmt.get(file.figureId)) {
        skippedMissingFigure += 1;
        continue;
      }

      const top = pickTopCandidates(file, args.limitPerFigure);
      const keepKeys = top.map(
        (row) => `${row.corpus}::${row.source_title || ''}::${row.source_url || ''}`
      );
      for (const row of top) {
        const metadata = JSON.stringify({
          import_reason: row.why,
          figure_name: file.figureName,
        });
        const existing = findExistingStmt.get(file.figureId, row.corpus, row.source_title, row.source_url) as
          | { id: number }
          | undefined;

        if (existing?.id) {
          updateStmt.run(row.snippet, row.match_score, metadata, now, existing.id);
          updated += 1;
        } else {
          insertStmt.run(
            file.figureId,
            row.corpus,
            row.edition_year,
            row.source_title,
            row.source_url,
            row.snippet,
            row.match_score,
            'auto',
            metadata,
            now,
            now
          );
          inserted += 1;
        }
      }

      if (args.prune) {
        if (keepKeys.length > 0) {
          const result = pruneMissingStmt.run(file.figureId, JSON.stringify(keepKeys));
          pruned += result.changes;
        } else {
          const result = pruneAllAutoStmt.run(file.figureId);
          pruned += result.changes;
        }
      }
    }
  });

  if (args.dryRun) {
    let prospective = 0;
    for (const file of filtered) {
      prospective += pickTopCandidates(file, args.limitPerFigure).length;
    }
    console.log(
      JSON.stringify(
        {
          mode: 'dry-run',
          files: filtered.length,
          rows: prospective,
          prune: args.prune,
          skippedMissingFigure: filtered.filter((file) => !figureExistsStmt.get(file.figureId)).length,
        },
        null,
        2
      )
    );
    db.close();
    return;
  }

  try {
    runImport();
    console.log(
      `Imported historical snippets: ${inserted} inserted, ${updated} updated, ${pruned} pruned (missing figures skipped: ${skippedMissingFigure})`
    );
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
