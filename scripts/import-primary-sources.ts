import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';

type SourceRole = 'primary' | 'secondary' | 'reference';

type CandidateFile = {
  figureId: string;
  figureName: string;
  candidates: Array<{
    source_corpus: string;
    source_role?: SourceRole;
    source_kind: string;
    title: string;
    author: string | null;
    publication_year: number | null;
    source_url: string;
    access_url?: string | null;
    snippet?: string | null;
    confidence: number;
    why: string;
    metadata?: Record<string, unknown>;
  }>;
};

type CliArgs = {
  dbPath: string;
  filePath: string | null;
  dirPath: string;
  figureId: string | null;
  limitPerFigure: number | null;
  limitPerRole: number;
  dryRun: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  const get = (flag: string) => {
    const match = argv.find((arg) => arg.startsWith(`${flag}=`));
    return match ? match.slice(flag.length + 1) : null;
  };

  const dbPath = get('--db') || path.join(process.cwd(), 'historyrank.db');
  const filePath = get('--file');
  const dirPath = get('--dir') || path.join(process.cwd(), 'data', 'research-candidates');
  const figureId = get('--figure-id');
  const limitFigureRaw = get('--limit-per-figure');
  const limitRoleRaw = get('--limit-per-role');
  const limitPerFigure = limitFigureRaw ? Number.parseInt(limitFigureRaw, 10) : null;
  const limitPerRole = limitRoleRaw ? Number.parseInt(limitRoleRaw, 10) : 3;
  const dryRun = argv.includes('--dry-run');

  if (limitPerFigure !== null && (!Number.isFinite(limitPerFigure) || limitPerFigure < 1 || limitPerFigure > 30)) {
    throw new Error('Invalid --limit-per-figure. Use a number between 1 and 30.');
  }
  if (!Number.isFinite(limitPerRole) || limitPerRole < 1 || limitPerRole > 10) {
    throw new Error('Invalid --limit-per-role. Use a number between 1 and 10.');
  }

  return { dbPath, filePath, dirPath, figureId, limitPerFigure, limitPerRole, dryRun };
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
    .filter((file) => file.endsWith('.primary-sources.json') || file.endsWith('.research-sources.json'))
    .map((file) => path.join(args.dirPath, file));

  const payloads = await Promise.all(
    targets.map(async (filePath) => {
      const raw = await readFile(filePath, 'utf8');
      return JSON.parse(raw) as CandidateFile;
    })
  );

  return payloads;
}

function isAllowedCorpus(value: string): boolean {
  return [
    'wikisource',
    'project_gutenberg',
    'internet_archive',
    'openalex',
    'crossref',
    'openlibrary',
    'loc',
    'britannica_1911',
    'britannica_1902',
    'other',
  ].includes(value);
}

function mapSourceRole(value: string | undefined): SourceRole {
  if (value === 'secondary' || value === 'reference') return value;
  return 'primary';
}

function mapSourceKind(value: string | null | undefined): string {
  const allowed = new Set(['text', 'speech', 'letter', 'book', 'article', 'archive_record', 'other']);
  if (!value) return 'text';
  return allowed.has(value) ? value : 'text';
}

function mapSourceCorpusForDb(value: string): { sourceCorpus: string; provider: string | null } {
  const native = new Set([
    'wikisource',
    'project_gutenberg',
    'internet_archive',
    'britannica_1911',
    'britannica_1902',
    'other',
  ]);

  if (native.has(value)) {
    return { sourceCorpus: value, provider: value === 'other' ? 'other' : null };
  }
  return { sourceCorpus: 'other', provider: value };
}

function isPublicDomainByCorpus(corpus: string, sourceRole: SourceRole): boolean {
  if (sourceRole === 'primary') return true;
  return corpus === 'wikisource' || corpus === 'project_gutenberg' || corpus === 'internet_archive';
}

function rankCandidates(file: CandidateFile, args: CliArgs) {
  const rows = (file.candidates || [])
    .filter((row) => isAllowedCorpus(row.source_corpus))
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

  if (args.limitPerFigure !== null) {
    return rows.slice(0, args.limitPerFigure);
  }

  const orderedRoles: SourceRole[] = ['primary', 'secondary', 'reference'];
  const picked: CandidateFile['candidates'] = [];
  for (const role of orderedRoles) {
    picked.push(
      ...rows
        .filter((row) => mapSourceRole(row.source_role) === role)
        .slice(0, args.limitPerRole)
    );
  }
  return picked;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = await loadCandidateFiles(args);
  const filtered = args.figureId ? files.filter((f) => f.figureId === args.figureId) : files;

  if (filtered.length === 0) {
    console.log('No candidate files found to import.');
    return;
  }

  const db = new Database(args.dbPath);
  db.exec('PRAGMA foreign_keys = ON;');

  const existsStmt = db.prepare('SELECT 1 FROM figures WHERE id = ? LIMIT 1');
  const upsertStmt = db.prepare(`
    INSERT INTO figure_research_sources (
      figure_id, source_role, source_corpus, source_kind, title, author,
      publication_year, source_url, access_url, snippet, is_public_domain, confidence,
      curation_status, metadata, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(figure_id, source_url) DO UPDATE SET
      source_role = excluded.source_role,
      source_corpus = excluded.source_corpus,
      source_kind = excluded.source_kind,
      title = excluded.title,
      author = excluded.author,
      publication_year = excluded.publication_year,
      access_url = excluded.access_url,
      snippet = excluded.snippet,
      is_public_domain = excluded.is_public_domain,
      confidence = excluded.confidence,
      metadata = excluded.metadata,
      updated_at = excluded.updated_at
  `);

  let insertedOrUpdated = 0;
  let skippedMissingFigure = 0;

  const now = Math.floor(Date.now() / 1000);

  const runImport = db.transaction(() => {
    for (const file of filtered) {
      const hasFigure = existsStmt.get(file.figureId);
      if (!hasFigure) {
        skippedMissingFigure += 1;
        continue;
      }

      const top = rankCandidates(file, args);
      for (const row of top) {
        const sourceRole = mapSourceRole(row.source_role);
        const mappedCorpus = mapSourceCorpusForDb(row.source_corpus);
        const metadata = JSON.stringify({
          ...(row.metadata || {}),
          provider: mappedCorpus.provider || row.metadata?.provider || null,
          import_reason: row.why,
          figure_name: file.figureName,
        });

        upsertStmt.run(
          file.figureId,
          sourceRole,
          mappedCorpus.sourceCorpus,
          mapSourceKind(row.source_kind),
          row.title,
          row.author,
          row.publication_year,
          row.source_url,
          row.access_url || null,
          row.snippet || null,
          isPublicDomainByCorpus(mappedCorpus.sourceCorpus, sourceRole) ? 1 : 0,
          row.confidence,
          'auto',
          metadata,
          now,
          now
        );
        insertedOrUpdated += 1;
      }
    }
  });

  if (args.dryRun) {
    let prospective = 0;
    for (const file of filtered) {
      prospective += rankCandidates(file, args).length;
    }
    console.log(
      JSON.stringify(
        {
          mode: 'dry-run',
          files: filtered.length,
          rows: prospective,
          skippedMissingFigure: filtered.filter((f) => !existsStmt.get(f.figureId)).length,
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
      `Imported research source candidates: ${insertedOrUpdated} rows (missing figures skipped: ${skippedMissingFigure})`
    );
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
